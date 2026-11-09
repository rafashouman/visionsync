"use client"

import { useCallback, useEffect, useState } from "react"
import { AlarmClock, BellPlus, Check, MessageSquare, RotateCcw, Trash2 } from "lucide-react"
import type { ReminderState, ReminderView } from "@/lib/reminders"
import { whatsappLink } from "@/lib/charge-message"
import { PageHeader } from "@/components/page-header"
import { btn, btnSm, card, chip, chipTone, errorText, field, ghost, ghostSm, inner } from "@/lib/ui"

const TZ = "America/Sao_Paulo"
const when = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: TZ })

type Tab = "abertos" | "adiadas" | "feitos"
const TABS: { id: Tab; label: string }[] = [
  { id: "abertos", label: "Pendências" },
  { id: "adiadas", label: "Adiadas" },
  { id: "feitos", label: "Feitas" },
]
const GROUPS: { state: ReminderState; title: string; tone: keyof typeof chipTone }[] = [
  { state: "atrasado", title: "Atrasadas", tone: "late" },
  { state: "hoje", title: "Hoje", tone: "wait" },
  { state: "proximo", title: "Próximas", tone: "mute" },
]

type ContactHit = { id: string; name: string; phone: string }

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

/** Opções de "Adiar" (horário local do navegador). */
function snoozeOptions(): { label: string; at: Date }[] {
  const now = new Date()
  const at = (days: number, h: number) => {
    const d = new Date(now)
    d.setDate(d.getDate() + days)
    d.setHours(h, 0, 0, 0)
    return d
  }
  const list = [
    { label: "Daqui 1 hora", at: new Date(now.getTime() + 3600_000) },
    { label: "Hoje às 18h", at: at(0, 18) },
    { label: "Amanhã 9h", at: at(1, 9) },
    { label: "Em 3 dias", at: at(3, 9) },
    { label: "Semana que vem", at: at(7, 9) },
  ]
  return list.filter((o) => o.at.getTime() > now.getTime() + 60_000)
}

const iconBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5 }

