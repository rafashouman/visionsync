import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { decryptSecret } from "@/lib/crypto"
import { META_GRAPH_VERSION } from "@/lib/meta"

// GET: pixels da conta e a qual pixel cada lista aponta. O token NUNCA volta inteiro, só os 4 últimos caracteres.
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const userId = session.user.id

  const [pixels, lists] = await Promise.all([
    prisma.metaPixel.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.crmList.findMany({
      where: { userId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, color: true, metaPixelId: true },
    }),
  ])

  return NextResponse.json({
    graphVersion: META_GRAPH_VERSION,
    pixels: pixels.map((p) => {
      let tokenHint = "(ilegível, salve de novo)"
      try {
        tokenHint = "••••" + decryptSecret(p.accessToken).slice(-4)
      } catch {}
      return {
        id: p.id,
        name: p.name,
        datasetId: p.datasetId,
        tokenHint,
        testEventCode: p.testEventCode ?? "",
        repeatMode: p.repeatMode,
        isDefault: p.isDefault,
      }
    }),
    lists,
  })
}
