import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/crm-auth"

const schema = z.object({
  contactId: z.string().min(1),
  fromListId: z.string().nullable().optional(), // null/ausente = veio de "Sem lista"
  toListId: z.string().nullable().optional(), // null/ausente = foi pra "Sem lista"
})

// POST /api/crm/funnel/move -> arrasta um card: sai da coluna de origem e entra na de destino.
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
  const { contactId, fromListId, toListId } = parsed.data

  if ((fromListId ?? null) === (toListId ?? null)) return NextResponse.json({ ok: true })

  const contact = await prisma.contact.findFirst({ where: { id: contactId, userId: user.id } })
  if (!contact) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 })

  // As duas listas precisam ser da própria usuária
  const wanted = [fromListId, toListId].filter((x): x is string => Boolean(x))
  const owned = await prisma.crmList.findMany({
    where: { id: { in: wanted }, userId: user.id },
    select: { id: true },
  })
  if (owned.length !== wanted.length) {
    return NextResponse.json({ error: "Lista não encontrada" }, { status: 404 })
  }

  await prisma.$transaction([
    ...(fromListId
      ? [prisma.crmListMember.deleteMany({ where: { listId: fromListId, contactId } })]
      : []),
    ...(toListId
      ? [
          prisma.crmListMember.upsert({
            where: { listId_contactId: { listId: toListId, contactId } },
            create: { listId: toListId, contactId },
            update: {},
          }),
        ]
      : []),
    prisma.contact.update({ where: { id: contactId }, data: { lastActivityAt: new Date() } }),
  ])

  return NextResponse.json({ ok: true })
}
