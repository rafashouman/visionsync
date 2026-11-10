import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/crm-auth"
import { MAX_QUICK_REPLIES, toView } from "@/lib/quick-replies"
import { isMediaKind } from "@/lib/quick-reply-types"
import { accountQuotaError } from "@/lib/quick-reply-files"
import { isMissingFile, readStoredFile, removeStoredFile, storeFile } from "@/lib/local-storage"

// POST /api/crm/quick-replies/[id]/duplicate -> cópia sem atalho (o atalho é único),
// com uso zerado e sem favorito. Nos tipos com arquivo, o arquivo também é copiado
// (e conta no limite de espaço da conta).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await ctx.params
  const src = await prisma.quickReply.findFirst({ where: { id, userId: user.id } })
  if (!src) return NextResponse.json({ error: "Resposta não encontrada" }, { status: 404 })
  if (src.type === "SEQUENCE") {
    return NextResponse.json({ error: "Este tipo ainda não pode ser duplicado." }, { status: 400 })
  }

  const count = await prisma.quickReply.count({ where: { userId: user.id } })
  if (count >= MAX_QUICK_REPLIES) {
    return NextResponse.json({ error: `Limite de ${MAX_QUICK_REPLIES} respostas rápidas.` }, { status: 400 })
  }

  let fileData: Uint8Array<ArrayBuffer> | null = null
  if (isMediaKind(src.type)) {
    const f = await prisma.quickReplyFile.findUnique({ where: { quickReplyId: src.id }, select: { data: true, storageKey: true } })
    if (!f) return NextResponse.json({ error: "O arquivo desta resposta não foi encontrado." }, { status: 409 })
    try { fileData = f.storageKey ? await readStoredFile(f.storageKey) : f.data }
    catch (error) { if (isMissingFile(error)) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 409 }); throw error }
    if (!fileData) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 409 })
    const quota = await accountQuotaError(user.id, src.mediaSize ?? fileData.length)
    if (quota) return NextResponse.json({ error: quota }, { status: 400 })
  }

  const last = await prisma.quickReply.aggregate({ where: { userId: user.id }, _max: { position: true } })

  const storageKey = fileData ? await storeFile(user.id, "files", fileData) : null
  let copy
  try { copy = await prisma.quickReply.create({
    data: {
      userId: user.id,
      type: src.type,
      name: `${src.name} (cópia)`.slice(0, 80),
      category: src.category,
      text: src.text,
      contactName: src.contactName,
      contactPhone: src.contactPhone,
      mediaName: src.mediaName,
      mediaMime: src.mediaMime,
      mediaSize: src.mediaSize,
      viewOnce: src.viewOnce,
      asVoiceNote: src.asVoiceNote,
      position: (last._max.position ?? -1) + 1,
      ...(storageKey ? { file: { create: { storageKey } } } : {}),
    },
  }) } catch (error) { await removeStoredFile(storageKey); throw error }
  return NextResponse.json(toView(copy), { status: 201 })
}
