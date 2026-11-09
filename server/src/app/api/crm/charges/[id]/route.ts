import { NextRequest, NextResponse, after } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/crm-auth"
import { sendPurchaseEvent } from "@/lib/meta"

const schema = z.object({ action: z.enum(["pay", "cancel"]) })

/**
 * PATCH /api/crm/charges/[id]
 *  - pay:    marca como paga e cria a compra (que dispara o evento pro Meta)
 *  - cancel: cancela uma cobrança pendente
 * Só cobrança PENDENTE muda. Pagar duas vezes é recusado, pra não gerar duas
 * compras nem dois eventos de conversão.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await ctx.params
  const charge = await prisma.charge.findFirst({ where: { id, userId: user.id }, select: { id: true } })
  if (!charge) return NextResponse.json({ error: "Cobrança não encontrada" }, { status: 404 })

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Ação inválida" }, { status: 400 })

  if (parsed.data.action === "cancel") {
    const res = await prisma.charge.updateMany({
      where: { id, userId: user.id, status: "PENDING" },
      data: { status: "CANCELED" },
    })
    if (res.count === 0) {
      return NextResponse.json({ error: "Só uma cobrança pendente pode ser cancelada." }, { status: 409 })
    }
    return NextResponse.json({ ok: true })
  }

  // pay: "reserva" a cobrança (PENDING -> PAID) e cria a compra, tudo na mesma transação.
  const now = new Date()
  const purchase = await prisma.$transaction(async (tx) => {
    const claimed = await tx.charge.updateMany({
      where: { id, userId: user.id, status: "PENDING" },
      data: { status: "PAID", paidAt: now },
    })
    if (claimed.count === 0) return null

    const c = await tx.charge.findUniqueOrThrow({ where: { id } })
    const p = await tx.purchase.create({
      data: {
        userId: user.id,
        contactId: c.contactId,
        amount: c.amount,
        productName: c.description,
        source: "cobranca",
        purchasedAt: now,
      },
    })
    await tx.charge.update({ where: { id }, data: { purchaseId: p.id } })
    await tx.contact.update({ where: { id: c.contactId }, data: { lastActivityAt: now } })
    return p
  })

  if (!purchase) {
    return NextResponse.json({ error: "Esta cobrança já foi paga ou cancelada." }, { status: 409 })
  }

  after(async () => {
    try {
      await sendPurchaseEvent(purchase.id)
    } catch (e) {
      console.error("[meta] falha inesperada ao enviar", e)
    }
  })

  return NextResponse.json({ ok: true, purchaseId: purchase.id })
}
