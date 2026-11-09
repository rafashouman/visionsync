import { createHash } from "crypto"
import { prisma } from "@/lib/prisma"
import { decryptSecret } from "@/lib/crypto"
import { withCountryCode } from "@/lib/phone"
import { cleanNameParts } from "@/lib/names"

/**
 * Envio de conversões para o Meta (Conversions API).
 *
 * Usamos action_source = "chat": conversão feita por app de mensagem. É o
 * formato certo para quem usa o WhatsApp Web / app (o formato
 * "business_messaging" exige a API oficial do WhatsApp).
 * O Meta liga o evento à pessoa pelo telefone (enviado só como hash SHA-256).
 *
 * Vários pixels: cada lista (etiqueta) pode apontar pra um pixel. A compra vai
 * pro pixel da primeira lista da cliente (na ordem das listas) que tiver um.
 * Se nenhuma tiver, usa o pixel marcado como padrão; se não houver, fica
 * "sem pixel" (nada é enviado, e o motivo aparece na compra).
 *
 * Regras da API (docs oficiais do Meta):
 *  - event_time com no máximo 7 dias; um evento velho derruba a requisição toda.
 *  - ph/fn/ln/external_id/country vão em SHA-256; ctwa_clid vai sem hash.
 *  - test_event_code NÃO isola os dados da medição real.
 */

const GRAPH_BASE = (process.env.META_GRAPH_BASE ?? "https://graph.facebook.com").replace(/\/$/, "")
const GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v27.0"
const MAX_AGE_SECONDS = 7 * 24 * 3600 - 3600 // 7 dias menos 1h de folga
const EXPIRED_MSG = "Expirado: o Meta só aceita eventos de até 7 dias"
export const NO_PIXEL_MSG = "Sem pixel: nenhuma lista desta cliente aponta pra um pixel (e não há pixel padrão)"
export const SKIP_REPEAT_MSG = "Recompra não enviada (este pixel está configurado pra enviar só a 1ª compra)"

export const META_GRAPH_VERSION = GRAPH_VERSION

/** Como tratar a 2ª compra em diante: igual à 1ª, evento separado "Recompra", ou não enviar. */
export const REPEAT_MODES = ["purchase", "custom", "none"] as const
export type RepeatMode = (typeof REPEAT_MODES)[number]

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex")

/** Telefone no formato do Meta: só dígitos, com DDI (assume Brasil se vier sem). */
export function phoneForMeta(raw: string): string | null {
  return withCountryCode(raw) || null
}

/** Nome e sobrenome em minúsculas, sem pontuação. Ignora nome genérico e a palavra "cliente". */
export function nameForMeta(name: string): { fn?: string; ln?: string } {
  const parts = cleanNameParts(name).map((p) => p.toLowerCase())
  if (parts.length === 0) return {}
  return { fn: parts[0], ln: parts.length > 1 ? parts[parts.length - 1] : undefined }
}

type EventInput = {
  purchase: { id: string; amount: number; productName: string | null; purchasedAt: Date; ctwaClid: string | null }
  contact: { id: string; name: string; phone: string }
  purchaseNumber: number
  eventName?: string // "Purchase" (padrão) ou "Recompra"
}

export function buildEvent({ purchase, contact, purchaseNumber, eventName = "Purchase" }: EventInput) {
  const ph = phoneForMeta(contact.phone)
  const { fn, ln } = nameForMeta(contact.name)

  const user_data: Record<string, unknown> = {
    external_id: [sha256(contact.id)],
    country: [sha256("br")],
  }
  if (ph) user_data.ph = [sha256(ph)]
  if (fn) user_data.fn = [sha256(fn)]
  if (ln) user_data.ln = [sha256(ln)]
  if (purchase.ctwaClid) user_data.ctwa_clid = purchase.ctwaClid // sem hash

  const custom_data: Record<string, unknown> = {
    currency: "BRL",
    value: purchase.amount,
    purchase_number: purchaseNumber, // 1 = primeira compra; >1 = recorrente
  }
  if (purchase.productName) custom_data.content_name = purchase.productName

  return {
    event_name: eventName,
    event_time: Math.floor(purchase.purchasedAt.getTime() / 1000),
    event_id: purchase.id, // evita duplicar se reenviar
    action_source: "chat",
    user_data,
    custom_data,
  }
}

type PixelRow = { id: string; name: string; datasetId: string; accessToken: string; testEventCode: string | null; repeatMode: string; isDefault: boolean }

/** Pixel que recebe as compras desta cliente (ver regra no topo do arquivo). */
export async function pixelForContact(userId: string, contactId: string): Promise<PixelRow | null> {
  const memberships = await prisma.crmListMember.findMany({
    where: { contactId, list: { userId, metaPixelId: { not: null } } },
    include: { list: { include: { metaPixel: true } } },
    orderBy: { list: { order: "asc" } },
  })
  const viaList = memberships.find((m) => m.list.metaPixel && m.list.metaPixel.userId === userId)?.list.metaPixel
  if (viaList) return viaList
  return prisma.metaPixel.findFirst({ where: { userId, isDefault: true } })
}

export type SendResult = {
  status: "sent" | "failed" | "expired" | "skipped"
  message?: string
}

