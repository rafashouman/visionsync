import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { allowAuthAttempt } from "@/lib/auth-rate-limit"
import { passwordPairSchema } from "@/lib/password-policy"
import { resetPassword } from "@/lib/password-reset"
import { hasTrustedOrigin } from "@/lib/request-origin"

export async function POST(req: NextRequest) {
  if (!hasTrustedOrigin(req)) return NextResponse.json({ error: "Origem inválida" }, { status: 403 })
  const parsed = passwordPairSchema.and(z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) })).safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Confira o link e as duas senhas (mínimo de 8 caracteres)." }, { status: 400 })
  try {
    if (!await allowAuthAttempt("reset-submit:global", 30, 60_000)) return NextResponse.json({ error: "Muitas tentativas. Aguarde um minuto." }, { status: 429 })
    if (!await resetPassword(parsed.data.token, parsed.data.password)) return NextResponse.json({ error: "Este link expirou ou já foi utilizado. Solicite outro." }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ error: "Não foi possível redefinir a senha. Tente novamente." }, { status: 503 }) }
}
