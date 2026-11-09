"use client"

import { useDialog } from "./use-dialog"

import { useCallback, useEffect, useId, useRef, useState } from "react"
import { MessageSquare, X } from "lucide-react"
import type { getContactDetail } from "@/lib/contact-detail"
import {
  SOURCES, SOURCE_LABEL,
  LIFECYCLE_STAGES, LIFECYCLE_LABEL,
  LEAD_STATUSES, LEAD_STATUS_LABEL,
  DEAL_STAGES, DEAL_STAGE_LABEL,
} from "@/lib/sources"
import { withCountryCode } from "@/lib/phone"
import { btn, chip, errorText, field, iconBtn, inner, label } from "@/lib/ui"

type Detail = NonNullable<Awaited<ReturnType<typeof getContactDetail>>>
type Tab = "dados" | "timeline" | "notas" | "historico"

const TZ = "America/Sao_Paulo"
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const day = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: TZ })
const dayTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })

async function call(method: string, url: string, body?: unknown, signal?: AbortSignal) {
  const res = await fetch(url, {
    method, signal,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`)
  return data
}

export function ContactDrawer({
  contactId, onClose, onChanged,
}: {
  contactId: string
  onClose: () => void
  onChanged: () => Promise<void> | void
}) {
  const uid = useId()
  const changed = useRef(false)
  const baseline = useRef("")
  const request = useRef(0)
  const [historyBusy, setHistoryBusy] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const continueButton = useRef<HTMLButtonElement>(null)
  const close = () => {
    if (discarding) { setDiscarding(false); return }
    if (changed.current) setDiscarding(true)
    else onClose()
  }
  useEffect(() => { if (discarding) continueButton.current?.focus() }, [discarding])
  const dialog = useDialog(close)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>("dados")

  // campos de "Dados do lead & Negócio (HubSpot)"
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [source, setSource] = useState("")
  const [birth, setBirth] = useState("")
  const [lifecycleStage, setLifecycleStage] = useState("lead")
  const [leadStatus, setLeadStatus] = useState("novo")
  const [dealTitle, setDealTitle] = useState("")
  const [dealValue, setDealValue] = useState("")
  const [dealStage, setDealStage] = useState("aberto")
  const [nextStep, setNextStep] = useState("")
  const [nextStepAt, setNextStepAt] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // notas
  const [noteText, setNoteText] = useState("")
  const [addingNote, setAddingNote] = useState(false)

  useEffect(() => { changed.current = Boolean(detail && baseline.current !== JSON.stringify([name, email, source, birth, lifecycleStage, leadStatus, dealTitle, dealValue, dealStage, nextStep, nextStepAt])) || Boolean(noteText.trim()) }, [detail, name, email, source, birth, lifecycleStage, leadStatus, dealTitle, dealValue, dealStage, nextStep, nextStepAt, noteText])

  const load = useCallback(async (signal?: AbortSignal) => {
    const version = ++request.current
    try {
      const d: Detail = await call("GET", `/api/crm/contacts/${contactId}`, undefined, signal)
      if (signal?.aborted || version !== request.current) return
      baseline.current = JSON.stringify([d.contact.name, d.contact.email ?? "", d.contact.source ?? "", d.contact.birthDate ?? "", d.contact.lifecycleStage ?? "lead", d.contact.leadStatus ?? "novo", d.contact.dealTitle ?? "", d.contact.dealValue != null ? String(d.contact.dealValue) : "", d.contact.dealStage ?? "aberto", d.contact.nextStep ?? "", d.contact.nextStepAt ?? ""])
      changed.current = false
      setDetail(d)
      setName(d.contact.name)
      setEmail(d.contact.email ?? "")
      setSource(d.contact.source ?? "")
      setBirth(d.contact.birthDate ?? "")
      setLifecycleStage(d.contact.lifecycleStage ?? "lead")
      setLeadStatus(d.contact.leadStatus ?? "novo")
      setDealTitle(d.contact.dealTitle ?? "")
      setDealValue(d.contact.dealValue != null ? String(d.contact.dealValue) : "")
      setDealStage(d.contact.dealStage ?? "aberto")
      setNextStep(d.contact.nextStep ?? "")
      setNextStepAt(d.contact.nextStepAt ?? "")
      setError(null)
    } catch (e) {
      if (!signal?.aborted && version === request.current) setError(e instanceof Error ? e.message : "Não consegui carregar a cliente.")
    }
  }, [contactId])

  useEffect(() => {
    const controller = new AbortController()
    const task = setTimeout(() => void load(controller.signal), 0)
    return () => { clearTimeout(task); controller.abort() }
  }, [load])

  async function moreHistory() {
    if (!detail || historyBusy) return
    const version = request.current
    setHistoryBusy(true)
    try {
      const next: Detail = await call("GET", `/api/crm/contacts/${contactId}?purchasePage=${detail.crm.purchasePage + 1}`)
      if (version === request.current) setDetail(old => old ? { ...old, crm: { ...next.crm, purchases: [...old.crm.purchases, ...next.crm.purchases.filter(p => !old.crm.purchases.some(x => x.id === p.id))] } } : old)
    } catch (e) { if (version === request.current) setError(e instanceof Error ? e.message : "Não foi possível carregar o histórico.") }
    finally { setHistoryBusy(false) }
  }

  async function saveData() {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const numVal = dealValue.trim() ? parseFloat(dealValue.replace(",", ".")) : null
      await call("PATCH", `/api/crm/contacts/${contactId}`, {
        name,
        email,
        source: source || null,
        birthDate: birth || null,
        lifecycleStage,
        leadStatus,
        dealTitle: dealTitle.trim() || null,
        dealValue: numVal != null && !Number.isNaN(numVal) ? numVal : null,
        dealStage,
        nextStep: nextStep.trim() || null,
        nextStepAt: nextStepAt || null,
      })
      setSaved(true)
      await load()
      await onChanged()
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui salvar.")
    } finally {
      setSaving(false)
    }
  }

  async function addNote() {
    if (!noteText.trim()) return
    setAddingNote(true)
    setError(null)
    try {
      await call("POST", `/api/crm/contacts/${contactId}/notes`, { text: noteText })
      setNoteText("")
      await load()
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui salvar a nota.")
    } finally {
      setAddingNote(false)
    }
  }

  async function removeNote(id: string) {
    if (!confirm("Apagar esta nota? Não dá pra desfazer.")) return
    try {
      await call("DELETE", `/api/crm/notes/${id}`)
      await load()
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui apagar.")
    }
  }

  const s = detail?.crm.stats

  return (
    <div style={overlay} onClick={close}>
      <aside ref={dialog} role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`} tabIndex={-1} style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div id={`${uid}-title`} style={{ fontSize: 18, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--strong)" }}>
              {detail?.contact.name ?? "Carregando..."}
            </div>
            {detail && (
              <div style={{ fontSize: 13, color: "var(--muted)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {detail.contact.phone}
                <a href={`https://wa.me/${withCountryCode(detail.contact.phone)}`} target="_blank" rel="noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600, textDecoration: "none" }}>
                  <MessageSquare size={13} />Abrir conversa
                </a>
              </div>
            )}
          </div>
          <button onClick={close} aria-label="Fechar" style={{ ...iconBtn, color: "var(--muted)" }}><X size={20} /></button>
        </div>

        {discarding && <div role="alert" style={{ ...inner, padding: 12, marginTop: 12 }}>
          <p>Há alterações não salvas. Deseja descartá-las?</p>
          <div className="vs-actions"><button ref={continueButton} style={btn} onClick={() => setDiscarding(false)}>Continuar editando</button><button style={btn} onClick={onClose}>Descartar alterações</button></div>
        </div>}
        {detail && s && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            <span style={chip("wine")}>{s.tierLabel}</span>
            {s.cadenceLabel && <span style={chip("wait")}>{s.cadenceLabel}</span>}
            {detail.crm.lists.map((l) => (
              <span key={l.id} style={{ ...chip("mute"), borderColor: l.color, color: "var(--text)" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: l.color }} />{l.name}
              </span>
            ))}
          </div>
        )}

        <div role="tablist" aria-label="Detalhes do contato" style={{ display: "flex", gap: 4, margin: "14px 0 12px", borderBottom: "1px solid var(--soft)", flexWrap: "wrap" }}>
          {([
            ["dados", "Dados & Negócio"],
            ["timeline", "Linha do Tempo (360°)"],
            ["notas", `Notas${detail ? ` (${detail.notes.length})` : ""}`],
            ["historico", "Compras"],
          ] as [Tab, string][]).map(([id, text]) => (
            <button
              key={id}
              role="tab" id={`${uid}-tab-${id}`} aria-selected={tab === id} aria-controls={`${uid}-content`} tabIndex={tab === id ? 0 : -1}
              onKeyDown={e => {
                const tabs: Tab[] = ["dados", "timeline", "notas", "historico"]
                const index = tabs.indexOf(id)
                const next = e.key === "ArrowRight" ? tabs[(index + 1) % tabs.length] : e.key === "ArrowLeft" ? tabs[(index + tabs.length - 1) % tabs.length] : e.key === "Home" ? tabs[0] : e.key === "End" ? tabs[tabs.length - 1] : null
                if (next) { e.preventDefault(); setTab(next); document.getElementById(`${uid}-tab-${next}`)?.focus() }
              }}
              onClick={() => setTab(id)}
              style={{
                background: "none", border: "none", cursor: "pointer", padding: "8px 10px",
                fontSize: 12.5, fontWeight: 700,
                color: tab === id ? "var(--strong)" : "var(--muted)",
                borderBottom: `2px solid ${tab === id ? "var(--accent)" : "transparent"}`,
              }}
            >
              {text}
            </button>
          ))}
        </div>

        {error && <p role="alert" style={{ ...errorText, margin: "0 0 10px" }}>{error}</p>}

        <div id={`${uid}-content`} role="tabpanel" aria-labelledby={`${uid}-tab-${tab}`}>
        {!detail ? (
          !error && <p style={{ color: "var(--muted)", fontSize: 13 }}>Carregando...</p>
        ) : tab === "dados" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ ...inner, padding: 12, marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.7, color: "var(--accent)", marginBottom: 8 }}>
                Oportunidade / Negócio (HubSpot Pipeline)
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 8 }}>
                <div>
                  <label htmlFor={`${uid}-field-1`} style={label}>Título do Negócio</label>
                  <input id={`${uid}-field-1`} value={dealTitle} onChange={(e) => setDealTitle(e.target.value)} placeholder="Ex.: Pacote Premium" style={field} />
                </div>
                <div>
                  <label htmlFor={`${uid}-field-2`} style={label}>Valor (R$)</label>
                  <input id={`${uid}-field-2`} type="number" step="0.01" min="0" value={dealValue} onChange={(e) => setDealValue(e.target.value)} placeholder="0,00" style={field} />
                </div>
              </div>
              <label htmlFor={`${uid}-field-3`} style={label}>Status do Negócio</label>
              <select id={`${uid}-field-3`} value={dealStage} onChange={(e) => setDealStage(e.target.value)} style={field}>
                {DEAL_STAGES.map((st) => (
                  <option key={st} value={st}>{DEAL_STAGE_LABEL[st]}</option>
                ))}
              </select>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 8 }}>
                <div>
                  <label htmlFor={`${uid}-field-4`} style={label}>Próximo Passo (Follow-up)</label>
                  <input id={`${uid}-field-4`} value={nextStep} onChange={(e) => setNextStep(e.target.value)} placeholder="Ex.: Ligar sexta às 14h" style={field} />
                </div>
                <div>
                  <label htmlFor={`${uid}-field-5`} style={label}>Prazo</label>
                  <input id={`${uid}-field-5`} type="date" value={nextStepAt} onChange={(e) => setNextStepAt(e.target.value)} style={field} />
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label htmlFor={`${uid}-field-6`} style={label}>Ciclo de Vida (HubSpot)</label>
                <select id={`${uid}-field-6`} value={lifecycleStage} onChange={(e) => setLifecycleStage(e.target.value)} style={field}>
                  {LIFECYCLE_STAGES.map((lc) => (
                    <option key={lc} value={lc}>{LIFECYCLE_LABEL[lc]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`${uid}-field-7`} style={label}>Status do Lead</label>
                <select id={`${uid}-field-7`} value={leadStatus} onChange={(e) => setLeadStatus(e.target.value)} style={field}>
                  {LEAD_STATUSES.map((ls) => (
                    <option key={ls} value={ls}>{LEAD_STATUS_LABEL[ls]}</option>
                  ))}
                </select>
              </div>
            </div>

            <label htmlFor={`${uid}-field-8`} style={label}>Nome</label>
            <input id={`${uid}-field-8`} value={name} onChange={(e) => setName(e.target.value)} style={field} />

            <label htmlFor={`${uid}-field-9`} style={label}>Telefone</label>
            <input id={`${uid}-field-9`} value={detail.contact.phone} readOnly style={{ ...field, opacity: 0.6 }} />

            <label htmlFor={`${uid}-field-10`} style={label}>E-mail</label>
            <input id={`${uid}-field-10`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="opcional" style={field} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label htmlFor={`${uid}-field-11`} style={label}>Origem</label>
                <select id={`${uid}-field-11`} value={source} onChange={(e) => setSource(e.target.value)} style={field}>
                  <option value="">Não informada</option>
                  {SOURCES.map((o) => (
                    <option key={o} value={o}>{SOURCE_LABEL[o]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`${uid}-field-12`} style={label}>Nascimento</label>
                <input id={`${uid}-field-12`} type="date" value={birth} onChange={(e) => setBirth(e.target.value)} style={field} />
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
              <button onClick={saveData} disabled={saving || !name.trim()} style={{ ...btn, opacity: saving || !name.trim() ? 0.6 : 1 }}>
                {saving ? "Salvando..." : "Salvar propriedades"}
              </button>
              {saved && <span role="status" style={{ color: "var(--ok)", fontSize: 13 }}>Salvo!</span>}
            </div>
          </div>
        ) : tab === "timeline" ? (
          <div><p style={{ color: "var(--muted)", fontSize: 12 }}>Atividades recentes: até 200 notas, 100 cobranças, 100 lembretes e as compras já carregadas. Veja Compras para continuar o histórico.</p><TimelineView detail={detail} /></div>
        ) : tab === "notas" ? (
          <div>
            <textarea
              aria-label="Nova anotação sobre o contato"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) addNote() }}
              placeholder="Escreva uma anotação sobre esta cliente..."
              rows={3}
              maxLength={2000}
              style={{ ...field, resize: "vertical", fontFamily: "inherit" }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0 16px" }}>
              <button onClick={addNote} disabled={addingNote || !noteText.trim()} style={{ ...btn, opacity: addingNote || !noteText.trim() ? 0.6 : 1 }}>
                {addingNote ? "Salvando..." : "Adicionar nota"}
              </button>
              <span style={{ fontSize: 11, color: "var(--faint)" }}>Ctrl+Enter também salva</span>
            </div>

            {detail.notes.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--faint)", fontStyle: "italic" }}>Nenhuma nota ainda.</p>
            ) : (
              detail.notes.map((n) => (
                <div key={n.id} style={{ ...inner, padding: "10px 12px", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: "var(--muted)", flex: 1 }}>{dayTime(n.createdAt)}</span>
                    <button onClick={() => removeNote(n.id)} title="Apagar nota" aria-label="Apagar nota" style={{ ...iconBtn, color: "var(--faint)" }}>
                      <X size={15} />
                    </button>
                  </div>
                  <div style={{ fontSize: 14, whiteSpace: "pre-wrap", wordBreak: "break-word", color: "var(--text)" }}>{n.text}</div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div>
            {s && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
                <Stat value={String(s.count)} text="compras" />
                <Stat value={brl(s.totalSpent)} text="total gasto" />
                <Stat value={s.daysSinceLast == null ? "—" : `${s.daysSinceLast}d`} text="última compra" />
              </div>
            )}
            {detail.crm.purchases.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--faint)", fontStyle: "italic" }}>Nenhuma compra registrada.</p>
            ) : (
              detail.crm.purchases.map((p) => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid var(--soft)" }}>
                  <div>
                    <div style={{ fontSize: 14, color: "var(--text)" }}>{p.productName || "Compra"}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>{day(p.purchasedAt)}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ok)" }}>{brl(p.amount)}</div>
                </div>
              ))
            )}
            {detail.crm.purchaseHasMore && <button style={btn} disabled={historyBusy} onClick={moreHistory}>{historyBusy ? "Carregando…" : "Carregar mais compras"}</button>}
          </div>
        )}
        </div>
      </aside>
    </div>
  )
}

