import { prisma } from "@/lib/prisma"
import { dayKey } from "@/lib/dates"

export type ChargeState = "pendente" | "vencida" | "paga" | "cancelada"
export type ChargeFilter = "todas" | "a_receber" | "vencidas" | "pagas"

export type ChargeView = {
  id: string
  contactId: string
  contactName: string
  contactPhone: string
  amount: number
  description: string | null
  dueDate: string
  state: ChargeState
  paidAt: string | null
  paymentLink: string | null
}

export type ChargeSummary = {
  aReceber: { count: number; total: number }
  vencidas: { count: number; total: number }
  pagas: { count: number; total: number }
}

const MAX_CHARGES = 500

/** "Vencida" não existe no banco: é pendente com vencimento antes de hoje. */
export function chargeState(
  status: "PENDING" | "PAID" | "CANCELED",
  dueDate: Date,
  now = new Date()
): ChargeState {
  if (status === "PAID") return "paga"
  if (status === "CANCELED") return "cancelada"
  return dayKey(dueDate) < dayKey(now) ? "vencida" : "pendente"
}

const RANK: Record<ChargeState, number> = { vencida: 0, pendente: 1, paga: 2, cancelada: 3 }

export async function listCharges(userId: string, filter: ChargeFilter) {
  const now = new Date()
  const rows = await prisma.charge.findMany({
    where: { userId },
    include: { contact: { select: { name: true, phone: true } } },
    orderBy: { createdAt: "desc" },
    take: MAX_CHARGES,
  })

  const all: ChargeView[] = rows.map((r) => ({
    id: r.id,
    contactId: r.contactId,
    contactName: r.contact.name,
    contactPhone: r.contact.phone,
    amount: r.amount,
    description: r.description,
    dueDate: r.dueDate.toISOString(),
    state: chargeState(r.status, r.dueDate, now),
    paidAt: r.paidAt?.toISOString() ?? null,
    paymentLink: r.paymentLink,
  }))

  const sum = (state: ChargeState) => {
    const items = all.filter((c) => c.state === state)
    return { count: items.length, total: items.reduce((s, c) => s + c.amount, 0) }
  }
  const summary: ChargeSummary = { aReceber: sum("pendente"), vencidas: sum("vencida"), pagas: sum("paga") }

  const wanted: Record<ChargeFilter, (c: ChargeView) => boolean> = {
    todas: () => true,
    a_receber: (c) => c.state === "pendente",
    vencidas: (c) => c.state === "vencida",
    pagas: (c) => c.state === "paga",
  }

  const charges = all.filter(wanted[filter]).sort((a, b) => {
    if (RANK[a.state] !== RANK[b.state]) return RANK[a.state] - RANK[b.state]
    if (a.state === "paga") return (b.paidAt ?? "").localeCompare(a.paidAt ?? "")
    return a.dueDate.localeCompare(b.dueDate)
  })

  return { charges, summary, truncated: rows.length === MAX_CHARGES }
}

/** Cobranças em aberto por contato, pra mostrar no card do funil. */
export async function pendingByContact(userId: string, now = new Date()) {
  const rows = await prisma.charge.findMany({
    where: { userId, status: "PENDING" },
    select: { contactId: true, amount: true, dueDate: true },
  })
  const map = new Map<string, { count: number; total: number; overdue: boolean; overdueTotal: number; overdueCount: number }>()
  for (const r of rows) {
    const cur = map.get(r.contactId) ?? { count: 0, total: 0, overdue: false, overdueTotal: 0, overdueCount: 0 }
    cur.count += 1
    cur.total += r.amount
    if (dayKey(r.dueDate) < dayKey(now)) {
      cur.overdue = true
      cur.overdueTotal += r.amount
      cur.overdueCount += 1
    }
    map.set(r.contactId, cur)
  }
  return map
}
