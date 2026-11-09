/** Datas no fuso de Brasília. Concentrado aqui pra a regra do "dia" ser uma só. */
export const TZ = "America/Sao_Paulo"

/** "2026-11-07" no fuso de Brasília, pra comparar dias sem erro de horário. */
export const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ })

/**
 * Lê uma data vinda da tela.
 * "2026-11-10" vira meio-dia de Brasília (15:00 UTC), pra o dia nunca "voltar"
 * pro dia anterior por causa do fuso. Aceita também um ISO completo.
 * Vazio ou inválido devolve null.
 */
export function parseDay(value: string): Date | null {
  const v = value.trim()
  if (!v) return null
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T15:00:00Z`) : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}
