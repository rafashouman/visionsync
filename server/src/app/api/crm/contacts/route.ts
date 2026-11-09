import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getAuthUser, normalizePhone } from "@/lib/crm-auth"
import { findContactByPhone } from "@/lib/crm"
import { withCountryCode } from "@/lib/phone"

const schema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(100),
  phone: z.string().trim().min(1, "Informe o telefone"),
  listId: z.string().nullable().optional(), // já entra numa coluna
})

// GET /api/crm/contacts?q=maria -> busca por nome ou telefone (até 20), pra escolher uma cliente.
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim()
  const digits = normalizePhone(q)

  const contacts = await prisma.contact.findMany({
    where: {
      userId: user.id,
      ...(q && {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          ...(digits ? [{ phone: { contains: digits } }] : []),
        ],
      }),
    },
    orderBy: { lastActivityAt: "desc" },
    take: 20,
    select: { id: true, name: true, phone: true },
  })

  return NextResponse.json(contacts)
}

// POST /api/crm/contacts -> cria um contato à mão. Se o telefone já existe, devolve o existente.
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 })
  }
  const { name, phone, listId } = parsed.data

  const digits = normalizePhone(phone)
  if (digits.length < 8 || digits.length > 15) {
    return NextResponse.json({ error: "Telefone inválido. Use DDD + número (com 55 se quiser)." }, { status: 400 })
  }

  if (listId) {
    const list = await prisma.crmList.findFirst({ where: { id: listId, userId: user.id }, select: { id: true } })
    if (!list) return NextResponse.json({ error: "Lista não encontrada" }, { status: 404 })
  }

  let contact = await findContactByPhone(user.id, digits)
  const existed = Boolean(contact)
  if (!contact) {
    // Guarda no formato internacional (com 55), pro wa.me e o Meta funcionarem.
    contact = await prisma.contact.create({ data: { userId: user.id, name, phone: withCountryCode(digits) } })
  }

  if (listId) {
    await prisma.crmListMember.upsert({
      where: { listId_contactId: { listId, contactId: contact.id } },
      create: { listId, contactId: contact.id },
      update: {},
    })
    await prisma.contact.update({ where: { id: contact.id }, data: { lastActivityAt: new Date() } })
  }

  return NextResponse.json({ id: contact.id, name: contact.name, existed }, { status: existed ? 200 : 201 })
}
