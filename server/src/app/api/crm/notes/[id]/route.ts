import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/crm-auth"

// DELETE /api/crm/notes/[id] -> apaga uma nota (só a dona dela).
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await ctx.params
  const res = await prisma.note.deleteMany({ where: { id, userId: user.id } })
  if (res.count === 0) return NextResponse.json({ error: "Nota não encontrada" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
