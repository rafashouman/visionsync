import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/crm-auth"

const schema = z.object({
  text: z.string().trim().min(1, "Escreva a nota").max(2000, "A nota passou de 2000 caracteres"),
})

// POST /api/crm/contacts/[id]/notes -> adiciona uma nota à cliente.
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

  const note = await prisma.note.create({
    data: { userId: user.id, contactId: contact.id, text: parsed.data.text },
    select: { id: true, text: true, createdAt: true },
  })
  // Anotar conta como atividade: a cliente deixa de aparecer como "parada".
  await prisma.contact.update({ where: { id: contact.id }, data: { lastActivityAt: new Date() } })

  return NextResponse.json({ id: note.id, text: note.text, createdAt: note.createdAt.toISOString() }, { status: 201 })
}
