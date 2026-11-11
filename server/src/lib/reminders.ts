import { prisma } from "@/lib/prisma"
import { dayKey } from "@/lib/dates"

export type ReminderState = "atrasado" | "hoje" | "proximo" | "feito"

export type ReminderView = {
  id: string
  contactId: string
  contactName: string
  contactPhone: string
  text: string
  scheduledMessage: string | null
  scheduledReplyId?: string | null
  dueAt: string // ISO
  doneAt: string | null
  snoozeCount: number // quantas vezes foi adiado ("Adiadas")
  state: ReminderState
}

export function reminderState(dueAt: Date, doneAt: Date | null, now = new Date()): ReminderState {
  if (doneAt) return "feito"
  if (dueAt.getTime() < now.getTime() && dayKey(dueAt) < dayKey(now)) return "atrasado"
  if (dayKey(dueAt) === dayKey(now)) return dueAt.getTime() < now.getTime() ? "atrasado" : "hoje"
  return "proximo"
}

const MAX = 500

/** Lembretes abertos (ou os feitos recentes), do mais urgente pro mais distante. */
export async function listReminders(userId: string, opts: { contactId?: string; done?: boolean } = {}) {
  const now = new Date()
  const rows = await prisma.reminder.findMany({
    where: {
      userId,
      ...(opts.contactId && { contactId: opts.contactId }),
      ...(opts.done ? { doneAt: { not: null } } : { OR: [{ doneAt: null }, { doneAt: { isSet: false } }] }),
    },
    include: { contact: { select: { name: true, phone: true } } },
    orderBy: opts.done ? { doneAt: "desc" } : { dueAt: "asc" },
    take: MAX,
  })
  const reminders: ReminderView[] = rows.map((r) => ({
    id: r.id,
    contactId: r.contactId,
    contactName: r.contact.name,
    contactPhone: r.contact.phone,
    text: r.text,
    scheduledMessage: r.scheduledMessage ?? null,
    scheduledReplyId: r.scheduledReplyId ?? null,
    dueAt: r.dueAt.toISOString(),
    doneAt: r.doneAt?.toISOString() ?? null,
    snoozeCount: r.snoozeCount,
    state: reminderState(r.dueAt, r.doneAt, now),
  }))
  return { reminders }
}

/** Resumo pro cartão de números e pro menu. */
export async function reminderCounts(userId: string, now = new Date()) {
  const tomorrow = new Date(new Date(`${dayKey(now)}T03:00:00Z`).getTime() + 86_400_000)
  const open = { userId, OR: [{ doneAt: null }, { doneAt: { isSet: false } }] }
  const [atrasados, hoje, proximos, adiadas] = await Promise.all([
    prisma.reminder.count({ where: { ...open, dueAt: { lt: now } } }),
    prisma.reminder.count({ where: { ...open, dueAt: { gte: now, lt: tomorrow } } }),
    prisma.reminder.count({ where: { ...open, dueAt: { gte: tomorrow } } }),
    prisma.reminder.count({ where: { ...open, snoozeCount: { gt: 0 } } }),
  ])
  return { atrasados, hoje, proximos, adiadas }
}
