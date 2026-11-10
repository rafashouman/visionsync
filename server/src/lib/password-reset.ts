import { createHash, randomBytes } from "node:crypto"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"

export const resetTokenHash = (token: string) => createHash("sha256").update(token).digest("hex")

export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (!user) return
  const token = randomBytes(32).toString("hex")
  const id = resetTokenHash(token)
  await prisma.passwordReset.create({ data: { id, userId: user.id, expiresAt: new Date(Date.now() + 30 * 60_000) } })
  try {
    const url = new URL("/redefinir-senha", process.env.AUTH_URL || process.env.NEXTAUTH_URL)
    url.searchParams.set("token", token)
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.AUTH_EMAIL_FROM, to: [email], subject: "Redefina sua senha do VisionSync", text: `Recebemos uma solicitação para redefinir sua senha. Acesse o link abaixo em até 30 minutos. Ele só pode ser usado uma vez.\n\n${url.href}\n\nSe não foi você, ignore este email. Sua senha permanece a mesma.` }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error("Email delivery failed")
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
    const consumed = await tx.passwordReset.deleteMany({ where: { id, expiresAt: { gt: new Date() } } })
    if (consumed.count !== 1) return false
    await tx.user.update({ where: { id: reset.userId }, data: { password: passwordHash, passwordChangedAt: new Date(), apiTokenHash: null, apiTokenExpiresAt: null, apiToken: null } })
    await tx.passwordReset.deleteMany({ where: { userId: reset.userId } })
    return true
  })
}
