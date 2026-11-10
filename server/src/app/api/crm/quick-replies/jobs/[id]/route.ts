import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getAuthUser } from "@/lib/crm-auth"
import { whatsappDb, type Job } from "@/lib/whatsapp/store"

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store" }
  try {
    const user = await getAuthUser(req)
    if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers })
    const { id } = await ctx.params
    if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Envio inválido" }, { status: 400, headers })
    const db = await whatsappDb()
    const job = await db.collection<Job>("wa_jobs").findOne({ _id: id, userId: user.id, kind: "quick" }, { projection: { _id: 1, status: 1, updatedAt: 1 } })
    if (!job) return NextResponse.json({ error: "Envio não encontrado" }, { status: 404, headers })
    return NextResponse.json({ id: job._id, status: job.status, updatedAt: job.updatedAt.toISOString() }, { headers })
  } catch { return NextResponse.json({ error: "Não foi possível consultar o envio." }, { status: 503, headers }) }
}
