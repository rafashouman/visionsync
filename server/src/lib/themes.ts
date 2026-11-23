export const THEME_COOKIE = "visionsync-theme"
export const DEFAULT_THEME = "dark"
export const THEMES = [
  { id: "dark", name: "Dark", description: "A identidade neon: azul-marinho profundo, ciano elétrico e detalhes em lima.", bg: "#050b1f", surface: "#0b1a3d", accent: "#00e5ff", secondary: "#0a66ff", highlight: "#c6f21a", text: "#e6f0ff" },
  { id: "contrast", name: "Contrast", description: "Grafite, cobalto e ciano. Lima para destacar as próximas ações.", bg: "#080b12", surface: "#121a27", accent: "#c6f21a", secondary: "#00e5ff", highlight: "#0a66ff", text: "#dce2ed" },
  { id: "light", name: "Light", description: "Superfícies claras e frias, com azul profundo do logo e detalhes em oliva.", bg: "#f1f4f9", surface: "#fbfcfe", accent: "#0a4fd1", secondary: "#0b7ea0", highlight: "#5d7a00", text: "#14284f" },
] as const
export type Theme = typeof THEMES[number]["id"]
export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && THEMES.some(theme => theme.id === value)
}
export function resolveTheme(value: unknown): Theme {
  if (value === "nexusync") return "contrast"
  if (value === "dark-original" || value === "dark-minimal") return "dark"
  if (value === "minimal" || value === "light-minimal") return "light"
  return isTheme(value) ? value : DEFAULT_THEME
}
