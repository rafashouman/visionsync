import type { Prisma } from "@prisma/client"
import { sumMoney } from "@/lib/money"
import { prisma } from "@/lib/prisma"
import { dayKey } from "@/lib/dates"
import { pendingByContact, summarizeCharges } from "@/lib/charges"

export type NextStepState = "atrasado" | "hoje" | "futuro" | "nenhum"

export type FunnelCard = {
  id: string
  name: string
  phone: string
  purchases: number
  totalSpent: number
  lastPurchaseAt: string | null
  nextStep: string | null
  nextStepAt: string | null
  nextStepState: NextStepState
  lastActivityAt: string
  daysIdle: number
  /** Cobranças em aberto desta cliente (a receber ou vencidas). */
  chargesDue: { count: number; total: number; overdue: boolean; overdueTotal: number } | null
  source: string | null // origem do lead
  notesCount: number
  lifecycleStage: string | null
  leadStatus: string | null
  dealTitle: string | null
  dealValue: number | null
  dealStage: string | null
}

export type FunnelColumn = {
  id: string
  name: string
  color: string
  total: number // quantos contatos existem na coluna
  cards: FunnelCard[] // até CARDS_PER_COLUMN
}

export type Funnel = {
  lists: FunnelColumn[]
  unassigned: { total: number; cards: FunnelCard[] }
  totals: { contacts: number; totalSpent: number; pipelineValue?: number; openDealsCount?: number }
  /** Cobranças em aberto da conta toda: a receber (ainda no prazo) e vencidas. */
  charges: { aReceber: { count: number; total: number }; vencidas: { count: number; total: number } }
  matched: number
  pages: Record<string, number>
  truncated: boolean // true se há mais contatos do que o limite de leitura
}

const CARDS_PER_COLUMN = 100
const DAY_MS = 86_400_000
export type FunnelOptions = { q?: string; step?: string; source?: string; idle?: boolean; pages?: Record<string, number> }

export function nextStepState(nextStep: string | null, nextStepAt: Date | null, now = new Date()): NextStepState {
  if (!nextStep && !nextStepAt) return "nenhum"
  if (!nextStepAt) return "futuro"
  const due = dayKey(nextStepAt)
  const today = dayKey(now)
  if (due < today) return "atrasado"
  if (due === today) return "hoje"
  return "futuro"
}

