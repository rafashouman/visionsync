import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sendPendingForUser } from "@/lib/meta"

// POST: reenvia ao Meta as compras que ficaram pendentes ou falharam (até 7 dias atrás).
// Cada compra vai pro pixel da lista da cliente; sem pixel, ela é pulada com o motivo.
export async function POST() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  return NextResponse.json(await sendPendingForUser(session.user.id))
}
