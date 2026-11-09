import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { randomBytes } from "crypto"

/** Autenticação da extensão: header `Authorization: Bearer <token>`. */
export async function getUserFromToken(req: NextRequest) {
  const header = req.headers.get("authorization") ?? ""
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : ""
  if (!token) return null
  return prisma.user.findUnique({ where: { apiToken: token } })
}

/**
 * Quem está chamando: a extensão (token Bearer) OU a taróloga logada no painel (sessão).
 * Use nas rotas que as duas partes compartilham.
 */
export async function getAuthUser(req: NextRequest) {
  const byToken = await getUserFromToken(req)
  if (byToken) return byToken
  const session = await auth()
  if (!session?.user?.id) return null
  return prisma.user.findUnique({ where: { id: session.user.id } })
}

export function generateApiToken() {
  return "crm_" + randomBytes(24).toString("hex")
}

/** Só dígitos (ex.: "+55 (11) 99999-9999" -> "5511999999999"). */
export function normalizePhone(phone: string) {
  return (phone ?? "").replace(/\D/g, "")
}
