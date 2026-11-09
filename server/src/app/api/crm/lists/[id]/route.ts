import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/crm-auth"

const patchSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  order: z.number().int().optional(),
})

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Token inválido" }, { status: 401 })

  const { id } = await ctx.params
  const owned = await prisma.crmList.findFirst({ where: { id, userId: user.id } })
  if (!owned) return NextResponse.json({ error: "Lista não encontrada" }, { status: 404 })

  let data: z.infer<typeof patchSchema>
  try {
    data = patchSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
  }

  const list = await prisma.crmList.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.color !== undefined && { color: data.color }),
      ...(data.order !== undefined && { order: data.order }),
    },
  })

  return NextResponse.json({ id: list.id, name: list.name, color: list.color, order: list.order })
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Token inválido" }, { status: 401 })

  const { id } = await ctx.params
  const owned = await prisma.crmList.findFirst({ where: { id, userId: user.id } })
  if (!owned) return NextResponse.json({ error: "Lista não encontrada" }, { status: 404 })

  await prisma.crmList.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
