import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { toMinor, validAmount } from "@/lib/money"

export class InvalidChargeError extends Error {}

/** Account-scoped, atomic settlement. Conflict retries cannot duplicate the sale. */
export async function settleCharge(userId: string, id: string, attempt = 0): Promise<Awaited<ReturnType<typeof prisma.purchase.create>> | null> {
  try {
    return await prisma.$transaction(async tx => {
      const now = new Date()
      const claimed = await tx.charge.updateMany({ where: { id, userId, status: "PENDING" }, data: { status: "PAID", paidAt: now } })
      if (!claimed.count) return null
      const charge = await tx.charge.findUniqueOrThrow({ where: { id } })
      const minor = charge.amountMinor ?? toMinor(charge.amount)
      if (!validAmount(minor / 100) || charge.currency !== "BRL" || (charge.amountMinor == null && !validAmount(charge.amount))) throw new InvalidChargeError("Cobrança com valor ou moeda incompatível. Revise o cadastro antes da baixa.")
      const contact = await tx.contact.findFirst({ where: { id: charge.contactId, userId }, select: { id: true } })
      if (!contact) throw new InvalidChargeError("Contato não encontrado nesta conta.")
      const purchase = await tx.purchase.create({ data: { userId, contactId: charge.contactId,
        amount: minor / 100, amountMinor: minor, currency: charge.currency, requestKey: `charge:${id}`,
        productName: charge.description, source: "cobranca", purchasedAt: now } })
      await tx.charge.update({ where: { id }, data: { purchaseId: purchase.id } })
      await tx.contact.update({ where: { id: charge.contactId }, data: { lastActivityAt: now } })
      return purchase
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 4) {
      await new Promise(resolve => setTimeout(resolve, 20 * (attempt + 1)))
      return settleCharge(userId, id, attempt + 1)
    }
    throw error
  }
}
