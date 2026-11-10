"use client"

import { useState } from "react"
import { Eye, MessageSquare } from "lucide-react"
import type { QuickReplyView } from "@/lib/quick-replies"
import { renderVariables, VARIABLES } from "@/lib/quick-reply-vars"
import { previewSteps } from "@/lib/quick-reply-preview"
import { isMediaKind, TYPE_INFO, type QuickReplyKind } from "@/lib/quick-reply-types"
import { LocalPreview, SavedPreview } from "./quick-reply-media"
import { useDialog } from "./use-dialog"
import { field, ghost, helper, inner, modal, modalTitle, overlay } from "@/lib/ui"

type Value = { type: QuickReplyKind; text?: string | null; id?: string; contactName?: string | null; contactPhone?: string | null; file?: File | null; mediaName?: string | null; asVoiceNote?: boolean; viewOnce?: boolean }
export function QuickReplyPreview({ value, library = [] }: { value: Value; library?: QuickReplyView[] }) {
  const [contactName, setName] = useState("Maria da Silva")
  const [myName, setMyName] = useState("Seu nome")
  const context = { contactName, contactPhone: "5511999998888", myName }
  const preview = (text: string) => renderVariables(text, context)
  const unknown = [...new Set((value.text || "").match(/\{[a-zA-Z_]+\}/g) || [])].filter(token => !VARIABLES.some(variable => variable.token === token))
  return <section className="vs-reply-preview" style={{ ...inner, padding: 16, marginTop: 16 }} aria-label="Prévia da resposta">
    <h3 style={{ fontSize: 14, margin: "0 0 8px", display: "flex", gap: 7, alignItems: "center" }}><Eye size={16} /> Prévia da resposta</h3>
    <p style={helper}>Simulação com dados fictícios. Nenhuma mensagem será enviada.</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, margin: "12px 0" }}>
      <label style={{ fontSize: 11, color: "var(--muted)" }}>Nome do cliente<input value={contactName} onChange={event => setName(event.target.value)} maxLength={100} style={field} /></label>
      <label style={{ fontSize: 11, color: "var(--muted)" }}>Nome de quem atende<input value={myName} onChange={event => setMyName(event.target.value)} maxLength={100} style={field} /></label>
    </div>
    <div style={{ background: "var(--card-surface)", border: "1px solid var(--line)", borderRadius: "14px 14px 3px 14px", padding: 14, overflowWrap: "anywhere" }}>
      {isMediaKind(value.type) && <>
        <small style={{ color: "var(--muted)" }}>{TYPE_INFO[value.type].label} · {value.file?.name || value.mediaName || "Escolha ou grave um arquivo"}</small>
        {value.file ? <LocalPreview kind={value.type} file={value.file} /> : value.id && <SavedPreview id={value.id} kind={value.type} name={value.mediaName || "Arquivo"} />}
        {value.asVoiceNote && <p style={helper}>Nota de voz: exige OGG/Opus e conector do servidor.</p>}
        {value.viewOnce && <p style={helper}>Visualização única cadastrada; confirme o suporte no envio.</p>}
      </>}
      {value.type === "CONTACT" && <><strong>{value.contactName || "Nome do contato"}</strong><p style={{ margin: "4px 0" }}>{value.contactPhone || "Telefone do contato"}</p><small>Compartilhado pelo plugin como nome e telefone em texto.</small></>}
      {value.type === "SEQUENCE" ? previewSteps(value.text).map((step, index) => {
        const media = library.find(item => item.id === step.quickReplyId)
        return <div key={index} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}><small style={{ color: "var(--accent-text)" }}>Passo {index + 1} · aguardar {step.delaySec}s</small>
          {step.quickReplyId && (media && isMediaKind(media.type) ? <><p style={helper}>{media.name}</p><SavedPreview id={media.id} kind={media.type} name={media.mediaName || media.name} /></> : <p style={{ color: "var(--danger)" }}>Mídia não encontrada na biblioteca.</p>)}
          {step.text && <p style={{ whiteSpace: "pre-wrap", margin: "8px 0" }}>{preview(step.text)}</p>}
        </div>
      }) : value.text && <p style={{ whiteSpace: "pre-wrap", margin: "10px 0 0", lineHeight: 1.6 }}>{preview(value.text)}</p>}
      {value.type === "TEXT" && !value.text && <p style={helper}><MessageSquare size={14} /> Escreva sua mensagem para ver a prévia.</p>}
    </div>
    {unknown.length > 0 && <p style={{ ...helper, color: "var(--wait)" }}>Variáveis não reconhecidas: {unknown.join(", ")}. Elas aparecerão literalmente na mensagem.</p>}
  </section>
}

export function ReplyPreviewDialog({ item, library, onClose }: { item: QuickReplyView; library: QuickReplyView[]; onClose: () => void }) {
  const ref = useDialog(onClose)
  return <div style={overlay} onClick={onClose}><section ref={ref} role="dialog" aria-modal="true" aria-labelledby="reply-preview-title" tabIndex={-1} style={{ ...modal, width: 620 }} onClick={event => event.stopPropagation()}>
    <h2 id="reply-preview-title" style={modalTitle}>{item.name}</h2>
    <QuickReplyPreview value={item} library={library} />
    <button onClick={onClose} style={{ ...ghost, marginTop: 16 }}>Fechar prévia</button>
  </section></div>
}
