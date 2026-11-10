import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import QRCode from "qrcode"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { decryptSecret } from "@/lib/crypto"
import { limitedBody } from "@/lib/local-storage"
import { readReplyMedia, PreparationError } from "@/lib/whatsapp/media"
import { configSchema, defaults, afterDays, renderMessage } from "@/lib/whatsapp/policy"
import { whatsappDb, getConnection, saveConfig, putJob, ensureWhatsappIndexes, type Job, type PilotContact, type Connection } from "@/lib/whatsapp/store"

export const runtime = "nodejs"
const headers = { "Cache-Control": "private, no-store" }
const payload = z.discriminatedUnion("action", [
  z.object({ action: z.literal("configure"), config: configSchema }).strict(),
  z.object({ action: z.enum(["connect", "disconnect", "pause", "resume"]) }).strict(),
  z.object({ action: z.enum(["approve", "cancel"]), id: z.string().uuid() }).strict(),
  z.object({ action: z.enum(["exclude", "include"]), phone: z.string().regex(/^[1-9]\d{9,14}$/) }).strict(),
  z.object({ action: z.literal("schedule"), kind: z.enum(["quote", "after_sale", "test", "scheduled"]), contactId: z.string().min(1).max(100), requestId: z.string().uuid(), text: z.string().trim().max(2000).optional(), replyId: z.string().min(1).max(100).optional(), dueAt: z.string().datetime().optional() }).strict(),
])
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  try {
    const db = await whatsappDb()
    const userId = session.user.id
    const connection = await getConnection(db, userId)
    const jobs = await db.collection<Job>("wa_jobs").find({ userId }).sort({ createdAt: -1 }).limit(60).toArray()
    const contacts = await db.collection<PilotContact>("contacts").find({ userId, phone: { $in: connection?.config.phones ?? [] } }, { projection: { _id: 1, name: 1, phone: 1 } }).limit(2).toArray()
    const online = Boolean(connection?.heartbeat && Date.now() - connection.heartbeat.getTime() < 45000)
    const qr = online && connection?.qrEncrypted && connection.qrUntil && connection.qrUntil > new Date()
      ? await QRCode.toDataURL(decryptSecret(connection.qrEncrypted), { width: 280, margin: 2 }) : null
    const exclusions = await db.collection<{ userId: string; phone: string }>("wa_exclusions").find({ userId }, { projection: { _id: 0, phone: 1 } }).limit(100).toArray()
    return NextResponse.json({ config: connection?.config ?? defaults, state: online ? connection?.state : "worker_offline", workerOnline: online, phone: connection?.phone, qr, jobs, contacts, exclusions: exclusions.map(x => x.phone) }, { headers })
  } catch { return NextResponse.json({ error: "Não foi possível consultar a conexão do WhatsApp." }, { status: 503, headers }) }
}
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  // Connector administration is session-only. Extension tokens cannot pair or send.
  if (req.headers.get("origin") !== new URL(req.url).origin) return NextResponse.json({ error: "Origem inválida" }, { status: 403 })
  let raw: string
  try { raw = Buffer.from(await limitedBody(req, 16000)).toString("utf8") }
  catch { return NextResponse.json({ error: "Solicitação muito grande ou inválida" }, { status: 413 }) }
  const parsed = payload.safeParse((() => { try { return JSON.parse(raw) } catch { return null } })())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 })
  try {
    const db = await whatsappDb()
    await ensureWhatsappIndexes(db)
    const userId = session.user.id
    const data = parsed.data
    if (data.action === "configure") {
      for (const id of [data.config.birthdayReplyId, data.config.quoteReplyId, data.config.afterSaleReplyId]) if (id) await readReplyMedia(db, userId, id)
      await saveConfig(db, userId, data.config)
      return NextResponse.json({ ok: true })
    }
    const connection = await getConnection(db, userId)
    if (!connection) return NextResponse.json({ error: "Salve os números e as regras primeiro." }, { status: 409 })
    if (data.action === "connect" || data.action === "disconnect") {
      if (data.action === "connect" && (!connection.config.enabled || !connection.config.phones.length)) return NextResponse.json({ error: "Habilite o piloto e informe os números autorizados." }, { status: 409 })
      await db.collection<Connection>("wa_connections").updateOne({ _id: userId }, { $set: { desired: data.action === "connect", command: randomUUID(), qrEncrypted: null, updatedAt: new Date(), ...(data.action === "disconnect" ? { "config.paused": true } : {}) } })
    } else if (data.action === "pause" || data.action === "resume") {
      await db.collection<Connection>("wa_connections").updateOne({ _id: userId }, { $set: { "config.paused": data.action === "pause", updatedAt: new Date() } })
    } else if (data.action === "approve" || data.action === "cancel") {
      const result = await db.collection<Job>("wa_jobs").updateOne({ _id: data.id, userId, status: { $in: data.action === "approve" ? ["review"] : ["review", "queued"] } }, { $set: { status: data.action === "approve" ? "queued" : "canceled", approved: data.action === "approve", updatedAt: new Date() } })
      if (!result.matchedCount) return NextResponse.json({ error: "A mensagem mudou de estado. Atualize a lista." }, { status: 409 })
    } else if (data.action === "exclude" || data.action === "include") {
      if (!connection.config.phones.includes(data.phone)) return NextResponse.json({ error: "Número fora do piloto" }, { status: 400 })
      const collection = db.collection<{ userId: string; phone: string }>("wa_exclusions")
      if (data.action === "include") await collection.deleteOne({ userId, phone: data.phone })
      else {
        await collection.updateOne({ userId, phone: data.phone }, { $set: { userId, phone: data.phone } }, { upsert: true })
        await db.collection<Job>("wa_jobs").updateMany({ userId, phone: data.phone, status: { $in: ["review", "queued"] } }, { $set: { status: "canceled", reason: "Contato excluído", updatedAt: new Date() } })
      }
    } else if (data.action === "schedule") {
      const contact = await db.collection<PilotContact>("contacts").findOne({ _id: data.contactId, userId, phone: { $in: connection.config.phones } })
      if (!contact) return NextResponse.json({ error: "Cadastre o contato no CRM com um dos números autorizados." }, { status: 404 })
      if (await db.collection("wa_exclusions").findOne({ userId, phone: contact.phone })) return NextResponse.json({ error: "O contato está excluído dos envios." }, { status: 409 })
      const config = connection.config
      if ((data.kind === "quote" && !config.quote) || (data.kind === "after_sale" && !config.afterSale)) return NextResponse.json({ error: "Habilite e salve a regra correspondente." }, { status: 409 })
      const now = new Date()
      const dueAt = data.kind === "test" ? now : data.kind === "scheduled" && data.dueAt ? new Date(data.dueAt) : afterDays(now, data.kind === "quote" ? config.quoteDays : config.afterSaleDays)
      if (data.kind === "scheduled" && (!data.dueAt || dueAt <= now || dueAt.getTime() > now.getTime() + 366 * 86400000)) return NextResponse.json({ error: "Escolha uma data futura dentro de um ano." }, { status: 400 })
      const replyId = data.replyId ?? (data.kind === "quote" ? config.quoteReplyId : data.kind === "after_sale" ? config.afterSaleReplyId : null)
      const media = replyId ? await readReplyMedia(db, userId, replyId) : null
      const text = media?.attachment.type === "AUDIO" ? "" : renderMessage(data.text ?? (data.kind === "quote" ? config.quoteText : data.kind === "after_sale" ? config.afterSaleText : "Teste autorizado do VisionSync."), contact.name)
      if (!text.trim() && !media) return NextResponse.json({ error: "Escreva uma mensagem ou escolha um anexo." }, { status: 400 })
      await putJob(db, { userId, contactId: contact._id, phone: contact.phone, name: contact.name, kind: data.kind, text, ...(media ? { attachment: media.attachment } : {}), dueAt, expiresAt: new Date(dueAt.getTime() + 24 * 3600000), eventAt: now, status: data.kind === "test" || !config.automatic ? "review" : "queued", key: `${data.kind}:${data.requestId}` })
    }
    return NextResponse.json({ ok: true })
  } catch (error) { return NextResponse.json({ error: error instanceof PreparationError ? error.message : "Não foi possível concluir a operação do WhatsApp." }, { status: error instanceof PreparationError ? 400 : 503 }) }
}
