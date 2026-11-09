import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/crm-auth"
import { dayKey, parseDay } from "@/lib/dates"
import { SOURCES } from "@/lib/sources"
import { getContactDetail } from "@/lib/contact-detail"

// GET /api/crm/contacts/[id] -> dados do lead, notas, etiquetas, estatísticas e compras.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await ctx.params
  const detail = await getContactDetail(user.id, id)
  if (!detail) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 })
  return NextResponse.json(detail)
}

const schema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  email: z.union([z.literal(""), z.string().trim().max(200).email("E-mail inválido")]).nullable().optional(),
  source: z.union([z.literal(""), z.enum(SOURCES)]).nullable().optional(), // ""/null apaga
  birthDate: z.string().nullable().optional(), // "YYYY-MM-DD"; ""/null apaga
  nextStep: z.string().trim().max(200).nullable().optional(), // null ou "" apaga
  nextStepAt: z.string().nullable().optional(), // "YYYY-MM-DD" ou ISO; null ou "" apaga
})

// PATCH /api/crm/contacts/[id] -> dados do lead e/ou próximo passo com prazo.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await ctx.params
  const contact = await prisma.contact.findFirst({ where: { id, userId: user.id } })
  if (!contact) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 })

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 })
  }
  const { name, email, source, birthDate, nextStep, nextStepAt } = parsed.data

  let due: Date | null | undefined = undefined
  if (nextStepAt !== undefined) {
    due = nextStepAt === null ? null : parseDay(nextStepAt)
    if (nextStepAt && due === null) {
      return NextResponse.json({ error: "Data inválida" }, { status: 400 })
    }
  }

  let birth: Date | null | undefined = undefined
  if (birthDate !== undefined) {
    birth = birthDate === null ? null : parseDay(birthDate)
    if (birthDate && birth === null) {
      return NextResponse.json({ error: "Data de nascimento inválida" }, { status: 400 })
    }
    if (birth && (dayKey(birth) > dayKey(new Date()) || birth.getUTCFullYear() < 1900)) {
      return NextResponse.json({ error: "Data de nascimento fora do possível" }, { status: 400 })
    }
  }

  const clearStep = nextStep !== undefined && !nextStep
  const touchesStep = nextStep !== undefined || nextStepAt !== undefined

  const updated = await prisma.contact.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(email !== undefined && { email: email || null }),
      ...(source !== undefined && { source: source || null }),
      ...(birth !== undefined && { birthDate: birth }),
      ...(nextStep !== undefined && { nextStep: nextStep || null }),
      // apagar o texto do passo também apaga o prazo
      ...(clearStep ? { nextStepAt: null } : due !== undefined ? { nextStepAt: due } : {}),
      // só mexer no próximo passo conta como atividade; corrigir e-mail ou nascimento não
      ...(touchesStep && { lastActivityAt: new Date() }),
    },
  })

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    source: updated.source,
    birthDate: updated.birthDate ? dayKey(updated.birthDate) : null,
    nextStep: updated.nextStep,
    nextStepAt: updated.nextStepAt?.toISOString() ?? null,
  })
}
