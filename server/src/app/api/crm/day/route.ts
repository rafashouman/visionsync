import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/crm-auth"
import { buildDay } from "@/lib/day"

// GET /api/crm/day -> números e listas do Painel do Dia.
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  return NextResponse.json(await buildDay(user.id))
}
