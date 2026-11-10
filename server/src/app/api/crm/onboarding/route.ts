import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { hasTrustedOrigin } from "@/lib/request-origin"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  if (!hasTrustedOrigin(req)) return NextResponse.json({ error: "Origem inválida" }, { status: 403 })
  await prisma.user.update({ where: { id: session.user.id }, data: { onboardingCompletedAt: new Date() } })
  return NextResponse.json({ ok: true })
}
