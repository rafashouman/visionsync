/**
 * Variáveis das respostas rápidas: "O cliente recebe tudo preenchido".
 * Sem imports de servidor: a tela e a extensão também usam este arquivo.
 */
import { firstName, fullName } from "@/lib/names"

export const VARIABLES = [
  { token: "{primeiro_nome}", label: "Primeiro nome" },
  { token: "{nome_completo}", label: "Nome completo" },
  { token: "{saudacao}", label: "Saudação" },
  { token: "{seu_nome}", label: "Seu nome" },
  { token: "{telefone}", label: "Telefone" },
  { token: "{data_de_hoje}", label: "Data de hoje" },
  { token: "{hora_agora}", label: "Hora agora" },
] as const

export type VarContext = {
  contactName?: string | null // nome da cliente na conversa
  contactPhone?: string | null
  myName?: string | null // nome de quem está atendendo
  now?: Date
}

const TZ = "America/Sao_Paulo"

function greeting(now: Date) {
  const hour = parseInt(now.toLocaleString("pt-BR", { hour: "2-digit", hour12: false, timeZone: TZ }), 10)
  if (hour >= 5 && hour < 12) return "Bom dia"
  if (hour >= 12 && hour < 18) return "Boa tarde"
  return "Boa noite"
}

/**
 * Troca as variáveis pelos valores. Se um valor não existe (ex.: o nome da
 * cliente é desconhecido), a variável some e o espaço sobrando antes de
 * pontuação é arrumado, pra não sair "Oi , tudo bem?".
 */
export function renderVariables(text: string, ctx: VarContext = {}): string {
  const now = ctx.now ?? new Date()
  const values: Record<string, string> = {
    "{primeiro_nome}": firstName(ctx.contactName),
    "{nome_completo}": fullName(ctx.contactName),
    "{saudacao}": greeting(now),
    "{seu_nome}": (ctx.myName ?? "").trim(),
    "{telefone}": (ctx.contactPhone ?? "").trim(),
    "{data_de_hoje}": now.toLocaleDateString("pt-BR", { timeZone: TZ }),
    "{hora_agora}": now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ }),
  }

  let anyEmpty = false
  let out = text
  for (const [token, value] of Object.entries(values)) {
    if (!out.includes(token)) continue
    if (!value) anyEmpty = true
    out = out.split(token).join(value)
  }

  if (anyEmpty) {
    out = out.replace(/[ \t]+([,.!?;:])/g, "$1").replace(/[ \t]{2,}/g, " ")
  }
  return out
}