export async function buildFunnel(userId: string, options: FunnelOptions = {}): Promise<Funnel> {
  const now = new Date()
  const today = new Date(`${dayKey(now)}T03:00:00Z`)
  const tomorrow = new Date(today.getTime() + DAY_MS)
  const conditions: Prisma.ContactWhereInput[] = [{ userId }]
  const q = options.q?.trim().slice(0, 100)
  if (q) { const digits = q.replace(/\D/g, ""); conditions.push({ OR: [{ name: { contains: q, mode: "insensitive" } }, ...(digits ? [{ phone: { contains: digits } }] : [])] }) }
  if (options.idle) conditions.push({ lastActivityAt: { lte: new Date(now.getTime() - 3 * DAY_MS) } })
  if (options.source === "sem") conditions.push({ OR: [{ source: null }, { source: { isSet: false } }, { source: "" }] })
  else if (options.source && options.source !== "todas") conditions.push({ source: options.source })
  if (options.step === "atrasado") conditions.push({ nextStepAt: { lt: today } })
  if (options.step === "hoje") conditions.push({ nextStepAt: { gte: today, lt: tomorrow } })
  if (options.step === "nenhum") conditions.push({ AND: [
    { OR: [{ nextStep: null }, { nextStep: { isSet: false } }, { nextStep: "" }] },
    { OR: [{ nextStepAt: null }, { nextStepAt: { isSet: false } }] },
  ] })
  const base: Prisma.ContactWhereInput = { AND: conditions }
  const [lists, totalContacts, matched, purchaseTotal, deals, chargeSummary] = await Promise.all([
    prisma.crmList.findMany({ where: { userId }, orderBy: [{ order: "asc" }, { createdAt: "asc" }] }),
    prisma.contact.count({ where: { userId } }), prisma.contact.count({ where: base }),
    prisma.purchase.aggregate({ where: { userId }, _sum: { amount: true } }),
    prisma.contact.aggregate({ where: { userId, dealValue: { gt: 0 }, OR: [{ dealStage: "aberto" }, { dealStage: null }, { dealStage: { isSet: false } }] }, _sum: { dealValue: true }, _count: { _all: true } }),
    summarizeCharges(userId, now),
  ])
  const pages: Record<string, number> = {}
  const columns = await Promise.all([{ id: "__none", name: "Sem lista", color: "var(--muted)" }, ...lists].map(async list => {
    const membership: Prisma.ContactWhereInput = list.id === "__none" ? { memberships: { none: {} } } : { memberships: { some: { listId: list.id } } }
    const where: Prisma.ContactWhereInput = { AND: [base, membership] }
    const total = await prisma.contact.count({ where })
    const page = Math.max(1, Math.min(Math.ceil(total / CARDS_PER_COLUMN) || 1, Math.floor(options.pages?.[list.id] ?? 1) || 1))
    pages[list.id] = page
    const contacts = await prisma.contact.findMany({ where, orderBy: [{ lastActivityAt: "desc" }, { id: "desc" }], skip: (page - 1) * CARDS_PER_COLUMN, take: CARDS_PER_COLUMN })
    return { list, total, contacts }
  }))
  const ids = [...new Set(columns.flatMap(c => c.contacts.map(x => x.id)))]
  const [agg, notes, due] = await Promise.all([
    prisma.purchase.groupBy({ by: ["contactId"], where: { userId, contactId: { in: ids } }, _count: { _all: true }, _sum: { amount: true }, _max: { purchasedAt: true } }),
    prisma.note.groupBy({ by: ["contactId"], where: { userId, contactId: { in: ids } }, _count: { _all: true } }),
    pendingByContact(userId, now, ids),
  ])
  const stats = new Map(agg.map(a => [a.contactId, a]))
  const noteCounts = new Map(notes.map(n => [n.contactId, n._count._all]))
  const result = columns.map(({ list, total, contacts }) => ({ id: list.id, name: list.name, color: list.color, total,
    cards: contacts.map(c => {
      const a = stats.get(c.id)
      return { id: c.id, name: c.name, phone: c.phone, purchases: a?._count._all ?? 0,
        totalSpent: sumMoney([a?._sum.amount ?? 0]), lastPurchaseAt: a?._max.purchasedAt?.toISOString() ?? null,
        nextStep: c.nextStep, nextStepAt: c.nextStepAt?.toISOString() ?? null, nextStepState: nextStepState(c.nextStep, c.nextStepAt, now),
        lastActivityAt: c.lastActivityAt.toISOString(), daysIdle: Math.max(0, Math.floor((now.getTime() - c.lastActivityAt.getTime()) / DAY_MS)),
        chargesDue: due.get(c.id) ?? null, source: c.source, notesCount: noteCounts.get(c.id) ?? 0,
        lifecycleStage: c.lifecycleStage ?? ((a?._count._all ?? 0) > 0 ? "cliente" : "lead"), leadStatus: c.leadStatus ?? "novo",
        dealTitle: c.dealTitle ?? null, dealValue: c.dealValue ?? null, dealStage: c.dealStage ?? (c.dealValue ? "aberto" : null) }
    }) }))
  return { lists: result.slice(1), unassigned: result[0], matched, pages,
    totals: { contacts: totalContacts, totalSpent: sumMoney([purchaseTotal._sum.amount ?? 0]), pipelineValue: sumMoney([deals._sum.dealValue ?? 0]), openDealsCount: deals._count._all },
    charges: { aReceber: chargeSummary.aReceber, vencidas: chargeSummary.vencidas },
    truncated: result.some(c => c.total > c.cards.length) }
}
