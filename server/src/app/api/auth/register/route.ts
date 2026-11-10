import { allowAuthAttempt } from "@/lib/auth-rate-limit"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { passwordPairSchema } from "@/lib/password-policy"
import { Prisma } from "@prisma/client"

const schema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().max(254).email().transform(v => v.toLowerCase()),
}).and(passwordPairSchema)

export async function POST(req: NextRequest) {
  if (!await allowAuthAttempt("register:global", 30, 60_000)) return NextResponse.json({ error: "Muitas tentativas. Aguarde um minuto." }, { status: 429, headers: { "Retry-After": "60" } })
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Confira nome, email e senha (mínimo de 8 caracteres)." }, { status: 400 })
  try {
    const { name, email, password } = parsed.data
    if (!await allowAuthAttempt(`register:${email}`, 5, 3_600_000)) return NextResponse.json({ error: "Muitas tentativas para este email. Tente mais tarde." }, { status: 429, headers: { "Retry-After": "3600" } })

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: "Email já cadastrado" }, { status: 409 })
    }

    const hashed = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({
      data: { name, email, password: hashed },
      select: { id: true, email: true, name: true },
    })

    return NextResponse.json(user, { status: 201 })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "Email já cadastrado" }, { status: 409 })
    }
    console.error("[register]", err)
    return NextResponse.json({ error: "Não foi possível criar a conta. Tente novamente." }, { status: 500 })
  }
}
