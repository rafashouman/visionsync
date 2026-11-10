export const THEME_COOKIE = "visionsync-theme"
export const DEFAULT_THEME = "dark"
export const THEMES = [
  { id: "dark", name: "Vision escuro", description: "Azul-marinho e vinho originais, com detalhes em dourado envelhecido.", bg: "#040a1c", surface: "#0c2150", accent: "#e0245e", text: "#e8eefc" },
  { id: "light", name: "Vision claro", description: "Marfim e cinza azulado, com vinho e detalhes dourados do Vision dos filmes.", bg: "#f2f1ed", surface: "#fcfbf8", accent: "#79344d", text: "#223b55" },
  { id: "minimal", name: "Vision minimalista", description: "Branco, prata e azul frio inspirados no novo Vision, com superfícies limpas e discretas.", bg: "#f3f5f8", surface: "#ffffff", accent: "#425a70", text: "#253444" },
] as const
export type Theme = typeof THEMES[number]["id"]
export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && THEMES.some(theme => theme.id === value)
}
export function resolveTheme(value: unknown): Theme {
  if (value === "dark-original" || value === "dark-minimal") return "dark"
  if (value === "light-minimal") return "minimal"
  return isTheme(value) ? value : DEFAULT_THEME
}
