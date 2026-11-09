/** Origem do lead e propriedades HubSpot CRM. Sem imports de servidor: a tela também usa este arquivo. */
export const SOURCES = ["anuncio", "organico", "indicacao", "outro"] as const
export type Source = (typeof SOURCES)[number]

export const SOURCE_LABEL: Record<Source, string> = {
  anuncio: "Anúncio",
  organico: "Orgânico",
  indicacao: "Indicação",
  outro: "Outro",
}

export const sourceLabel = (s: string | null) => (s && s in SOURCE_LABEL ? SOURCE_LABEL[s as Source] : null)

export const LIFECYCLE_STAGES = ["assinante", "lead", "mql", "sql", "oportunidade", "cliente", "evangelista"] as const
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number]

export const LIFECYCLE_LABEL: Record<LifecycleStage, string> = {
  assinante: "Assinante",
  lead: "Lead",
  mql: "Lead Qualificado (MQL)",
  sql: "Oportunidade de Venda (SQL)",
  oportunidade: "Negócio em Aberto",
  cliente: "Cliente",
  evangelista: "Cliente Promotor / VIP",
}

export const lifecycleLabel = (s: string | null | undefined) =>
  s && s in LIFECYCLE_LABEL ? LIFECYCLE_LABEL[s as LifecycleStage] : "Lead"

export const LEAD_STATUSES = ["novo", "em_atendimento", "aguardando", "qualificado", "sem_interesse"] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  novo: "Novo",
  em_atendimento: "Em atendimento",
  aguardando: "Aguardando retorno",
  qualificado: "Qualificado",
  sem_interesse: "Sem interesse / Arquivado",
}

export const leadStatusLabel = (s: string | null | undefined) =>
  s && s in LEAD_STATUS_LABEL ? LEAD_STATUS_LABEL[s as LeadStatus] : "Novo"

export const DEAL_STAGES = ["aberto", "ganho", "perdido"] as const
export type DealStage = (typeof DEAL_STAGES)[number]

export const DEAL_STAGE_LABEL: Record<DealStage, string> = {
  aberto: "Em negociação",
  ganho: "Ganho (Fechado)",
  perdido: "Perdido",
}

