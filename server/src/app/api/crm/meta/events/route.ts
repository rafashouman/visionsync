import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET: últimas compras com o status do envio ao Meta e o pixel usado.
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const purchases = await prisma.purchase.findMany({
    where: { userId: session.user.id },
    orderBy: { purchasedAt: "desc" },
    take: 20,
    include: { contact: { select: { name: true } }, metaPixel: { select: { name: true } } },
  })

  return NextResponse.json(
    purchases.map((p) => ({
      id: p.id,
      contactName: p.contact.name,
      amount: p.amount,
      productName: p.productName,
      purchasedAt: p.purchasedAt.toISOString(),
      pixelName: p.metaPixel?.name ?? null,
      status: p.metaEventSent
        ? "enviado"
        : p.metaError?.startsWith("Expirado")
          ? "expirado"
          : p.metaError?.startsWith("Sem pixel")
            ? "sem_pixel"
            : p.metaError?.startsWith("Recompra não enviada")
              ? "ignorada"
              : p.metaError
                ? "falhou"
                : "pendente",
      error: p.metaError,
    }))
  )
}
