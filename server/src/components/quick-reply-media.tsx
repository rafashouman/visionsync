"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Mic, Paperclip, Upload } from "lucide-react"
import type { QuickReplyView } from "@/lib/quick-replies"
import {
  BLOCKED_EXTS, MAX_FILE_BYTES, MEDIA_RULES, fileExt, formatBytes, type MediaKind,
} from "@/lib/quick-reply-types"
import { chip, inner, link } from "@/lib/ui"

export const fileUrl = (id: string) => `/api/crm/quick-replies/${id}/file`

const ACTION_LABEL: Record<MediaKind, string> = { AUDIO: "Ouvir", IMAGE: "Ver", VIDEO: "Assistir", DOCUMENT: "Baixar" }

/** Prévia do arquivo já salvo (carrega só quando a pessoa pede). */
export function SavedPreview({ id, kind, name }: { id: string; kind: MediaKind; name: string }) {
  const src = fileUrl(id)
  if (kind === "IMAGE") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 10, marginTop: 8 }} />
  }
  if (kind === "AUDIO") return <audio controls preload="none" src={src} style={{ width: "100%", marginTop: 8 }} />
  if (kind === "VIDEO") return <video controls preload="metadata" src={src} style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 10, marginTop: 8 }} />
  return null
}

/** Linha do arquivo no cartão da lista: nome, tamanho, opções marcadas e botão pra ver. */
export function MediaLine({ item, kind }: { item: QuickReplyView; kind: MediaKind }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-2)", flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }}>
          <Paperclip size={13} style={{ color: "var(--vred)", flex: "none" }} />{item.mediaName}
        </span>
        {item.mediaSize != null && <span style={{ color: "var(--faint)" }}>{formatBytes(item.mediaSize)}</span>}
        {item.viewOnce && <span style={chip("wine")}>visualização única</span>}
        {item.asVoiceNote && <span style={chip("wine")}>áudio gravado na hora</span>}
        {kind === "DOCUMENT" ? (
          <a href={fileUrl(item.id)} download style={{ ...link, textDecoration: "underline" }}>{ACTION_LABEL[kind]}</a>
        ) : (
          <button onClick={() => setOpen((v) => !v)} style={{ ...link, textDecoration: "underline" }}>{open ? "Fechar" : ACTION_LABEL[kind]}</button>
        )}
      </div>
      {open && <SavedPreview id={item.id} kind={kind} name={item.mediaName ?? "arquivo"} />}
    </div>
  )
}

/** Prévia do arquivo que acabou de ser escolhido (ainda não salvo). */
function LocalPreview({ kind, file }: { kind: MediaKind; file: File }) {
  const url = useMemo(() => URL.createObjectURL(file), [file])
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  if (kind === "IMAGE") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={file.name} style={{ maxWidth: "100%", maxHeight: 160, borderRadius: 10, marginTop: 8 }} />
  }
  if (kind === "AUDIO") return <audio controls src={url} style={{ width: "100%", marginTop: 8 }} />
  if (kind === "VIDEO") return <video controls src={url} style={{ maxWidth: "100%", maxHeight: 180, borderRadius: 10, marginTop: 8 }} />
  return null
}

/** Confere o arquivo no navegador (o servidor confere de novo): devolve a mensagem de erro, ou null. */
function clientCheck(kind: MediaKind, f: File): string | null {
  if (f.size === 0) return "O arquivo está vazio."
  if (f.size > MAX_FILE_BYTES) return `Arquivo grande demais (${formatBytes(f.size)}). O limite é ${formatBytes(MAX_FILE_BYTES)}.`
  const ext = fileExt(f.name)
  if (BLOCKED_EXTS.includes(ext)) return `Arquivos .${ext} não são aceitos.`
  const rule = MEDIA_RULES[kind]
  if (rule.exts && !rule.exts.includes(ext)) return `Formato não aceito. Use: ${rule.formats}.`
  if (!rule.exts && !ext) return "O arquivo precisa ter extensão (ex.: .pdf)."
  return null
}

