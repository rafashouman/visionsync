"use client"

import { useCallback, useEffect, useState } from "react"
import { Bot, Check, Play, Plus, Sparkles, Trash2 } from "lucide-react"
import type { QuickReplyView } from "@/lib/quick-replies"
import { PageHeader } from "@/components/page-header"
import { btn, btnSm, card, chip, errorText, field, ghost, ghostSm, helper, inner, label } from "@/lib/ui"

type SeqStep = { text: string; delaySec: number; quickReplyId?: string }

function parseSeq(raw: string | null | undefined): SeqStep[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) {
      return arr.map((s) => ({
        text: String(s?.text ?? ""),
        delaySec: Math.max(0, Math.min(60, Number(s?.delaySec ?? 2) || 0)),
        quickReplyId: typeof s?.quickReplyId === "string" ? s.quickReplyId : undefined,
      }))
    }
  } catch {}
  return raw.split(/\n---\n/).filter(Boolean).map((t) => ({ text: t.trim(), delaySec: 2 }))
}

const PLAYBOOKS: {
  name: string
  category: string
  shortcut: string
  description: string
  steps: SeqStep[]
}[] = [
  {
    name: "Boas-vindas + Qualificação (HubSpot)",
    category: "QUALIFICAÇÃO",
    shortcut: "boasvindas",
    description: "Recepciona o lead pelo primeiro nome, gera conexão imediata e faz a pergunta de qualificação.",
    steps: [
      { text: "{saudacao}, {primeiro_nome}! Tudo bem? Aqui é {seu_nome}. Que alegria receber sua mensagem!", delaySec: 0 },
      { text: "Vou te explicar rapidinho como funciona meu atendimento e os pacotes disponíveis hoje.", delaySec: 2 },
      { text: "Antes, me conta: é a sua primeira vez por aqui ou você já conhece nosso trabalho?", delaySec: 3 },
    ],
  },
  {
    name: "Recuperação de Orçamento (Follow-up HotZapp)",
    category: "FOLLOW-UP",
    shortcut: "followup",
    description: "Roteiro em 3 mensagens curtas para destravar clientes que pararam de responder após o preço.",
    steps: [
      { text: "Oi {primeiro_nome}, passando rapidinho por aqui!", delaySec: 0 },
      { text: "Vi que conversamos sobre o atendimento e separei um horário especial na agenda desta semana.", delaySec: 2 },
      { text: "Ficou alguma dúvida sobre os valores ou podemos confirmar seu horário?", delaySec: 3 },
    ],
  },
  {
    name: "Pós-Venda & Fidelização VIP",
    category: "PÓS-VENDA",
    shortcut: "posvenda",
    description: "Agradecimento pós-compra e convite para avaliação/indicação.",
    steps: [
      { text: "{primeiro_nome}, muito obrigada pela confiança no nosso atendimento de hoje! ✨", delaySec: 0 },
      { text: "Qualquer dúvida que surgir nos próximos dias pode me chamar por aqui. Estou à disposição!", delaySec: 2 },
    ],
  },
]

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

