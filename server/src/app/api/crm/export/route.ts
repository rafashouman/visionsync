import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/crm-auth"
import { dayKey } from "@/lib/dates"

const MAX = 20000

// Planilha: se o texto começar com = + - @ o Excel pode tratar como fórmula. Prefixamos com apóstrofo.
function cell(v: string | number | null | undefined) {
  let s = v == null ? "" : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return `"${s.replace(/"/g, '""')}"`
}

// GET /api/crm/export -> todos os seus contatos em CSV (abre direto no Excel, separado por ponto e vírgula).
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const userId = user.id

  const [contacts, members, lists, purchases] = await Promise.all([
    prisma.contact.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, take: MAX }),
    prisma.crmListMember.findMany({ where: { list: { userId } }, select: { listId: true, contactId: true } }),
    prisma.crmList.findMany({ where: { userId }, select: { id: true, name: true } }),
    prisma.purchase.groupBy({
      by: ["contactId"],
      where: { userId },
      _count: { _all: true },
      _sum: { amount: true },
      _max: { purchasedAt: true },
    }),
  ])

  const listName = new Map(lists.map((l) => [l.id, l.name]))
  const listsOf = new Map<string, string[]>()
  for (const m of members) {
    const n = listName.get(m.listId)
    if (!n) continue
    if (!listsOf.has(m.contactId)) listsOf.set(m.contactId, [])
    listsOf.get(m.contactId)!.push(n)
  }
  const stats = new Map(purchases.map((p) => [p.contactId, p]))

  const header = ["Nome", "Telefone", "Listas", "Origem", "Compras", "Total gasto (R$)", "Última compra", "Cadastrado em", "Aguardando resposta"]
  const rows = contacts.map((c) => {
    const s = stats.get(c.id)
    return [
      c.name,
      c.phone,
      (listsOf.get(c.id) ?? []).join(" | "),
      c.source ?? "",
      s?._count._all ?? 0,
      (s?._sum.amount ?? 0).toFixed(2).replace(".", ","),
      s?._max.purchasedAt ? dayKey(s._max.purchasedAt) : "",
      dayKey(c.createdAt),
      c.waLastFromMe === false ? "sim" : "",
    ]
  })

  const csv = "﻿" + [header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n")
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contatos-${dayKey(new Date())}.csv"`,
      "X-Content-Type-Options": "nosniff",
    },
  })
}
