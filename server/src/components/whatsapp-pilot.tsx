"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { PageHeader } from "@/components/page-header"
import { btn, card, chip, errorText, field, ghost, helper, inner } from "@/lib/ui"
import { defaults, type PilotConfig } from "@/lib/whatsapp/policy"
import type { QuickReplyView } from "@/lib/quick-replies"

type JobView = { _id: string; name: string; phone: string; kind: string; text: string; dueAt: string; status: string; reason?: string; checkedAt?: string; attachment?: { type: string; asVoiceNote: boolean; replyId: string } }
type View = { config: PilotConfig; state: string; desired: boolean; workerOnline: boolean; heartbeat: string | null; phone?: string; qr: string | null; jobs: JobView[]; nextCursor: string | null; queueHealth: { review: number; queued: number; overdue: number; uncertain: number; unreviewed: number; expired: number }; contacts: { _id: string; name: string; phone: string }[]; exclusions: string[] }
const statusNames: Record<string, string> = { review: "Aguardando aprovação", queued: "Na fila", sending: "Enviando", submitted: "Transmitida", delivered: "Entregue", read: "Lida", uncertain: "Resultado incerto: confira a conversa", canceled: "Cancelada", expired: "Expirada" }
const kindNames: Record<string, string> = { birthday: "Aniversário", quote: "Retorno de orçamento", after_sale: "Pós-venda", test: "Teste", quick: "Resposta rápida", scheduled: "Agendamento" }
const connectionNames: Record<string, string> = { worker_offline: "Worker desligado", disconnected: "Desconectado", connecting: "Conectando", pairing: "Aguardando QR code", syncing: "Sincronizando avisos antes de liberar os envios", connected: "Conectado", reconnecting: "Reconectando", logged_out: "Vincule novamente", conflict: "Sessão em conflito: conecte novamente" }
async function request(body?: unknown, filters?: URLSearchParams) {
  const response = await fetch(`/api/crm/whatsapp${filters?.size ? `?${filters}` : ""}`, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || "Falha na conexão")
  return data
}


