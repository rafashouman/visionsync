import { prisma } from "@/lib/prisma"
import { normalizePhone } from "@/lib/crm-auth"
import { findContactByPhone } from "@/lib/crm"
import { withCountryCode } from "@/lib/phone"
import { shouldCompleteContactName, usableContactName } from "@/lib/contact-name"
import { randomUUID } from "crypto"
import { Prisma } from "@prisma/client"

export type PurchaseInput = {
  amount: number
  productName?: string
  source?: "whatsapp" | "manual" | "ad"
  ctwaClid?: string
  purchasedAt?: string
  requestKey?: string
}

/** Cria a compra de um contato que já existe e marca a última atividade. */
export async function createPurchase(userId: string, contactId: string, data: PurchaseInput, attempt = 0): Promise<Awaited<ReturnType<typeof prisma.purchase.create>>> {
  const amountMinor = Math.round(data.amount * 100)
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > 2_147_483_647 || Math.abs(data.amount * 100 - amountMinor) > 0.00001) throw new Error("Informe um valor positivo com até duas casas decimais.")
  const requestKey = data.requestKey || randomUUID()
  const at = data.purchasedAt ? new Date(data.purchasedAt) : undefined
  if (at && (!Number.isFinite(at.getTime()) || at.getTime() > Date.now() + 60_000)) throw new Error("Data da compra inválida.")
  const duplicate = async () => {
    const old = await prisma.purchase.findUnique({ where: { userId_requestKey: { userId, requestKey } } })
    if (old && (old.contactId !== contactId || old.amountMinor !== amountMinor || old.productName !== (data.productName?.trim() || null) || old.source !== (data.source ?? "whatsapp") || old.ctwaClid !== (data.ctwaClid || null) || (at && old.purchasedAt.getTime() !== at.getTime()))) throw new Error("Chave de operação já usada com dados diferentes.")
    return old
  }
  const existing = await duplicate()
  if (existing) return existing
  try {
  return await prisma.$transaction(async tx => {
    const contact = await tx.contact.findFirst({ where: { id: contactId, userId }, select: { id: true } })
    if (!contact) throw new Error("Contato não encontrado nesta conta.")
    const purchase = await tx.purchase.create({
      data: {
        userId,
        contactId,
        amount: amountMinor / 100,
        amountMinor,
        currency: "BRL",
        requestKey,
        productName: data.productName?.trim() || null,
        source: data.source ?? "whatsapp",
        ctwaClid: data.ctwaClid || null,
        purchasedAt: at,
      },
    })
    await tx.contact.update({ where: { id: contact.id }, data: { lastActivityAt: new Date() } })
    return purchase
  })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 4) {
      await new Promise(resolve => setTimeout(resolve, 20 * (attempt + 1)))
      return createPurchase(userId, contactId, { ...data, requestKey }, attempt + 1)
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const old = await duplicate()
      if (old) return old
    }
    throw error
  }
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
    contact = await prisma.contact.upsert({
      where: { userId_phone: { userId, phone: withCountryCode(normalizePhone(data.phone)) } },
      update: {},
      create: {
        userId,
        name: usableContactName(data.name) || "Cliente WhatsApp",
        phone: withCountryCode(normalizePhone(data.phone)),
      },
    })
  } else if (shouldCompleteContactName(contact.name, contact.phone, data.name)) {
    contact = await prisma.contact.update({
      where: { id: contact.id },
      data: { name: usableContactName(data.name)! },
    })
  }

  const purchase = await createPurchase(userId, contact.id, data)
  return { contact, purchase }
}
