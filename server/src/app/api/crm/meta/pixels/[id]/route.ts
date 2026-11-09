import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { encryptSecret } from "@/lib/crypto"
import { REPEAT_MODES } from "@/lib/meta"

const schema = z.object({
  name: z.string().trim().min(1, "Dê um nome ao pixel").max(60).optional(),
  datasetId: z.string().trim().regex(/^\d{5,25}$/, "O ID do Pixel tem só números").optional(),
  accessToken: z.string().trim().max(1000).optional(), // vazio = mantém o atual
  testEventCode: z.string().trim().max(50).optional(),
  repeatMode: z.enum(REPEAT_MODES).optional(),
  isDefault: z.boolean().optional(),
})

// PUT /api/crm/meta/pixels/[id] -> edita o pixel.
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const userId = session.user.id
  const { id } = await ctx.params

  const found = await prisma.metaPixel.findFirst({ where: { id, userId }, select: { id: true } })
  if (!found) return NextResponse.json({ error: "Pixel não encontrado" }, { status: 404 })

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 })
  const d = parsed.data
  if (d.accessToken && d.accessToken.length < 10) return NextResponse.json({ error: "Token muito curto" }, { status: 400 })

  await prisma.$transaction(async (tx) => {
    if (d.isDefault) await tx.metaPixel.updateMany({ where: { userId, NOT: { id } }, data: { isDefault: false } })
    await tx.metaPixel.update({
      where: { id },
      data: {
        ...(d.name !== undefined && { name: d.name }),
        ...(d.datasetId !== undefined && { datasetId: d.datasetId }),
        ...(d.accessToken ? { accessToken: encryptSecret(d.accessToken) } : {}),
        ...(d.testEventCode !== undefined && { testEventCode: d.testEventCode || null }),
        ...(d.repeatMode !== undefined && { repeatMode: d.repeatMode }),
        ...(d.isDefault !== undefined && { isDefault: d.isDefault }),
      },
    })
  })
  return NextResponse.json({ ok: true })
}

// DELETE /api/crm/meta/pixels/[id] -> apaga o pixel. As listas que apontavam pra ele ficam sem pixel.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const { id } = await ctx.params
  const res = await prisma.metaPixel.deleteMany({ where: { id, userId: session.user.id } })
  if (res.count === 0) return NextResponse.json({ error: "Pixel não encontrado" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
