"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowUp, ArrowDown, Eye, GripVertical, ChevronDown, ChevronRight, Copy, Paperclip, Pencil, Plus, Search, Star, Trash2 } from "lucide-react"
import type { QuickReplyView } from "@/lib/quick-replies"
import {
  MAX_ACCOUNT_BYTES, MAX_CAPTION, MEDIA_RULES, QUICK_REPLY_TYPES, TYPE_INFO, formatBytes, isMediaKind,
  type QuickReplyKind,
} from "@/lib/quick-reply-types"
import { VARIABLES } from "@/lib/quick-reply-vars"
import { FileDrop, MediaLine, SavedPreview, Toggle } from "@/components/quick-reply-media"
import { PageHeader } from "@/components/page-header"
import { TypeIcon } from "@/components/type-icon"
import { btn, card, empty, errorText, field, ghost, helper, iconBtn, inner, label, modal, modalTitle, opt, overlay, req } from "@/lib/ui"

import { QuickReplyPreview, ReplyPreviewDialog } from "@/components/quick-reply-preview"
import { QuickReplyCategoryEditor } from "@/components/quick-reply-category-editor"
import { moveBefore, type LibraryCategory } from "@/lib/quick-reply-library"
import { previewSteps, type ReplyStep } from "@/lib/quick-reply-preview"
import { useDialog } from "@/components/use-dialog"

const NO_CATEGORY = "SEM CATEGORIA"


type Filter = "todas" | "favoritas" | QuickReplyKind
type Editor = { mode: "new"; kind: QuickReplyKind | null } | { mode: "edit"; item: QuickReplyView } | null

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

