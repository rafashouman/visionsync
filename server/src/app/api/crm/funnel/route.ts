import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/crm-auth"
import { buildFunnel } from "@/lib/funnel"

// GET /api/crm/funnel -> o quadro inteiro: colunas (listas), cards e totais.
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  return NextResponse.json(await buildFunnel(user.id))
}
