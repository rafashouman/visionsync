"use client"
import { useState } from "react"
import { useDialog } from "./use-dialog"
import { btn, field, ghost, label, modal, modalTitle, overlay } from "@/lib/ui"
import { CATEGORY_COLORS, type LibraryCategory } from "@/lib/quick-reply-library"

export function QuickReplyCategoryEditor({ category, onSave, onClose }: { category: LibraryCategory; onSave: (name: string, color: string) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState(category.name), [color, setColor] = useState(category.color)
  const [busy, setBusy] = useState(false), [error, setError] = useState("")
  const close = () => { if (!busy) onClose() }
  const ref = useDialog(close)
  return <div style={overlay} onClick={close}><section ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="category-title" style={modal} onClick={event => event.stopPropagation()}>
    <h2 id="category-title" style={modalTitle}>Editar categoria</h2>
    <form onSubmit={async event => { event.preventDefault(); setBusy(true); setError(""); try { await onSave(name, color); onClose() } catch (error) { setError(error instanceof Error ? error.message : "Não foi possível salvar.") } finally { setBusy(false) } }}>
      <label style={label}>Nome da categoria<input value={name} onChange={event => setName(event.target.value)} required maxLength={40} style={field} disabled={busy} /></label>
      <p style={{ fontSize: 12, color: "var(--muted)" }}>O novo nome será aplicado às {category.count} respostas desta categoria.</p>
      <label style={label}>Cor<input type="color" value={color} onChange={event => setColor(event.target.value)} disabled={busy} /></label>
      <div style={{ display: "flex", gap: 10, margin: "12px 0" }}>{CATEGORY_COLORS.map(value => <button type="button" key={value} aria-label={`Usar cor ${value}`} aria-pressed={value === color} onClick={() => setColor(value)} disabled={busy} style={{ background: value, border: value === color ? "3px solid var(--strong)" : "1px solid var(--line)", width: 30, height: 30, borderRadius: 30 }} />)}</div>
      {error && <p role="alert" style={{ color: "var(--danger)", fontSize: 12 }}>{error}</p>}
      <div style={{ display: "flex", gap: 10 }}><button disabled={busy} style={btn}>{busy ? "Salvando…" : "Salvar categoria"}</button><button type="button" disabled={busy} style={ghost} onClick={close}>Cancelar</button></div>
    </form>
  </section></div>
}