/** Envio de arquivo (multipart): o navegador define o Content-Type sozinho. */
async function callForm(method: string, url: string, form: FormData) {
  const res = await fetch(url, { method, body: form })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`)
  return data
}

function titleFor(kind: QuickReplyKind, editing: boolean) {
  const names: Record<QuickReplyKind, [string, string]> = {
    TEXT: ["Nova mensagem de texto", "Editar mensagem de texto"],
    AUDIO: ["Novo áudio", "Editar áudio"],
    IMAGE: ["Nova imagem", "Editar imagem"],
    VIDEO: ["Novo vídeo", "Editar vídeo"],
    DOCUMENT: ["Novo documento", "Editar documento"],
    CONTACT: ["Novo contato", "Editar contato"],
    SEQUENCE: ["Nova sequência", "Editar sequência"],
  }
  return names[kind][editing ? 1 : 0]
}

export function QuickRepliesBoard({ openNew = false }: { openNew?: boolean }) {
  const [items, setItems] = useState<QuickReplyView[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<Filter>("todas")
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [editor, setEditor] = useState<Editor>(openNew ? { mode: "new", kind: null } : null)
  const [categoryMeta, setCategoryMeta] = useState<LibraryCategory[]>([])
  const [categoryEditor, setCategoryEditor] = useState<LibraryCategory | null>(null)
  const [previewItem, setPreviewItem] = useState<QuickReplyView | null>(null)
  const [organizing, setOrganizing] = useState(false)
  const [sort, setSort] = useState("manual")
  const dragged = useRef<{ type: "reply" | "category"; key: string } | null>(null)
  const canOrganize = !search.trim() && filter === "todas" && sort === "manual" && !organizing

  const load = useCallback(async () => {
    try {
      const [rows, categories] = await Promise.all([call("GET", "/api/crm/quick-replies"), call("GET", "/api/crm/quick-replies/library")])
      setItems(rows); setCategoryMeta(categories)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui carregar as respostas.")
    }
  }, [])

  useEffect(() => {
    const task = setTimeout(() => void load(), 0)
    return () => clearTimeout(task)
  }, [load])

  const categories = useMemo(
    () => [...new Set((items ?? []).map((i) => i.category).filter((c): c is string => Boolean(c)))],
    [items]
  )

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const result = (items ?? []).filter((i) => {
      if (filter === "favoritas" && !i.favorite) return false
      if (filter !== "todas" && filter !== "favoritas" && i.type !== filter) return false
      if (!q) return true
      return [i.name, i.text, i.shortcut, i.category, i.contactName, i.mediaName].some((v) => v?.toLowerCase().includes(q))
    })
    return sort === "name" ? result.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")) : sort === "usage" ? result.sort((a, b) => b.usageCount - a.usageCount) : result
  }, [items, search, filter, sort])

  // Espaço usado pelos arquivos (o limite é por conta)
  const usedBytes = useMemo(() => (items ?? []).reduce((sum, i) => sum + (i.mediaSize ?? 0), 0), [items])

  // Agrupa por categoria, na ordem em que aparecem; "sem categoria" por último.
  const groups = useMemo(() => {
    const map = new Map<string, QuickReplyView[]>()
    for (const i of visible) {
      const key = i.category ?? NO_CATEGORY
      map.set(key, [...(map.get(key) ?? []), i])
    }
    return [...map.entries()].sort(([a], [b]) => (a === NO_CATEGORY ? 1 : b === NO_CATEGORY ? -1 : (categoryMeta.find(c => c.name === a)?.position ?? 9999) - (categoryMeta.find(c => c.name === b)?.position ?? 9999)))
  }, [visible, categoryMeta])

  async function toggleFavorite(i: QuickReplyView) {
    setItems((prev) => prev?.map((x) => (x.id === i.id ? { ...x, favorite: !x.favorite } : x)) ?? prev)
    try {
      await call("PATCH", `/api/crm/quick-replies/${i.id}`, { favorite: !i.favorite })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui favoritar.")
      await load()
    }
  }

  async function duplicate(i: QuickReplyView) {
    try {
      await call("POST", `/api/crm/quick-replies/${i.id}/duplicate`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui duplicar.")
    }
  }

  async function remove(i: QuickReplyView) {
    if (!confirm(`Excluir "${i.name}"? Não dá pra desfazer.`)) return
    try {
      await call("DELETE", `/api/crm/quick-replies/${i.id}`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui excluir.")
    }
  }

  async function organize(body: unknown) {
    setOrganizing(true); setError(null)
    try { await call("PATCH", "/api/crm/quick-replies/library", body); await load() }
    catch (error) { setError(error instanceof Error ? error.message : "Não foi possível organizar.") }
    finally { setOrganizing(false) }
  }
  function moveReply(id: string, target: string) {
    if (!canOrganize || !items || id === target) return
    const a = items.findIndex(item => item.id === id), b = items.findIndex(item => item.id === target)
    if (items[a]?.category !== items[b]?.category) return
    void organize({ action: "reorder", ids: moveBefore(items, a, b).map(item => item.id) })
  }
  function moveCategory(name: string, target: string) {
    if (!canOrganize || name === target) return
    void organize({ action: "categories", names: moveBefore(categoryMeta, categoryMeta.findIndex(item => item.name === name), categoryMeta.findIndex(item => item.name === target)).map(item => item.name) })
  }

  const toggleGroup = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <>
      <PageHeader
        title="Respostas rápidas"
        subtitle={
          <>
            Grave, organize e confira suas respostas. No WhatsApp, use <code>;</code> + atalho ou a barra do plugin.
            {usedBytes > 0 && (
              <span style={{ marginLeft: 8, color: usedBytes > MAX_ACCOUNT_BYTES * 0.8 ? "var(--wait)" : "var(--faint)" }}>
                Arquivos: {formatBytes(usedBytes)} de {formatBytes(MAX_ACCOUNT_BYTES)}
              </span>
            )}
          </>
        }
        actions={
          <button onClick={() => setEditor({ mode: "new", kind: null })} style={btn}>
            <Plus size={15} style={{ verticalAlign: -2, marginRight: 4 }} />Nova
          </button>
        }
      />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={searchBox}>
          <Search size={16} style={{ color: "var(--muted)", flex: "none" }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar mensagem" style={bare} />
        </div>
        <select aria-label="Filtrar por tipo" value={filter} onChange={(e) => setFilter(e.target.value as Filter)} style={{ ...field, width: "auto" }}>
          <option value="todas">Todas</option>
          <option value="favoritas">Favoritas</option>
          {QUICK_REPLY_TYPES.filter((t) => TYPE_INFO[t].available).map((t) => (
            <option key={t} value={t}>{TYPE_INFO[t].label}</option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, color: "var(--muted)" }}>Ordenar <select value={sort} onChange={event => setSort(event.target.value)} style={{ ...field, width: "auto" }}><option value="manual">Minha organização</option><option value="name">Nome</option><option value="usage">Mais usadas</option></select></label>
        <span role="status" style={helper}>{organizing ? "Salvando organização…" : canOrganize ? "Arraste respostas dentro da categoria ou use as setas. Arraste os títulos para ordenar categorias." : "Para reorganizar, limpe os filtros e selecione Minha organização."}</span>
      </div>
      {error && <p style={{ ...errorText, margin: 0 }}>{error}</p>}

      {items === null ? (
        <p style={empty}>Carregando...</p>
      ) : items.length === 0 ? (
        <p style={empty}>Nenhuma resposta ainda. Clique em <b>+ Nova</b> pra criar a primeira.</p>
      ) : visible.length === 0 ? (
        <p style={empty}>Nada encontrado com esse filtro.</p>
      ) : (
        groups.map(([key, list]) => {
          const closed = collapsed.has(key)
          return (
            <div key={key} draggable={canOrganize && key !== NO_CATEGORY} onDragStart={event => { if (!canOrganize || key === NO_CATEGORY) return; dragged.current = { type: "category", key }; event.dataTransfer.setData("text/plain", key) }} onDragEnd={() => { dragged.current = null }} onDragOver={event => { if (canOrganize && dragged.current?.type === "category" && key !== NO_CATEGORY) event.preventDefault() }} onDrop={event => { if (dragged.current?.type !== "category") return; event.preventDefault(); event.stopPropagation(); if (key !== NO_CATEGORY) moveCategory(dragged.current.key, key); dragged.current = null }}>
              {key !== NO_CATEGORY && <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }} draggable={canOrganize} onDragStart={event => { dragged.current = { type: "category", key }; event.dataTransfer.setData("text/plain", key) }} onDragEnd={() => { dragged.current = null }}>
                <GripVertical size={14} aria-hidden="true" style={{ color: "var(--muted)" }} />
                <button aria-label={`Mover categoria ${key} para cima`} disabled={!canOrganize || categoryMeta[0]?.name === key} style={iconBtn} onClick={() => moveCategory(key, categoryMeta[categoryMeta.findIndex(c => c.name === key) - 1]?.name || key)}><ArrowUp size={14} /></button>
                <button aria-label={`Mover categoria ${key} para baixo`} disabled={!canOrganize || categoryMeta.at(-1)?.name === key} style={iconBtn} onClick={() => moveCategory(key, categoryMeta[categoryMeta.findIndex(c => c.name === key) + 1]?.name || key)}><ArrowDown size={14} /></button>
                <button style={{ ...ghost, padding: "4px 9px", fontSize: 11 }} disabled={organizing} onClick={() => setCategoryEditor(categoryMeta.find(c => c.name === key) || null)}>Nome e cor da categoria</button>
              </div>}
              <button aria-expanded={!closed} onClick={() => toggleGroup(key)} style={groupHeader}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: key === NO_CATEGORY ? "var(--faint)" : (categoryMeta.find(c => c.name === key)?.color || "var(--accent)"), boxShadow: key === NO_CATEGORY ? "none" : "0 0 8px var(--glow)" }} />
                <span style={{ fontWeight: 700, fontSize: 12, letterSpacing: 1, color: "var(--vred)" }}>{key}</span>
                <span style={{ fontSize: 12, color: "var(--faint)" }}>({list.length})</span>
                <span style={{ marginLeft: "auto", color: "var(--faint)", display: "grid" }}>
                  {closed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                </span>
              </button>
              {!closed && (
                <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 8 }}>
                  {list.map((i, index) => (
                    <div key={i.id} draggable={canOrganize} onDragStart={event => { event.stopPropagation(); dragged.current = { type: "reply", key: i.id }; event.dataTransfer.setData("text/plain", i.id) }} onDragEnd={() => { dragged.current = null }} onDragOver={event => { if (canOrganize && dragged.current?.type === "reply") event.preventDefault() }} onDrop={event => { if (dragged.current?.type !== "reply") return; event.preventDefault(); event.stopPropagation(); moveReply(dragged.current.key, i.id); dragged.current = null }} style={{ ...card, padding: "12px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                        <span title={TYPE_INFO[i.type].label} style={typeIcon}><TypeIcon kind={i.type} size={16} /></span>
                        <strong style={{ flex: 1, minWidth: 120, fontSize: 14, color: "var(--strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.name}</strong>
                        {(
                          <span style={{ display: "flex", gap: 2 }}>
                            <button title="Ver prévia" aria-label={`Ver prévia de ${i.name}`} onClick={() => setPreviewItem(i)} style={iconBtn}><Eye size={16} /></button>
                            <button title="Mover para cima" aria-label={`Mover ${i.name} para cima`} disabled={!canOrganize || index === 0} onClick={() => moveReply(i.id, list[index - 1].id)} style={iconBtn}><ArrowUp size={15} /></button>
                            <button title="Mover para baixo" aria-label={`Mover ${i.name} para baixo`} disabled={!canOrganize || index === list.length - 1} onClick={() => moveReply(i.id, list[index + 1].id)} style={iconBtn}><ArrowDown size={15} /></button>
                            <button title="Duplicar" aria-label="Duplicar" onClick={() => duplicate(i)} style={iconBtn}><Copy size={16} /></button>
                            <button title="Editar" aria-label="Editar" onClick={() => setEditor({ mode: "edit", item: i })} style={iconBtn}><Pencil size={16} /></button>
                            <button title="Excluir" aria-label="Excluir" onClick={() => remove(i)} style={{ ...iconBtn, color: "var(--danger)" }}><Trash2 size={16} /></button>
                          </span>
                        )}
                        <button
                          title={i.favorite ? "Tirar dos favoritos" : "Favoritar"}
                          aria-label={i.favorite ? "Tirar dos favoritos" : "Favoritar"}
                          onClick={() => toggleFavorite(i)}
                          style={{ ...iconBtn, color: i.favorite ? "var(--gold)" : "var(--faint)" }}
                        >
                          <Star size={18} fill={i.favorite ? "currentColor" : "none"} />
                        </button>
                      </div>
                      {i.type === "TEXT" && i.text && <p style={preview}>{i.text}</p>}
                      {i.type === "SEQUENCE" && i.text && (
                        <p style={preview}>
                          Sequência com {parseSeq(i.text).length} {parseSeq(i.text).length === 1 ? "passo" : "passos"}:{" "}
                          {parseSeq(i.text).map((s, idx) => `(${idx + 1}) ${s.text.slice(0, 45)}`).join(" → ")}
                        </p>
                      )}
                      {isMediaKind(i.type) && i.text && <p style={preview}>{i.text}</p>}
                      {isMediaKind(i.type) && <MediaLine item={i} kind={i.type} />}
                      {i.type === "CONTACT" && (
                        <p style={preview}>Cartão de contato: {i.contactName} · {i.contactPhone}</p>
                      )}
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, fontSize: 11, color: "var(--faint)" }}>
                        {i.shortcut && <span style={shortcutChip}>;{i.shortcut}</span>}
                        <span style={{ marginLeft: "auto" }}>usada {i.usageCount}×</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })
      )}

      {previewItem && <ReplyPreviewDialog item={previewItem} library={items || []} onClose={() => setPreviewItem(null)} />}
      {categoryEditor && <QuickReplyCategoryEditor category={categoryEditor} onClose={() => setCategoryEditor(null)} onSave={async (name, color) => { await call("PATCH", "/api/crm/quick-replies/library", { action: "category", previous: categoryEditor.name, name, color }); await load() }} />}
      {editor && (
        <EditorModal
          editor={editor}
          categories={categories}
          library={items || []}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            setEditor(null)
            await load()
          }}
        />
      )}
    </>
  )
}

/* ───────────── Janela de criar / editar ───────────── */

type SeqStep = ReplyStep
const parseSeq = previewSteps

function EditorModal({
  editor, categories, library, onClose, onSaved,
}: {
  editor: NonNullable<Editor>
  categories: string[]
  library: QuickReplyView[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const editing = editor.mode === "edit" ? editor.item : null
  const [kind, setKind] = useState<QuickReplyKind | null>(editor.mode === "edit" ? editor.item.type : editor.kind)
  const [name, setName] = useState(editing?.name ?? "")
  const [category, setCategory] = useState(editing?.category ?? "")
  const [shortcut, setShortcut] = useState(editing?.shortcut ?? "")
  const [text, setText] = useState(editing?.text ?? "")
  const [seqSteps, setSeqSteps] = useState<SeqStep[]>(() => parseSeq(editing?.type === "SEQUENCE" ? editing.text : null))
  const [contactName, setContactName] = useState(editing?.contactName ?? "")
  const [contactPhone, setContactPhone] = useState(editing?.contactPhone ?? "")
  const [moreOpen, setMoreOpen] = useState(Boolean(editing?.shortcut))
  const [file, setFile] = useState<File | null>(null)
  const [viewOnce, setViewOnce] = useState(editing?.viewOnce ?? false)
  const [asVoiceNote, setAsVoiceNote] = useState(editing?.asVoiceNote ?? false)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [recordingBusy, setRecordingBusy] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)

  const dirty = !!file || name !== (editing?.name || "") || category !== (editing?.category || "") || shortcut !== (editing?.shortcut || "") || text !== (editing?.text || "") || contactName !== (editing?.contactName || "") || contactPhone !== (editing?.contactPhone || "") || viewOnce !== (editing?.viewOnce || false) || asVoiceNote !== (editing?.asVoiceNote || false) || JSON.stringify(seqSteps) !== JSON.stringify(parseSeq(editing?.type === "SEQUENCE" ? editing.text : null))
  const close = () => { if (busy) return; if ((recordingBusy || dirty) && !confirm("Descartar as alterações e a gravação deste editor?")) return; onClose() }
  const dialog = useDialog(close)
  const normalizedShortcut = shortcut.trim().replace(/^;+/, "").trim().toLowerCase()
  const shortcutTaken = !!normalizedShortcut && library.some(item => item.id !== editing?.id && item.shortcut === normalizedShortcut)

  const media = kind !== null && isMediaKind(kind) ? kind : null // tipo com arquivo, ou null
  const hasCaption = media !== null && MEDIA_RULES[media].hasCaption
  const hasTextBox = kind === "TEXT" || hasCaption

  const missing =
    (name.trim() ? 0 : 1) +
    (kind === "TEXT" ? (text.trim() ? 0 : 1) : 0) +
    (kind === "SEQUENCE" ? (seqSteps.some((s) => s.text.trim() || s.quickReplyId) ? 0 : 1) : 0) +
    (media && !editing && !file ? 1 : 0) + // ao criar, o arquivo é obrigatório
    (kind === "CONTACT" ? (contactName.trim() ? 0 : 1) + (contactPhone.trim() ? 0 : 1) : 0)

  // Onde o cursor deve ficar depois de inserir uma variável. É aplicado em um
  // efeito, logo depois de a tela atualizar (não depende de animação/janela visível).
  const cursorAfter = useRef<number | null>(null)
  useEffect(() => {
    const pos = cursorAfter.current
    const el = taRef.current
    if (pos === null || !el) return
    cursorAfter.current = null
    el.focus()
    el.setSelectionRange(pos, pos)
  }, [text])

  function insertToken(token: string) {
    const el = taRef.current
    if (!el) return setText((t) => t + token)
    const start = el.selectionStart ?? text.length
    const end = el.selectionEnd ?? text.length
    cursorAfter.current = start + token.length
    setText(text.slice(0, start) + token + text.slice(end))
  }

  async function save() {
    if (!kind || missing > 0 || recordingBusy || shortcutTaken) return
    setBusy(true)
    setErr(null)
    try {
      const common = { name, category: category || null, shortcut: shortcut || null }

      if (media) {
        // Tipos com arquivo
        if (editing) {
          // Primeiro os dados (pega erro de atalho repetido antes de trocar o arquivo)
          await call("PATCH", `/api/crm/quick-replies/${editing.id}`, {
            ...common,
            ...(hasCaption ? { text } : {}),
            ...(media === "AUDIO" ? { asVoiceNote } : {}),
            ...(media === "IMAGE" || media === "VIDEO" ? { viewOnce } : {}),
          })
          if (file) {
            const fd = new FormData()
            fd.set("file", file)
            await callForm("PUT", `/api/crm/quick-replies/${editing.id}/file`, fd)
          }
        } else {
          const fd = new FormData()
          fd.set("type", media)
          fd.set("name", name)
          if (category) fd.set("category", category)
          if (shortcut) fd.set("shortcut", shortcut)
          if (hasCaption && text) fd.set("text", text)
          if (viewOnce) fd.set("viewOnce", "true")
          if (asVoiceNote) fd.set("asVoiceNote", "true")
          if (file) fd.set("file", file)
          await callForm("POST", "/api/crm/quick-replies/upload", fd)
        }
      } else {
        const typeFields =
          kind === "TEXT"
            ? { text }
            : kind === "SEQUENCE"
              ? { text: JSON.stringify(seqSteps.filter((s) => s.text.trim() || s.quickReplyId)) }
              : { contactName, contactPhone }
        if (editing) {
          await call("PATCH", `/api/crm/quick-replies/${editing.id}`, { ...common, ...typeFields })
        } else {
          await call("POST", "/api/crm/quick-replies", { type: kind, ...common, ...typeFields })
        }
      }
      await onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não consegui salvar.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={overlay} onClick={close}>
      <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="reply-editor-title" tabIndex={-1} style={{ ...modal, width: 620 }} onClick={(e) => e.stopPropagation()}>
        {!kind ? (
          <>
            <h2 id="reply-editor-title" style={modalTitle}>Nova resposta rápida</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {QUICK_REPLY_TYPES.filter((t) => t !== "SEQUENCE").map((t) => {
                const info = TYPE_INFO[t]
                return (
                  <button key={t} disabled={!info.available} onClick={() => setKind(t)} title={info.available ? info.hint : "Em breve: " + info.hint} style={{ ...tile, opacity: info.available ? 1 : 0.45, cursor: info.available ? "pointer" : "not-allowed" }}>
                    <span style={{ color: "var(--vred)", display: "grid" }}><TypeIcon kind={t} size={22} /></span>
                    <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{info.label}</span>
                    {!info.available && <span style={{ fontSize: 10, color: "var(--faint)" }}>em breve</span>}
                  </button>
                )
              })}
            </div>
            <button onClick={() => setKind("SEQUENCE")} style={{ ...tile, width: "100%", marginTop: 10, flexDirection: "row", justifyContent: "flex-start", gap: 10, cursor: "pointer" }}>
              <span style={{ color: "var(--vred)", display: "grid" }}><TypeIcon kind="SEQUENCE" size={20} /></span>
              <span style={{ textAlign: "left", color: "var(--text)" }}>
                <b style={{ fontSize: 13 }}>Sequência de mensagens</b>
                <br /><span style={{ fontSize: 11, color: "var(--muted)" }}>Várias mensagens enviadas automaticamente com intervalo em segundos entre elas.</span>
              </span>
            </button>
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button onClick={close} style={ghost}>Cancelar</button>
            </div>
          </>
        ) : (
          <>
            <h2 id="reply-editor-title" style={modalTitle}>{titleFor(kind, Boolean(editing))}</h2>

            <label style={label}>Nome <span style={req}>*</span></label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Como você vai achar essa mensagem depois" style={field} />

            <label style={label}>Categoria <span style={opt}>· só você vê (opcional)</span></label>
            <input value={category} onChange={(e) => setCategory(e.target.value)} list="quick-categories" maxLength={40} placeholder="Ex.: Orçamentos" style={field} />
            <datalist id="quick-categories">
              {categories.map((c) => <option key={c} value={c} />)}
            </datalist>

            {media && (
              <>
                <label style={label}>
                  {media === "AUDIO" ? "Áudio" : "Arquivo"} {!editing && <span style={req}>*</span>}
                </label>
                {editing && !file && editing.mediaName && (
                  <div style={{ fontSize: 13, marginBottom: 8, color: "var(--text)" }}>
                    <Paperclip size={14} style={{ verticalAlign: -2, marginRight: 5, color: "var(--vred)" }} />{editing.mediaName} {editing.mediaSize != null && <span style={opt}>· {formatBytes(editing.mediaSize)}</span>}
                    {media !== "DOCUMENT" && <SavedPreview id={editing.id} kind={media} name={editing.mediaName} />}
                  </div>
                )}
                <FileDrop kind={media} file={file} onFile={selected => { setFile(selected); if (media === "AUDIO" && selected && !selected.name.toLowerCase().endsWith(".ogg")) setAsVoiceNote(false) }} optional={Boolean(editing)} onRecorded={recorded => { setFile(recorded); setAsVoiceNote(true) }} onRecordingBusy={setRecordingBusy} />
                {(media === "IMAGE" || media === "VIDEO") && (
                  <Toggle checked={viewOnce} onChange={setViewOnce} label="Visualização única" />
                )}
                {media === "AUDIO" && (
                  <>
                    <Toggle checked={asVoiceNote} onChange={setAsVoiceNote} label="Enviar como nota de voz" />
                    <p style={helper}>Nota de voz requer OGG/Opus e conector do servidor conectado. MP3 pode ser enviado como arquivo de áudio. O envio cria uma nova mensagem; não usa encaminhamento.</p>
                  </>
                )}
              </>
            )}

            {hasTextBox && (
              <>
                <label style={label}>
                  {kind === "TEXT" ? <>Mensagem <span style={req}>*</span></> : <>Legenda <span style={opt}>(opcional)</span></>}
                </label>
                <textarea ref={taRef} value={text} onChange={(e) => setText(e.target.value)} rows={kind === "TEXT" ? 5 : 3} maxLength={kind === "TEXT" ? 4096 : MAX_CAPTION} placeholder="Digite sua mensagem aqui…" style={{ ...field, resize: "vertical", fontFamily: "inherit" }} />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                  {VARIABLES.map((v) => (
                    <button key={v.token} type="button" onClick={() => insertToken(v.token)} style={varChip}>{v.label}</button>
                  ))}
                </div>
                <p style={helper}>Clique pra inserir. O cliente recebe tudo preenchido.</p>

              </>
            )}

            {kind === "SEQUENCE" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
                <label style={label}>Passos da sequência <span style={req}>*</span></label>
                {seqSteps.map((st, idx) => (
                  <div key={idx} style={{ ...inner, padding: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                      <strong style={{ fontSize: 12, color: "var(--accent-text)" }}>Passo {idx + 1}</strong>
                      <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
                        Aguardar antes:
                        <input
                          type="number"
                          min={0}
                          max={60}
                          value={st.delaySec}
                          onChange={(e) => {
                            const next = [...seqSteps]
                            next[idx] = { ...next[idx], delaySec: Math.max(0, Math.min(60, Number(e.target.value) || 0)) }
                            setSeqSteps(next)
                          }}
                          style={{ ...field, width: 64, padding: "4px 8px" }}
                        />
                        seg
                      </label>
                      {seqSteps.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setSeqSteps(seqSteps.filter((_, i) => i !== idx))}
                          style={{ ...ghost, padding: "3px 8px", fontSize: 11, color: "var(--danger)" }}
                        >
                          Remover
                        </button>
                      )}
                    </div>
                    <label style={label}>Mídia deste passo (opcional)
                      <select value={st.quickReplyId || ""} onChange={event => { const media = library.find(item => item.id === event.target.value); setSeqSteps(seqSteps.map((step, i) => i === idx ? { ...step, quickReplyId: event.target.value || undefined, ...(media?.type === "AUDIO" ? { text: "" } : {}) } : step)) }} style={field}>
                        <option value="">Somente texto</option>{library.filter(item => ["AUDIO", "IMAGE"].includes(item.type) && !item.viewOnce).map(item => <option key={item.id} value={item.id}>{item.name} ({TYPE_INFO[item.type].label})</option>)}
                      </select>
                    </label>
                    <textarea
                      disabled={library.find(item => item.id === st.quickReplyId)?.type === "AUDIO"}
                      value={st.text}
                      onChange={(e) => {
                        const next = [...seqSteps]
                        next[idx] = { ...next[idx], text: e.target.value }
                        setSeqSteps(next)
                      }}
                      rows={3}
                      maxLength={1500}
                      placeholder={`Mensagem do passo ${idx + 1} (aceita variáveis como {primeiro_nome}, {saudacao}…)`}
                      style={{ ...field, resize: "vertical", fontFamily: "inherit" }}
                    />
                  </div>
                ))}
                <button
                  type="button"
                  disabled={seqSteps.length >= 20} onClick={() => setSeqSteps([...seqSteps, { text: "", delaySec: 2 }])}
                  style={{ ...ghost, alignSelf: "flex-start" }}
                >
                  + Adicionar passo na sequência
                </button>
              </div>
            )}

            {kind === "CONTACT" && (
              <>
                <label style={label}>Nome do contato <span style={req}>*</span></label>
                <input value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={100} placeholder="Ex.: Financeiro · Clínica Vivace" style={field} />
                <label style={label}>Telefone <span style={req}>*</span></label>
                <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+55 47 99999-0000" style={field} />
                <p style={helper}>O plugin compartilha nome e telefone em texto.</p>
              </>
            )}

            <button type="button" onClick={() => setMoreOpen((v) => !v)} style={moreBtn}>
              {moreOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />} Mais opções <span style={opt}>(atalho)</span>
            </button>
            {moreOpen && (
              <>
                <label style={label}>Atalho</label>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontWeight: 700, color: "var(--muted)" }}>;</span>
                  <input value={shortcut} onChange={(e) => setShortcut(e.target.value)} maxLength={31} placeholder="atalho" style={{ ...field, flex: 1 }} />
                </div>
                <p style={helper}>Na conversa, digite ; e o atalho pra achar esta mensagem rápido.</p>
              </>
            )}

            <QuickReplyPreview value={{ type: kind, text: kind === "SEQUENCE" ? JSON.stringify(seqSteps) : text, id: editing?.id, file, mediaName: editing?.mediaName, contactName, contactPhone, asVoiceNote, viewOnce }} library={library} />
            {shortcutTaken && <p role="alert" style={errorText}>Este atalho já está em uso. Escolha outro antes de salvar.</p>}
            {recordingBusy && <p role="status" style={helper}>Use ou descarte a gravação para continuar.</p>}
            {missing > 0 && <p style={{ color: "var(--wait)", fontSize: 13, margin: "12px 0 0" }}>Faltam {missing} {missing === 1 ? "campo" : "campos"}.</p>}
            {err && <p style={errorText}>{err}</p>}

            <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 16 }}>
              <button onClick={close} style={ghost}>Cancelar</button>
              {!editing && <button disabled={recordingBusy || busy} onClick={() => { setKind(null); setFile(null); setViewOnce(false); setAsVoiceNote(false) }} style={ghost}>‹ Trocar o tipo</button>}
              <button onClick={save} disabled={busy || recordingBusy || shortcutTaken || missing > 0} style={{ ...btn, opacity: busy || recordingBusy || shortcutTaken || missing > 0 ? 0.5 : 1 }}>
                {busy ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

const searchBox: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8, flex: "1 1 260px", maxWidth: 420,
  background: "var(--field)", border: "1px solid var(--soft)", borderRadius: 12, padding: "8px 12px",
}
/** Campo sem moldura própria (a moldura é do contêiner). */
const bare: React.CSSProperties = { flex: 1, background: "transparent", border: "none", boxShadow: "none", padding: 0, fontSize: 13, outline: "none", color: "var(--text)", width: "100%" }
const groupHeader: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, width: "100%", background: "none", border: "none", cursor: "pointer", padding: "4px 2px" }
const typeIcon: React.CSSProperties = { width: 30, height: 30, borderRadius: 9, background: "var(--accent-soft)", border: "1px solid var(--accent-line)", color: "var(--accent-text)", display: "grid", placeItems: "center", flexShrink: 0 }
const preview: React.CSSProperties = { fontSize: 13, color: "var(--text-2)", margin: "8px 0 0", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", whiteSpace: "pre-wrap" }
const shortcutChip: React.CSSProperties = { background: "var(--accent-soft)", color: "var(--accent-text)", border: "1px solid var(--accent-line)", fontWeight: 700, padding: "1px 8px", borderRadius: 999 }
const tile: React.CSSProperties = { ...inner, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "16px 8px" }
const varChip: React.CSSProperties = { background: "var(--field)", border: "1px solid var(--soft)", borderRadius: 999, padding: "3px 11px", fontSize: 12, cursor: "pointer", color: "var(--text-2)" }
const moreBtn: React.CSSProperties = { background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--text-2)", padding: "14px 0 0", display: "inline-flex", alignItems: "center", gap: 4 }