/** Área de escolher/arrastar o arquivo. Só entrega o arquivo se ele passar na conferência. */
export function FileDrop({
  kind, file, onFile, optional,
}: {
  kind: MediaKind
  file: File | null
  onFile: (f: File | null) => void
  optional?: boolean // ao editar: trocar o arquivo é opcional
}) {
  const input = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const rule = MEDIA_RULES[kind]

  function pick(f: File | undefined) {
    if (!f) return
    const problem = clientCheck(kind, f)
    setErr(problem)
    onFile(problem ? null : f)
  }

  const hidden = (
    <input
      ref={input}
      type="file"
      accept={rule.accept || undefined}
      style={{ display: "none" }}
      onChange={(e) => {
        pick(e.target.files?.[0])
        e.target.value = ""
      }}
    />
  )

  const chosen = file && (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text)" }}>
        <Paperclip size={14} style={{ color: "var(--vred)", flex: "none" }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{file.name}</span>
        <span style={{ color: "var(--faint)", fontSize: 12 }}>{formatBytes(file.size)}</span>
        <button type="button" onClick={() => { setErr(null); onFile(null) }} style={{ ...link, textDecoration: "underline" }}>Remover</button>
      </div>
      <LocalPreview kind={kind} file={file} />
    </div>
  )

  if (kind === "AUDIO") {
    return (
      <div>
        {hidden}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button type="button" disabled title="Em breve: o Chrome grava num formato que o WhatsApp não aceita" style={{ ...tileBtn, opacity: 0.45, cursor: "not-allowed" }}>
            <Mic size={20} style={{ color: "var(--vred)" }} />
            <b style={{ fontSize: 13, color: "var(--text)" }}>Gravar agora</b>
            <span style={{ fontSize: 10, color: "var(--faint)" }}>em breve</span>
          </button>
          <button type="button" onClick={() => input.current?.click()} style={tileBtn}>
            <Upload size={20} style={{ color: "var(--vred)" }} />
            <b style={{ fontSize: 13, color: "var(--text)" }}>{optional ? "Trocar arquivo" : "Escolher arquivo"}</b>
            <span style={{ fontSize: 10, color: "var(--faint)" }}>{rule.formats}</span>
          </button>
        </div>
        {chosen}
        {err && <p style={errText}>{err}</p>}
      </div>
    )
  }

  return (
    <div>
      {hidden}
      <div
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files?.[0]) }}
        style={{
          ...dropBox,
          background: over ? "var(--accent-soft)" : "var(--inner)",
          borderColor: over ? "var(--accent)" : "var(--accent-line)",
          boxShadow: over ? "0 0 18px var(--glow)" : "none",
        }}
      >
        <Upload size={22} style={{ color: "var(--vred)" }} />
        <div style={{ fontSize: 13, color: "var(--accent-text)", marginTop: 6 }}>
          {optional ? "Clique aqui ou arraste um arquivo pra trocar." : "Clique aqui ou arraste o arquivo."}
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
          Formatos: {rule.formats} · até {formatBytes(MAX_FILE_BYTES)}
        </div>
      </div>
      {chosen}
      {err && <p style={errText}>{err}</p>}
    </div>
  )
}

/** Botão liga/desliga. */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, cursor: "pointer", fontSize: 13, color: "var(--text)" }}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          width: 40, height: 22, borderRadius: 999, border: "none", cursor: "pointer", position: "relative", padding: 0, flexShrink: 0,
          background: checked ? "var(--accent)" : "rgba(143, 163, 214, 0.28)",
          boxShadow: checked ? "0 0 12px var(--glow)" : "none",
        }}
      >
        <span style={{ position: "absolute", top: 3, left: checked ? 21 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.15s" }} />
      </button>
      {label}
    </label>
  )
}

const tileBtn: React.CSSProperties = { ...inner, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "16px 8px", cursor: "pointer" }
const dropBox: React.CSSProperties = { border: "1.5px dashed var(--accent-line)", borderRadius: 14, padding: "22px 12px", textAlign: "center", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center" }
const errText: React.CSSProperties = { color: "var(--danger)", fontSize: 12, margin: "8px 0 0" }
