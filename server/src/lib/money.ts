/** BRL compatibility boundary: all arithmetic uses integer cents. */
export function toMinor(amount: number) {
  const minor = Math.round(amount * 100)
  if (!Number.isSafeInteger(minor)) throw new Error("Valor fora do limite permitido.")
  return minor
}
export function validAmount(amount: number) {
  return Number.isFinite(amount) && amount > 0 && amount <= 21_474_836.47 && Math.abs(amount * 100 - Math.round(amount * 100)) < 0.00001
}
export const sumMoney = (values: number[]) => values.reduce((sum, value) => sum + toMinor(value), 0) / 100
