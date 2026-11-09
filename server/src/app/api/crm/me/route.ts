import { NextRequest, NextResponse } from "next/server"
import { getUserFromToken } from "@/lib/crm-auth"

// Testa a conexão da extensão.
export async function GET(req: NextRequest) {
  const user = await getUserFromToken(req)
  if (!user) return NextResponse.json({ error: "Token inválido" }, { status: 401 })
  return NextResponse.json({ ok: true, name: user.name, email: user.email })
}
