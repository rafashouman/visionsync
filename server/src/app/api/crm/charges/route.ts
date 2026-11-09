import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/crm-auth"
import { parseDay } from "@/lib/dates"
import { listCharges, type ChargeFilter } from "@/lib/charges"

const FILTERS: ChargeFilter[] = ["todas", "a_receber", "vencidas", "pagas"]

// GET /api/crm/charges?status=todas|a_receber|vencidas|pagas -> lista + resumo.
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const status = new URL(req.url).searchParams.get("status") ?? "todas"
  const filter = (FILTERS as string[]).includes(status) ? (status as ChargeFilter) : "todas"
  return NextResponse.json(await listCharges(user.id, filter))
}

const schema = z.object({
  contactId: z.string().min(1),
  amount: z.number().positive("Informe um valor maior que zero"),
  dueDate: z.string().min(1, "Informe o vencimento"),
  description: z.string().trim().max(200).optional(),
  paymentLink: z.string().trim().max(1000).optional(), // link de pagamento ou Pix copia-e-cola
})

// POST /api/crm/charges -> cria uma cobrança pendente.
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 })
  }
  const data = parsed.data

  const due = parseDay(data.dueDate)
  if (!due) return NextResponse.json({ error: "Data de vencimento inválida" }, { status: 400 })

  const contact = await prisma.contact.findFirst({ where: { id: data.contactId, userId: user.id }, select: { id: true } })
  if (!contact) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 })

  const [charge] = await prisma.$transaction([
    prisma.charge.create({
      data: {
        userId: user.id,
        contactId: contact.id,
        amount: data.amount,
        dueDate: due,
        description: data.description || null,
        paymentLink: data.paymentLink || null,
      },
    }),
    prisma.contact.update({ where: { id: contact.id }, data: { lastActivityAt: new Date() } }),
  ])

  return NextResponse.json({ id: charge.id }, { status: 201 })
}
