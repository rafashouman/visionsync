import { NextRequest, NextResponse, after } from "next/server"
import { z } from "zod"
import { getUserFromToken, normalizePhone } from "@/lib/crm-auth"
import { buildContact } from "@/lib/crm"
import { sendPurchaseEvent } from "@/lib/meta"
import { recordPurchaseByPhone } from "@/lib/purchases"

const schema = z.object({
  phone: z.string().min(1),
  name: z.string().optional(),
  amount: z.number().positive(),
  productName: z.string().optional(),
  source: z.enum(["whatsapp", "manual", "ad"]).optional(),
  ctwaClid: z.string().optional(),
  purchasedAt: z.string().optional(),
})

// POST /api/crm/purchase -> registra compra pelo telefone (cria o contato se não existir).
export async function POST(req: NextRequest) {
  const user = await getUserFromToken(req)
  if (!user) return NextResponse.json({ error: "Token inválido" }, { status: 401 })

  let data: z.infer<typeof schema>
  try {
    data = schema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
  }

  if (!normalizePhone(data.phone)) {
    return NextResponse.json({ error: "Telefone inválido" }, { status: 400 })
  }

  let result
  const key = req.headers.get("Idempotency-Key")
  if (key !== null && (!key.trim() || key.length > 128)) return NextResponse.json({ error: "Chave de operação inválida." }, { status: 400 })
  try { result = await recordPurchaseByPhone(user.id, { ...data, requestKey: key ?? undefined }) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível registrar a compra." }, { status: 409 }) }
  const { contact, purchase } = result

  // Envia a conversão ao Meta depois de responder. Se falhar, o erro fica salvo
  // na compra e dá pra reenviar pelo painel; a compra em si nunca é perdida.
  after(async () => {
    try {
      await sendPurchaseEvent(purchase.id)
    } catch (e) {
      console.error("[meta] falha inesperada ao enviar", e)
    }
  })

  return NextResponse.json(await buildContact(user.id, contact.id), { status: 201 })
}
