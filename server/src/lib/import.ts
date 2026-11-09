import { randomUUID } from "crypto"
import { prisma } from "@/lib/prisma"
import { normalizePhone } from "@/lib/crm-auth"
import { withCountryCode } from "@/lib/phone"

/** Um contato lido do WhatsApp pela extensão. */
export type ImportContact = {
  phone: string
  name: string
  labels: string[] // nomes das etiquetas do WhatsApp
  unread: number
  archived: boolean
  lastFromMe: boolean | null
  lastAt: number | null // ms desde 1970
}

export type ImportLabel = { name: string; color?: string }

export type ImportResult = {
  existing: number // já estavam no CRM (ignorados no modo "só novos")
  created: number
  updated: number
  skipped: number // telefone inválido
  listsCreated: number
  memberships: number
}

const DEFAULT_COLOR = "#3b82f6"
const GENERIC = new Set(["", "cliente whatsapp"])

/**
 * Importa etiquetas (viram listas) e contatos (com o estado da conversa).
 * Nunca apaga nada e nunca sobrescreve nome já cadastrado. Roda em lotes:
 * a extensão manda vários pedidos pequenos.
 */
export async function importFromWhatsApp(
  userId: string,
  labels: ImportLabel[],
  contacts: ImportContact[],
  onlyNew = false // true: quem já está no CRM não é tocado (nem nome, nem estado, nem listas)
): Promise<ImportResult> {
  const result: ImportResult = { existing: 0, created: 0, updated: 0, skipped: 0, listsCreated: 0, memberships: 0 }

  // No modo "só novos", as listas só são criadas se sobrar algum contato novo pra pôr nelas.
  if (onlyNew) {
    const have = await prisma.contact.findMany({ where: { userId }, select: { phone: true } })
    const tails = new Set(have.map((c) => normalizePhone(c.phone).slice(-8)))
    const fresh = contacts.filter((c) => {
      const d = normalizePhone(c.phone)
      return d.length >= 8 && !tails.has(d.slice(-8))
    })
    result.existing = contacts.filter((c) => normalizePhone(c.phone).length >= 8).length - fresh.length
    contacts = fresh
    const used = new Set(fresh.flatMap((c) => c.labels.map((n) => n.trim().toLowerCase())))
    labels = labels.filter((l) => used.has(l.name.trim().toLowerCase()))
  }

  // ── Listas: usa a que já existe com o mesmo nome; senão cria ──
  const existingLists = await prisma.crmList.findMany({ where: { userId }, orderBy: { order: "desc" } })
  const listByName = new Map(existingLists.map((l) => [l.name.trim().toLowerCase(), l.id]))
  let nextOrder = (existingLists[0]?.order ?? -1) + 1

  const wanted = new Map<string, string | undefined>() // nome minúsculo -> cor
  for (const l of labels) if (l.name.trim()) wanted.set(l.name.trim().toLowerCase(), l.color)
  for (const c of contacts) for (const n of c.labels) if (n.trim() && !wanted.has(n.trim().toLowerCase())) wanted.set(n.trim().toLowerCase(), undefined)

  const nameOf = new Map<string, string>() // minúsculo -> como veio escrito
  for (const l of labels) nameOf.set(l.name.trim().toLowerCase(), l.name.trim())
  for (const c of contacts) for (const n of c.labels) if (!nameOf.has(n.trim().toLowerCase())) nameOf.set(n.trim().toLowerCase(), n.trim())

  for (const [key, color] of wanted) {
    if (listByName.has(key)) continue
    const list = await prisma.crmList.create({
      data: {
        userId,
        name: (nameOf.get(key) ?? key).slice(0, 60),
        color: color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : DEFAULT_COLOR,
        order: nextOrder++,
      },
    })
    listByName.set(key, list.id)
    result.listsCreated++
  }

  // ── Contatos: um carregamento só, comparando pelos 8 últimos dígitos ──
  const all = await prisma.contact.findMany({
    where: { userId },
    select: { id: true, name: true, phone: true, waLastAt: true, waLastFromMe: true, waUnread: true, waArchived: true },
  })
  const byTail = new Map<string, (typeof all)[number]>()
  for (const c of all) {
    const tail = normalizePhone(c.phone).slice(-8)
    if (tail && !byTail.has(tail)) byTail.set(tail, c)
  }

  const now = new Date()
  const toCreate: { id: string; userId: string; name: string; phone: string; lastActivityAt: Date; waLastAt: Date | null; waLastFromMe: boolean | null; waUnread: number; waArchived: boolean; waSyncedAt: Date }[] = []
  const updates: { id: string; data: Record<string, unknown> }[] = []
  const links: { listId: string; contactId: string }[] = []
  const seenTail = new Set<string>()

  for (const c of contacts) {
    const digits = normalizePhone(c.phone)
    if (digits.length < 8 || digits.length > 15) { result.skipped++; continue }
    const tail = digits.slice(-8)
    if (seenTail.has(tail)) continue // mesmo número duas vezes no mesmo lote
    seenTail.add(tail)

    const lastAt = c.lastAt && c.lastAt > 0 && c.lastAt <= now.getTime() + 86_400_000 ? new Date(c.lastAt) : null
    const unread = Math.max(0, Math.min(9999, Math.trunc(c.unread || 0)))
    const name = (c.name || "").trim().slice(0, 100)

    let contactId: string
    const found = byTail.get(tail)
    if (found) {
      contactId = found.id
      const data: Record<string, unknown> = {}
      if (GENERIC.has(found.name.trim().toLowerCase()) && name) data.name = name
      if (found.waLastAt?.getTime() !== lastAt?.getTime()) data.waLastAt = lastAt
      if (found.waLastFromMe !== c.lastFromMe) data.waLastFromMe = c.lastFromMe
      if (found.waUnread !== unread) data.waUnread = unread
      if (found.waArchived !== c.archived) data.waArchived = c.archived
      data.waSyncedAt = now
      updates.push({ id: found.id, data })
      result.updated++
    } else {
      contactId = randomUUID()
      toCreate.push({
        id: contactId,
        userId,
        name: name || digits,
        phone: withCountryCode(digits),
        lastActivityAt: lastAt ?? now,
        waLastAt: lastAt,
        waLastFromMe: c.lastFromMe,
        waUnread: unread,
        waArchived: c.archived,
        waSyncedAt: now,
      })
      result.created++
    }

    for (const n of c.labels) {
      const listId = listByName.get(n.trim().toLowerCase())
      if (listId) links.push({ listId, contactId })
    }
  }

  if (toCreate.length) await prisma.contact.createMany({ data: toCreate })
  for (let i = 0; i < updates.length; i += 20) {
    await Promise.all(updates.slice(i, i + 20).map((u) => prisma.contact.update({ where: { id: u.id }, data: u.data })))
  }
  if (links.length) {
    const r = await prisma.crmListMember.createMany({ data: links, skipDuplicates: true })
    result.memberships = r.count
  }
  return result
}