export function AutomationsBoard() {
  const [sequences, setSequences] = useState<QuickReplyView[] | null>(null)
  const [mediaReplies, setMediaReplies] = useState<QuickReplyView[]>([])
  const [error, setError] = useState<string | null>(null)
  const [installing, setInstalling] = useState<string | null>(null)
  const [showBuilder, setShowBuilder] = useState(false)

  // Builder state
  const [name, setName] = useState("")
  const [category, setCategory] = useState("AUTOMAÇÃO")
  const [shortcut, setShortcut] = useState("")
  const [steps, setSteps] = useState<SeqStep[]>([
    { text: "{saudacao}, {primeiro_nome}! Tudo bem?", delaySec: 0 },
    { text: "Como posso te ajudar hoje?", delaySec: 2 },
  ])
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const all: QuickReplyView[] = await call("GET", "/api/crm/quick-replies")
      setSequences(all.filter((r) => r.type === "SEQUENCE"))
      setMediaReplies(all.filter(r => ["AUDIO", "IMAGE"].includes(r.type) && !r.viewOnce))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui carregar as sequências.")
    }
  }, [])

  useEffect(() => {
    const task = setTimeout(() => void load(), 0)
    return () => clearTimeout(task)
  }, [load])

  async function installPlaybook(pb: (typeof PLAYBOOKS)[number]) {
    setInstalling(pb.name)
    setError(null)
    try {
      await call("POST", "/api/crm/quick-replies", {
        type: "SEQUENCE",
        name: pb.name,
        category: pb.category,
        shortcut: pb.shortcut,
        text: JSON.stringify(pb.steps),
      })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui instalar o playbook.")
    } finally {
      setInstalling(null)
    }
  }

  async function createCustom() {
    const clean = steps.filter((s) => s.text.trim() || s.quickReplyId)
    if (!name.trim() || clean.length === 0) return setError("Informe o nome e pelo menos 1 passo.")
    setSaving(true)
    setError(null)
    try {
      await call("POST", "/api/crm/quick-replies", {
        type: "SEQUENCE",
        name: name.trim(),
        category: category.trim() || null,
        shortcut: shortcut.trim() || null,
        text: JSON.stringify(clean),
      })
      setShowBuilder(false)
      setName("")
      setShortcut("")
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui salvar a sequência.")
    } finally {
      setSaving(false)
    }
  }

  async function removeSeq(id: string, title: string) {
    if (!confirm(`Excluir a sequência "${title}"?`)) return
    try {
      await call("DELETE", `/api/crm/quick-replies/${id}`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao excluir.")
    }
  }

  return (
    <>
      <PageHeader
        title="Mensagens Automáticas & Sequências (Roteiros)"
        subtitle="Crie fluxos de mensagens enviadas em sequência com intervalo automático (HotZapp) e Playbooks de conversão (HubSpot)."
        actions={
          <button onClick={() => setShowBuilder((v) => !v)} style={btn}>
            <Plus size={15} style={{ verticalAlign: -2, marginRight: 5 }} />
            Nova Sequência
          </button>
        }
      />

      {error && <p style={errorText}>{error}</p>}

      {showBuilder && (
        <div style={{ ...card, padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 16, color: "var(--strong)" }}>Criar Nova Sequência de Mensagens</h3>
          <div className="vs-sequence-fields">
            <div>
              <label style={label}>Nome da Sequência *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Apresentação Completa" style={field} />
            </div>
            <div>
              <label style={label}>Categoria</label>
              <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="AUTOMAÇÃO" style={field} />
            </div>
            <div>
              <label style={label}>Atalho (;atalho)</label>
              <input value={shortcut} onChange={(e) => setShortcut(e.target.value)} placeholder="ex.: roteiro1" style={field} />
            </div>
          </div>

          <label style={label}>Passos do Roteiro</label>
          {steps.map((st, idx) => (
            <div key={idx} style={{ ...inner, padding: 12 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <strong style={{ fontSize: 13, color: "var(--accent-text)" }}>Passo {idx + 1}</strong>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>Aguardar antes de enviar (seg):</span>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={st.delaySec}
                    onChange={(e) => {
                      const next = [...steps]
                      next[idx] = { ...next[idx], delaySec: Math.max(0, Math.min(60, Number(e.target.value) || 0)) }
                      setSteps(next)
                    }}
                    style={{ ...field, width: 64, padding: "4px 8px" }}
                  />
                  {steps.length > 1 && (
                    <button onClick={() => setSteps(steps.filter((_, i) => i !== idx))} style={{ ...ghostSm, color: "var(--danger)" }}>
                      Remover
                    </button>
                  )}
                </div>
              </div>
              <label style={label}>Mídia opcional da biblioteca
                <select value={st.quickReplyId || ""} onChange={e => setSteps(steps.map((step, i) => i === idx ? { ...step, quickReplyId: e.target.value || undefined, ...(mediaReplies.find(r => r.id === e.target.value)?.type === "AUDIO" ? { text: "" } : {}) } : step))} style={field}>
                  <option value="">Somente texto</option>{mediaReplies.map(r => <option key={r.id} value={r.id}>{r.name} ({r.type === "AUDIO" ? "Áudio" : "Imagem"})</option>)}
                </select>
              </label>
              <textarea
                value={st.text}
                onChange={(e) => {
                  const next = [...steps]
                  next[idx] = { ...next[idx], text: e.target.value }
                  setSteps(next)
                }}
                rows={2}
                placeholder="Mensagem deste passo (use {primeiro_nome}, {saudacao}, {seu_nome}…)"
                style={{ ...field, resize: "vertical", fontFamily: "inherit" }}
              />
            </div>
          ))}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
            <button onClick={() => setSteps([...steps, { text: "", delaySec: 2 }])} style={ghost}>
              + Adicionar passo
            </button>
            <button onClick={createCustom} disabled={saving} style={{ ...btn, marginLeft: "auto" }}>
              {saving ? "Salvando…" : "Salvar Sequência"}
            </button>
            <button onClick={() => setShowBuilder(false)} style={ghost}>Cancelar</button>
          </div>
        </div>
      )}

      <div style={{ ...card, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Sparkles size={18} style={{ color: "var(--vred)" }} />
          <h2 style={{ margin: 0, fontSize: 16, color: "var(--strong)" }}>Playbooks Prontos (HubSpot + HotZapp)</h2>
        </div>
        <p style={helper}>
          Instale com 1 clique roteiros validados de vendas. Depois, no WhatsApp Web, basta clicar no chip da sequência na barra inferior ou digitar <code>;atalho</code> para disparar todas as mensagens automaticamente!
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 12, marginTop: 12 }}>
          {PLAYBOOKS.map((pb) => {
            const installed = (sequences ?? []).some((s) => s.name === pb.name)
            return (
              <div key={pb.name} style={{ ...inner, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <strong style={{ fontSize: 14, color: "var(--strong)" }}>{pb.name}</strong>
                  <span style={chip("vio")}>;{pb.shortcut}</span>
                </div>
                <p style={{ fontSize: 12.5, color: "var(--muted)", margin: 0 }}>{pb.description}</p>
                <div style={{ fontSize: 12, color: "var(--text-2)", display: "flex", flexDirection: "column", gap: 4 }}>
                  {pb.steps.map((s, i) => (
                    <div key={i} style={{ padding: "4px 8px", borderRadius: 6, background: "var(--subtle-surface)" }}>
                      <b>{i + 1}.</b> ({s.delaySec}s) {s.text}
                    </div>
                  ))}
                </div>
                <button
                  disabled={installed || installing === pb.name}
                  onClick={() => installPlaybook(pb)}
                  style={{ ...btnSm, marginTop: "auto", alignSelf: "flex-start", opacity: installed ? 0.6 : 1 }}
                >
                  {installed ? (
                    <>
                      <Check size={13} style={{ verticalAlign: -2, marginRight: 4 }} /> Já instalado
                    </>
                  ) : installing === pb.name ? (
                    "Instalando…"
                  ) : (
                    <>
                      <Play size={13} style={{ verticalAlign: -2, marginRight: 4 }} /> Instalar Playbook
                    </>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ ...card, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Bot size={18} style={{ color: "var(--vred)" }} />
          <h2 style={{ margin: 0, fontSize: 16, color: "var(--strong)" }}>Suas Sequências Ativas ({sequences?.length ?? 0})</h2>
        </div>
        {sequences === null ? (
          <p style={{ color: "var(--muted)", fontSize: 13 }}>Carregando…</p>
        ) : sequences.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 13 }}>
            Nenhuma sequência ativa ainda. Instale um Playbook acima ou clique em <b>+ Nova Sequência</b>.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sequences.map((seq) => {
              const st = parseSeq(seq.text)
              return (
                <div key={seq.id} style={{ ...inner, padding: 14 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <strong style={{ fontSize: 14, color: "var(--strong)", flex: 1 }}>{seq.name}</strong>
                    {seq.shortcut && <span style={chip("vio")}>;{seq.shortcut}</span>}
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>disparada {seq.usageCount}×</span>
                    <button onClick={() => removeSeq(seq.id, seq.name)} style={{ ...ghostSm, color: "var(--danger)" }} title="Excluir">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {st.map((step, i) => (
                      <div key={i} style={{ fontSize: 13, color: "var(--text)", padding: "6px 10px", borderRadius: 8, background: "var(--subtle-surface)" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-text)", marginRight: 8 }}>
                          Passo {i + 1} ({step.delaySec}s)
                        </span>
                        {step.quickReplyId ? `[${mediaReplies.find(r => r.id === step.quickReplyId)?.name ?? "Mídia indisponível"}] ` : ""}{step.text}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
