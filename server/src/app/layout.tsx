import type { Metadata } from "next"
import "./globals.css"
import { AuthProvider } from "@/components/session-provider"

export const metadata: Metadata = {
  title: "Vision CRM",
  description: "CRM sobre o WhatsApp para tarólogas.",
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
