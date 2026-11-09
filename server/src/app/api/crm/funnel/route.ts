import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/crm-auth"
import { buildFunnel } from "@/lib/funnel"

// GET /api/crm/funnel -> o quadro inteiro: colunas (listas), cards e totais.
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const q = req.nextUrl.searchParams
  let pages: Record<string, number> = {}
  try {
    const raw: unknown = JSON.parse((q.get("pages") ?? "{}").slice(0, 10000))
    if (raw && typeof raw === "object" && !Array.isArray(raw)) pages = Object.fromEntries(Object.entries(raw).filter(([k, v]) => k.length < 100 && typeof v === "number" && Number.isSafeInteger(v) && v > 0))
  } catch { /* Malformed page state falls back to the first page. */ }
  return NextResponse.json(await buildFunnel(user.id, { q: q.get("q") ?? "", step: q.get("step") ?? "todos", source: q.get("source") ?? "todas", idle: q.get("idle") === "1", pages }))
}
