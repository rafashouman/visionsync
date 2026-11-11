import { z } from "zod"

export const kinds = ["birthday", "quote", "after_sale", "test", "quick", "scheduled"] as const
export type MessageKind = typeof kinds[number]
export const configSchema = z.object({
  enabled: z.boolean(), paused: z.boolean(), automatic: z.boolean(),
  birthday: z.boolean(), quote: z.boolean(), afterSale: z.boolean(),
  quoteDays: z.number().int().min(1).max(30), afterSaleDays: z.number().int().min(1).max(90),
  birthdayText: z.string().trim().min(1).max(2000),
  quoteText: z.string().trim().min(1).max(2000), afterSaleText: z.string().trim().min(1).max(2000),
  birthdayReplyId: z.string().max(100).nullable().optional(),
  quoteReplyId: z.string().max(100).nullable().optional(),
  afterSaleReplyId: z.string().max(100).nullable().optional(),
})
export type PilotConfig = z.infer<typeof configSchema>
export const defaults: PilotConfig = {
  enabled: false, paused: true, automatic: false, birthday: false, quote: false, afterSale: false,
  quoteDays: 2, afterSaleDays: 3,
  birthdayText: "Parabéns, {primeiro_nome}! 🎉 Desejamos um ótimo aniversário! Um abraço da NexuSync.",
  quoteText: "Oi, {primeiro_nome}! Ficou alguma dúvida sobre o orçamento que enviamos? Estou à disposição.",
  afterSaleText: "Oi, {primeiro_nome}! Como foi sua experiência com nosso serviço? Podemos ajudar em algo?",
}
export function renderMessage(template: string, name: string) {
  return template.replaceAll("{primeiro_nome}", name.trim().split(/\s+/)[0] || "Olá").replaceAll("{nome}", name.trim())
}
export function localParts(date: Date) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(date)
  const get = (key: string) => p.find(v => v.type === key)!.value
  return { day: `${get("year")}-${get("month")}-${get("day")}`, monthDay: `${get("month")}-${get("day")}`, year: get("year"), hour: Number(get("hour")) }
}
// The pilot uses Brasilia time. Offset is calculated with Intl, not the host timezone.
export function atNine(day: string) {
  const target = Date.parse(`${day}T09:00:00Z`)
  let instant = target
  for (let i = 0; i < 3; i++) {
    const p = localParts(new Date(instant))
    const shown = Date.parse(`${p.day}T${String(p.hour).padStart(2, "0")}:00:00Z`)
    instant += target - shown
  }
  return new Date(instant)
}
export function afterDays(eventAt: Date, days: number) {
  const day = localParts(eventAt).day
  const next = new Date(`${day}T12:00:00Z`)
  next.setUTCDate(next.getUTCDate() + days)
  return atNine(next.toISOString().slice(0, 10))
}
export function canSend(config: PilotConfig) {
  return config.enabled && !config.paused
}
