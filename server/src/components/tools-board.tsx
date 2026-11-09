"use client"

import { useState } from "react"
import { Download, MessageSquarePlus } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { whatsappLink } from "@/lib/charge-message"
import { btn, card, field, helper, label } from "@/lib/ui"

export function ToolsBoard() {
  const [phone, setPhone] = useState("")
  const [text, setText] = useState("")
  const [err, setErr] = useState<string | null>(null)

  function open() {
    const digits = phone.replace(/\D/g, "")
    if (digits.length < 10 || digits.length > 15) return setErr("Digite o número com DDD, por exemplo 11 99999-8888.")
    setErr(null)
    window.open(whatsappLink(digits, text), "_blank", "noopener,noreferrer")
  }

  return (
    <>
      <PageHeader title="Ferramentas" subtitle="Atalhos úteis do dia a dia." />

      <div style={{ ...card, padding: 22, maxWidth: 640 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 4px", color: "var(--strong)", display: "flex", alignItems: "center", gap: 8 }}>
          <MessageSquarePlus size={18} style={{ color: "var(--vred)" }} /> Abrir conversa sem salvar o contato
        </h2>
        <p style={helper}>Digite o número e abra a conversa direto no WhatsApp, sem adicionar na agenda do celular.</p>
        <label style={label}>Número com DDD</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="11 99999-8888" inputMode="tel" style={{ ...field, padding: "9px 12px" }} />
        <label style={label}>Mensagem (opcional)</label>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Já abre com este texto escrito" style={{ ...field, padding: "9px 12px", resize: "vertical" }} />
        {err && <p style={{ color: "var(--danger)", fontSize: 13, margin: "8px 0 0" }}>{err}</p>}
        <button onClick={open} style={{ ...btn, marginTop: 12 }}>Abrir no WhatsApp</button>
      </div>

      <div style={{ ...card, padding: 22, maxWidth: 640 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 4px", color: "var(--strong)", display: "flex", alignItems: "center", gap: 8 }}>
          <Download size={18} style={{ color: "var(--vred)" }} /> Exportar contatos
        </h2>
        <p style={helper}>
          Baixa todos os seus contatos numa planilha (abre direto no Excel): nome, telefone, listas, origem, quantas
          compras, total gasto e última compra.
        </p>
        <a href="/api/crm/export" style={{ ...btn, display: "inline-block", marginTop: 8, textDecoration: "none" }}>Baixar planilha</a>
      </div>
    </>
  )
}
