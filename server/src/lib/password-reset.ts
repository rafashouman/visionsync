import { createHash, randomBytes } from "node:crypto"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { sendAccessEmail } from "@/lib/mail"

export const resetTokenHash = (token: string) => createHash("sha256").update(token).digest("hex")

export async function requestPasswordReset(email: string, purpose: "reset" | "activation" = "reset") {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (!user) return
  const token = randomBytes(32).toString("hex")
  const id = resetTokenHash(token)
  await prisma.passwordReset.create({ data: { id, userId: user.id, expiresAt: new Date(Date.now() + 30 * 60_000) } })
  try {
    const url = new URL("/redefinir-senha", process.env.AUTH_URL || process.env.NEXTAUTH_URL)
    url.searchParams.set("token", token)
    await sendAccessEmail(email, purpose === "activation" ? "Confirme seu acesso ao VisionSync" : "Redefina sua senha do VisionSync", `${purpose === "activation" ? "Para confirmar seu email e definir sua senha" : "Recebemos uma solicitação para redefinir sua senha. Para continuar"}, acesse o link abaixo em até 30 minutos. Ele só pode ser usado uma vez.\n\n${url.href}\n\nSe não foi você, ignore este email. Sua senha permanece a mesma.`)
  } catch {
    await prisma.passwordReset.deleteMany({ where: { id } })
    throw new Error("Email delivery failed")
  }
}

export async function resetPassword(token: string, password: string) {
  const id = resetTokenHash(token)
  const passwordHash = await bcrypt.hash(password, 12)
  return prisma.$transaction(async tx => {
    const reset = await tx.passwordReset.findUnique({ where: { id } })
    if (!reset || reset.expiresAt <= new Date()) return false
    const user = await tx.user.findUnique({ where: { id: reset.userId }, select: { id: true } })
    if (!user) return false
    const consumed = await tx.passwordReset.deleteMany({ where: { id, expiresAt: { gt: new Date() } } })
    if (consumed.count !== 1) return false
    await tx.user.update({ where: { id: reset.userId }, data: { password: passwordHash, passwordChangedAt: new Date(), apiTokenHash: null, apiTokenExpiresAt: null, apiToken: null } })
    await tx.passwordReset.deleteMany({ where: { userId: reset.userId } })
    return true
  })
}