/** Envia uma compra ao Meta e grava o resultado na própria compra. */
export async function sendPurchaseEvent(purchaseId: string): Promise<SendResult> {
  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: { contact: true },
  })
  if (!purchase) return { status: "skipped", message: "Compra não encontrada" }
  if (purchase.metaEventSent) return { status: "skipped", message: "Já enviada" }

  const { contact } = purchase
  const userId = purchase.userId
  const fail = async (msg: string, status: SendResult["status"] = "failed") => {
    await prisma.purchase.update({ where: { id: purchase.id }, data: { metaError: msg } })
    return { status, message: msg } as SendResult
  }

  // Evento com mais de 7 dias derrubaria a requisição inteira: nem tenta.
  const ageSeconds = (Date.now() - purchase.purchasedAt.getTime()) / 1000
  if (ageSeconds > MAX_AGE_SECONDS) return fail(EXPIRED_MSG, "expired")

  const pixel = await pixelForContact(userId, contact.id)
  if (!pixel) return fail(NO_PIXEL_MSG, "skipped")

  const purchaseNumber = await prisma.purchase.count({
    where: { userId, contactId: contact.id, purchasedAt: { lte: purchase.purchasedAt } },
  })

  let eventName = "Purchase"
  if (purchaseNumber > 1) {
    if (pixel.repeatMode === "none") {
      await prisma.purchase.update({ where: { id: purchase.id }, data: { metaPixelId: pixel.id, metaError: SKIP_REPEAT_MSG } })
      return { status: "skipped", message: SKIP_REPEAT_MSG }
    }
    if (pixel.repeatMode === "custom") eventName = "Recompra"
  }

  let token: string
  try {
    token = decryptSecret(pixel.accessToken)
  } catch {
    return fail("Não consegui abrir o token salvo. Salve o token do Meta de novo.")
  }

  const body: Record<string, unknown> = { data: [buildEvent({ purchase, contact, purchaseNumber, eventName })] }
  if (pixel.testEventCode) body.test_event_code = pixel.testEventCode

  try {
    const res = await fetch(
      `${GRAPH_BASE}/${GRAPH_VERSION}/${encodeURIComponent(pixel.datasetId)}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      }
    )
    const json = (await res.json().catch(() => null)) as {
      events_received?: number
      fbtrace_id?: string
      error?: { message?: string; code?: number }
    } | null

    if (res.ok && json && (json.events_received ?? 0) >= 1) {
      await prisma.purchase.update({
        where: { id: purchase.id },
        data: {
          metaEventSent: true,
          metaEventId: json.fbtrace_id ?? purchase.id,
          metaSentAt: new Date(),
          metaError: null,
          metaPixelId: pixel.id,
        },
      })
      return { status: "sent" }
    }

    const msg = (json?.error?.message ?? `Erro ${res.status} do Meta`).slice(0, 300)
    await prisma.purchase.update({ where: { id: purchase.id }, data: { metaError: msg, metaPixelId: pixel.id } })
    return { status: "failed", message: msg }
  } catch (e) {
    const msg = (e instanceof Error ? e.message : "Falha de rede").slice(0, 300)
    await prisma.purchase.update({ where: { id: purchase.id }, data: { metaError: msg, metaPixelId: pixel.id } })
    return { status: "failed", message: msg }
  }
}

/** Reenvia as compras pendentes de uma conta (as que ainda estão dentro de 7 dias). */
export async function sendPendingForUser(userId: string, limit = 50) {
  const cutoff = new Date(Date.now() - MAX_AGE_SECONDS * 1000)

  // O que já passou de 7 dias nunca mais será aceito: marca como expirado.
  await prisma.purchase.updateMany({
    where: {
      userId,
      metaEventSent: false,
      purchasedAt: { lt: cutoff },
      OR: [{ metaError: null }, { NOT: { metaError: EXPIRED_MSG } }],
    },
    data: { metaError: EXPIRED_MSG },
  })

  const pending = await prisma.purchase.findMany({
    where: { userId, metaEventSent: false, purchasedAt: { gte: cutoff } },
    orderBy: { purchasedAt: "asc" },
    take: limit,
    select: { id: true },
  })

  const summary = { sent: 0, failed: 0, skipped: 0, firstError: null as string | null }
  for (const p of pending) {
    const r = await sendPurchaseEvent(p.id)
    if (r.status === "sent") summary.sent++
    else if (r.status === "failed") {
      summary.failed++
      summary.firstError ??= r.message ?? null
    } else summary.skipped++
  }
  return summary
}

/** Mostra como o evento da última compra seria enviado (sem enviar nada). */
export async function previewLatestEvent(userId: string) {
  const purchase = await prisma.purchase.findFirst({
    where: { userId },
    orderBy: { purchasedAt: "desc" },
    include: { contact: true },
  })
  if (!purchase) return null

  const purchaseNumber = await prisma.purchase.count({
    where: { userId, contactId: purchase.contactId, purchasedAt: { lte: purchase.purchasedAt } },
  })
  const pixel = await pixelForContact(userId, purchase.contactId)
  const eventName = purchaseNumber > 1 && pixel?.repeatMode === "custom" ? "Recompra" : "Purchase"
  const event = buildEvent({ purchase, contact: purchase.contact, purchaseNumber, eventName })
  const { fn, ln } = nameForMeta(purchase.contact.name)

  return {
    pixel: pixel ? { nome: pixel.name, id: pixel.datasetId, recompras: pixel.repeatMode } : null,
    aviso: !pixel ? NO_PIXEL_MSG : purchaseNumber > 1 && pixel.repeatMode === "none" ? SKIP_REPEAT_MSG : undefined,
    event,
    antesDoHash: {
      telefone: phoneForMeta(purchase.contact.phone),
      nome: fn ?? null,
      sobrenome: ln ?? null,
    },
  }
}