function TimelineView({ detail }: { detail: Detail }) {
  type EventItem = { id: string; kind: "nota" | "compra" | "cobranca" | "lembrete"; at: string; title: string; sub?: string; badge?: string; color?: string }
  const events: EventItem[] = []
  for (const n of detail.notes) {
    events.push({ id: "n-" + n.id, kind: "nota", at: n.createdAt, title: "Nota adicionada", sub: n.text, badge: "Nota", color: "var(--accent)" })
  }
  for (const p of detail.crm.purchases) {
    events.push({ id: "p-" + p.id, kind: "compra", at: p.purchasedAt, title: p.productName || "Compra registrada", sub: `Valor pago: ${brl(p.amount)}`, badge: brl(p.amount), color: "var(--ok)" })
  }
  for (const c of detail.charges || []) {
    events.push({
      id: "c-" + c.id,
      kind: "cobranca",
      at: c.createdAt,
      title: `Cobrança: ${c.description || "Sem descrição"}`,
      sub: `Vencimento: ${c.dueDate} · Status: ${c.status}`,
      badge: brl(c.amount),
      color: "var(--warn)",
    })
  }
  for (const r of detail.reminders || []) {
    events.push({
      id: "r-" + r.id,
      kind: "lembrete",
      at: r.dueAt,
      title: `Tarefa / Agendamento: ${r.text}`,
      sub: r.scheduledMessage ? `Mensagem agendada: "${r.scheduledMessage}"` : r.doneAt ? "Concluído" : "Aberto",
      badge: r.doneAt ? "Feito" : "Agendado",
      color: "var(--muted)",
    })
  }
  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  if (events.length === 0) {
    return <p style={{ fontSize: 13, color: "var(--faint)", fontStyle: "italic" }}>Nenhuma atividade registrada nesta cliente ainda.</p>
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {events.map((ev) => (
        <div key={ev.id} style={{ ...inner, padding: "10px 12px", borderLeft: `3px solid ${ev.color || "var(--accent)"}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <b style={{ fontSize: 13, color: "var(--strong)" }}>{ev.title}</b>
            {ev.badge && <span style={{ fontSize: 11, fontWeight: 700, color: ev.color }}>{ev.badge}</span>}
          </div>
          {ev.sub && <div style={{ fontSize: 12.5, color: "var(--text)", whiteSpace: "pre-wrap" }}>{ev.sub}</div>}
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{dayTime(ev.at)}</div>
        </div>
      ))}
    </div>
  )
}

function Stat({ value, text }: { value: string; text: string }) {
  return (
    <div style={{ ...inner, padding: "10px 6px", textAlign: "center" }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--strong)" }}>{value}</div>
      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{text}</div>
    </div>
  )
}

const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "var(--overlay)", zIndex: 50, display: "flex", justifyContent: "flex-end" }
const panel: React.CSSProperties = {
  width: 410, maxWidth: "100vw", height: "100%", overflowY: "auto", padding: 20,
  background: "linear-gradient(180deg, var(--panel-1), var(--panel-2))",
  borderLeft: "1px solid var(--line)",
  boxShadow: "-12px 0 40px rgba(224, 36, 94, 0.14)",
}
