import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import { toMinor } from "@/lib/money"
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

export async function summarizeCharges(userId: string, now = new Date()) {
  const today = new Date(`${dayKey(now)}T03:00:00Z`)
  const summaryRows = await prisma.charge.aggregateRaw({ pipeline: [
      { $match: { userId } },
      { $group: { _id: { $cond: [{ $eq: ["$status", "PAID"] }, "pagas", { $cond: [
        { $eq: ["$status", "PENDING"] }, { $cond: [{ $lt: ["$dueDate", { $date: today.toISOString() }] }, "vencidas", "aReceber"] }, "canceladas"] }] },
        count: { $sum: 1 }, minor: { $sum: { $ifNull: ["$amountMinor", { $round: [{ $multiply: ["$amount", 100] }, 0] }] } } } },
    ] })
  const summary: ChargeSummary = { aReceber: { count: 0, total: 0 }, vencidas: { count: 0, total: 0 }, pagas: { count: 0, total: 0 } }
  for (const item of summaryRows as unknown as { _id: string; count: number; minor: number }[]) {
    if (item._id === "aReceber" || item._id === "vencidas" || item._id === "pagas") summary[item._id] = { count: item.count, total: item.minor / 100 }
  }
  return summary
}

export async function listCharges(userId: string, filter: ChargeFilter, page = 1) {
  page = Math.max(1, Math.min(100_000, Math.floor(page) || 1))
  const now = new Date()
  const today = new Date(`${dayKey(now)}T03:00:00Z`)
  const scopes: Record<ChargeFilter, Prisma.ChargeWhereInput> = {
    todas: {}, a_receber: { status: "PENDING", dueDate: { gte: today } },
    vencidas: { status: "PENDING", dueDate: { lt: today } }, pagas: { status: "PAID" },
  }
  const where = { userId, ...scopes[filter] }
  const [rows, total, summaryRows] = await Promise.all([
    prisma.charge.findMany({ where, include: { contact: { select: { name: true, phone: true } } },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }], skip: (page - 1) * MAX_CHARGES, take: MAX_CHARGES }),
    prisma.charge.count({ where }),
    summarizeCharges(userId, now),
  ])
  const summary = summaryRows
  const charges: ChargeView[] = rows.map(r => ({ id: r.id, contactId: r.contactId, contactName: r.contact.name,
    contactPhone: r.contact.phone, amount: r.amountMinor != null ? r.amountMinor / 100 : r.amount, description: r.description, dueDate: r.dueDate.toISOString(),
    state: chargeState(r.status, r.dueDate, now), paidAt: r.paidAt?.toISOString() ?? null, paymentLink: r.paymentLink }))
  return { charges, summary, total, page, hasMore: page * MAX_CHARGES < total, truncated: page * MAX_CHARGES < total }
}

/** Cobranças em aberto por contato, pra mostrar no card do funil. */
export async function pendingByContact(userId: string, now = new Date(), contactIds?: string[]) {
  const rows = await prisma.charge.findMany({
    where: { userId, status: "PENDING", ...(contactIds ? { contactId: { in: contactIds } } : {}) },
    select: { contactId: true, amount: true, amountMinor: true, dueDate: true },
  })
  const map = new Map<string, { count: number; total: number; overdue: boolean; overdueTotal: number; overdueCount: number }>()
  for (const r of rows) {
    const cur = map.get(r.contactId) ?? { count: 0, total: 0, overdue: false, overdueTotal: 0, overdueCount: 0 }
    cur.count += 1
    cur.total = (toMinor(cur.total) + (r.amountMinor ?? toMinor(r.amount))) / 100
    if (dayKey(r.dueDate) < dayKey(now)) {
      cur.overdue = true
      cur.overdueTotal = (toMinor(cur.overdueTotal) + (r.amountMinor ?? toMinor(r.amount))) / 100
      cur.overdueCount += 1
    }
    map.set(r.contactId, cur)
  }
  return map
}
