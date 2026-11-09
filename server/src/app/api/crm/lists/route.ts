import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/crm-auth"

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Token inválido" }, { status: 401 })

  const lists = await prisma.crmList.findMany({
    where: { userId: user.id },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { members: true } } },
  })

  return NextResponse.json(
    lists.map((l) => ({ id: l.id, name: l.name, color: l.color, order: l.order, count: l._count.members }))
  )
}

const createSchema = z.object({
  name: z.string().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
})

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Token inválido" }, { status: 401 })

  let data: z.infer<typeof createSchema>
  try {
    data = createSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
  }

  const last = await prisma.crmList.findFirst({
    where: { userId: user.id },
    orderBy: { order: "desc" },
    select: { order: true },
  })

  const list = await prisma.crmList.create({
    data: {
      userId: user.id,
      name: data.name.trim(),
      color: data.color ?? "#3b82f6",
      order: (last?.order ?? -1) + 1,
    },
  })

  return NextResponse.json({ id: list.id, name: list.name, color: list.color, order: list.order, count: 0 }, { status: 201 })
}
