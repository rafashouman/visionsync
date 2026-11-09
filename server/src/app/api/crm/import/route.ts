import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getAuthUser, normalizePhone } from "@/lib/crm-auth"
import { prisma } from "@/lib/prisma"
import { importFromWhatsApp } from "@/lib/import"

const schema = z.object({
  labels: z.array(z.object({ name: z.string().trim().min(1).max(60), color: z.string().max(20).optional() })).max(200),
  onlyNew: z.boolean().optional(),
  contacts: z
    .array(
      z.object({
        phone: z.string().max(40),
        name: z.string().max(200),
        labels: z.array(z.string().max(60)).max(30),
        unread: z.number().int().min(-1).max(100000),
        archived: z.boolean(),
        lastFromMe: z.boolean().nullable(),
        lastAt: z.number().nullable(),
      })
    )
    .max(300), // a extensão manda em lotes de até 300
})

// POST /api/crm/import -> importa etiquetas (viram listas) e contatos lidos do WhatsApp.
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Token inválido" }, { status: 401 })

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 })

  return NextResponse.json(await importFromWhatsApp(user.id, parsed.data.labels, parsed.data.contacts, parsed.data.onlyNew ?? false))
}

// GET /api/crm/import -> os 8 últimos dígitos de todo telefone que já está no CRM.
// A extensão usa isso pra mostrar, antes de importar, quantos são novos e quantos já existem.
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Token inválido" }, { status: 401 })
  const rows = await prisma.contact.findMany({ where: { userId: user.id }, select: { phone: true } })
  const tails = new Set<string>()
  for (const r of rows) {
    const t = normalizePhone(r.phone).slice(-8)
    if (t.length === 8) tails.add(t)
  }
  return NextResponse.json({ tails: [...tails] })
}
