"use client"

import { useCallback, useEffect, useState } from "react"
import { AlarmClock, BellPlus, Calendar, Check, ExternalLink, MessageSquare } from "lucide-react"
import type { ReminderView } from "@/lib/reminders"
import { whatsappLink } from "@/lib/charge-message"
import { PageHeader } from "@/components/page-header"
import { btn, btnSm, card, chip, errorText, field, ghost, ghostSm, inner, label } from "@/lib/ui"

const TZ = "America/Sao_Paulo"
const fmtDayHeader = (dayStr: string) => {
  const [y, m, d] = dayStr.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d, 15, 0, 0))
  return dt.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: TZ })
}
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ })
const dayKey = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ })

function gcalUrl(r: ReminderView) {
  const start = new Date(r.dueAt)
  const end = new Date(start.getTime() + 30 * 60_000)
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${r.text} — ${r.contactName}`,
    dates: `${f(start)}/${f(end)}`,
    details: r.scheduledMessage
      ? `Cliente: ${r.contactName} (${r.contactPhone})\nMensagem agendada:\n${r.scheduledMessage}`
      : `Cliente: ${r.contactName} (${r.contactPhone})`,
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

async function call(method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`)
  return data
}

type ContactHit = { id: string; name: string; phone: string }

export function AgendaBoard() {
  const [items, setItems] = useState<ReminderView[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [filter, setFilter] = useState<"todos" | "mensagens" | "lembretes">("todos")

  const load = useCallback(async () => {
    try {
      const d = await call("GET", "/api/crm/reminders?status=abertos")
      setItems(d.reminders)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui carregar a agenda.")
    }
  }, [])

  useEffect(() => {
    const task = setTimeout(() => void load(), 0)
    return () => clearTimeout(task)
  }, [load])

  async function markDone(id: string) {
    try {
      await call("PATCH", `/api/crm/reminders/${id}`, { action: "done" })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui concluir.")
    }
  }

  const all = (items ?? []).filter((r) => {
    if (filter === "mensagens") return Boolean(r.scheduledMessage)
    if (filter === "lembretes") return !r.scheduledMessage
    return true
  })

  const byDay = new Map<string, ReminderView[]>()
  for (const r of all) {
    const k = dayKey(r.dueAt)
    if (!byDay.has(k)) byDay.set(k, [])
    byDay.get(k)!.push(r)
  }
  const days = [...byDay.keys()].sort()
  const schedMsgCount = (items ?? []).filter((r) => Boolean(r.scheduledMessage)).length

  return (
    <>
      <PageHeader
        title="Agenda & Mensagens Agendadas"
        subtitle="Calendário de compromissos, retornos do HubSpot e mensagens pré-agendadas do HotZapp com exportação para o Google Agenda."
        actions={
          <button onClick={() => setShowForm((v) => !v)} style={btn}>
            <BellPlus size={15} style={{ verticalAlign: -2, marginRight: 5 }} />
            Agendar compromisso / mensagem
          </button>
        }
      />

      <div className="v-card v-kpis">
        <div className="v-kpi">
          <div className="l">Total na Agenda</div>
          <div className="n">{items ? items.length : "…"}</div>
          <span className="v-pill ok">compromissos abertos</span>
        </div>
        <div className="v-kpi">
          <div className="l">Mensagens Agendadas</div>
          <div className="n">{items ? schedMsgCount : "…"}</div>
          <span className="v-pill wait">prontas para envio</span>
        </div>
        <div className="v-kpi">
          <div className="l">Hoje</div>
          <div className="n">{items ? items.filter((r) => r.state === "hoje").length : "…"}</div>
          <span className="v-pill wait">no dia de hoje</span>
        </div>
        <div className="v-kpi">
          <div className="l">Atrasados</div>
          <div className="n">{items ? items.filter((r) => r.state === "atrasado").length : "…"}</div>
          <span className="v-pill late">exigem retorno</span>
        </div>
      </div>

      {showForm && (
        <ScheduleForm
          onClose={() => setShowForm(false)}
          onSaved={async () => {
            setShowForm(false)
            await load()
          }}
        />
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {([
          ["todos", "Todos os compromissos"],
          ["mensagens", "Com mensagem agendada (HotZapp)"],
          ["lembretes", "Apenas lembretes de retorno"],
        ] as const).map(([id, lbl]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            style={{
              padding: "7px 16px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              border: `1px solid ${filter === id ? "transparent" : "var(--soft)"}`,
              background: filter === id ? "var(--accent)" : "var(--field)",
              color: filter === id ? "var(--on-accent)" : "var(--muted)",
            }}
          >
            {lbl}
          </button>
        ))}
      </div>

      {error && <p style={errorText}>{error}</p>}

      {items === null ? (
        <div style={{ ...card, padding: 28, textAlign: "center", color: "var(--muted)" }}>Carregando agenda…</div>
      ) : days.length === 0 ? (
        <div style={{ ...card, padding: 28, textAlign: "center", color: "var(--muted)" }}>
          Nenhum compromisso ou mensagem agendada neste filtro.
        </div>
      ) : (
        days.map((d) => {
          const list = byDay.get(d)!
          return (
            <div key={d} style={{ ...card, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--soft)", display: "flex", alignItems: "center", gap: 8 }}>
                <Calendar size={16} style={{ color: "var(--vred)" }} />
                <strong style={{ fontSize: 14, color: "var(--strong)", textTransform: "capitalize" }}>{fmtDayHeader(d)}</strong>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>({list.length})</span>
              </div>
              {list.map((r) => (
                <div
                  key={r.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 14,
                    padding: "14px 16px",
                    borderTop: "1px solid var(--soft)",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "flex", gap: 12, flex: 1, minWidth: 240 }}>
                    <span style={{ ...chip(r.state === "atrasado" ? "late" : r.state === "hoje" ? "wait" : "mute"), alignSelf: "flex-start" }}>
                      <AlarmClock size={12} /> {fmtTime(r.dueAt)}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "var(--strong)" }}>{r.text}</div>
                      <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>
                        Cliente: <b style={{ color: "var(--text)" }}>{r.contactName}</b> · {r.contactPhone}
                      </div>
                      {r.scheduledMessage && (
                        <div style={{ ...inner, padding: "8px 10px", marginTop: 8, fontSize: 13, color: "var(--text)", whiteSpace: "pre-wrap" }}>
                          <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--ok)", textTransform: "uppercase", display: "block", marginBottom: 2 }}>
                            Mensagem pronta para enviar:
                          </span>
                          {r.scheduledMessage}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <a
                      href={whatsappLink(r.contactPhone, r.scheduledMessage || "")}
                      target="_blank"
                      rel="noreferrer"
                      style={{ ...btnSm, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5 }}
                    >
                      <MessageSquare size={13} />
                      {r.scheduledMessage ? "Enviar no WhatsApp" : "Abrir WhatsApp"}
                    </a>
                    <a
                      href={gcalUrl(r)}
                      target="_blank"
                      rel="noreferrer"
                      style={{ ...ghostSm, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5 }}
                    >
                      <ExternalLink size={13} />+ Google Agenda
                    </a>
                    <button onClick={() => markDone(r.id)} style={{ ...ghostSm, display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <Check size={13} />Feito
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        })
      )}
    </>
  )
}

function ScheduleForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [q, setQ] = useState("")
  const [hits, setHits] = useState<ContactHit[]>([])
  const [contact, setContact] = useState<ContactHit | null>(null)
  const [text, setText] = useState("")
  const [scheduledMessage, setScheduledMessage] = useState("")
  const [at, setAt] = useState(() => {
    const d = new Date(Date.now() + 86400_000)
    d.setHours(9, 0, 0, 0)
    const p = (n: number) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
  })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (contact) return
    const t = setTimeout(async () => {
      try {
        setHits(await call("GET", `/api/crm/contacts?q=${encodeURIComponent(q)}`))
      } catch {
        setHits([])
      }
    }, 250)
    return () => clearTimeout(t)
  }, [q, contact])

  async function save() {
    if (!contact) return setErr("Escolha a cliente.")
    if (!text.trim()) return setErr("Informe o título do compromisso/lembrete.")
    const d = new Date(at)
    if (Number.isNaN(d.getTime())) return setErr("Data/hora inválida.")
    setBusy(true)
    setErr(null)
    try {
      await call("POST", "/api/crm/reminders", {
        contactId: contact.id,
        text: text.trim(),
        scheduledMessage: scheduledMessage.trim() || null,
        dueAt: d.toISOString(),
      })
      await onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao salvar.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ ...card, padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
      {contact ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <b style={{ color: "var(--strong)" }}>{contact.name}</b>
          <span style={{ color: "var(--muted)", fontSize: 13 }}>{contact.phone}</span>
          <button onClick={() => setContact(null)} style={{ ...ghostSm, marginLeft: "auto" }}>Trocar cliente</button>
        </div>
      ) : (
        <div>
          <label style={label}>Cliente</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente por nome ou telefone…" style={field} />
          <div style={{ maxHeight: 150, overflowY: "auto", marginTop: 6 }}>
            {hits.map((h) => (
              <button
                key={h.id}
                onClick={() => setContact(h)}
                style={{ ...inner, display: "block", width: "100%", textAlign: "left", padding: "7px 10px", marginBottom: 4, cursor: "pointer", color: "var(--text)", fontSize: 13 }}
              >
                {h.name} <span style={{ color: "var(--muted)" }}>({h.phone})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 10 }}>
        <div>
          <label style={label}>Compromisso / Lembrete</label>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ex.: Retorno sobre proposta comercial" maxLength={300} style={field} />
        </div>
        <div>
          <label style={label}>Data e Hora</label>
          <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} style={field} />
        </div>
      </div>

      <label style={label}>Mensagem agendada para enviar no WhatsApp (opcional — estilo HotZapp)</label>
      <textarea
        value={scheduledMessage}
        onChange={(e) => setScheduledMessage(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="Se preenchida, no horário agendado o plugin do WhatsApp avisa você com 1 clique para disparar esta mensagem (suporta {primeiro_nome}, {saudacao}…)"
        style={{ ...field, resize: "vertical", fontFamily: "inherit" }}
      />

      {err && <p style={errorText}>{err}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={save} disabled={busy} style={btn}>{busy ? "Agendando…" : "Salvar na Agenda"}</button>
        <button onClick={onClose} style={ghost}>Cancelar</button>
      </div>
    </div>
  )
}
