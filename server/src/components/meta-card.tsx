"use client"

import { useCallback, useEffect, useState } from "react"
import { Pencil, Plus, Send, Trash2 } from "lucide-react"
import { PasswordInput } from "@/components/password-input"
import { btn, card, chip, chipTone, field, ghost, ghostSm, inner, label } from "@/lib/ui"

type Pixel = {
  id: string
  name: string
  datasetId: string
  tokenHint: string
  testEventCode: string
  repeatMode: "purchase" | "custom" | "none"
  isDefault: boolean
}
type ListRow = { id: string; name: string; color: string; metaPixelId: string | null }
type Config = { graphVersion: string; pixels: Pixel[]; lists: ListRow[] }

type MetaEvent = {
  id: string
  contactName: string
  amount: number
  productName: string | null
  purchasedAt: string
  pixelName: string | null
  status: "enviado" | "pendente" | "falhou" | "expirado" | "sem_pixel" | "ignorada"
  error: string | null
}

const STATUS: Record<MetaEvent["status"], { tone: keyof typeof chipTone; label: string }> = {
  enviado: { tone: "ok", label: "Enviado" },
  pendente: { tone: "wait", label: "Pendente" },
  falhou: { tone: "late", label: "Falhou" },
  expirado: { tone: "mute", label: "Expirado" },
  sem_pixel: { tone: "wait", label: "Sem pixel" },
  ignorada: { tone: "mute", label: "Não enviada" },
}

const REPEAT_LABEL: Record<Pixel["repeatMode"], string> = {
  purchase: "Todas as compras como Purchase",
  custom: 'Recompras como evento "Recompra"',
  none: "Só a 1ª compra de cada cliente",
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const fmt = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })

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