export function WhatsappPilot() {
  const [view, setView] = useState<View | null>(null)
  const [config, setConfig] = useState<PilotConfig>(defaults)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [contactId, setContactId] = useState("")
  const [contactSearch, setContactSearch] = useState("")
  const [kind, setKind] = useState<"quote" | "after_sale" | "test" | "scheduled">("test")
  const [mediaReplies, setMediaReplies] = useState<QuickReplyView[]>([])
  const [replyId, setReplyId] = useState("")
  const [dueAt, setDueAt] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("")
  const [jobKind, setJobKind] = useState("")
  const [cursors, setCursors] = useState<string[]>([])
  const [loadedHistoryKey, setLoadedHistoryKey] = useState("")
  const historyKey = JSON.stringify([search, status, jobKind, cursors])
  useEffect(() => { void fetch("/api/crm/quick-replies").then(async r => { if (!r.ok) throw new Error(); return r.json() }).then((rows: QuickReplyView[]) => setMediaReplies(rows.filter(r => ["AUDIO", "IMAGE"].includes(r.type) && !r.viewOnce))).catch(() => setError("Não foi possível carregar a biblioteca de mídia.")) }, [])
  const [testText, setTestText] = useState("Teste autorizado do VisionSync.")
  const initialized = useRef(false)
  const scheduleRequest = useRef<string | null>(null)
  const loadSequence = useRef(0)
  const load = useCallback(async () => {
    const sequence = ++loadSequence.current
    const filters = new URLSearchParams()
    if (search) filters.set("q", search)
    if (status) filters.set("status", status)
    if (jobKind) filters.set("kind", jobKind)
    if (cursors.length) filters.set("cursor", cursors[cursors.length - 1])
    const data: View = await request(undefined, filters)
    if (sequence !== loadSequence.current) return
    setView(data)
    setLoadedHistoryKey(historyKey)
    if (!initialized.current) { setConfig(data.config); initialized.current = true }
  }, [search, status, jobKind, cursors, historyKey])
  useEffect(() => {
    let mounted = true
    const sequence = loadSequence
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      try { if (mounted) await load() } catch (e) { if (mounted) setError(e instanceof Error ? e.message : "Falha na consulta") }
      if (mounted) timer = setTimeout(poll, 5000)
    }
    void poll()
    return () => { mounted = false; sequence.current++; clearTimeout(timer) }
  }, [load])

  async function act(body: unknown, message: string) {
    setBusy(true); setError(""); setNotice("")
    try { await request(body); await load(); setNotice(message); return true }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível concluir"); return false }
    finally { setBusy(false) }
  }
  async function save() {
    await act({ action: "configure", config }, "Configurações salvas.")
  }
  return <div className="vs-stack">
    <PageHeader title="Envios no servidor" subtitle="Conecte seu WhatsApp e gerencie os envios da sua conta." />
    <p style={helper}>Acompanhe suas mensagens e configure os envios automáticos. Conexão não oficial para teste.</p>
    <nav className="vs-wa-shortcuts" aria-label="Atalhos de envios">
      <a href="#fila">Fila e histórico</a><a href="#conexao-servidor">Conexão</a><a href="#preparar-envio">Preparar mensagem</a><a href="#regras-envio">Configurações</a>
    </nav>
    {error && <p role="alert" style={errorText}>{error}</p>}
    {notice && <p role="status" style={{ color: "var(--ok-text)" }}>{notice}</p>}
    {!view && !error && <p>Carregando conexão…</p>}
    <section id="fila" style={{ ...card, padding: 20 }} aria-labelledby="wa-queue">
      <h2 id="wa-queue" style={{ marginTop: 0 }}>Fila e histórico</h2>
      {view && <div className="vs-wa-counts" aria-label="Resumo da fila">
        <button type="button" onClick={() => { setCursors([]); setSearch(""); setSearchInput(""); setJobKind(""); setStatus("review") }}><strong>{view.queueHealth.review}</strong><span>Aguardando aprovação</span></button>
        <button type="button" onClick={() => { setCursors([]); setSearch(""); setSearchInput(""); setJobKind(""); setStatus("queued") }}><strong>{view.queueHealth.queued}</strong><span>Na fila</span></button>
        <button type="button" onClick={() => { setCursors([]); setSearch(""); setSearchInput(""); setJobKind(""); setStatus("uncertain") }}><strong>{view.queueHealth.uncertain}</strong><span>Resultados incertos · {view.queueHealth.unreviewed} sem conferência</span></button>
      </div>}
      <p style={helper}>Transmitida não significa entregue. Resultado incerto não é reenviado automaticamente. A pausa não desfaz uma transmissão já iniciada.</p>
      <form onSubmit={event => { event.preventDefault(); setCursors([]); setSearch(searchInput.trim()) }} style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12, alignItems: "end" }}>
        <label>Buscar nome, telefone ou mensagem<input value={searchInput} maxLength={100} onChange={event => setSearchInput(event.target.value)} style={field} /></label>
        <button type="submit" style={ghost}>Buscar</button>
        {(search || status || jobKind) && <button type="button" style={ghost} onClick={() => { setSearchInput(""); setSearch(""); setStatus(""); setJobKind(""); setCursors([]) }}>Limpar filtros</button>}
        <label>Status<select value={status} onChange={event => { setCursors([]); setStatus(event.target.value) }} style={field}><option value="">Todos</option>{Object.entries(statusNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
        <label>Tipo<select value={jobKind} onChange={event => { setCursors([]); setJobKind(event.target.value) }} style={field}><option value="">Todos</option>{Object.entries(kindNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
      </form>
      {view && loadedHistoryKey !== historyKey && <p role="status">Atualizando histórico…</p>}
      {view && loadedHistoryKey === historyKey && view.jobs.length === 0 && <p>Nenhuma mensagem encontrada.</p>}
      {loadedHistoryKey === historyKey && view?.jobs.map(job => <article key={job._id} className="vs-wa-job" style={{ ...inner, padding: 16, marginTop: 12, overflowWrap: "anywhere" }}>
        <div className="vs-wa-job-head"><div><strong>{job.name || job.phone}</strong><p style={helper}>+{job.phone} · {kindNames[job.kind] ?? job.kind}</p></div><span style={chip(job.status === "uncertain" ? "wait" : job.status === "review" ? "wine" : job.status === "delivered" || job.status === "read" ? "ok" : "mute")}>{statusNames[job.status] ?? job.status}</span></div>
        <p style={helper}>Prevista para {new Date(job.dueAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · Brasília</p>
        {job.attachment && <p>{job.attachment.type === "IMAGE" ? "Imagem" : job.attachment.asVoiceNote ? "Nota de voz" : "Arquivo de áudio"} · {mediaReplies.find(r => r.id === job.attachment?.replyId)?.name ?? "Anexo da biblioteca"}</p>}
        {job.text && <p className="vs-wa-message">{job.text}</p>}
        {job.reason && <p style={helper}>{job.reason}</p>}
        {job.status === "uncertain" && job.checkedAt && <p style={helper}>Conferida em {new Date(job.checkedAt).toLocaleString("pt-BR")}; a entrega não foi confirmada pelo aplicativo.</p>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{job.status === "review" && <button disabled={busy} style={btn} onClick={() => void act({ action: "approve", id: job._id }, "Aprovada. O worker tentará enviar quando a fila estiver liberada.")}>Aprovar envio</button>}{["review", "queued"].includes(job.status) && <button disabled={busy} style={ghost} onClick={() => void act({ action: "cancel", id: job._id }, "Mensagem cancelada.")}>Cancelar</button>}{job.status === "uncertain" && !job.checkedAt && <button disabled={busy} style={ghost} onClick={() => void act({ action: "acknowledge", id: job._id }, "Marcada como conferida. O resultado continua incerto.")}>Marcar como conferida</button>}</div>
      </article>)}
      {view && <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}><button type="button" disabled={busy || loadedHistoryKey !== historyKey || cursors.length === 0} style={ghost} onClick={() => setCursors(current => current.slice(0, -1))}>Mais recentes</button><span>Página {cursors.length + 1}</span><button type="button" disabled={busy || loadedHistoryKey !== historyKey || !view.nextCursor} style={ghost} onClick={() => { if (view.nextCursor) setCursors(current => [...current, view.nextCursor!]) }}>Mais antigas</button></div>}
    </section>
    <details id="conexao-servidor" style={{ ...card, padding: 20 }}>
      <summary className="vs-wa-summary">Conexão e controle <span>{view ? connectionNames[view.state] ?? view.state : "Consultando…"}</span></summary>
      <section aria-label="Conexão e controle">
      <p role="status">{view ? connectionNames[view.state] ?? view.state : "Consultando…"}{view?.phone ? ` · ${view.phone}` : ""}</p>
      {view && <p style={helper}>Fila {view.config.paused ? "pausada" : "liberada"} · {view.config.automatic ? "novas mensagens automáticas" : "novas mensagens exigem revisão"}</p>}
      {view?.state === "worker_offline" && <p style={helper}>Inicie o processo do conector no servidor com <code>npm run whatsapp:worker</code>. O QR code aparecerá aqui.</p>}
      {view?.heartbeat && <p style={helper}>Último sinal do worker: {new Date(view.heartbeat).toLocaleString("pt-BR")}</p>}
      {view?.desired && !view.workerOnline && <p role="alert" style={errorText}>O worker não está respondendo; os envios não serão processados até ele voltar.</p>}
      {view?.workerOnline && view.desired && ["reconnecting", "logged_out", "conflict"].includes(view.state) && <p role="alert" style={errorText}>A conexão precisa de atenção antes de processar os envios.</p>}
      {view?.state === "syncing" && <p style={helper}>Os envios aguardam a sincronização do WhatsApp.</p>}
      {view && <p style={helper}>Fila: {view.queueHealth.review} aguardando aprovação · {view.queueHealth.queued} na fila · {view.queueHealth.overdue} com horário já alcançado · {view.queueHealth.uncertain} resultado incerto · {view.queueHealth.expired} expiradas.</p>}
      {!!view?.queueHealth.unreviewed && <p role="alert" style={errorText}>Há {view.queueHealth.unreviewed} envio(s) com resultado incerto ainda não conferido(s). Confira as conversas antes de enviar novamente.</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <button disabled={busy || !view} style={btn} onClick={async () => { if (await act({ action: "connect" }, view?.workerOnline ? "Conexão solicitada. Aguarde o QR code." : "Conexão solicitada. Inicie o worker para gerar o QR code.")) setConfig(current => ({ ...current, enabled: true })) }}>Conectar / gerar QR</button>
        <button disabled={busy || !view} style={ghost} onClick={async () => { if (await act({ action: "disconnect" }, "Desconexão solicitada e fila pausada.")) setConfig(current => ({ ...current, paused: true })) }}>Desconectar</button>
        <button disabled={busy || !view} style={ghost} onClick={async () => { const paused = !view?.config.paused; if (await act({ action: paused ? "pause" : "resume" }, "Controle da fila atualizado.")) setConfig(current => ({ ...current, paused })) }}>{view?.config.paused ? "Retomar fila" : "Pausar todos os envios"}</button>
      </div>
      {view?.qr && <div style={{ marginTop: 16 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={view.qr} alt="QR code privado para vincular o WhatsApp da agência" width={280} height={280} style={{ maxWidth: "100%", height: "auto", borderRadius: 12 }} />
        <p style={helper}>No WhatsApp: aparelhos conectados → conectar um aparelho. O QR expira e será atualizado enquanto esta tela estiver aberta.</p>
      </div>}
      </section>
    </details>
    <details id="regras-envio" style={{ ...card, padding: 20 }}>
      <summary className="vs-wa-summary">Configurações de envio <span>Regras, modelos e mídia</span></summary>
      <section style={{ display: "grid", gap: 14, marginTop: 16 }} aria-label="Configurações de envio">
      <label><input type="checkbox" checked={config.enabled} onChange={e => setConfig({ ...config, enabled: e.target.checked })} /> Habilitar conector</label>
      <label><input type="checkbox" checked={config.paused} onChange={e => setConfig({ ...config, paused: e.target.checked })} /> Salvar com a fila pausada</label>
      <label><input type="checkbox" checked={config.automatic} onChange={e => setConfig({ ...config, automatic: e.target.checked })} /> Enviar automaticamente novas mensagens das regras habilitadas</label>
      <p style={helper}>Desmarcado: as mensagens são preparadas para aprovação. Testes sempre exigem aprovação. Mensagens já preparadas mantêm seu texto; alterar o modelo vale para as próximas.</p>
      <label><input type="checkbox" checked={config.birthday} onChange={e => setConfig({ ...config, birthday: e.target.checked })} /> Aniversários, uma vez por ano</label>
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
      <button disabled={busy || !view} style={{ ...btn, justifySelf: "start" }} onClick={() => void save()}>Salvar configurações</button>
      </section>
    </details>
    <details id="preparar-envio" style={{ ...card, padding: 20 }}>
      <summary className="vs-wa-summary">Preparar mensagem ou registrar evento <span>Agendamentos, testes e eventos</span></summary>
      <section style={{ display: "grid", gap: 12, marginTop: 16 }} aria-label="Preparar mensagem ou registrar evento">
      <label>Buscar contato<input value={contactSearch} onChange={e => setContactSearch(e.target.value)} placeholder="Nome ou telefone" style={field} /></label>
      <label>Contato<select value={contactId} onChange={e => { setContactId(e.target.value); scheduleRequest.current = null }} style={field}><option value="">Selecione</option>{view?.contacts.filter(c => {
        const q = contactSearch.trim().toLocaleLowerCase("pt-BR")
        const digits = q.replace(/\D/g, "")
        return c._id === contactId || !q || c.name.toLocaleLowerCase("pt-BR").includes(q) || (digits && !/[^\d\s()+.\-]/.test(q) && c.phone.includes(digits))
      }).map(c => <option key={c._id} value={c._id}>{c.name} · {c.phone}</option>)}</select></label>
      <label>Ação<select value={kind} onChange={e => { setKind(e.target.value as typeof kind); scheduleRequest.current = null }} style={field}><option value="scheduled">Agendar texto, áudio ou imagem</option><option value="test">Preparar mensagem de teste</option><option value="quote">Marcar orçamento enviado</option><option value="after_sale">Marcar serviço concluído</option></select></label>
      {(kind === "test" || kind === "scheduled") && <label>Mensagem / legenda de imagem<textarea value={testText} maxLength={2000} rows={2} onChange={e => { setTestText(e.target.value); scheduleRequest.current = null }} style={field} /></label>}
      <label>Áudio ou imagem opcional<select value={replyId} onChange={e => { setReplyId(e.target.value); scheduleRequest.current = null }} style={field}><option value="">Usar texto ou mídia da regra</option>{mediaReplies.map(r => <option key={r.id} value={r.id}>{r.name} ({r.type === "AUDIO" ? "Áudio" : "Imagem"})</option>)}</select></label>
      {kind === "scheduled" && <label>Data e hora (horário do seu aparelho)<input type="datetime-local" value={dueAt} onChange={e => { setDueAt(e.target.value); scheduleRequest.current = null }} style={field} /></label>}
      <p style={helper}>Registre somente eventos reais. Orçamento e pós-venda são agendados conforme as regras salvas. Teste exige aprovação individual.</p>
      <button disabled={busy || !contactId} style={{ ...btn, justifySelf: "start" }} onClick={async () => {
        if (kind === "scheduled" && (!dueAt || !Number.isFinite(new Date(dueAt).getTime()))) { setError("Informe uma data e hora válidas."); return }
        scheduleRequest.current ??= crypto.randomUUID()
        if (await act({ action: "schedule", contactId, kind, requestId: scheduleRequest.current, ...(replyId ? { replyId } : {}), ...(kind === "scheduled" ? { dueAt: new Date(dueAt).toISOString() } : {}), ...(["test", "scheduled"].includes(kind) ? { text: testText } : {}) }, "Mensagem preparada. Confira a fila acima.")) scheduleRequest.current = null
      }}>Preparar mensagem / registrar evento</button>
      {view?.contacts.filter(c => c._id === contactId).map(c => <div key={c._id} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}><span>{c.name}: {view.exclusions.includes(c.phone) ? "envios bloqueados" : "envios permitidos"}</span><button disabled={busy} style={ghost} onClick={() => void act({ action: view.exclusions.includes(c.phone) ? "include" : "exclude", phone: c.phone }, "Preferência atualizada.")}>{view.exclusions.includes(c.phone) ? "Reautorizar" : "Bloquear envios"}</button></div>)}
      </section>
    </details>

  </div>
}
