"use client"
import { createContext, useContext, useState, type ReactNode } from "react"
import { THEME_COOKIE, isTheme, type Theme } from "@/lib/themes"

const ThemeContext = createContext<{ theme: Theme; setTheme: (theme: Theme) => void } | null>(null)
export function ThemeProvider({ initialTheme, children }: { initialTheme: Theme; children: ReactNode }) {
  const [theme, updateTheme] = useState(initialTheme)
  function setTheme(value: Theme) {
    if (!isTheme(value)) return
    document.documentElement.dataset.theme = value
    document.cookie = `${THEME_COOKIE}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`
    updateTheme(value)
  }
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}
export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error("ThemePicker precisa de ThemeProvider.")
  return context
}
