import { NextRequest, NextResponse } from "next/server"
import { getUserFromToken, normalizePhone } from "@/lib/crm-auth"
import { buildContact, emptyContact, findContactByPhone } from "@/lib/crm"

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
