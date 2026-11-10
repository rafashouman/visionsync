"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { PageHeader } from "@/components/page-header"
import { btn, card, errorText, field, ghost, helper, inner } from "@/lib/ui"
import { defaults, type PilotConfig } from "@/lib/whatsapp/policy"
import type { QuickReplyView } from "@/lib/quick-replies"

type JobView = { _id: string; name: string; phone: string; kind: string; text: string; dueAt: string; status: string; reason?: string; attachment?: { type: string; asVoiceNote: boolean; replyId: string } }
type View = { config: PilotConfig; state: string; workerOnline: boolean; phone?: string; qr: string | null; jobs: JobView[]; contacts: { _id: string; name: string; phone: string }[]; exclusions: string[] }
const statusNames: Record<string, string> = { review: "Aguardando aprovação", queued: "Na fila", sending: "Enviando", submitted: "Transmitida", delivered: "Entregue", read: "Lida", uncertain: "Resultado incerto: confira a conversa", canceled: "Cancelada", expired: "Expirada" }
const connectionNames: Record<string, string> = { worker_offline: "Worker desligado", disconnected: "Desconectado", connecting: "Conectando", pairing: "Aguardando QR code", syncing: "Sincronizando avisos antes de liberar os envios", connected: "Conectado", reconnecting: "Reconectando", logged_out: "Vincule novamente", conflict: "Sessão em conflito: conecte novamente" }
async function request(body?: unknown) {
  const response = await fetch("/api/crm/whatsapp", body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || "Falha na conexão")
  return data
}

