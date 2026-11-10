import { NextRequest, NextResponse } from "next/server"
import { getUserFromToken } from "@/lib/crm-auth"
import { whatsappDb, getConnection } from "@/lib/whatsapp/store"

export const runtime = "nodejs"
export async function GET(req: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" }
  try {
    const user = await getUserFromToken(req)
    if (!user) return NextResponse.json({ error: "Token inválido ou expirado." }, { status: 401, headers })
    const db = await whatsappDb()
    const connection = await getConnection(db, user.id)
    // Health only: no QR, credentials, contacts, message content or worker identity.
    return NextResponse.json({
      protocol: 1,
      checkedAt: new Date().toISOString(),
      tokenExpiresAt: user.apiTokenExpiresAt?.toISOString() ?? null,
      connector: {
        configured: !!connection,
        workerOnline: !!connection?.heartbeat && Date.now() - connection.heartbeat.getTime() < 45000,
        connected: connection?.state === "connected" && !!connection.desired,
        paused: connection?.config.paused ?? true,
        enabled: connection?.config.enabled ?? false,
      },
    }, { headers })
  } catch { return NextResponse.json({ error: "Não foi possível consultar a conexão do CRM." }, { status: 503, headers }) }
}
