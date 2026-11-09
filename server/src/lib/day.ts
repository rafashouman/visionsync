import { prisma } from "@/lib/prisma"
import { dayKey } from "@/lib/dates"
import { listReminders } from "@/lib/reminders"
import { listCharges } from "@/lib/charges"

const DAY_MS = 86_400_000
const BRT_OFFSET_HOURS = 3 // Brasília é UTC-3 (sem horário de verão desde 2019)

/** Meia-noite de hoje em Brasília, como instante UTC. */
function startOfTodayBrt(now = new Date()) {
  return new Date(`${dayKey(now)}T0${BRT_OFFSET_HOURS}:00:00Z`)
}

/** Tudo que o "Painel do Dia" mostra, de uma vez. */
export async function buildDay(userId: string) {
  const now = new Date()
  const start = startOfTodayBrt(now)
  const weekAgo = new Date(start.getTime() - 6 * DAY_MS)
  const waitFrom = new Date(now.getTime() - 72 * 3600_000)

  const [todayAgg, weekAgg, newContacts, reminders, charges, metaPending, waiting] = await Promise.all([
    prisma.purchase.aggregate({ where: { userId, purchasedAt: { gte: start } }, _count: { _all: true }, _sum: { amount: true } }),
    prisma.purchase.aggregate({ where: { userId, purchasedAt: { gte: weekAgo } }, _count: { _all: true }, _sum: { amount: true } }),
    prisma.contact.count({ where: { userId, createdAt: { gte: start } } }),
    listReminders(userId),
    listCharges(userId, "todas"),
    prisma.purchase.findMany({
      where: { userId, metaEventSent: false, purchasedAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } },
      select: { metaError: true },
    }),
    prisma.contact.findMany({
      where: { userId, waLastFromMe: false, waArchived: false, waLastAt: { gte: waitFrom } },
      orderBy: { waLastAt: "asc" },
      take: 8,
      select: { id: true, name: true, phone: true, waLastAt: true, waUnread: true },
    }),
  ])

  const open = reminders.reminders
  const dueToday = charges.charges.filter((c) => c.state === "pendente" && dayKey(new Date(c.dueDate)) === dayKey(now))

  const meta = { pendentes: 0, falhas: 0, semPixel: 0 }
  for (const p of metaPending) {
    if (!p.metaError) meta.pendentes++
    else if (p.metaError.startsWith("Sem pixel")) meta.semPixel++
    else if (!p.metaError.startsWith("Recompra não enviada") && !p.metaError.startsWith("Expirado")) meta.falhas++
  }

  return {
    compras: {
      hoje: { count: todayAgg._count._all, total: todayAgg._sum.amount ?? 0 },
      semana: { count: weekAgg._count._all, total: weekAgg._sum.amount ?? 0 },
    },
    contatosNovos: newContacts,
    lembretes: {
      atrasados: open.filter((r) => r.state === "atrasado").length,
      hoje: open.filter((r) => r.state === "hoje").length,
      lista: open.filter((r) => r.state === "atrasado" || r.state === "hoje").slice(0, 8),
    },
    cobrancas: {
      vencidas: charges.summary.vencidas,
      hoje: { count: dueToday.length, total: dueToday.reduce((s, c) => s + c.amount, 0) },
      aReceber: charges.summary.aReceber,
    },
    meta,
    aguardando: waiting.map((w) => ({ id: w.id, name: w.name, phone: w.phone, since: w.waLastAt?.toISOString() ?? null, unread: w.waUnread })),
  }
}
