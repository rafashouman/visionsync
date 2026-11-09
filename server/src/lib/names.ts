/**
 * Limpeza de nomes de contato. Uma regra só, usada por mensagens, cobranças e Meta.
 * Sem imports de servidor: a tela também usa este arquivo.
 *
 * Os contatos vêm do WhatsApp com sufixos como "Amanda Cliente" ou
 * "Edivania De Souza CLIENTE": a palavra "cliente" não é sobrenome.
 */
export function cleanNameParts(name: string | null | undefined): string[] {
  if (!name || name === "Cliente WhatsApp") return []
  return name
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter((p) => p && !/^clientes?$/i.test(p))
}

export const firstName = (name: string | null | undefined) => cleanNameParts(name)[0] ?? ""
export const fullName = (name: string | null | undefined) => cleanNameParts(name).join(" ")
