/**
 * Mensagem de cobrança pronta pra abrir no WhatsApp.
 * Sem imports de servidor: a tela também usa este arquivo.
 */
import { withCountryCode } from "@/lib/phone"
import { firstName } from "@/lib/names"

export type ChargeMessageInput = {
  name: string
  amount: number
  dueDate: string // ISO
  description?: string | null
  paymentLink?: string | null
}

const TZ = "America/Sao_Paulo"

export function buildChargeMessage(c: ChargeMessageInput): string {
  const value = c.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
  const due = new Date(c.dueDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: TZ })
  const who = firstName(c.name)
  const what = c.description?.trim() ? ` (${c.description.trim()})` : ""

  const lines = [
    `Oi${who ? `, ${who}` : ""}! Passando pra lembrar do pagamento${what} no valor de ${value}, com vencimento em ${due}.`,
  ]
  if (c.paymentLink?.trim()) lines.push("", `Pra pagar: ${c.paymentLink.trim()}`)
  lines.push("", "Qualquer dúvida é só me chamar. Obrigada!")
  return lines.join("\n")
}

export function whatsappLink(phone: string, text: string) {
  return `https://wa.me/${withCountryCode(phone)}?text=${encodeURIComponent(text)}`
}
