import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getUserFromToken, normalizePhone } from "@/lib/crm-auth"
import { buildContact, findContactByPhone } from "@/lib/crm"

const schema = z.object({
  phone: z.string().min(1),
  name: z.string().optional(),
  listId: z.string().min(1),
  action: z.enum(["add", "remove"]),
})

export async function POST(req: NextRequest) {
  const user = await getUserFromToken(req)
  if (!user) return NextResponse.json({ error: "Token inválido" }, { status: 401 })

  let data: z.infer<typeof schema>
  try {
    data = schema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
  }

  if (!normalizePhone(data.phone)) {
    return NextResponse.json({ error: "Telefone inválido" }, { status: 400 })
  }

  const list = await prisma.crmList.findFirst({ where: { id: data.listId, userId: user.id } })
  if (!list) return NextResponse.json({ error: "Lista não encontrada" }, { status: 404 })

  let contact = await findContactByPhone(user.id, data.phone)
  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        userId: user.id,
        name: data.name?.trim() || "Cliente WhatsApp",
        phone: normalizePhone(data.phone),
      },
    })
  }

  if (data.action === "add") {
    await prisma.crmListMember.upsert({
      where: { listId_contactId: { listId: list.id, contactId: contact.id } },
      create: { listId: list.id, contactId: contact.id },
      update: {},
    })
  } else {
    await prisma.crmListMember.deleteMany({ where: { listId: list.id, contactId: contact.id } })
  }
  await prisma.contact.update({ where: { id: contact.id }, data: { lastActivityAt: new Date() } })

  return NextResponse.json(await buildContact(user.id, contact.id))
}
