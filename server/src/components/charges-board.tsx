"use client"

import { useCallback, useEffect, useState } from "react"
import { HandCoins, MessageSquare, Plus } from "lucide-react"
import type { ChargeFilter, ChargeState, ChargeSummary, ChargeView } from "@/lib/charges"
import { buildChargeMessage, whatsappLink } from "@/lib/charge-message"
import { PageHeader } from "@/components/page-header"
import { btn, btnSm, card, chip, chipTone, errorText, field, ghost, ghostSm, inner } from "@/lib/ui"

const TZ = "America/Sao_Paulo"
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: TZ })
const todayInput = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ })

const TABS: { id: ChargeFilter; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "a_receber", label: "A receber" },
  { id: "vencidas", label: "Vencidas" },
  { id: "pagas", label: "Pagas" },
]

const STATE: Record<ChargeState, { tone: keyof typeof chipTone; label: string }> = {
  pendente: { tone: "wait", label: "A receber" },
  vencida: { tone: "late", label: "Vencida" },
  paga: { tone: "ok", label: "Paga" },
  cancelada: { tone: "mute", label: "Cancelada" },
}

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

export function ChargesBoard() {
  const [tab, setTab] = useState<ChargeFilter>("todas")
  const [charges, setCharges] = useState<ChargeView[] | null>(null)
  const [summary, setSummary] = useState<ChargeSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async (filter: ChargeFilter) => {
    try {
      const d = await call("GET", `/api/crm/charges?status=${filter}`)
      setCharges(d.charges)
      setSummary(d.summary)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui carregar as cobranças.")
    }
  }, [])

  useEffect(() => {
    load(tab)
  }, [tab, load])

  async function act(c: ChargeView, action: "pay" | "cancel") {
    const msg =
      action === "pay"
        ? `Marcar como paga a cobrança de ${brl(c.amount)} de ${c.contactName}?\n\nIsso registra a compra e envia a conversão ao Meta (se estiver configurado).`
        : `Cancelar a cobrança de ${brl(c.amount)} de ${c.contactName}?`
    if (!confirm(msg)) return
    setBusyId(c.id)
    try {
      await call("PATCH", `/api/crm/charges/${c.id}`, { action })
      await load(tab)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo deu errado.")
      await load(tab)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Cobranças"
        subtitle="Dinheiro a receber das clientes. Ao marcar como paga, vira uma compra e vai pro Meta."
        actions={<button onClick={() => setShowForm((v) => !v)} style={btn}><Plus size={15} style={{ verticalAlign: -2, marginRight: 4 }} />Cobrança</button>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
        <SummaryCard label="A receber" tone="wait" value={summary?.aReceber} />
        <SummaryCard label="Vencidas" tone="late" value={summary?.vencidas} />
        <SummaryCard label="Recebidas" tone="ok" value={summary?.pagas} />
      </div>

      {showForm && (
        <NewChargeForm
          onClose={() => setShowForm(false)}
          onDone={async () => {
            setShowForm(false)
            await load(tab)
          }}
        />
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
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

      <div style={{ ...card, padding: 6 }}>
        {charges === null ? (
          <p style={empty}>Carregando...</p>
        ) : charges.length === 0 ? (
          <p style={empty}>
            Nenhuma cobrança aqui. Crie a primeira em <b>+ Cobrança</b> ou pelo botão <b>Cobrar</b> de um card do funil.
          </p>
        ) : (
          charges.map((c, i) => {
            const s = STATE[c.state]
            const open = c.state === "pendente" || c.state === "vencida"
            const text = buildChargeMessage({
              name: c.contactName, amount: c.amount, dueDate: c.dueDate,
              description: c.description, paymentLink: c.paymentLink,
            })
            return (
              <div key={c.id} style={{ ...row, borderTop: i === 0 ? "none" : "1px solid var(--soft)" }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "var(--strong)" }}>{c.contactName}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.description || "Sem descrição"} · {c.contactPhone}
                  </div>
                </div>
                <div style={{ textAlign: "right", minWidth: 100 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "var(--strong)" }}>{brl(c.amount)}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    {c.state === "paga" && c.paidAt ? `paga em ${shortDate(c.paidAt)}` : `vence ${shortDate(c.dueDate)}`}
                  </div>
                </div>
                <span style={{ ...chip(s.tone), minWidth: 82, justifyContent: "center" }}>{s.label}</span>
                {open ? (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", minWidth: 270 }}>
                    <a href={whatsappLink(c.contactPhone, text)} target="_blank" rel="noreferrer" style={{ ...ghostSm, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <MessageSquare size={13} />Cobrar no WhatsApp
                    </a>
                    <button disabled={busyId === c.id} onClick={() => act(c, "pay")} style={btnSm}>
                      {busyId === c.id ? "..." : "Marcar paga"}
                    </button>
                    <button disabled={busyId === c.id} onClick={() => act(c, "cancel")} style={ghostSm}>Cancelar</button>
                  </div>
                ) : (
                  <div style={{ minWidth: 270 }} />
                )}
              </div>
            )
          })
        )}
      </div>
    </>
  )
}

function SummaryCard({
  label, tone, value,
}: {
  label: string
  tone: "wait" | "late" | "ok"
  value?: { count: number; total: number }
}) {
  const color = tone === "wait" ? "var(--wait-text)" : tone === "late" ? "var(--late-text)" : "var(--ok-text)"
  return (
    <div className="v-card" style={{ padding: "16px 18px" }}>
      <div style={{ fontSize: 13, color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: "var(--strong)", margin: "4px 0" }}>{value ? brl(value.total) : "..."}</div>
      <span style={{ ...chip(tone), color }}>
        {value ? `${value.count} ${value.count === 1 ? "cobrança" : "cobranças"}` : ""}
      </span>
    </div>
  )
}

function NewChargeForm({ onClose, onDone }: { onClose: () => void; onDone: () => Promise<void> }) {
  const [q, setQ] = useState("")
  const [hits, setHits] = useState<ContactHit[]>([])
  const [contact, setContact] = useState<ContactHit | null>(null)
  const [amount, setAmount] = useState("")
  const [due, setDue] = useState(todayInput())
  const [desc, setDesc] = useState("")
  const [link, setLink] = useState("")
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Busca de cliente (espera 300 ms depois da última tecla)
  useEffect(() => {
    if (contact) return
    const t = setTimeout(async () => {
      try {
        setHits(await call("GET", `/api/crm/contacts?q=${encodeURIComponent(q)}`))
      } catch {
        setHits([])
      }
    }, 300)
    return () => clearTimeout(t)
  }, [q, contact])

  async function create() {
    setErr(null)
    if (!contact) return setErr("Escolha a cliente.")
    const value = parseFloat(amount.replace(",", "."))
    if (!value || value <= 0) return setErr("Informe um valor maior que zero.")
    setBusy(true)
    try {
      await call("POST", "/api/crm/charges", {
        contactId: contact.id, amount: value, dueDate: due,
        description: desc || undefined, paymentLink: link || undefined,
      })
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
          <HandCoins size={17} style={{ color: "var(--vred)" }} />
          <b style={{ color: "var(--strong)" }}>{contact.name}</b> <span style={{ color: "var(--muted)" }}>{contact.phone}</span>
          <button onClick={() => { setContact(null); setQ("") }} style={{ ...ghostSm, marginLeft: "auto" }}>Trocar</button>
        </div>
      ) : (
        <div>
          <input autoFocus placeholder="Buscar cliente por nome ou telefone" value={q} onChange={(e) => setQ(e.target.value)} style={field} />
          <div style={{ maxHeight: 170, overflowY: "auto", marginTop: 6 }}>
            {hits.map((h) => (
              <button key={h.id} onClick={() => setContact(h)} style={hit}>
                {h.name} <span style={{ color: "var(--faint)" }}>{h.phone}</span>
              </button>
            ))}
            {hits.length === 0 && <p style={{ fontSize: 12, color: "var(--faint)", margin: "6px 2px" }}>Nenhuma cliente encontrada. Crie o contato no Funil primeiro.</p>}
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input placeholder="Valor (R$)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ ...field, width: 140 }} />
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={{ ...field, width: "auto" }} />
        <input placeholder="Descrição (opcional)" value={desc} onChange={(e) => setDesc(e.target.value)} style={{ ...field, flex: 1, minWidth: 180, width: "auto" }} />
      </div>
      <input placeholder="Link de pagamento ou Pix copia-e-cola (opcional, vai na mensagem)" value={link} onChange={(e) => setLink(e.target.value)} style={field} />
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={create} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>{busy ? "Criando..." : "Criar cobrança"}</button>
        <button onClick={onClose} style={ghost}>Cancelar</button>
        {err && <span style={{ color: "var(--danger)", fontSize: 12 }}>{err}</span>}
      </div>
    </div>
  )
}

const empty: React.CSSProperties = { padding: 28, textAlign: "center", color: "var(--muted)", fontSize: 14, margin: 0 }
const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", flexWrap: "wrap" }
const hit: React.CSSProperties = {
  ...inner, display: "block", width: "100%", textAlign: "left", cursor: "pointer", color: "var(--text)",
  padding: "8px 10px", fontSize: 13, marginBottom: 5,
}
