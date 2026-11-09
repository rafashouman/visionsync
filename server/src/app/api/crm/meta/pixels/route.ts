import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { encryptSecret } from "@/lib/crypto"
import { REPEAT_MODES } from "@/lib/meta"

const MAX_PIXELS = 10

const pixelFields = {
  name: z.string().trim().min(1, "Dê um nome ao pixel").max(60),
  datasetId: z.string().trim().regex(/^\d{5,25}$/, "O ID do Pixel tem só números"),
  testEventCode: z.string().trim().max(50).optional(),
  repeatMode: z.enum(REPEAT_MODES).optional(),
  isDefault: z.boolean().optional(),
}

const createSchema = z.object({
  ...pixelFields,
  accessToken: z.string().trim().min(10, "Cole o token de acesso").max(1000),
})

// POST /api/crm/meta/pixels -> cadastra um pixel.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const userId = session.user.id

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 })
  const d = parsed.data

  if ((await prisma.metaPixel.count({ where: { userId } })) >= MAX_PIXELS) {
    return NextResponse.json({ error: `Limite de ${MAX_PIXELS} pixels.` }, { status: 400 })
  }

  const pixel = await prisma.$transaction(async (tx) => {
    if (d.isDefault) await tx.metaPixel.updateMany({ where: { userId }, data: { isDefault: false } })
    return tx.metaPixel.create({
      data: {
        userId,
        name: d.name,
        datasetId: d.datasetId,
        accessToken: encryptSecret(d.accessToken),
        testEventCode: d.testEventCode || null,
        repeatMode: d.repeatMode ?? "purchase",
        isDefault: d.isDefault ?? false,
      },
    })
  })
  return NextResponse.json({ id: pixel.id }, { status: 201 })
}
