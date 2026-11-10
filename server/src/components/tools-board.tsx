"use client"

import { useState } from "react"
import { Code2, Copy, Download, Link2, MessageSquarePlus } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { whatsappLink } from "@/lib/charge-message"
import { btn, card, field, ghost, helper, inner, label } from "@/lib/ui"

export function ToolsBoard() {
  const [phone, setPhone] = useState("")
  const [text, setText] = useState("")
  const [err, setErr] = useState<string | null>(null)

  // Gerador de Link Personalizado + Botão Flutuante (HotZapp / HubSpot Lead Capture)
  const [myPhone, setMyPhone] = useState("")
  const [welcomeMsg, setWelcomeMsg] = useState("Olá! Vim pelo site e gostaria de mais informações.")
  const [btnLabel, setBtnLabel] = useState("Falar no WhatsApp")
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedWidget, setCopiedWidget] = useState(false)

  function open() {
    const digits = phone.replace(/\D/g, "")
    if (digits.length < 10 || digits.length > 15) return setErr("Digite o número com DDD, por exemplo 11 99999-8888.")
    setErr(null)
    window.open(whatsappLink(digits, text), "_blank", "noopener,noreferrer")
  }

  const cleanMyDigits = myPhone.replace(/\D/g, "")
  const generatedUrl = cleanMyDigits.length >= 10 ? whatsappLink(cleanMyDigits, welcomeMsg) : ""
  const widgetHtml = generatedUrl
    ? `<!-- Botão Flutuante WhatsApp · VisionSync -->
<a href="${generatedUrl}" target="_blank" rel="noopener noreferrer" style="position:fixed;bottom:22px;right:22px;z-index:99999;display:inline-flex;align-items:center;gap:10px;padding:12px 20px;border-radius:999px;background:#25D366;color:#fff;font-family:system-ui,sans-serif;font-weight:700;font-size:14px;text-decoration:none;box-shadow:0 8px 24px rgba(37,211,102,0.4);">
  <span>💬 ${btnLabel}</span>
</a>`
    : ""

  async function copyText(val: string, kind: "link" | "widget") {
    if (!val) return
    try {
      await navigator.clipboard.writeText(val)
      if (kind === "link") {
        setCopiedLink(true)
        setTimeout(() => setCopiedLink(false), 2000)
      } else {
        setCopiedWidget(true)
        setTimeout(() => setCopiedWidget(false), 2000)
      }
    } catch {}
  }

  return (
    <>
      <PageHeader title="Ferramentas" subtitle="Atalhos úteis, captura de leads estilo HubSpot/HotZapp e exportação de dados." />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16 }}>
        <div style={{ ...card, padding: 22 }}>
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

        <div style={{ ...card, padding: 22 }}>
          <h2 style={{ fontSize: 16, margin: "0 0 4px", color: "var(--strong)", display: "flex", alignItems: "center", gap: 8 }}>
            <Link2 size={18} style={{ color: "var(--vred)" }} /> Gerador de Link de WhatsApp &amp; Botão para Site
          </h2>
          <p style={helper}>Crie seu link personalizado para bio do Instagram/anúncios ou copie o botão flutuante para sua página de vendas.</p>
          <label style={label}>Seu WhatsApp de atendimento (com DDD)</label>
          <input value={myPhone} onChange={(e) => setMyPhone(e.target.value)} placeholder="11 99999-8888" inputMode="tel" style={{ ...field, padding: "9px 12px" }} />
          <label style={label}>Mensagem automática que a cliente envia ao clicar</label>
          <input value={welcomeMsg} onChange={(e) => setWelcomeMsg(e.target.value)} style={{ ...field, padding: "9px 12px" }} />
          <label style={label}>Texto do botão flutuante</label>
          <input value={btnLabel} onChange={(e) => setBtnLabel(e.target.value)} style={{ ...field, padding: "9px 12px" }} />

          {generatedUrl ? (
            <div style={{ ...inner, padding: 12, marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 12, color: "var(--text)", wordBreak: "break-all" }}>
                <b>Link direto:</b> {generatedUrl}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => copyText(generatedUrl, "link")} style={btn}>
                  <Copy size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
                  {copiedLink ? "Link copiado!" : "Copiar Link"}
                </button>
                <button onClick={() => copyText(widgetHtml, "widget")} style={ghost}>
                  <Code2 size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
                  {copiedWidget ? "Código HTML copiado!" : "Copiar Botão Flutuante (HTML)"}
                </button>
              </div>
            </div>
          ) : (
            <p style={{ fontSize: 12, color: "var(--faint)", marginTop: 10 }}>Informe seu número com DDD acima para gerar o link e o código HTML.</p>
          )}
        </div>

        <div style={{ ...card, padding: 22 }}>
          <h2 style={{ fontSize: 16, margin: "0 0 4px", color: "var(--strong)", display: "flex", alignItems: "center", gap: 8 }}>
            <Download size={18} style={{ color: "var(--vred)" }} /> Exportar contatos (Excel / CSV)
          </h2>
          <p style={helper}>
            Baixa todos os seus contatos numa planilha (abre direto no Excel): nome, telefone, listas, origem, quantas
            compras, total gasto e última compra.
          </p>
          <a href="/api/crm/export" style={{ ...btn, display: "inline-block", marginTop: 8, textDecoration: "none" }}>Baixar planilha</a>
        </div>
      </div>
    </>
  )
}
