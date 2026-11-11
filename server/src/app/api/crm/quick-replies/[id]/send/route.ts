import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getAuthUser } from "@/lib/crm-auth"
import { limitedBody } from "@/lib/local-storage"
import { whatsappDb, getConnection, putJob, ensureWhatsappIndexes, type Job, type PilotContact } from "@/lib/whatsapp/store"
import { readReplyMedia, PreparationError } from "@/lib/whatsapp/media"
import { renderMessage } from "@/lib/whatsapp/policy"

export const runtime = "nodejs"
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  try {
    const parsed = z.object({ phone: z.string().regex(/^[1-9]\d{9,14}$/), requestId: z.string().uuid(), approved: z.boolean().default(false) }).strict().safeParse(JSON.parse(Buffer.from(await limitedBody(req, 2000)).toString()))
    if (!parsed.success) return NextResponse.json({ error: "Destinatário ou pedido inválido" }, { status: 400 })
    const db = await whatsappDb()
    const connection = await getConnection(db, user.id)
    if (!connection?.config.enabled || connection.config.paused || !connection.desired || connection.state !== "connected" || !connection.heartbeat || Date.now() - connection.heartbeat.getTime() > 45000) return NextResponse.json({ error: "Conecte o WhatsApp e retome a fila em Envios no servidor." }, { status: 409 })
    const contact = await db.collection<PilotContact>("contacts").findOne({ userId: user.id, phone: parsed.data.phone })
    if (!contact || await db.collection("wa_exclusions").findOne({ userId: user.id, phone: parsed.data.phone })) return NextResponse.json({ error: "Contato indisponível ou bloqueado." }, { status: 409 })
    const { id } = await ctx.params
    const media = await readReplyMedia(db, user.id, id)
    await ensureWhatsappIndexes(db)
    const now = new Date()
    await putJob(db, { userId: user.id, contactId: contact._id, phone: contact.phone, name: contact.name, kind: "quick", text: renderMessage(media.caption, contact.name), attachment: media.attachment, dueAt: now, expiresAt: new Date(now.getTime() + 10 * 60000), eventAt: now, status: parsed.data.approved ? "queued" : "review", approved: parsed.data.approved, key: `quick:${parsed.data.requestId}` })
    const job = await db.collection<Job>("wa_jobs").findOne({ userId: user.id, key: `quick:${parsed.data.requestId}` })
    if (!job) return NextResponse.json({ error: "Não foi possível confirmar a fila. Confira antes de tentar novamente." }, { status: 503 })
    if (job.phone !== contact.phone || job.attachment?.replyId !== media.attachment.replyId) return NextResponse.json({ error: "Esta solicitação já pertence a outro envio." }, { status: 409 })
    return NextResponse.json({ id: job._id, status: job.status, queued: job.status === "queued", review: job.status === "review" }, { status: 202, headers: { "Cache-Control": "private, no-store" } })
  } catch (error) { return NextResponse.json({ error: error instanceof PreparationError ? error.message : "Não foi possível preparar o envio." }, { status: 400 }) }
}