export function WhatsappPilot() {
  const [view, setView] = useState<View | null>(null)
  const [config, setConfig] = useState<PilotConfig>(defaults)
  const [phones, setPhones] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [contactId, setContactId] = useState("")
  const [kind, setKind] = useState<"quote" | "after_sale" | "test" | "scheduled">("test")
  const [mediaReplies, setMediaReplies] = useState<QuickReplyView[]>([])
  const [replyId, setReplyId] = useState("")
  const [dueAt, setDueAt] = useState("")
  useEffect(() => { void fetch("/api/crm/quick-replies").then(async r => { if (!r.ok) throw new Error(); return r.json() }).then((rows: QuickReplyView[]) => setMediaReplies(rows.filter(r => ["AUDIO", "IMAGE"].includes(r.type) && !r.viewOnce))).catch(() => setError("Não foi possível carregar a biblioteca de mídia.")) }, [])
  const [testText, setTestText] = useState("Teste autorizado do VisionSync.")
  const initialized = useRef(false)
  const scheduleRequest = useRef<string | null>(null)
  const load = useCallback(async () => {
    const data: View = await request()
    setView(data)
    if (!initialized.current) { setConfig(data.config); setPhones(data.config.phones.join("\n")); initialized.current = true }
  }, [])
  useEffect(() => {
    let mounted = true
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      try { if (mounted) await load() } catch (e) { if (mounted) setError(e instanceof Error ? e.message : "Falha na consulta") }
      if (mounted) timer = setTimeout(poll, 5000)
    }
    void poll()
    return () => { mounted = false; clearTimeout(timer) }
  }, [load])

  async function act(body: unknown, message: string) {
    setBusy(true); setError(""); setNotice("")
    try { await request(body); await load(); setNotice(message); return true }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível concluir"); return false }
    finally { setBusy(false) }
  }
  async function save() {
    const next = { ...config, phones: phones.split(/[\n,;]+/).map(x => x.replace(/\D/g, "")).filter(Boolean) }
    if (await act({ action: "configure", config: next }, "Regras salvas. Conecte o WhatsApp e retome a fila quando estiver pronto.")) setConfig(next)
  }
  const configured = Boolean(view?.config.phones.length)
  return <>
    <PageHeader title="Envios no servidor" subtitle="Piloto interno · até dois destinatários autorizados · horário de envio: 9h às 18h, Brasília." />
    <p style={helper}>Aniversário, retorno de orçamento e pós-venda. O servidor executa os envios; a extensão continua disponível para atendimento. Conexão não oficial para teste.</p>
    {error && <p role="alert" style={errorText}>{error}</p>}
    {notice && <p role="status" style={{ color: "var(--ok-text)" }}>{notice}</p>}
    {!view && !error && <p>Carregando conexão…</p>}
    <section style={{ ...card, padding: 20 }} aria-labelledby="wa-connection">
      <h2 id="wa-connection" style={{ marginTop: 0 }}>Conexão e controle</h2>
      <p role="status">{view ? connectionNames[view.state] ?? view.state : "Consultando…"}{view?.phone ? ` · ${view.phone}` : ""}</p>
      {view && <p style={helper}>Fila {view.config.paused ? "pausada" : "liberada"} · {view.config.automatic ? "novas mensagens automáticas" : "novas mensagens exigem revisão"}</p>}
      {view?.state === "worker_offline" && <p style={helper}>Inicie o processo do conector no servidor com <code>npm run whatsapp:worker</code>. O QR code aparecerá aqui.</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <button disabled={busy || !configured || !view?.workerOnline} style={btn} onClick={() => void act({ action: "connect" }, "Conexão solicitada. Aguarde o QR code.")}>Conectar / gerar QR</button>
        <button disabled={busy || !configured} style={ghost} onClick={() => void act({ action: "disconnect" }, "Desconexão solicitada e fila pausada.")}>Desconectar</button>
        <button disabled={busy || !configured} style={ghost} onClick={() => void act({ action: view?.config.paused ? "resume" : "pause" }, "Controle da fila atualizado.")}>{view?.config.paused ? "Retomar fila" : "Pausar todos os envios"}</button>
      </div>
      {view?.qr && <div style={{ marginTop: 16 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={view.qr} alt="QR code privado para vincular o WhatsApp da agência" width={280} height={280} style={{ maxWidth: "100%", height: "auto", borderRadius: 12 }} />
        <p style={helper}>No WhatsApp: aparelhos conectados → conectar um aparelho. O QR expira e será atualizado enquanto esta tela estiver aberta.</p>
      </div>}
    </section>
    <section style={{ ...card, padding: 20, display: "grid", gap: 14 }} aria-labelledby="wa-rules">
      <h2 id="wa-rules" style={{ margin: 0 }}>Regras do piloto</h2>
      <label>Destinatários autorizados (um por linha, DDI + DDD + número)
        <textarea rows={2} value={phones} onChange={e => setPhones(e.target.value)} placeholder={"5511999999999\n5521999999999"} style={field} />
      </label>
      <p style={helper}>Somente estes números poderão receber mensagens. Cadastre ambos em Contatos para aparecerem abaixo. Remover um número impede os próximos envios para ele.</p>
      <label><input type="checkbox" checked={config.enabled} onChange={e => setConfig({ ...config, enabled: e.target.checked })} /> Habilitar conector interno</label>
      <label><input type="checkbox" checked={config.paused} onChange={e => setConfig({ ...config, paused: e.target.checked })} /> Salvar com a fila pausada</label>
      <label><input type="checkbox" checked={config.automatic} onChange={e => setConfig({ ...config, automatic: e.target.checked })} /> Enviar automaticamente novas mensagens das regras habilitadas</label>
      <p style={helper}>Desmarcado: as mensagens são preparadas para aprovação. Testes sempre exigem aprovação. Mensagens já preparadas mantêm seu texto; alterar o modelo vale para as próximas.</p>
      <label><input type="checkbox" checked={config.birthday} onChange={e => setConfig({ ...config, birthday: e.target.checked })} /> Aniversários, uma vez por ano, a partir das 9h</label>
      <label>Mensagem de aniversário<textarea rows={3} value={config.birthdayText} maxLength={2000} onChange={e => setConfig({ ...config, birthdayText: e.target.value })} style={field} /></label>
      <label><input type="checkbox" checked={config.quote} onChange={e => setConfig({ ...config, quote: e.target.checked })} /> Retorno de orçamento</label>
      <label>Dias após marcar orçamento enviado<input type="number" min={1} max={30} value={config.quoteDays} onChange={e => setConfig({ ...config, quoteDays: Number(e.target.value) })} style={field} /></label>
      <label>Mensagem de retorno<textarea rows={3} value={config.quoteText} maxLength={2000} onChange={e => setConfig({ ...config, quoteText: e.target.value })} style={field} /></label>
      <label><input type="checkbox" checked={config.afterSale} onChange={e => setConfig({ ...config, afterSale: e.target.checked })} /> Pós-venda</label>
      <label>Dias após marcar serviço concluído<input type="number" min={1} max={90} value={config.afterSaleDays} onChange={e => setConfig({ ...config, afterSaleDays: Number(e.target.value) })} style={field} /></label>
      <label>Mensagem de pós-venda<textarea rows={3} value={config.afterSaleText} maxLength={2000} onChange={e => setConfig({ ...config, afterSaleText: e.target.value })} style={field} /></label>
      <p style={helper}>Personalização: {"{primeiro_nome}"} e {"{nome}"}. Aniversário depende da data cadastrada no contato. Orçamentos são cancelados se o cliente responder ou o negócio for encerrado.</p>
      {([{ key: "birthdayReplyId", label: "Mídia de aniversário" }, { key: "quoteReplyId", label: "Mídia do retorno de orçamento" }, { key: "afterSaleReplyId", label: "Mídia de pós-venda" }] as const).map(item => <label key={item.key}>{item.label}<select value={config[item.key] || ""} onChange={e => setConfig({ ...config, [item.key]: e.target.value || null })} style={field}><option value="">Somente texto</option>{mediaReplies.map(r => <option key={r.id} value={r.id}>{r.name} ({r.type === "AUDIO" ? "Áudio" : "Imagem"})</option>)}</select></label>)}
      <p style={helper}>Imagem usa o texto como legenda. Áudio substitui o texto; para nota de voz, use OGG/Opus e marque a opção na resposta rápida. MP3 pode ser enviado como arquivo de áudio.</p>
      <button disabled={busy || !view} style={{ ...btn, justifySelf: "start" }} onClick={() => void save()}>Salvar regras e números</button>
    </section>
    <section style={{ ...card, padding: 20, display: "grid", gap: 12 }} aria-labelledby="wa-trigger">
      <h2 id="wa-trigger" style={{ margin: 0 }}>Registrar evento ou preparar teste</h2>
      <label>Contato autorizado<select value={contactId} onChange={e => { setContactId(e.target.value); scheduleRequest.current = null }} style={field}><option value="">Selecione</option>{view?.contacts.map(c => <option key={c._id} value={c._id}>{c.name} · {c.phone}</option>)}</select></label>
      <label>Ação<select value={kind} onChange={e => { setKind(e.target.value as typeof kind); scheduleRequest.current = null }} style={field}><option value="scheduled">Agendar texto, áudio ou imagem</option><option value="test">Preparar mensagem de teste</option><option value="quote">Marcar orçamento enviado</option><option value="after_sale">Marcar serviço concluído</option></select></label>
      {(kind === "test" || kind === "scheduled") && <label>Mensagem / legenda de imagem<textarea value={testText} maxLength={2000} rows={2} onChange={e => { setTestText(e.target.value); scheduleRequest.current = null }} style={field} /></label>}
      <label>Áudio ou imagem opcional<select value={replyId} onChange={e => { setReplyId(e.target.value); scheduleRequest.current = null }} style={field}><option value="">Usar texto ou mídia da regra</option>{mediaReplies.map(r => <option key={r.id} value={r.id}>{r.name} ({r.type === "AUDIO" ? "Áudio" : "Imagem"})</option>)}</select></label>
      {kind === "scheduled" && <label>Data e hora (horário do seu aparelho)<input type="datetime-local" value={dueAt} onChange={e => { setDueAt(e.target.value); scheduleRequest.current = null }} style={field} /></label>}
      <p style={helper}>Registre somente eventos reais. Orçamento e pós-venda são agendados conforme as regras salvas. Teste exige aprovação individual e pode sair fora das 9h às 18h.</p>
      <button disabled={busy || !contactId} style={{ ...btn, justifySelf: "start" }} onClick={async () => {
        if (kind === "scheduled" && (!dueAt || !Number.isFinite(new Date(dueAt).getTime()))) { setError("Informe uma data e hora válidas."); return }
        scheduleRequest.current ??= crypto.randomUUID()
        if (await act({ action: "schedule", contactId, kind, requestId: scheduleRequest.current, ...(replyId ? { replyId } : {}), ...(kind === "scheduled" ? { dueAt: new Date(dueAt).toISOString() } : {}), ...(["test", "scheduled"].includes(kind) ? { text: testText } : {}) }, "Mensagem preparada. Confira a fila abaixo.")) scheduleRequest.current = null
      }}>Preparar mensagem / registrar evento</button>
      {view?.contacts.map(c => <div key={c._id} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}><span>{c.name}: {view.exclusions.includes(c.phone) ? "envios bloqueados" : "autorizado no piloto"}</span><button disabled={busy} style={ghost} onClick={() => void act({ action: view.exclusions.includes(c.phone) ? "include" : "exclude", phone: c.phone }, "Preferência atualizada.")}>{view.exclusions.includes(c.phone) ? "Reautorizar" : "Bloquear envios"}</button></div>)}
    </section>
    <section style={{ ...card, padding: 20 }} aria-labelledby="wa-queue">
      <h2 id="wa-queue" style={{ marginTop: 0 }}>Fila e histórico recente</h2>
      <p style={helper}>Até 60 mensagens mais recentes. Transmitida não significa entregue. Resultado incerto não é reenviado automaticamente. A pausa não desfaz uma transmissão já iniciada.</p>
      {view?.jobs.length === 0 && <p>Nenhuma mensagem preparada.</p>}
      {view?.jobs.map(job => <article key={job._id} style={{ ...inner, padding: 14, marginTop: 12, overflowWrap: "anywhere" }}>
        <strong>{job.name}</strong><p style={helper}>{job.phone} · {new Date(job.dueAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · Brasília</p>
        {job.attachment && <p>{job.attachment.type === "IMAGE" ? "Imagem" : job.attachment.asVoiceNote ? "Nota de voz" : "Arquivo de áudio"} · {mediaReplies.find(r => r.id === job.attachment?.replyId)?.name ?? "Anexo da biblioteca"}</p>}
        <p>{job.text}</p><p style={{ color: job.status === "uncertain" ? "var(--wait-text)" : "var(--muted)" }}>{statusNames[job.status] ?? job.status}</p>
        {job.reason && <p style={helper}>{job.reason}</p>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{job.status === "review" && <button disabled={busy} style={btn} onClick={() => void act({ action: "approve", id: job._id }, "Aprovada. O worker tentará no horário permitido, se a fila estiver liberada.")}>Aprovar envio</button>}{["review", "queued"].includes(job.status) && <button disabled={busy} style={ghost} onClick={() => void act({ action: "cancel", id: job._id }, "Mensagem cancelada.")}>Cancelar</button>}</div>
      </article>)}
    </section>
  </>
}
