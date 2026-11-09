import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/crm-auth"
import {
  SHORTCUT_TAKEN, captionField, categoryField, contactNameField, contactPhoneField, isUniqueViolation,
  nameField, shortcutField, textField, toView,
} from "@/lib/quick-replies"
import { MEDIA_RULES, isMediaKind } from "@/lib/quick-reply-types"

const schema = z.object({
  name: nameField.optional(),
  category: categoryField,
  shortcut: shortcutField,
  favorite: z.boolean().optional(),
  text: z.string().optional(), // mensagem (Texto) ou legenda (Imagem, Vídeo, Documento)
  viewOnce: z.boolean().optional(),
  asVoiceNote: z.boolean().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
})

const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Dados inválidos"

// PATCH /api/crm/quick-replies/[id] -> edita. O tipo não muda (pra trocar, crie outra).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await ctx.params
  const current = await prisma.quickReply.findFirst({ where: { id, userId: user.id } })
  if (!current) return NextResponse.json({ error: "Resposta não encontrada" }, { status: 404 })

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 })
  const d = parsed.data

  const data: Record<string, unknown> = {}
  if (d.name !== undefined) data.name = d.name
  if (d.category !== undefined) data.category = d.category
  if (d.shortcut !== undefined) data.shortcut = d.shortcut
  if (d.favorite !== undefined) data.favorite = d.favorite

  if (d.text !== undefined) {
    if (current.type === "TEXT") {
      const t = textField.safeParse(d.text)
      if (!t.success) return NextResponse.json({ error: firstIssue(t.error) }, { status: 400 })
      data.text = t.data
    } else if (isMediaKind(current.type) && MEDIA_RULES[current.type].hasCaption) {
      // legenda: pode ficar vazia
      const c = captionField.safeParse(d.text)
      if (!c.success) return NextResponse.json({ error: firstIssue(c.error) }, { status: 400 })
      data.text = c.data
    } else {
      return NextResponse.json({ error: "Esta resposta não tem texto nem legenda." }, { status: 400 })
    }
  }
  if (d.viewOnce !== undefined) {
    if (current.type !== "IMAGE" && current.type !== "VIDEO") {
      return NextResponse.json({ error: "Visualização única só vale pra imagem e vídeo." }, { status: 400 })
    }
    data.viewOnce = d.viewOnce
  }
  if (d.asVoiceNote !== undefined) {
    if (current.type !== "AUDIO") {
      return NextResponse.json({ error: "\"Áudio gravado na hora\" só vale pra áudio." }, { status: 400 })
    }
    data.asVoiceNote = d.asVoiceNote
  }
  if (d.contactName !== undefined || d.contactPhone !== undefined) {
    if (current.type !== "CONTACT") return NextResponse.json({ error: "Esta resposta não é um contato." }, { status: 400 })
    if (d.contactName !== undefined) {
      const n = contactNameField.safeParse(d.contactName)
      if (!n.success) return NextResponse.json({ error: firstIssue(n.error) }, { status: 400 })
      data.contactName = n.data
    }
    if (d.contactPhone !== undefined) {
      const p = contactPhoneField.safeParse(d.contactPhone)
      if (!p.success) return NextResponse.json({ error: firstIssue(p.error) }, { status: 400 })
      data.contactPhone = p.data
    }
  }

  try {
    const updated = await prisma.quickReply.update({ where: { id }, data })
    return NextResponse.json(toView(updated))
  } catch (e) {
    if (isUniqueViolation(e)) return NextResponse.json({ error: SHORTCUT_TAKEN }, { status: 409 })
    throw e
  }
}

// DELETE /api/crm/quick-replies/[id]
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await ctx.params
  const res = await prisma.quickReply.deleteMany({ where: { id, userId: user.id } })
  if (res.count === 0) return NextResponse.json({ error: "Resposta não encontrada" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
