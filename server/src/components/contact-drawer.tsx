"use client"

import { useCallback, useEffect, useState } from "react"
import { MessageSquare, X } from "lucide-react"
import type { getContactDetail } from "@/lib/contact-detail"
import { SOURCES, SOURCE_LABEL } from "@/lib/sources"
import { withCountryCode } from "@/lib/phone"
import { btn, chip, errorText, field, iconBtn, inner, label } from "@/lib/ui"

type Detail = NonNullable<Awaited<ReturnType<typeof getContactDetail>>>
type Tab = "dados" | "notas" | "historico"

const TZ = "America/Sao_Paulo"
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const day = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: TZ })
const dayTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })

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

export function ContactDrawer({
  contactId, onClose, onChanged,
}: {
  contactId: string
  onClose: () => void
  onChanged: () => Promise<void> | void
}) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>("dados")

  // campos de "Dados do lead"
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [source, setSource] = useState("")
  const [birth, setBirth] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // notas
  const [noteText, setNoteText] = useState("")
  const [addingNote, setAddingNote] = useState(false)

  const load = useCallback(async () => {
    try {
      const d: Detail = await call("GET", `/api/crm/contacts/${contactId}`)
      setDetail(d)
      setName(d.contact.name)
      setEmail(d.contact.email ?? "")
      setSource(d.contact.source ?? "")
      setBirth(d.contact.birthDate ?? "")
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui carregar a cliente.")
    }
  }, [contactId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  async function saveData() {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      await call("PATCH", `/api/crm/contacts/${contactId}`, {
        name,
        email,
        source: source || null,
        birthDate: birth || null,
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
    <div style={overlay} onClick={onClose}>
      <aside style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--strong)" }}>
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
          <button onClick={onClose} aria-label="Fechar" style={{ ...iconBtn, color: "var(--muted)" }}><X size={20} /></button>
        </div>

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

        <div style={{ display: "flex", gap: 4, margin: "14px 0 12px", borderBottom: "1px solid var(--soft)" }}>
          {([
            ["dados", "Dados"],
            ["notas", `Notas${detail ? ` (${detail.notes.length})` : ""}`],
            ["historico", "Histórico"],
          ] as [Tab, string][]).map(([id, text]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                background: "none", border: "none", cursor: "pointer", padding: "8px 12px",
                fontSize: 13, fontWeight: 700,
                color: tab === id ? "var(--strong)" : "var(--muted)",
                borderBottom: `2px solid ${tab === id ? "var(--accent)" : "transparent"}`,
              }}
            >
              {text}
            </button>
          ))}
        </div>

        {error && <p style={{ ...errorText, margin: "0 0 10px" }}>{error}</p>}

        {!detail ? (
          !error && <p style={{ color: "var(--muted)", fontSize: 13 }}>Carregando...</p>
        ) : tab === "dados" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={label}>Nome</label>
            <input value={name} onChange={(e) => setName(e.target.value)} style={field} />

            <label style={label}>Telefone</label>
            <input value={detail.contact.phone} readOnly style={{ ...field, opacity: 0.6 }} />
            <span style={{ fontSize: 11, color: "var(--faint)" }}>O número identifica a cliente. Pra trocar, crie outro contato.</span>

            <label style={label}>E-mail</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="opcional" style={field} />

            <label style={label}>Origem</label>
            <select value={source} onChange={(e) => setSource(e.target.value)} style={field}>
              <option value="">Não informada</option>
              {SOURCES.map((o) => (
                <option key={o} value={o}>{SOURCE_LABEL[o]}</option>
              ))}
            </select>

            <label style={label}>Nascimento</label>
            <input type="date" value={birth} onChange={(e) => setBirth(e.target.value)} style={field} />

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
              <button onClick={saveData} disabled={saving || !name.trim()} style={{ ...btn, opacity: saving || !name.trim() ? 0.6 : 1 }}>
                {saving ? "Salvando..." : "Salvar"}
              </button>
              {saved && <span style={{ color: "var(--ok)", fontSize: 13 }}>Salvo.</span>}
            </div>
          </div>
        ) : tab === "notas" ? (
          <div>
            <textarea
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
          </div>
        )}
      </aside>
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
