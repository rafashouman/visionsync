"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, ChevronRight, Copy, Paperclip, Pencil, Plus, Search, Star, Trash2 } from "lucide-react"
import type { QuickReplyView } from "@/lib/quick-replies"
import {
  MAX_ACCOUNT_BYTES, MAX_CAPTION, MEDIA_RULES, QUICK_REPLY_TYPES, TYPE_INFO, formatBytes, isMediaKind,
  type QuickReplyKind,
} from "@/lib/quick-reply-types"
import { VARIABLES, renderVariables } from "@/lib/quick-reply-vars"
import { FileDrop, MediaLine, SavedPreview, Toggle } from "@/components/quick-reply-media"
import { PageHeader } from "@/components/page-header"
import { TypeIcon } from "@/components/type-icon"
import { btn, card, empty, errorText, field, ghost, helper, iconBtn, inner, label, modal, modalTitle, opt, overlay, req } from "@/lib/ui"

const NO_CATEGORY = "SEM CATEGORIA"
const SAMPLE = { contactName: "Maria da Silva", contactPhone: "5511999998888", myName: "Seu nome" }

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

export function QuickRepliesBoard() {
  const [items, setItems] = useState<QuickReplyView[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<Filter>("todas")
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [editor, setEditor] = useState<Editor>(null)
  const [hover, setHover] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setItems(await call("GET", "/api/crm/quick-replies"))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui carregar as respostas.")
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const categories = useMemo(
    () => [...new Set((items ?? []).map((i) => i.category).filter((c): c is string => Boolean(c)))],
    [items]
  )

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (items ?? []).filter((i) => {
      if (filter === "favoritas" && !i.favorite) return false
      if (filter !== "todas" && filter !== "favoritas" && i.type !== filter) return false
      if (!q) return true
      return [i.name, i.text, i.shortcut, i.category, i.contactName, i.mediaName].some((v) => v?.toLowerCase().includes(q))
    })
  }, [items, search, filter])

  // Espaço usado pelos arquivos (o limite é por conta)
  const usedBytes = useMemo(() => (items ?? []).reduce((sum, i) => sum + (i.mediaSize ?? 0), 0), [items])

  // Agrupa por categoria, na ordem em que aparecem; "sem categoria" por último.
  const groups = useMemo(() => {
    const map = new Map<string, QuickReplyView[]>()
    for (const i of visible) {
      const key = i.category ?? NO_CATEGORY
      map.set(key, [...(map.get(key) ?? []), i])
    }
    return [...map.entries()].sort(([a], [b]) => (a === NO_CATEGORY ? 1 : b === NO_CATEGORY ? -1 : 0))
  }, [visible])

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
            Mensagens prontas. Usar dentro da conversa (digitando <code>;</code> + atalho) vem com a extensão, em breve.
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
        <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} style={{ ...field, width: "auto" }}>
          <option value="todas">Todas</option>
          <option value="favoritas">Favoritas</option>
          {QUICK_REPLY_TYPES.filter((t) => TYPE_INFO[t].available).map((t) => (
            <option key={t} value={t}>{TYPE_INFO[t].label}</option>
          ))}
        </select>
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
            <div key={key}>
              <button onClick={() => toggleGroup(key)} style={groupHeader}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: key === NO_CATEGORY ? "var(--faint)" : "var(--accent)", boxShadow: key === NO_CATEGORY ? "none" : "0 0 8px var(--glow)" }} />
                <span style={{ fontWeight: 700, fontSize: 12, letterSpacing: 1, color: "var(--vred)" }}>{key}</span>
                <span style={{ fontSize: 12, color: "var(--faint)" }}>({list.length})</span>
                <span style={{ marginLeft: "auto", color: "var(--faint)", display: "grid" }}>
                  {closed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                </span>
              </button>
              {!closed && (
                <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 8 }}>
                  {list.map((i) => (
                    <div key={i.id} onMouseEnter={() => setHover(i.id)} onMouseLeave={() => setHover(null)} style={{ ...card, padding: "12px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span title={TYPE_INFO[i.type].label} style={typeIcon}><TypeIcon kind={i.type} size={16} /></span>
                        <strong style={{ flex: 1, fontSize: 14, color: "var(--strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.name}</strong>
                        {hover === i.id && (
                          <span style={{ display: "flex", gap: 2 }}>
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

      {editor && (
        <EditorModal
          editor={editor}
          categories={categories}
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

function EditorModal({
  editor, categories, onClose, onSaved,
}: {
  editor: NonNullable<Editor>
  categories: string[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const editing = editor.mode === "edit" ? editor.item : null
  const [kind, setKind] = useState<QuickReplyKind | null>(editor.mode === "edit" ? editor.item.type : editor.kind)
  const [name, setName] = useState(editing?.name ?? "")
  const [category, setCategory] = useState(editing?.category ?? "")
  const [shortcut, setShortcut] = useState(editing?.shortcut ?? "")
  const [text, setText] = useState(editing?.text ?? "")
  const [contactName, setContactName] = useState(editing?.contactName ?? "")
  const [contactPhone, setContactPhone] = useState(editing?.contactPhone ?? "")
  const [moreOpen, setMoreOpen] = useState(Boolean(editing?.shortcut))
  const [file, setFile] = useState<File | null>(null)
  const [viewOnce, setViewOnce] = useState(editing?.viewOnce ?? false)
  const [asVoiceNote, setAsVoiceNote] = useState(editing?.asVoiceNote ?? false)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const media = kind !== null && isMediaKind(kind) ? kind : null // tipo com arquivo, ou null
  const hasCaption = media !== null && MEDIA_RULES[media].hasCaption
  const hasTextBox = kind === "TEXT" || hasCaption

  const missing =
    (name.trim() ? 0 : 1) +
    (kind === "TEXT" ? (text.trim() ? 0 : 1) : 0) +
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
    if (!kind || missing > 0) return
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
        const typeFields = kind === "TEXT" ? { text } : { contactName, contactPhone }
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
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        {!kind ? (
          <>
            <h2 style={modalTitle}>Nova resposta rápida</h2>
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
            <button disabled style={{ ...tile, width: "100%", marginTop: 10, flexDirection: "row", justifyContent: "flex-start", gap: 10, opacity: 0.45, cursor: "not-allowed" }}>
              <span style={{ color: "var(--vred)", display: "grid" }}><TypeIcon kind="SEQUENCE" size={20} /></span>
              <span style={{ textAlign: "left", color: "var(--text)" }}>
                <b style={{ fontSize: 13 }}>Sequência de mensagens</b>
                <br /><span style={{ fontSize: 11, color: "var(--muted)" }}>Várias respostas rápidas, uma depois da outra. Em breve.</span>
              </span>
            </button>
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button onClick={onClose} style={ghost}>Cancelar</button>
            </div>
          </>
        ) : (
          <>
            <h2 style={modalTitle}>{titleFor(kind, Boolean(editing))}</h2>

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
                <FileDrop kind={media} file={file} onFile={setFile} optional={Boolean(editing)} />
                {(media === "IMAGE" || media === "VIDEO") && (
                  <Toggle checked={viewOnce} onChange={setViewOnce} label="Visualização única" />
                )}
                {media === "AUDIO" && (
                  <>
                    <Toggle checked={asVoiceNote} onChange={setAsVoiceNote} label="Enviar como áudio gravado na hora" />
                    <p style={helper}>Chega como arquivo de áudio, igual a um encaminhado.</p>
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
                {text.trim() && (
                  <div style={previewBox}>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 2 }}>Como a cliente recebe (exemplo com Maria da Silva):</div>
                    <div style={{ whiteSpace: "pre-wrap", fontSize: 13, color: "var(--text)" }}>{renderVariables(text, SAMPLE)}</div>
                  </div>
                )}
              </>
            )}

            {kind === "CONTACT" && (
              <>
                <label style={label}>Nome do contato <span style={req}>*</span></label>
                <input value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={100} placeholder="Ex.: Financeiro · Clínica Vivace" style={field} />
                <label style={label}>Telefone <span style={req}>*</span></label>
                <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+55 47 99999-0000" style={field} />
                <p style={helper}>Chega como cartão de contato: quem recebe toca e salva ou já chama.</p>
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

            {missing > 0 && <p style={{ color: "var(--wait)", fontSize: 13, margin: "12px 0 0" }}>Faltam {missing} {missing === 1 ? "campo" : "campos"}.</p>}
            {err && <p style={errorText}>{err}</p>}

            <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 16 }}>
              <button onClick={onClose} style={ghost}>Cancelar</button>
              {!editing && <button onClick={() => setKind(null)} style={ghost}>‹ Trocar o tipo</button>}
              <button onClick={save} disabled={busy || missing > 0} style={{ ...btn, opacity: busy || missing > 0 ? 0.5 : 1 }}>
                {busy ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </>
        )}
      </div>
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
const previewBox: React.CSSProperties = { background: "var(--ok-bg)", border: "1px solid var(--ok-line)", borderRadius: 10, padding: "8px 10px", marginTop: 10 }
