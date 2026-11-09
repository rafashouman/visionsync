import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/crm-auth"
import {
  MAX_QUICK_REPLIES, SHORTCUT_TAKEN, captionField, categoryField, isUniqueViolation, nameField,
  shortcutField, toView,
} from "@/lib/quick-replies"
import { MAX_FILE_BYTES, MEDIA_RULES, isMediaKind } from "@/lib/quick-reply-types"
import { accountQuotaError, checkUpload } from "@/lib/quick-reply-files"

const flag = (v: FormDataEntryValue | null) => v === "true" || v === "on" || v === "1"
const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : undefined)
const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Dados inválidos"

/**
 * POST /api/crm/quick-replies/upload (multipart/form-data)
 * Cria uma resposta de Áudio, Imagem, Vídeo ou Documento, com o arquivo.
 * Campos: type, name, category?, shortcut?, text? (legenda), viewOnce?, asVoiceNote?, file.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  // Recusa antes de ler o corpo se já dá pra ver que é grande demais.
  const declared = Number(req.headers.get("content-length") ?? 0)
  if (declared > MAX_FILE_BYTES + 256 * 1024) {
    return NextResponse.json({ error: "Arquivo grande demais." }, { status: 413 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "Envio inválido." }, { status: 400 })
  }

  const type = str(form.get("type")) ?? ""
  if (!isMediaKind(type)) {
    return NextResponse.json({ error: "Tipo inválido para envio de arquivo." }, { status: 400 })
  }
  const rule = MEDIA_RULES[type]

  const name = nameField.safeParse(str(form.get("name")) ?? "")
  if (!name.success) return NextResponse.json({ error: firstIssue(name.error) }, { status: 400 })
  const category = categoryField.safeParse(str(form.get("category")) ?? null)
  if (!category.success) return NextResponse.json({ error: firstIssue(category.error) }, { status: 400 })
  const shortcut = shortcutField.safeParse(str(form.get("shortcut")) ?? null)
  if (!shortcut.success) return NextResponse.json({ error: firstIssue(shortcut.error) }, { status: 400 })

  const rawCaption = str(form.get("text")) ?? ""
  if (rawCaption.trim() && !rule.hasCaption) {
    return NextResponse.json({ error: "Este tipo não tem legenda." }, { status: 400 })
  }
  const caption = captionField.safeParse(rawCaption)
  if (!caption.success) return NextResponse.json({ error: firstIssue(caption.error) }, { status: 400 })

  const viewOnce = flag(form.get("viewOnce"))
  const asVoiceNote = flag(form.get("asVoiceNote"))
  if (viewOnce && type !== "IMAGE" && type !== "VIDEO") {
    return NextResponse.json({ error: "Visualização única só vale pra imagem e vídeo." }, { status: 400 })
  }
  if (asVoiceNote && type !== "AUDIO") {
    return NextResponse.json({ error: "\"Áudio gravado na hora\" só vale pra áudio." }, { status: 400 })
  }

  const checked = await checkUpload(type, form.get("file"))
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.status })

  const count = await prisma.quickReply.count({ where: { userId: user.id } })
  if (count >= MAX_QUICK_REPLIES) {
    return NextResponse.json({ error: `Limite de ${MAX_QUICK_REPLIES} respostas rápidas.` }, { status: 400 })
  }
  const quota = await accountQuotaError(user.id, checked.file.size)
  if (quota) return NextResponse.json({ error: quota }, { status: 400 })

  const last = await prisma.quickReply.aggregate({ where: { userId: user.id }, _max: { position: true } })

  try {
    const created = await prisma.quickReply.create({
      data: {
        userId: user.id,
        type,
        name: name.data,
        category: category.data ?? null,
        shortcut: shortcut.data ?? null,
        text: caption.data,
        mediaName: checked.file.name,
        mediaMime: checked.file.mime,
        mediaSize: checked.file.size,
        viewOnce,
        asVoiceNote,
        position: (last._max.position ?? -1) + 1,
        file: { create: { data: checked.file.data } },
      },
    })
    return NextResponse.json(toView(created), { status: 201 })
  } catch (e) {
    if (isUniqueViolation(e)) return NextResponse.json({ error: SHORTCUT_TAKEN }, { status: 409 })
    throw e
  }
}
