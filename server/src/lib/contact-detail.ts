import { prisma } from "@/lib/prisma"
import { buildContact } from "@/lib/crm"
import { dayKey } from "@/lib/dates"

/**
 * Tudo sobre uma cliente para a gaveta do funil: dados do lead, notas e
 * histórico (compras, etiquetas, recorrência). Devolve null se o contato
 * não existe OU não é desta usuária.
 */
export async function getContactDetail(userId: string, contactId: string) {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, userId } })
  if (!contact) return null

  const [notes, crm] = await Promise.all([
    prisma.note.findMany({
      where: { contactId, userId },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, text: true, createdAt: true },
    }),
    buildContact(userId, contactId),
  ])

  return {
    contact: {
      id: contact.id,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      source: contact.source,
      birthDate: contact.birthDate ? dayKey(contact.birthDate) : null, // "YYYY-MM-DD"
    },
    notes: notes.map((n) => ({ id: n.id, text: n.text, createdAt: n.createdAt.toISOString() })),
    crm, // etiquetas, estatísticas e compras
  }
}
