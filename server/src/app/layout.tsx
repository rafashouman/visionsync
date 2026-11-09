import type { Metadata } from "next"
import "./globals.css"
import { AuthProvider } from "@/components/session-provider"

export const metadata: Metadata = {
  title: "Vision CRM",
  description: "Relacionamentos, oportunidades e vendas conectados ao WhatsApp.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
