import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/crm-auth"
import { hasTrustedOrigin } from "@/lib/request-origin"
import { categoryViews, libraryAction, sameMembers } from "@/lib/quick-reply-library"

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const [replies, categories] = await Promise.all([
    prisma.quickReply.findMany({ where: { userId: user.id }, select: { category: true }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] }),
    prisma.quickReplyCategory.findMany({ where: { userId: user.id } }),
  ])
  return NextResponse.json(categoryViews(replies, categories), { headers: { "Cache-Control": "private, no-store" } })
}
export async function PATCH(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  if (!req.headers.get("authorization") && !hasTrustedOrigin(req)) return NextResponse.json({ error: "Origem inválida" }, { status: 403 })
  const parsed = libraryAction.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Organização inválida" }, { status: 400 })
  const action = parsed.data
  try {
    await prisma.$transaction(async tx => {
      const [replies, saved] = await Promise.all([tx.quickReply.findMany({ where: { userId: user.id }, select: { id: true, category: true } }), tx.quickReplyCategory.findMany({ where: { userId: user.id } })])
      const categories = categoryViews(replies, saved)
      if (action.action === "reorder") {
        if (!sameMembers(replies.map(reply => reply.id), action.ids)) throw new Error("A biblioteca mudou. Atualize antes de reorganizar.")
        for (const [position, id] of action.ids.entries()) await tx.quickReply.updateMany({ where: { id, userId: user.id }, data: { position } })
      } else if (action.action === "categories") {
        if (!sameMembers(categories.map(category => category.name), action.names)) throw new Error("As categorias mudaram. Atualize antes de reorganizar.")
        for (const [position, name] of action.names.entries()) await tx.quickReplyCategory.upsert({ where: { userId_name: { userId: user.id, name } }, create: { userId: user.id, name, position, color: categories.find(category => category.name === name)!.color }, update: { position } })
      } else {
        const current = categories.find(category => category.name === action.previous)
        if (!current) throw new Error("Categoria não encontrada. Atualize a biblioteca.")
        if (action.previous !== action.name && categories.some(category => category.name === action.name)) throw new Error("Já existe uma categoria com esse nome.")
        await tx.quickReply.updateMany({ where: { userId: user.id, category: action.previous }, data: { category: action.name } })
        await tx.quickReplyCategory.deleteMany({ where: { userId: user.id, name: action.previous } })
        await tx.quickReplyCategory.upsert({ where: { userId_name: { userId: user.id, name: action.name } }, create: { userId: user.id, name: action.name, color: action.color, position: current.position }, update: { color: action.color, position: current.position } })
      }
    }, { timeout: 15000 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    const known = error instanceof Error && /biblioteca mudou|categorias mudaram|Categoria não encontrada|Já existe uma categoria/.test(error.message)
    return NextResponse.json({ error: known ? error.message : "Não foi possível salvar a organização. Atualize e tente novamente." }, { status: known ? 409 : 503 })
  }
}
