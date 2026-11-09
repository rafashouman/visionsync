"use client"

import { useEffect, useState } from "react"
import { Copy, Puzzle, RefreshCw } from "lucide-react"
import { MetaCard } from "@/components/meta-card"
import { PageHeader } from "@/components/page-header"
import { btn, card, field, label } from "@/lib/ui"

export default function ConfiguracoesPage() {
  const [token, setToken] = useState<string | null>(null)
  const [apiUrl, setApiUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch("/api/crm/token").then((r) => r.json()).then((d) => setToken(d.token ?? null)).catch(() => {})
    if (typeof window !== "undefined") setApiUrl(window.location.origin)
  }, [])

  async function generate() {
    setLoading(true)
    try {
      const res = await fetch("/api/crm/token", { method: "POST" })
      const d = await res.json()
      setToken(d.token ?? null)
    } finally {
      setLoading(false)
    }
  }

  function copy() {
    if (!token) return
    navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader title="Configurações" subtitle="Conecte a extensão do Chrome e o seu Pixel do Meta." />

      <div style={{ ...card, padding: 24 }}>
        <h2 style={{ fontSize: 17, margin: "0 0 4px", color: "var(--strong)", display: "flex", alignItems: "center", gap: 8 }}>
          <Puzzle size={18} style={{ color: "var(--vred)" }} />Extensão do Chrome
        </h2>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
          Conecte a extensão ao seu CRM. Cole estes dados no popup da extensão.
        </p>

        <label style={label}>URL do sistema</label>
        <input readOnly value={apiUrl} style={{ ...field, padding: "9px 12px" }} />

        <label style={label}>Token de acesso</label>
        {token ? (
          <div style={{ display: "flex", gap: 8 }}>
            <input readOnly value={token} style={{ ...field, padding: "9px 12px", flex: 1, fontFamily: "monospace" }} />
            <button onClick={copy} style={btn}>
              <Copy size={14} style={{ verticalAlign: -2, marginRight: 5 }} />{copied ? "Copiado!" : "Copiar"}
            </button>
          </div>
        ) : (
          <p style={{ fontSize: 13, color: "var(--faint)", fontStyle: "italic" }}>Nenhum token gerado ainda.</p>
        )}
        <p style={{ fontSize: 12, color: "var(--wait)", marginTop: 6 }}>
          Guarde em segredo. Quem tiver este token acessa seus dados.
        </p>

        <button onClick={generate} disabled={loading} style={{ ...btn, marginTop: 10, opacity: loading ? 0.6 : 1 }}>
          <RefreshCw size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
          {loading ? "Gerando..." : token ? "Gerar novo token" : "Gerar token"}
        </button>
      </div>

      <MetaCard />
    </div>
  )
}
