import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { whatsappConnectionHealth, whatsappQueueHealth } from "@/lib/whatsapp/history"
import { getConnection, whatsappDb } from "@/lib/whatsapp/store"

export const runtime = "nodejs"

export async function GET() {
  const headers = { "Cache-Control": "private, no-store" }
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers })
  try {
    const db = await whatsappDb()
    const connection = await getConnection(db, session.user.id)
    const queue = await whatsappQueueHealth(db, session.user.id)
    const { connectionProblem } = whatsappConnectionHealth(connection)
    return NextResponse.json({ connectionProblem, review: queue.review, unreviewed: queue.unreviewed }, { headers })
  } catch (error) {
    console.error("[whatsapp health]", error)
    return NextResponse.json({ error: "Não foi possível consultar os envios." }, { status: 503, headers })
  }
}
