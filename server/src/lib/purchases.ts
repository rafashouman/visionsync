import { prisma } from "@/lib/prisma"
import { normalizePhone } from "@/lib/crm-auth"
import { findContactByPhone } from "@/lib/crm"

export type PurchaseInput = {
  amount: number
  productName?: string
  source?: "whatsapp" | "manual" | "ad"
  ctwaClid?: string
  purchasedAt?: string
}

/** Cria a compra de um contato que já existe e marca a última atividade. */
export async function createPurchase(userId: string, contactId: string, data: PurchaseInput) {
  const [purchase] = await prisma.$transaction([
    prisma.purchase.create({
      data: {
        userId,
        contactId,
        amount: data.amount,
        productName: data.productName?.trim() || null,
        source: data.source ?? "whatsapp",
        ctwaClid: data.ctwaClid || null,
        purchasedAt: data.purchasedAt ? new Date(data.purchasedAt) : undefined,
      },
    }),
    prisma.contact.update({ where: { id: contactId }, data: { lastActivityAt: new Date() } }),
  ])
  return purchase
}

/**
 * Registra a compra pelo telefone (usado pela extensão).
 * Cria o contato se ainda não existir e completa o nome se ele estava genérico.
 */
export async function recordPurchaseByPhone(
  userId: string,
  data: PurchaseInput & { phone: string; name?: string }
) {
  let contact = await findContactByPhone(userId, data.phone)
  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        userId,
        name: data.name?.trim() || "Cliente WhatsApp",
        phone: normalizePhone(data.phone),
      },
    })
  } else if (data.name?.trim() && (contact.name === "Cliente WhatsApp" || !contact.name)) {
    contact = await prisma.contact.update({
      where: { id: contact.id },
      data: { name: data.name.trim() },
    })
  }

  const purchase = await createPurchase(userId, contact.id, data)
  return { contact, purchase }
}
