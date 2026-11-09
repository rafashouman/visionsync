import { prisma } from "@/lib/prisma"
import { buildContact } from "@/lib/crm"
import { dayKey } from "@/lib/dates"

/**
 * Tudo sobre uma cliente para a gaveta do funil: dados do lead, notas e
 * histórico (compras, etiquetas, recorrência). Devolve null se o contato
 * não existe OU não é desta usuária.
 */
export async function getContactDetail(userId: string, contactId: string, purchasePage = 1) {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, userId } })
  if (!contact) return null

  const [notes, crm, charges, reminders] = await Promise.all([
    prisma.note.findMany({
      where: { contactId, userId },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, text: true, createdAt: true },
    }),
    buildContact(userId, contactId, purchasePage, contact),
    prisma.charge.findMany({
      where: { contactId, userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.reminder.findMany({
      where: { contactId, userId },
      orderBy: { dueAt: "desc" },
      take: 100,
    }),
  ])

  return {
    contact: {
      id: contact.id,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      source: contact.source,
      birthDate: contact.birthDate ? dayKey(contact.birthDate) : null, // "YYYY-MM-DD"
      lifecycleStage: contact.lifecycleStage ?? (crm.stats.count > 0 ? "cliente" : "lead"),
      leadStatus: contact.leadStatus ?? "novo",
      dealTitle: contact.dealTitle ?? null,
      dealValue: contact.dealValue ?? null,
      dealStage: contact.dealStage ?? (contact.dealValue ? "aberto" : null),
      nextStep: contact.nextStep ?? null,
      nextStepAt: contact.nextStepAt ? dayKey(contact.nextStepAt) : null,
    },
    notes: notes.map((n) => ({ id: n.id, text: n.text, createdAt: n.createdAt.toISOString() })),
    charges: charges.map((c) => ({
      id: c.id,
      amount: c.amountMinor != null ? c.amountMinor / 100 : c.amount,
      description: c.description,
      dueDate: dayKey(c.dueDate),
      status: c.status,
      paidAt: c.paidAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    })),
    reminders: reminders.map((r) => ({
      id: r.id,
      text: r.text,
      scheduledMessage: r.scheduledMessage ?? null,
      dueAt: r.dueAt.toISOString(),
      doneAt: r.doneAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    crm, // etiquetas, estatísticas e compras
  }
}
