/** Origem do lead. Sem imports de servidor: a tela também usa este arquivo. */
export const SOURCES = ["anuncio", "organico", "indicacao", "outro"] as const
export type Source = (typeof SOURCES)[number]

export const SOURCE_LABEL: Record<Source, string> = {
  anuncio: "Anúncio",
  organico: "Orgânico",
  indicacao: "Indicação",
  outro: "Outro",
}

export const sourceLabel = (s: string | null) => (s && s in SOURCE_LABEL ? SOURCE_LABEL[s as Source] : null)
