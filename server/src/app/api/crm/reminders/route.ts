import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/crm-auth"
import { listReminders } from "@/lib/reminders"

// GET /api/crm/reminders?contactId=...&status=abertos|feitos
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const sp = new URL(req.url).searchParams
  return NextResponse.json(
    await listReminders(user.id, { contactId: sp.get("contactId") || undefined, done: sp.get("status") === "feitos" })
  )
}

const schema = z.object({
  contactId: z.string().min(1),
  text: z.string().trim().min(1, "Escreva o lembrete").max(300, "O lembrete passou de 300 caracteres"),
  dueAt: z.string().min(1, "Informe quando"),
})

// POST /api/crm/reminders -> cria um lembrete pra uma cliente.
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 })

  const due = new Date(parsed.data.dueAt)
  if (Number.isNaN(due.getTime())) return NextResponse.json({ error: "Data inválida" }, { status: 400 })

  const contact = await prisma.contact.findFirst({ where: { id: parsed.data.contactId, userId: user.id }, select: { id: true } })
  if (!contact) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 })

  const r = await prisma.reminder.create({
    data: { userId: user.id, contactId: contact.id, text: parsed.data.text, dueAt: due },
  })
  await prisma.contact.update({ where: { id: contact.id }, data: { lastActivityAt: new Date() } })
  return NextResponse.json({ id: r.id }, { status: 201 })
}
