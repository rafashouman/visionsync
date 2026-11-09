import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/crm-auth"

const schema = z.object({
  action: z.enum(["done", "reopen", "snooze"]),
  until: z.string().optional(), // ISO, só pra snooze
})

/**
 * PATCH /api/crm/reminders/[id]
 *  - done:   marca como feito
 *  - reopen: volta pra abertos
 *  - snooze: adia pro horário `until` (tem que ser no futuro) e soma 1 em "adiadas"
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const { id } = await ctx.params

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
  const { action, until } = parsed.data

  const found = await prisma.reminder.findFirst({ where: { id, userId: user.id }, select: { id: true, contactId: true } })
  if (!found) return NextResponse.json({ error: "Lembrete não encontrado" }, { status: 404 })

  if (action === "snooze") {
    const when = until ? new Date(until) : null
    if (!when || Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      return NextResponse.json({ error: "Escolha um horário no futuro" }, { status: 400 })
    }
    await prisma.reminder.update({ where: { id }, data: { dueAt: when, doneAt: null, snoozeCount: { increment: 1 } } })
  } else if (action === "done") {
    await prisma.reminder.update({ where: { id }, data: { doneAt: new Date() } })
    await prisma.contact.update({ where: { id: found.contactId }, data: { lastActivityAt: new Date() } })
  } else {
    await prisma.reminder.update({ where: { id }, data: { doneAt: null } })
  }
  return NextResponse.json({ ok: true })
}

// DELETE /api/crm/reminders/[id]
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const { id } = await ctx.params
  const res = await prisma.reminder.deleteMany({ where: { id, userId: user.id } })
  if (res.count === 0) return NextResponse.json({ error: "Lembrete não encontrado" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
