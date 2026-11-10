import { cookies } from "next/headers"
import { ThemeProvider } from "@/components/theme-provider"
import { THEME_COOKIE, resolveTheme } from "@/lib/themes"
import type { Metadata } from "next"
import "./globals.css"
import { AuthProvider } from "@/components/session-provider"

export const metadata: Metadata = {
  title: "VisionSync",
  icons: { icon: [{ url: "/favicon.ico", sizes: "any" }, { url: "/brand/icon.png", type: "image/png", sizes: "150x150" }], apple: "/brand/apple-touch-icon.png" },
  description: "Relacionamentos, oportunidades e vendas conectados ao WhatsApp.",
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = resolveTheme((await cookies()).get(THEME_COOKIE)?.value)
  return (
    <html lang="pt-BR" data-theme={theme}>
      <body>
        <ThemeProvider initialTheme={theme}><AuthProvider>{children}</AuthProvider></ThemeProvider>
      </body>
    </html>
  )
}
