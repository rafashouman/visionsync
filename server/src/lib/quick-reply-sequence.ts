import { z } from "zod"
import { prisma } from "./prisma"

export const sequenceStepSchema = z.object({ text: z.string().max(1500).default(""), delaySec: z.number().min(0).max(60), quickReplyId: z.string().min(1).max(100).optional() }).refine(step => !!step.text.trim() || !!step.quickReplyId, "Cada passo precisa de texto ou mídia.")
export async function validateSequence(userId: string, raw: string) {
  if (!raw.trim().startsWith("[")) return null
  let value: unknown
  try { value = JSON.parse(raw) } catch { return "Sequência inválida." }
  const parsed = z.array(sequenceStepSchema).min(1).max(20).safeParse(value)
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Sequência inválida."
  const ids = [...new Set(parsed.data.flatMap(step => step.quickReplyId ? [step.quickReplyId] : []))]
  if (!ids.length) return null
  const rows = await prisma.quickReply.findMany({ where: { id: { in: ids }, userId, type: { in: ["AUDIO", "IMAGE"] }, viewOnce: false }, select: { id: true, type: true } })
  if (rows.length !== ids.length) return "Use somente áudios e imagens da sua biblioteca, sem visualização única."
  if (parsed.data.some(step => step.text.trim() && rows.some(r => r.id === step.quickReplyId && r.type === "AUDIO"))) return "Áudio ocupa um passo próprio. Adicione o texto em outro passo."
  return null
}
