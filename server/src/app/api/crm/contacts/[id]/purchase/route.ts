import { NextRequest, NextResponse, after } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/crm-auth"
import { createPurchase } from "@/lib/purchases"
import { sendPurchaseEvent } from "@/lib/meta"

const schema = z.object({
  amount: z.number().positive("Informe um valor maior que zero"),
  productName: z.string().trim().max(120).optional(),
})

// POST /api/crm/contacts/[id]/purchase -> registra uma compra direto do card do funil.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await ctx.params
  const contact = await prisma.contact.findFirst({ where: { id, userId: user.id }, select: { id: true } })
  if (!contact) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 })

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 })
  }

  const purchase = await createPurchase(user.id, contact.id, { ...parsed.data, source: "manual" })

  after(async () => {
    try {
      await sendPurchaseEvent(purchase.id)
    } catch (e) {
      console.error("[meta] falha inesperada ao enviar", e)
    }
  })

  return NextResponse.json({ id: purchase.id }, { status: 201 })
}
