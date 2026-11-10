import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { allowAuthAttempt } from "@/lib/auth-rate-limit"
import { requestPasswordReset } from "@/lib/password-reset"
import { hasTrustedOrigin } from "@/lib/request-origin"

export async function POST(req: NextRequest) {
  if (!hasTrustedOrigin(req)) return NextResponse.json({ error: "Origem inválida" }, { status: 403 })
  const parsed = z.object({ email: z.string().trim().max(254).email().transform(value => value.toLowerCase()) }).safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Informe um email válido." }, { status: 400 })
  try {
    if (!await allowAuthAttempt("reset:global", 30, 60_000) || !await allowAuthAttempt(`reset:${parsed.data.email}`, 3, 900_000)) return NextResponse.json({ error: "Muitas solicitações. Aguarde 15 minutos." }, { status: 429 })
    if (!process.env.RESEND_API_KEY || !process.env.AUTH_EMAIL_FROM || !(process.env.AUTH_URL || process.env.NEXTAUTH_URL)) return NextResponse.json({ error: "Recuperação de senha indisponível. Entre em contato com o suporte." }, { status: 503 })
    // A provider failure must not reveal whether an account exists.
    await requestPasswordReset(parsed.data.email).catch(() => console.error("[password-reset] Falha no envio do email de recuperação."))
    return NextResponse.json({ message: "Se este email estiver cadastrado, você receberá um link para redefinir sua senha. Confira também o spam." })
  } catch { return NextResponse.json({ error: "Não foi possível solicitar a recuperação. Tente novamente." }, { status: 503 }) }
}
