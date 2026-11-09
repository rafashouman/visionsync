import { prisma } from "@/lib/prisma"
import { dayKey } from "@/lib/dates"
import { pendingByContact } from "@/lib/charges"

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
  totals: { contacts: number; totalSpent: number }
  /** Cobranças em aberto da conta toda: a receber (ainda no prazo) e vencidas. */
  charges: { aReceber: { count: number; total: number }; vencidas: { count: number; total: number } }
  truncated: boolean // true se há mais contatos do que o limite de leitura
}

const CARDS_PER_COLUMN = 100
const MAX_CONTACTS = 2000
const DAY_MS = 86_400_000

export function nextStepState(nextStep: string | null, nextStepAt: Date | null, now = new Date()): NextStepState {
  if (!nextStep && !nextStepAt) return "nenhum"
  if (!nextStepAt) return "futuro"
  const due = dayKey(nextStepAt)
  const today = dayKey(now)
  if (due < today) return "atrasado"
  if (due === today) return "hoje"
  return "futuro"
}

export async function buildFunnel(userId: string): Promise<Funnel> {
  const now = new Date()

  const [lists, contacts, memberships, agg, due, noteCounts] = await Promise.all([
    prisma.crmList.findMany({
      where: { userId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
    prisma.contact.findMany({
      where: { userId },
      orderBy: { lastActivityAt: "desc" },
      take: MAX_CONTACTS + 1,
    }),
    prisma.crmListMember.findMany({
      where: { list: { userId } },
      select: { listId: true, contactId: true },
    }),
    prisma.purchase.groupBy({
      by: ["contactId"],
      where: { userId },
      _count: { _all: true },
      _sum: { amount: true },
      _max: { purchasedAt: true },
    }),
    pendingByContact(userId, now),
    prisma.note.groupBy({ by: ["contactId"], where: { userId }, _count: { _all: true } }),
  ])

  const truncated = contacts.length > MAX_CONTACTS
  const visible = truncated ? contacts.slice(0, MAX_CONTACTS) : contacts

  const stats = new Map(agg.map((a) => [a.contactId, a]))
  const notesBy = new Map(noteCounts.map((n) => [n.contactId, n._count._all]))

  const cards = new Map<string, FunnelCard>()
  for (const c of visible) {
    const s = stats.get(c.id)
    cards.set(c.id, {
      id: c.id,
      name: c.name,
      phone: c.phone,
      purchases: s?._count._all ?? 0,
      totalSpent: s?._sum.amount ?? 0,
      lastPurchaseAt: s?._max.purchasedAt?.toISOString() ?? null,
      nextStep: c.nextStep,
      nextStepAt: c.nextStepAt?.toISOString() ?? null,
      nextStepState: nextStepState(c.nextStep, c.nextStepAt, now),
      lastActivityAt: c.lastActivityAt.toISOString(),
      daysIdle: Math.max(0, Math.floor((now.getTime() - c.lastActivityAt.getTime()) / DAY_MS)),
      chargesDue: due.get(c.id) ?? null,
      source: c.source,
      notesCount: notesBy.get(c.id) ?? 0,
    })
  }

  // contatos já ordenados por atividade recente; mantemos essa ordem em cada coluna
  const order = visible.map((c) => c.id)
  const byList = new Map<string, Set<string>>()
  const inAnyList = new Set<string>()
  for (const m of memberships) {
    if (!cards.has(m.contactId)) continue
    if (!byList.has(m.listId)) byList.set(m.listId, new Set())
    byList.get(m.listId)!.add(m.contactId)
    inAnyList.add(m.contactId)
  }

  const pick = (ids: Set<string> | null) => {
    const all = order.filter((id) => (ids ? ids.has(id) : !inAnyList.has(id)))
    return { total: all.length, cards: all.slice(0, CARDS_PER_COLUMN).map((id) => cards.get(id)!) }
  }

  const columns: FunnelColumn[] = lists.map((l) => ({
    id: l.id,
    name: l.name,
    color: l.color,
    ...pick(byList.get(l.id) ?? new Set()),
  }))

  const totalSpent = [...cards.values()].reduce((sum, c) => sum + c.totalSpent, 0)

  // Cobranças em aberto (de todos os contatos, não só dos 2000 lidos)
  const charges = { aReceber: { count: 0, total: 0 }, vencidas: { count: 0, total: 0 } }
  for (const d of due.values()) {
    charges.vencidas.count += d.overdueCount
    charges.vencidas.total += d.overdueTotal
    charges.aReceber.count += d.count - d.overdueCount
    charges.aReceber.total += d.total - d.overdueTotal
  }

  return {
    lists: columns,
    unassigned: pick(null),
    totals: { contacts: visible.length, totalSpent },
    charges,
    truncated,
  }
}
