import { allowAuthAttempt } from "@/lib/auth-rate-limit"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { requestPasswordReset } from "@/lib/password-reset"
import { isAccessEmailConfigured } from "@/lib/mail"

const schema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().max(254).email().transform(v => v.toLowerCase()),
  analyticsConsent: z.boolean().default(false),
})

export async function POST(req: NextRequest) {
  if (!await allowAuthAttempt("register:global", 30, 60_000)) return NextResponse.json({ error: "Muitas tentativas. Aguarde um minuto." }, { status: 429, headers: { "Retry-After": "60" } })
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Confira nome e email." }, { status: 400 })
  try {
    const { name, email, analyticsConsent } = parsed.data
    if (!await allowAuthAttempt(`register:${email}`, 5, 3_600_000)) return NextResponse.json({ error: "Muitas tentativas para este email. Tente mais tarde." }, { status: 429, headers: { "Retry-After": "3600" } })
    if (!isAccessEmailConfigured()) return NextResponse.json({ error: "Cadastro por email indisponível. Entre em contato com o administrador." }, { status: 503 })

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing?.password) {
      return NextResponse.json({ error: "Email já cadastrado" }, { status: 409 })
    }
    if (!existing) await prisma.user.create({ data: { name, email, analyticsConsent } })
    await requestPasswordReset(email, "activation")
    return NextResponse.json({ message: "Enviamos um link para confirmar seu email e definir sua senha." }, { status: 201 })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "Email já cadastrado" }, { status: 409 })
    }
    console.error("[register]", err)
    return NextResponse.json({ error: "Não foi possível criar a conta. Tente novamente." }, { status: 500 })
  }
}
