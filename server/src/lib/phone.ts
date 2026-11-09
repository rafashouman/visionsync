/**
 * Telefone no formato internacional, só dígitos.
 * Números com 10 ou 11 dígitos (DDD + número, sem código do país) ganham o 55 do Brasil.
 * O wa.me e o Meta exigem o código do país.
 * Sem imports de servidor: a tela também usa este arquivo.
 */
export function withCountryCode(raw: string): string {
  const digits = (raw ?? "").replace(/\D/g, "").replace(/^0+/, "")
  return digits.length === 10 || digits.length === 11 ? "55" + digits : digits
}
