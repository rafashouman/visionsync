"use client"

import { useEffect, useState } from "react"
import { Copy, Puzzle, RefreshCw } from "lucide-react"
import { ThemePicker } from "@/components/theme-picker"
import { MetaCard } from "@/components/meta-card"
import { PageHeader } from "@/components/page-header"
import { btn, card, field, label } from "@/lib/ui"

export default function ConfiguracoesPage() {
  const [token, setToken] = useState<string | null>(null)
  const [apiUrl, setApiUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/crm/token").then((r) => {
      if (!r.ok) throw new Error("Não foi possível consultar a conexão.")
      return r.json()
    }).then((d) => setConfigured(Boolean(d.configured))).catch(() => setError("Não foi possível consultar a conexão."))
    const task = requestAnimationFrame(() => setApiUrl(window.location.origin))
    return () => cancelAnimationFrame(task)
  }, [])

  async function generate() {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/crm/token", { method: "POST" })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || "Não foi possível gerar o token.")
      setToken(d.token ?? null)
      setConfigured(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível gerar o token.")
    } finally {
      setLoading(false)
    }
  }

  async function revoke() {
    setLoading(true); setError("")
    try {
      const res = await fetch("/api/crm/token", { method: "DELETE" })
      if (!res.ok) throw new Error("Não foi possível revogar o token.")
      setToken(null); setConfigured(false)
    } catch (err) { setError(err instanceof Error ? err.message : "Falha de conexão.") }
    finally { setLoading(false) }
  }

  async function copy() {
    if (!token) return
    try {
      await navigator.clipboard.writeText(token)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError("Não foi possível copiar. Selecione o token e copie manualmente.")
    }
  }

  return (
    <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader title="Configurações" subtitle="Personalize seu ambiente e gerencie suas conexões." />

      <section style={{ ...card, padding: 24 }} aria-label="Preferências de aparência"><ThemePicker /></section>

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
          <p style={{ fontSize: 13, color: "var(--muted)" }}>{configured ? "Já existe um token ativo. Gere outro se precisar reconectar o plugin." : "Gere um token para conectar o plugin."}</p>
        )}
        <p style={{ fontSize: 12, color: "var(--wait)", marginTop: 6 }}>
          Copie agora: o token só aparece uma vez e vence em 90 dias. Gerar outro invalida o anterior.
        </p>

        <button onClick={generate} disabled={loading} style={{ ...btn, marginTop: 10, opacity: loading ? 0.6 : 1 }}>
          <RefreshCw size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
          {loading ? "Aguarde..." : configured ? "Gerar novo token" : "Gerar token"}
        </button>
        {configured && <button onClick={revoke} disabled={loading} style={{ ...btn, marginLeft: 8 }}>Desconectar plugin</button>}
        {error && <p role="alert" style={{ color: "var(--danger)" }}>{error}</p>}
      </div>

      <MetaCard />
    </div>
  )
}
