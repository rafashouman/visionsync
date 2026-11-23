export const PLUGIN_THEMES = ["dark", "contrast", "light"] as const
export type PluginTheme = typeof PLUGIN_THEMES[number]

export function isPluginTheme(value: unknown): value is PluginTheme {
  return typeof value === "string" && PLUGIN_THEMES.some(theme => theme === value)
}

export function resolvePluginTheme(value: unknown): PluginTheme {
  if (value === "nexusync") return "contrast"
  if (value === "minimal" || value === "light-minimal") return "light"
  return isPluginTheme(value) ? value : "dark"
}