export function MetaCard() {
  const [cfg, setCfg] = useState<Config | null>(null)
  const [events, setEvents] = useState<MetaEvent[]>([])
  const [editing, setEditing] = useState<Pixel | "new" | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [sending, setSending] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setCfg(await call("GET", "/api/crm/meta"))
      setEvents(await call("GET", "/api/crm/meta/events"))
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Não consegui carregar." })
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function removePixel(p: Pixel) {
    if (!confirm(`Apagar o pixel "${p.name}"? As listas que apontam pra ele ficam sem pixel.`)) return
    try {
      await call("DELETE", `/api/crm/meta/pixels/${p.id}`)
      await load()
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Erro ao apagar." })
    }
  }

  async function assign(listId: string, pixelId: string) {
    try {
      await call("PUT", "/api/crm/meta/lists", { listId, pixelId: pixelId || null })
      setCfg((c) => c && { ...c, lists: c.lists.map((l) => (l.id === listId ? { ...l, metaPixelId: pixelId || null } : l)) })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Erro ao salvar." })
    }
  }

  async function sendPending() {
    setSending(true)
    setMsg(null)
    try {
      const d = await call("POST", "/api/crm/meta/send-pending")
      setMsg({
        ok: d.failed === 0,
        text: `${d.sent} enviado(s), ${d.failed} falhou(aram), ${d.skipped} pulado(s)` + (d.firstError ? `. Motivo: ${d.firstError}` : ""),
      })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Erro ao enviar." })
    }
    setSending(false)
    await load()
  }

  async function showPreview() {
    try {
      setPreview(JSON.stringify(await call("GET", "/api/crm/meta/preview"), null, 2))
    } catch (e) {
      setPreview(e instanceof Error ? e.message : "Sem prévia.")
    }
  }

  const pixels = cfg?.pixels ?? []

  return (
    <div style={{ ...card, padding: 24 }}>
      <h2 style={{ fontSize: 17, margin: "0 0 4px", color: "var(--strong)" }}>Conversões pro Meta</h2>
      <p style={hint}>
        Cada compra registrada vira um evento <b>Purchase</b> com valor, data e o telefone da cliente criptografado.
        A compra vai pro pixel da <b>lista</b> da cliente. O Meta só aceita eventos de até <b>7 dias</b>.
      </p>

      <h3 style={sec}>PIXELS</h3>
      {pixels.length === 0 && <p style={{ ...hint, fontStyle: "italic" }}>Nenhum pixel cadastrado. Sem pixel, nada é enviado ao Meta.</p>}
      {pixels.map((p) => (
        <div key={p.id} style={{ ...inner, padding: "10px 12px", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <b style={{ color: "var(--strong)", fontSize: 14 }}>{p.name}</b>
            {p.isDefault && <span style={chip("wine")}>Padrão</span>}
            <span style={{ fontSize: 12, color: "var(--muted)" }}>ID {p.datasetId} · token {p.tokenHint}</span>
            <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button onClick={() => setEditing(p)} style={ghostSm} title="Editar"><Pencil size={13} /></button>
              <button onClick={() => removePixel(p)} style={ghostSm} title="Apagar"><Trash2 size={13} /></button>
            </span>
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
            {REPEAT_LABEL[p.repeatMode]}{p.testEventCode ? ` · código de teste ${p.testEventCode}` : ""}
          </div>
        </div>
      ))}
      {editing ? (
        <PixelForm
          key={editing === "new" ? "new" : editing.id}
          pixel={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load() }}
        />
      ) : (
        <button onClick={() => setEditing("new")} style={{ ...ghost, display: "inline-flex", alignItems: "center", gap: 6, marginTop: 4 }}>
          <Plus size={14} />Adicionar pixel
        </button>
      )}

      <h3 style={sec}>QUAL PIXEL RECEBE CADA LISTA</h3>
      <p style={hint}>
        Se a cliente está em mais de uma lista, vale a primeira (na ordem do funil) que tiver pixel. Lista com
        &quot;Pixel padrão&quot; usa o pixel marcado como padrão{pixels.some((p) => p.isDefault) ? "" : " (hoje não há nenhum: essas compras ficam sem envio)"}.
      </p>
      {(cfg?.lists ?? []).length === 0 && <p style={{ ...hint, fontStyle: "italic" }}>Crie listas no Funil pra ligar a pixels.</p>}
      {(cfg?.lists ?? []).map((l) => (
        <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", flexWrap: "wrap" }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: l.color, flex: "none" }} />
          <span style={{ flex: 1, minWidth: 140, fontSize: 14, color: "var(--text)" }}>{l.name}</span>
          <select value={l.metaPixelId ?? ""} onChange={(e) => assign(l.id, e.target.value)} style={{ ...field, width: 220 }}>
            <option value="">Pixel padrão</option>
            {pixels.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      ))}

      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <button onClick={sendPending} disabled={sending} style={ghost}>
          <Send size={14} style={{ verticalAlign: -2, marginRight: 5 }} />{sending ? "Enviando..." : "Reenviar pendentes"}
        </button>
        <button onClick={showPreview} style={ghost}>Ver o que seria enviado</button>
      </div>

      {msg && <p style={{ fontSize: 13, color: msg.ok ? "var(--ok)" : "var(--danger)" }}>{msg.text}</p>}
      {preview && <pre style={pre}>{preview}</pre>}

      <h3 style={{ ...sec, marginTop: 22 }}>ÚLTIMAS COMPRAS</h3>
      {events.length === 0 ? (
        <p style={{ ...hint, fontStyle: "italic" }}>Nenhuma compra registrada ainda.</p>
      ) : (
        <div>
          {events.map((e, i) => {
            const s = STATUS[e.status]
            return (
              <div key={e.id} style={{ ...row, borderTop: i === 0 ? "none" : "1px solid var(--soft)" }} title={e.error ?? ""}>
                <span style={{ width: 44, color: "var(--muted)", fontSize: 12 }}>{fmt(e.purchasedAt)}</span>
                <span style={{ flex: 1, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text)" }}>
                  {e.contactName}{e.productName ? ` · ${e.productName}` : ""}
                </span>
                {e.pixelName && <span style={{ fontSize: 11, color: "var(--faint)" }}>{e.pixelName}</span>}
                <span style={{ fontSize: 13, fontWeight: 700, marginRight: 10, color: "var(--strong)" }}>{brl(e.amount)}</span>
                <span style={chip(s.tone)}>{s.label}</span>
              </div>
            )
          })}
          {events.some((e) => e.error && (e.status === "falhou" || e.status === "sem_pixel")) && (
            <p style={{ ...hint, fontSize: 12, color: "var(--danger)" }}>
              Aviso: {events.find((e) => e.error && (e.status === "falhou" || e.status === "sem_pixel"))?.error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function PixelForm({ pixel, onClose, onSaved }: { pixel: Pixel | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(pixel?.name ?? "")
  const [datasetId, setDatasetId] = useState(pixel?.datasetId ?? "")
  const [token, setToken] = useState("")
  const [testCode, setTestCode] = useState(pixel?.testEventCode ?? "")
  const [repeatMode, setRepeatMode] = useState<Pixel["repeatMode"]>(pixel?.repeatMode ?? "purchase")
  const [isDefault, setIsDefault] = useState(pixel?.isDefault ?? false)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save() {
    setErr(null)
    setBusy(true)
    try {
      const body = { name, datasetId, accessToken: token, testEventCode: testCode, repeatMode, isDefault }
      if (pixel) await call("PUT", `/api/crm/meta/pixels/${pixel.id}`, body)
      else await call("POST", "/api/crm/meta/pixels", body)
      await onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não consegui salvar.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ ...inner, padding: 14, marginTop: 6 }}>
      <label style={{ ...label, marginTop: 0 }}>Nome (só pra você)</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Compradoras valor cheio" style={{ ...field, padding: "9px 12px" }} />

      <label style={label}>ID do Pixel (conjunto de dados)</label>
      <input value={datasetId} onChange={(e) => setDatasetId(e.target.value)} placeholder="só números, ex: 1234567890123456" style={{ ...field, padding: "9px 12px" }} />

      <label style={label}>Token de acesso {pixel && <span style={{ color: "var(--ok)" }}>(salvo: {pixel.tokenHint})</span>}</label>
      <PasswordInput value={token} onChange={setToken} placeholder={pixel ? "deixe vazio pra manter o atual" : "cole o token de acesso"} />

      <label style={label}>Código de teste (opcional)</label>
      <input value={testCode} onChange={(e) => setTestCode(e.target.value)} placeholder="ex: TEST12345" style={{ ...field, padding: "9px 12px" }} />
      <p style={{ ...hint, fontSize: 12, marginTop: 6 }}>
        Eventos com código de teste aparecem em &quot;Testar eventos&quot;, mas o Meta ainda os usa na medição. Deixe vazio no dia a dia.
      </p>

      <label style={label}>Recompras (2ª compra em diante)</label>
      <select value={repeatMode} onChange={(e) => setRepeatMode(e.target.value as Pixel["repeatMode"])} style={{ ...field, padding: "9px 12px" }}>
        <option value="purchase">Enviar todas como Purchase (recomendado pra você)</option>
        <option value="custom">Enviar como evento separado &quot;Recompra&quot;</option>
        <option value="none">Não enviar (só a 1ª compra de cada cliente)</option>
      </select>

      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13, color: "var(--text)" }}>
        <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
        Pixel padrão (usado quando a lista da cliente não aponta pra nenhum)
      </label>

      <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={save} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>{busy ? "Salvando..." : pixel ? "Salvar alterações" : "Cadastrar pixel"}</button>
        <button onClick={onClose} style={ghost}>Cancelar</button>
        {err && <span style={{ color: "var(--danger)", fontSize: 12 }}>{err}</span>}
      </div>
    </div>
  )
}

const hint: React.CSSProperties = { fontSize: 13, color: "var(--muted)", lineHeight: 1.55, margin: "0 0 6px" }
const sec: React.CSSProperties = { fontSize: 13, margin: "20px 0 8px", color: "var(--vred)", letterSpacing: 1 }
const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, padding: "9px 0" }
const pre: React.CSSProperties = { ...inner, padding: 12, fontSize: 11, overflow: "auto", maxHeight: 260, color: "var(--text-2)" }
