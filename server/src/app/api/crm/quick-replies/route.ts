import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/crm-auth"
import {
  MAX_QUICK_REPLIES, SHORTCUT_TAKEN, categoryField, contactNameField, contactPhoneField,
  isUniqueViolation, kindField, nameField, shortcutField, textField, toView, unavailableTypeMessage,
} from "@/lib/quick-replies"
import { isMediaKind } from "@/lib/quick-reply-types"

// GET /api/crm/quick-replies -> todas as respostas rápidas da conta, na ordem manual.
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const rows = await prisma.quickReply.findMany({
    where: { userId: user.id },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  })
  return NextResponse.json(rows.map(toView))
}

const base = z.object({
  type: kindField,
  name: nameField,
  category: categoryField,
  shortcut: shortcutField,
  text: z.string().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
})

const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Dados inválidos"

// POST /api/crm/quick-replies -> cria uma resposta rápida (hoje: Texto e Contato).
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const parsed = base.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 })
  const d = parsed.data

  const unavailable = unavailableTypeMessage(d.type)
  if (unavailable) return NextResponse.json({ error: unavailable }, { status: 400 })
  if (isMediaKind(d.type)) {
    return NextResponse.json({ error: "Para este tipo é preciso enviar o arquivo (POST /api/crm/quick-replies/upload)." }, { status: 400 })
  }

  // Campos do tipo
  let text: string | null = null
  let contactName: string | null = null
  let contactPhone: string | null = null
  if (d.type === "TEXT") {
    const t = textField.safeParse(d.text)
    if (!t.success) return NextResponse.json({ error: firstIssue(t.error) }, { status: 400 })
    text = t.data
  } else if (d.type === "CONTACT") {
    const n = contactNameField.safeParse(d.contactName)
    if (!n.success) return NextResponse.json({ error: firstIssue(n.error) }, { status: 400 })
    const p = contactPhoneField.safeParse(d.contactPhone)
    if (!p.success) return NextResponse.json({ error: firstIssue(p.error) }, { status: 400 })
    contactName = n.data
    contactPhone = p.data
  }

  const count = await prisma.quickReply.count({ where: { userId: user.id } })
  if (count >= MAX_QUICK_REPLIES) {
    return NextResponse.json({ error: `Limite de ${MAX_QUICK_REPLIES} respostas rápidas.` }, { status: 400 })
  }
  const last = await prisma.quickReply.aggregate({ where: { userId: user.id }, _max: { position: true } })

  try {
    const created = await prisma.quickReply.create({
      data: {
        userId: user.id,
        type: d.type,
        name: d.name,
        category: d.category ?? null,
        shortcut: d.shortcut ?? null,
        text,
        contactName,
        contactPhone,
        position: (last._max.position ?? -1) + 1,
      },
    })
    return NextResponse.json(toView(created), { status: 201 })
  } catch (e) {
    if (isUniqueViolation(e)) return NextResponse.json({ error: SHORTCUT_TAKEN }, { status: 409 })
    throw e
  }
}
