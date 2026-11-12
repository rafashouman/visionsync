import { normalizePhone } from "@/lib/crm-auth"

export function usableContactName(name: string | null | undefined): string | null {
  const value = name?.trim().slice(0, 100) ?? ""
  return value && value.toLocaleLowerCase("pt-BR") !== "cliente whatsapp" && /\p{L}/u.test(value) ? value : null
}

export function shouldCompleteContactName(current: string, phone: string, candidate: string | null | undefined): boolean {
  const name = usableContactName(candidate)
  if (!name) return false
  const currentDigits = normalizePhone(current)
  return !usableContactName(current) || (currentDigits.length >= 8 && currentDigits === normalizePhone(phone))
}