export function RemindersBoard() {
  const [tab, setTab] = useState<Tab>("abertos")
  const [items, setItems] = useState<ReminderView[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [snoozeFor, setSnoozeFor] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async (t: Tab) => {
    try {
      const d = await call("GET", `/api/crm/reminders?status=${t === "feitos" ? "feitos" : "abertos"}`)
      setItems(d.reminders)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui carregar os lembretes.")
    }
  }, [])

  useEffect(() => {
    load(tab)
  }, [tab, load])

  async function act(r: ReminderView, action: "done" | "reopen" | "snooze" | "delete", until?: Date) {
    if (action === "delete" && !confirm(`Apagar o lembrete de ${r.contactName}?`)) return
    setBusyId(r.id)
    setSnoozeFor(null)
    try {
      if (action === "delete") await call("DELETE", `/api/crm/reminders/${r.id}`)
      else await call("PATCH", `/api/crm/reminders/${r.id}`, { action, until: until?.toISOString() })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo deu errado.")
    } finally {
      setBusyId(null)
      await load(tab)
    }
  }

  const all = items ?? []
  const visible = all.filter((r) => (tab === "adiadas" ? r.snoozeCount > 0 : true))
  const count = (s: ReminderState) => all.filter((r) => r.state === s).length

  function renderRow(r: ReminderView) {
    const done = r.state === "feito"
    return (
      <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", flexWrap: "wrap", borderTop: "1px solid var(--soft)" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: "var(--strong)", textDecoration: done ? "line-through" : "none" }}>{r.text}</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            {r.contactName} · {r.contactPhone}
          </div>
        </div>
        <span style={chip(r.state === "atrasado" ? "late" : r.state === "hoje" ? "wait" : "mute")}>
          {done && r.doneAt ? `feito ${when(r.doneAt)}` : when(r.dueAt)}
        </span>
        {r.snoozeCount > 0 && !done && (
          <span style={chip("vio")} title="Quantas vezes foi adiado">
            <AlarmClock size={11} /> adiado {r.snoozeCount}×
          </span>
        )}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <a href={whatsappLink(r.contactPhone, "")} target="_blank" rel="noreferrer" style={{ ...ghostSm, textDecoration: "none", ...iconBtn }}>
            <MessageSquare size={13} />Conversa
          </a>
          {done ? (
            <button disabled={busyId === r.id} onClick={() => act(r, "reopen")} style={{ ...ghostSm, ...iconBtn }}>
              <RotateCcw size={13} />Reabrir
            </button>
          ) : (
            <>
              <button disabled={busyId === r.id} onClick={() => act(r, "done")} style={{ ...btnSm, ...iconBtn }}>
                <Check size={13} />Feito
              </button>
              <button onClick={() => setSnoozeFor(snoozeFor === r.id ? null : r.id)} style={{ ...ghostSm, ...iconBtn }}>
                <AlarmClock size={13} />Adiar
              </button>
            </>
          )}
          <button disabled={busyId === r.id} onClick={() => act(r, "delete")} style={{ ...ghostSm, padding: "5px 8px" }} title="Apagar">
            <Trash2 size={13} />
          </button>
        </div>
        {snoozeFor === r.id && (
          <div style={{ flexBasis: "100%", display: "flex", gap: 6, flexWrap: "wrap" }}>
            {snoozeOptions().map((o) => (
              <button key={o.label} onClick={() => act(r, "snooze", o.at)} style={{ ...inner, padding: "6px 12px", fontSize: 12, color: "var(--text)", cursor: "pointer" }}>
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  const emptyBox = (text: string) => <p style={{ padding: 28, textAlign: "center", color: "var(--muted)", fontSize: 14, margin: 0 }}>{text}</p>

  return (
    <>
      <PageHeader
        title="Pendências"
        subtitle="Lembretes de voltar a falar com as clientes. Adiar muda o horário e fica marcado em Adiadas."
        actions={<button onClick={() => setShowForm((v) => !v)} style={btn}><BellPlus size={15} style={{ verticalAlign: -2, marginRight: 4 }} />Lembrete</button>}
      />

      <div className="v-card v-kpis">
        <div className="v-kpi"><div className="l">Atrasadas</div><div className="n">{items && tab !== "feitos" ? count("atrasado") : "…"}</div><span className="v-pill late">precisam de você</span></div>
        <div className="v-kpi"><div className="l">Hoje</div><div className="n">{items && tab !== "feitos" ? count("hoje") : "…"}</div><span className="v-pill wait">pra hoje</span></div>
        <div className="v-kpi"><div className="l">Adiadas</div><div className="n">{items && tab !== "feitos" ? all.filter((r) => r.snoozeCount > 0).length : "…"}</div><span className="v-pill mute">empurradas</span></div>
        <div className="v-kpi"><div className="l">Abertas</div><div className="n">{items && tab !== "feitos" ? all.length : "…"}</div><span className="v-pill ok">no total</span></div>
      </div>

      {showForm && <NewReminderForm onClose={() => setShowForm(false)} onDone={async () => { setShowForm(false); await load(tab) }} />}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => { setItems(null); setTab(t.id) }}
            style={{
              padding: "7px 16px", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: "pointer",
              border: `1px solid ${tab === t.id ? "transparent" : "var(--soft)"}`,
              background: tab === t.id ? "var(--accent)" : "var(--field)",
              color: tab === t.id ? "var(--on-accent)" : "var(--muted)",
              boxShadow: tab === t.id ? "0 0 16px var(--glow)" : "none",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p style={{ ...errorText, margin: 0 }}>{error}</p>}

      {items === null ? (
        <div style={card}>{emptyBox("Carregando...")}</div>
      ) : visible.length === 0 ? (
        <div style={card}>
          {emptyBox(tab === "feitos" ? "Nada feito ainda." : tab === "adiadas" ? "Nenhuma pendência adiada." : "Nenhuma pendência. Crie em + Lembrete ou pela extensão, dentro da conversa.")}
        </div>
      ) : tab === "abertos" ? (
        GROUPS.map((g) => {
          const list = visible.filter((r) => r.state === g.state)
          if (!list.length) return null
          return (
            <div key={g.state} style={{ ...card, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px 8px", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={chip(g.tone)}>{g.title}</span>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{list.length}</span>
              </div>
              {list.map(renderRow)}
            </div>
          )
        })
      ) : (
        <div style={{ ...card, overflow: "hidden" }}>{visible.map(renderRow)}</div>
      )}
    </>
  )
}

function NewReminderForm({ onClose, onDone }: { onClose: () => void; onDone: () => Promise<void> }) {
  const [q, setQ] = useState("")
  const [hits, setHits] = useState<ContactHit[]>([])
  const [contact, setContact] = useState<ContactHit | null>(null)
  const [text, setText] = useState("")
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
      try { setHits(await call("GET", `/api/crm/contacts?q=${encodeURIComponent(q)}`)) } catch { setHits([]) }
    }, 300)
    return () => clearTimeout(t)
  }, [q, contact])

  async function create() {
    setErr(null)
    if (!contact) return setErr("Escolha a cliente.")
    if (!text.trim()) return setErr("Escreva o lembrete.")
    const d = new Date(at)
    if (Number.isNaN(d.getTime())) return setErr("Informe data e hora.")
    setBusy(true)
    try {
      await call("POST", "/api/crm/reminders", { contactId: contact.id, text, dueAt: d.toISOString() })
      await onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não consegui criar.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ ...card, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      {contact ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
          <b style={{ color: "var(--strong)" }}>{contact.name}</b> <span style={{ color: "var(--muted)" }}>{contact.phone}</span>
          <button onClick={() => { setContact(null); setQ("") }} style={{ ...ghostSm, marginLeft: "auto" }}>Trocar</button>
        </div>
      ) : (
        <div>
          <input autoFocus placeholder="Buscar cliente por nome ou telefone" value={q} onChange={(e) => setQ(e.target.value)} style={field} />
          <div style={{ maxHeight: 170, overflowY: "auto", marginTop: 6 }}>
            {hits.map((h) => (
              <button key={h.id} onClick={() => setContact(h)} style={{ ...inner, display: "block", width: "100%", textAlign: "left", cursor: "pointer", color: "var(--text)", padding: "8px 10px", fontSize: 13, marginBottom: 5 }}>
                {h.name} <span style={{ color: "var(--faint)" }}>{h.phone}</span>
              </button>
            ))}
            {hits.length === 0 && <p style={{ fontSize: 12, color: "var(--faint)", margin: "6px 2px" }}>Nenhuma cliente encontrada. Crie o contato no Funil primeiro.</p>}
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input placeholder="O que lembrar? Ex.: cobrar o pacote" maxLength={300} value={text} onChange={(e) => setText(e.target.value)} style={{ ...field, flex: 1, minWidth: 220, width: "auto" }} />
        <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} style={{ ...field, width: "auto" }} />
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={create} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>{busy ? "Criando..." : "Criar lembrete"}</button>
        <button onClick={onClose} style={ghost}>Cancelar</button>
        {err && <span style={{ color: "var(--danger)", fontSize: 12 }}>{err}</span>}
      </div>
    </div>
  )
}
