import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { generateApiToken, hashApiToken } from "@/lib/crm-auth"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { apiTokenHash: true, apiTokenExpiresAt: true },
  })
  return NextResponse.json({ configured: Boolean(user?.apiTokenHash && user.apiTokenExpiresAt && user.apiTokenExpiresAt > new Date()), expiresAt: user?.apiTokenExpiresAt ?? null })
}

export async function POST() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const token = generateApiToken()
  await prisma.user.update({ where: { id: session.user.id }, data: { apiToken: null, apiTokenHash: hashApiToken(token), apiTokenExpiresAt: new Date(Date.now() + 90 * 86400000) } })
  return NextResponse.json({ token })
}

export async function DELETE() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  await prisma.user.update({ where: { id: session.user.id }, data: { apiToken: null, apiTokenHash: null, apiTokenExpiresAt: null } })
  return NextResponse.json({ ok: true })
}
