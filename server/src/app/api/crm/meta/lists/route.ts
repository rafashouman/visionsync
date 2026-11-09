import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const schema = z.object({
  listId: z.string().min(1),
  pixelId: z.string().min(1).nullable(), // null = esta lista não envia
})

// PUT /api/crm/meta/lists -> escolhe qual pixel recebe as compras das clientes de uma lista.
export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const userId = session.user.id

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
  const { listId, pixelId } = parsed.data

  const list = await prisma.crmList.findFirst({ where: { id: listId, userId }, select: { id: true } })
  if (!list) return NextResponse.json({ error: "Lista não encontrada" }, { status: 404 })
  if (pixelId) {
    const pixel = await prisma.metaPixel.findFirst({ where: { id: pixelId, userId }, select: { id: true } })
    if (!pixel) return NextResponse.json({ error: "Pixel não encontrado" }, { status: 404 })
  }

  await prisma.crmList.update({ where: { id: listId }, data: { metaPixelId: pixelId } })
  return NextResponse.json({ ok: true })
}
