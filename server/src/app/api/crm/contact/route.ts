import { NextRequest, NextResponse } from "next/server"
import { getUserFromToken, normalizePhone } from "@/lib/crm-auth"
import { buildContact, emptyContact, findContactByPhone } from "@/lib/crm"
import { prisma } from "@/lib/prisma"
import { withCountryCode } from "@/lib/phone"
import { shouldCompleteContactName, usableContactName } from "@/lib/contact-name"
import { z } from "zod"

// GET /api/crm/contact?phone=...&name=...
export async function GET(req: NextRequest) {
  const user = await getUserFromToken(req)
  if (!user) return NextResponse.json({ error: "Token inválido" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const phone = searchParams.get("phone") ?? ""
  const name = searchParams.get("name")

  if (!normalizePhone(phone)) {
    return NextResponse.json({ error: "Telefone obrigatório" }, { status: 400 })
  }

  const contact = await findContactByPhone(user.id, phone)
  if (!contact) return NextResponse.json(emptyContact(name, phone))

  return NextResponse.json(await buildContact(user.id, contact.id))
}

export async function POST(req: NextRequest) {
  const user = await getUserFromToken(req)
  if (!user) return NextResponse.json({ error: "Token inválido" }, { status: 401 })
  const parsed = z.object({ phone: z.string().max(40), name: z.string().max(100) }).safeParse(await req.json().catch(() => null))
  const phone = parsed.success ? withCountryCode(normalizePhone(parsed.data.phone)) : ""
  const name = parsed.success ? usableContactName(parsed.data.name) : null
  if (!name || !/^[1-9]\d{9,14}$/.test(phone)) return NextResponse.json({ error: "Nome ou telefone inválido." }, { status: 400 })
  const contact = await prisma.contact.upsert({
    where: { userId_phone: { userId: user.id, phone } },
    create: { userId: user.id, phone, name },
    update: {},
  })
  if (shouldCompleteContactName(contact.name, contact.phone, name)) {
    await prisma.contact.updateMany({ where: { id: contact.id, userId: user.id, name: contact.name }, data: { name } })
  }
  return NextResponse.json(await buildContact(user.id, contact.id))
}
