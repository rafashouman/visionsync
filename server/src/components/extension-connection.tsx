"use client"

import { useEffect, useState } from "react"
import { Copy, Puzzle, RefreshCw } from "lucide-react"
import { btn, card, field, label } from "@/lib/ui"

export function ExtensionConnection() {
  const [token, setToken] = useState<string | null>(null)
  const [apiUrl, setApiUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/crm/token").then(r => {
      if (!r.ok) throw new Error("Não foi possível consultar a conexão.")
      return r.json()
    }).then(d => setConfigured(Boolean(d.configured))).catch(() => setError("Não foi possível consultar a conexão."))
    const task = requestAnimationFrame(() => setApiUrl(window.location.origin))
    return () => cancelAnimationFrame(task)
  }, [])

  async function generate() {
    setLoading(true); setError("")
    try {
      const res = await fetch("/api/crm/token", { method: "POST" })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || "Não foi possível gerar o token.")
      setToken(d.token ?? null); setConfigured(true)
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível gerar o token.") }
    finally { setLoading(false) }
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
    try { await navigator.clipboard.writeText(token); setCopied(true); setTimeout(() => setCopied(false), 2000) }
    catch { setError("Não foi possível copiar. Selecione o token e copie manualmente.") }
  }

  return <section id="conexao" style={{ ...card, padding: 24 }} aria-labelledby="plugin-connection">
    <h2 id="plugin-connection" style={{ fontSize: 17, margin: "0 0 4px", color: "var(--strong)", display: "flex", alignItems: "center", gap: 8 }}><Puzzle size={18} />Extensão do Chrome</h2>
    <p style={{ fontSize: 13, color: "var(--muted)" }}>Conecte a extensão ao seu CRM. Cole estes dados no popup da extensão.</p>
    <label style={label}>URL do sistema<input readOnly value={apiUrl} style={{ ...field, padding: "9px 12px" }} /></label>
    <label style={label} htmlFor="plugin-token">Token de acesso</label>
    {token ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <input id="plugin-token" readOnly value={token} style={{ ...field, flex: 1, minWidth: 0, fontFamily: "monospace" }} />
      <button onClick={copy} style={btn}><Copy size={14} /> {copied ? "Copiado!" : "Copiar"}</button>
    </div> : <p style={{ fontSize: 13, color: "var(--muted)" }}>{configured ? "Já existe um token ativo. Gere outro se precisar reconectar o plugin." : "Gere um token para conectar o plugin."}</p>}
    <p style={{ fontSize: 12, color: "var(--wait-text)" }}>Copie agora: o token só aparece uma vez e vence em 90 dias. Gerar outro invalida o anterior.</p>
    <div className="vs-actions" style={{ flexWrap: "wrap" }}>
      <button onClick={generate} disabled={loading} style={btn}><RefreshCw size={14} /> {loading ? "Aguarde..." : configured ? "Gerar novo token" : "Gerar token"}</button>
      {configured && <button onClick={revoke} disabled={loading} style={btn}>Desconectar plugin</button>}
    </div>
    {error && <p role="alert" style={{ color: "var(--danger)" }}>{error}</p>}
  </section>
}
