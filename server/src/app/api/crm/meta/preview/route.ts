import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { previewLatestEvent } from "@/lib/meta"

// GET: mostra como a última compra seria enviada ao Meta. Não envia nada.
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const preview = await previewLatestEvent(session.user.id)
  if (!preview) return NextResponse.json({ error: "Ainda não há compras registradas." }, { status: 404 })
  return NextResponse.json(preview)
}
