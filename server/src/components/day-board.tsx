"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { AlertTriangle, ArrowRight, Check } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { card, chip, errorText } from "@/lib/ui"

type Day = {
  compras: { hoje: { count: number; total: number }; semana: { count: number; total: number } }
  contatosNovos: number
  lembretes: { atrasados: number; hoje: number; lista: { id: string; contactName: string; text: string; dueAt: string; state: string }[] }
  cobrancas: { vencidas: { count: number; total: number }; hoje: { count: number; total: number }; aReceber: { count: number; total: number } }
  meta: { pendentes: number; falhas: number; semPixel: number }
  aguardando: { id: string; name: string; phone: string; since: string | null; unread: number }[]
}

const TZ = "America/Sao_Paulo"
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const hm = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: TZ })
const ago = (iso: string | null) => {
  if (!iso) return ""
  const m = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  return m >= 1440 ? `${Math.floor(m / 1440)} d` : m >= 60 ? `${Math.floor(m / 60)} h` : `${m} min`
}

export function DayBoard() {
  const [d, setD] = useState<Day | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/crm/day")
      .then(async (r) => (r.ok ? setD(await r.json()) : setErr("Não consegui carregar o painel.")))
      .catch(() => setErr("Não consegui carregar o painel."))
  }, [])

  const alerts: { text: string; href: string; tone: "late" | "wait" }[] = []
  if (d) {
    if (d.meta.falhas) alerts.push({ text: `${d.meta.falhas} compra(s) com falha no envio pro Meta`, href: "/dashboard/configuracoes", tone: "late" })
    if (d.meta.semPixel) alerts.push({ text: `${d.meta.semPixel} compra(s) sem pixel (a lista da cliente não aponta pra nenhum)`, href: "/dashboard/configuracoes", tone: "wait" })
    if (d.meta.pendentes) alerts.push({ text: `${d.meta.pendentes} compra(s) ainda não enviadas ao Meta`, href: "/dashboard/configuracoes", tone: "wait" })
    if (d.cobrancas.vencidas.count) alerts.push({ text: `${d.cobrancas.vencidas.count} cobrança(s) vencida(s), ${brl(d.cobrancas.vencidas.total)}`, href: "/dashboard/cobrancas", tone: "late" })
    if (d.lembretes.atrasados) alerts.push({ text: `${d.lembretes.atrasados} lembrete(s) atrasado(s)`, href: "/dashboard/pendencias", tone: "late" })
  }

  const section = (title: string, href: string | null, body: React.ReactNode) => (
    <div style={{ ...card, padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", padding: "14px 18px 8px" }}>
        <b style={{ color: "var(--strong)", fontSize: 15 }}>{title}</b>
        {href && (
          <Link href={href} style={{ marginLeft: "auto", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}>
            Ver tudo <ArrowRight size={13} />
          </Link>
        )}
      </div>
      <div style={{ padding: "0 18px 14px" }}>{body}</div>
    </div>
  )
  const none = (t: string) => <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>{t}</p>
  const line: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid var(--soft)", fontSize: 13 }

  return (
    <>
      <PageHeader title="Painel do dia" subtitle="O que precisa da sua atenção hoje, num lugar só." />
      {err && <p style={errorText}>{err}</p>}

      <div className="v-card v-kpis">
        <div className="v-kpi"><div className="l">Vendas hoje</div><div className="n">{d ? brl(d.compras.hoje.total) : "…"}</div><span className="v-pill ok">{d ? `${d.compras.hoje.count} compras` : ""}</span></div>
        <div className="v-kpi"><div className="l">Últimos 7 dias</div><div className="n">{d ? brl(d.compras.semana.total) : "…"}</div><span className="v-pill mute">{d ? `${d.compras.semana.count} compras` : ""}</span></div>
        <div className="v-kpi"><div className="l">Clientes novos hoje</div><div className="n">{d ? d.contatosNovos : "…"}</div><span className="v-pill mute">no CRM</span></div>
        <div className="v-kpi"><div className="l">Esperam resposta</div><div className="n">{d ? d.aguardando.length : "…"}</div><span className="v-pill wait">na última importação</span></div>
      </div>

      {d && (
        <div style={{ ...card, padding: "14px 18px" }}>
          <b style={{ color: "var(--strong)", fontSize: 15 }}>Atenção</b>
          {alerts.length === 0 ? (
            <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--ok-text)", display: "flex", alignItems: "center", gap: 6 }}><Check size={15} /> Tudo em dia: nada atrasado, vencido ou com erro de envio.</p>
          ) : (
            alerts.map((a, i) => (
              <Link key={i} href={a.href} style={{ ...line, textDecoration: "none", color: "var(--text)", borderTop: i === 0 ? "none" : line.borderTop }}>
                <span style={chip(a.tone)}><AlertTriangle size={12} /></span>
                <span style={{ flex: 1 }}>{a.text}</span>
                <ArrowRight size={14} style={{ color: "var(--muted)" }} />
              </Link>
            ))
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16 }}>
        {section(
          "Lembretes de hoje",
          "/dashboard/pendencias",
          !d ? none("Carregando...") : d.lembretes.lista.length === 0 ? none("Nenhum lembrete pra hoje.") : d.lembretes.lista.map((r, i) => (
            <div key={r.id} style={{ ...line, borderTop: i === 0 ? "none" : line.borderTop }}>
              <span style={{ flex: 1, color: "var(--text)" }}><b style={{ color: "var(--strong)" }}>{r.text}</b><br /><span style={{ color: "var(--muted)", fontSize: 12 }}>{r.contactName}</span></span>
              <span style={chip(r.state === "atrasado" ? "late" : "wait")}>{hm(r.dueAt)}</span>
            </div>
          ))
        )}
        {section(
          "Cobranças",
          "/dashboard/cobrancas",
          !d ? none("Carregando...") : (
            <>
              <div style={{ ...line, borderTop: "none" }}><span style={{ flex: 1 }}>Vencem hoje</span><b style={{ color: "var(--strong)" }}>{d.cobrancas.hoje.count} · {brl(d.cobrancas.hoje.total)}</b></div>
              <div style={line}><span style={{ flex: 1 }}>Vencidas</span><b style={{ color: "var(--late-text)" }}>{d.cobrancas.vencidas.count} · {brl(d.cobrancas.vencidas.total)}</b></div>
              <div style={line}><span style={{ flex: 1 }}>A receber (no prazo)</span><b style={{ color: "var(--strong)" }}>{d.cobrancas.aReceber.count} · {brl(d.cobrancas.aReceber.total)}</b></div>
            </>
          )
        )}
        {section(
          "Esperam sua resposta",
          "/dashboard/funil",
          !d ? none("Carregando...") : d.aguardando.length === 0 ? none("Ninguém esperando (segundo a última importação). O aviso ao vivo fica no WhatsApp.") : d.aguardando.map((w, i) => (
            <div key={w.id} style={{ ...line, borderTop: i === 0 ? "none" : line.borderTop }}>
              <span style={{ flex: 1, color: "var(--strong)", fontWeight: 600 }}>{w.name}<br /><span style={{ color: "var(--muted)", fontSize: 12, fontWeight: 400 }}>{w.phone}</span></span>
              <span style={chip("wait")}>{ago(w.since)}</span>
            </div>
          ))
        )}
      </div>
    </>
  )
}
