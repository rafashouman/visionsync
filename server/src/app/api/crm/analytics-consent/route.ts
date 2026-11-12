import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { hasTrustedOrigin } from "@/lib/request-origin"

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  if (!hasTrustedOrigin(req)) return NextResponse.json({ error: "Origem inválida" }, { status: 403 })
  const parsed = z.object({ analyticsConsent: z.boolean() }).strict().safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Preferência inválida." }, { status: 400 })
  try {
    await prisma.user.update({ where: { id: session.user.id }, data: { analyticsConsent: parsed.data.analyticsConsent } })
    return NextResponse.json({ analyticsConsent: parsed.data.analyticsConsent }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    console.error("[analytics-consent]", error)
    return NextResponse.json({ error: "Não foi possível salvar a preferência de analytics." }, { status: 503 })
  }
}
