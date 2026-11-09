import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/crm-auth"

// POST /api/crm/quick-replies/[id]/use -> soma 1 no "usada N×". A extensão chama ao enviar.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await ctx.params
  const res = await prisma.quickReply.updateMany({
    where: { id, userId: user.id },
    data: { usageCount: { increment: 1 } },
  })
  if (res.count === 0) return NextResponse.json({ error: "Resposta não encontrada" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
