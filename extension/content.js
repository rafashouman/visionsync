// ─────────────────────────────────────────────────────────────────────────────
// VisionSync — content script (roda dentro do WhatsApp Web)
//
// Coluna de ícones na esquerda + painel que abre ao lado:
//   Conversa · Notas · Cobranças · Respostas rápidas · Painel web
// E, acima do campo de mensagem: barra de respostas rápidas + atalho ";".
//
// ⚠ PARTE FRÁGIL: os seletores do WhatsApp Web mudam de tempos em tempos.
// Se parar de detectar o nome/telefone ou de inserir texto, ajuste só
// getActivePhone(), getActiveName() e getComposer() abaixo.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT_ID = "vcrm-root"
const BAR_ID = "vcrm-bar"
const POP_ID = "vcrm-pop"
const RAIL_W = 44
const SCRIPT_VERSION = "0.22.0"

const state = {
  open: false,
  tab: "conversa",
  phone: null,
  name: null,
  contact: null, // resposta de /api/crm/contact
  detail: null, // resposta de /api/crm/contacts/:id (dados, notas)
  charges: [],
  reminders: [],
  lists: [],
  replies: [],
  repliesQuery: "",
  myName: "",
  apiUrl: "",
  status: "idle", // idle | loading | ok | no_config | bad_token | offline
  toast: "",
}

const SEND_LABELS = {
  blocked: "Revise o rascunho atual", preparing: "Preparando resposta", prepared: "Preparado para revisão", requested: "Envio solicitado ao WhatsApp",
  review: "Aguardando aprovação no servidor", queued: "Na fila do servidor", sending: "Transmitindo pelo servidor",
  submitted: "Transmitido pelo servidor", delivered: "Entregue", read: "Lida", uncertain: "Resultado incerto",
  canceled: "Envio cancelado", expired: "Envio expirado", failed: "Não foi possível concluir",
}
let sendFeedback = { status: "idle", detail: "", jobId: null, updatedAt: null }
let lastQuickKey = null
function sendState(status, detail = "", jobId = null, phone = status === "preparing" ? state.phone : (sendFeedback.phone || state.phone)) {
  sendFeedback = { status, detail, jobId, phone, updatedAt: new Date().toISOString() }
  const host = document.getElementById?.(ROOT_ID)?.querySelector(".vc-send-feedback")
  if (host) host.innerHTML = renderSendFeedback()
}
function renderSendFeedback() {
  if (sendFeedback.status === "idle") return ""
  if (sendFeedback.phone && sendFeedback.phone !== state.phone) return '<div class="vc-send-card"><b>Última ação em outra conversa</b><small>Abra a conversa original para acompanhar o estado, ou confira a fila no site.</small><button class="vc-link" data-act="server-queue">Abrir fila no site</button></div>'
  return `<div class="vc-send-card" role="status" aria-live="polite" data-send-state="${esc(sendFeedback.status)}"><b>${esc(SEND_LABELS[sendFeedback.status] || "Estado indisponível")}</b><small>${esc(sendFeedback.detail)}</small>${sendFeedback.jobId ? '<button class="vc-link" data-act="send-status">Atualizar estado</button><button class="vc-link" data-act="server-queue">Abrir fila no site</button>' : ""}${lastQuickKey ? '<button class="vc-link" data-act="new-server-send">Preparar outro envio</button>' : ""}</div>`
}
let jobCheckBusy = false
async function refreshSendStatus() {
  const jobId = sendFeedback.jobId
  const originalPhone = sendFeedback.phone
  if (!jobId || jobCheckBusy || extensionLife.expired) return
  jobCheckBusy = true
  try {
    const result = await api("GET", `/api/crm/quick-replies/jobs/${jobId}`)
    if (sendFeedback.jobId !== jobId) return
    if (result.ok && SEND_LABELS[result.data?.status]) {
      const status = result.data.status
      sendState(status, ["review", "queued", "sending"].includes(status) ? "Acompanhe ou aprove em Envios no servidor. Não é confirmação de entrega." : status === "uncertain" ? "Confira a conversa antes de criar outro envio. Não haverá repetição automática." : "Estado informado pelo conector do servidor.", jobId, originalPhone)
    } else sendState(sendFeedback.status, "Não foi possível atualizar. Confira a fila no site antes de tentar enviar novamente.", jobId, originalPhone)
  } finally { jobCheckBusy = false }
}

// ── Utilidades ───────────────────────────────────────────────────────────────

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
const brl = (n) => (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const fmtDate = (iso) => {
  if (!iso) return "—"
  try { return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" }) } catch { return "—" }
}
const todayPlus = (n) => new Date(Date.now() + n * 864e5).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })

const extensionLife = { expired: false, intervals: new Set(), timers: new Set(), observers: new Set(), pending: new Set(), abort: typeof AbortController === "function" ? new AbortController() : null }
function listenGlobal(target, type, handler, options = {}) {
  if (extensionLife.expired) return
  const opts = typeof options === "boolean" ? { capture: options } : options
  target.addEventListener(type, handler, { ...opts, ...(extensionLife.abort ? { signal: extensionLife.abort.signal } : {}) })
}
function guardedEvent(fn) {
  return event => {
    if (event.type === "submit") event.preventDefault()
    event.stopPropagation?.()
    if (extensionLife.expired) return
    try { Promise.resolve(fn(event)).catch(error => { handleExtensionError(error); if (!extensionLife.expired) toast("Não foi possível concluir esta ação. Tente novamente.") }) }
    catch (error) { handleExtensionError(error) }
  }
}
function cancelLater(id) { globalThis["clearTimeout"](id); extensionLife.timers.delete(id) }
function cancelRepeat(id) { globalThis["clearInterval"](id); extensionLife.intervals.delete(id) }
function repeat(fn, delay) {
  const id = globalThis["setInterval"](() => { if (!extensionLife.expired) void Promise.resolve().then(fn).catch(handleExtensionError) }, delay)
  extensionLife.intervals.add(id); return id
}
function later(fn, delay) {
  const id = globalThis["setTimeout"](() => { extensionLife.timers.delete(id); if (!extensionLife.expired) void Promise.resolve().then(fn).catch(handleExtensionError) }, delay)
  extensionLife.timers.add(id); return id
}
function handleExtensionError(error) {
  if (/context invalidated|extension.*reload/i.test(String(error?.message || error))) invalidateExtension()
}
function invalidateExtension(silent = false) {
  if (extensionLife.expired) return
  extensionLife.expired = true
  extensionLife.abort?.abort()
  for (const cancel of [...extensionLife.pending]) cancel()
  for (const id of extensionLife.intervals) cancelRepeat(id)
  for (const id of extensionLife.timers) cancelLater(id)
  for (const observer of extensionLife.observers) observer.disconnect()
  if (silent) return
  try {
    const banner = document.createElement("div")
    banner.id = "vcrm-reload-notice"
    banner.setAttribute("role", "alert")
    banner.textContent = "VisionSync foi atualizado. Recarregue esta aba do WhatsApp Web para reativar os botões. Seu rascunho não foi enviado."
    document.body.appendChild(banner)
  } catch {}
}
function runtimeMessage(message) {
  if (extensionLife.expired) return Promise.resolve({ ok: false, status: 0, error: "extension_reloaded" })
  return new Promise(resolve => {
    let settled = false, timer = null
    const cancel = () => finish({ ok: false, status: 0, error: "extension_reloaded" })
    const finish = result => { if (!settled) { settled = true; extensionLife.pending.delete(cancel); if (timer) cancelLater(timer); resolve(result || { ok: false, status: 0 }) } }
    const fail = error => { handleExtensionError(error); finish({ ok: false, status: 0, error: extensionLife.expired ? "extension_reloaded" : "runtime_unavailable" }) }
    extensionLife.pending.add(cancel)
    timer = typeof setTimeout === "function" ? later(() => finish({ ok: false, status: 0, error: "runtime_timeout" }), 25000) : null
    try {
      if (!chrome?.runtime || ("id" in chrome.runtime && !chrome.runtime.id)) { invalidateExtension(); return finish({ ok: false, status: 0, error: "extension_reloaded" }) }
      const pending = chrome.runtime.sendMessage(message, response => {
        try { const error = chrome.runtime.lastError; if (error) fail(error); else finish(response) } catch (error) { fail(error) }
      })
      if (pending && typeof pending.then === "function") pending.then(finish, fail)
    } catch (error) { fail(error) }
  })
}
function savePrefs(values) { return runtimeMessage({ type: "prefs-set", values: values || { vcrmPrefs: prefs, vcrmHandled: waitHandled, vcrmHdrHidden: hdrHidden } }) }
const purchaseRequests = new Map()
function api(method, path, body) {
  return new Promise((resolve) => {
    try {
      const purchase = method === "POST" && /\/purchase$/.test(path)
      const signature = purchase ? path + JSON.stringify(body) : null
      let requestKey = signature && purchaseRequests.get(signature)
      if (purchase && !requestKey) { requestKey = crypto.randomUUID(); purchaseRequests.set(signature, requestKey) }
      runtimeMessage({ type: "api", method, path, body, ...(requestKey ? { requestKey } : {}) }).then((r) => {
        if (signature && r?.ok) purchaseRequests.delete(signature)
        resolve(r || { ok: false, status: 0 })
      })
    } catch {
      resolve({ ok: false, status: 0, error: "extension_reloaded" })
    }
  })
}

// Ícones (Lucide, traço)
const ICONS = {
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  note: '<path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8l8-8V5a2 2 0 0 0-2-2h-3"/><path d="M15 21v-6h6"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  checklist: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
  chevron: '<path d="m15 18-6-6 6-6"/>',
  circleminus: '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  panelleft: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
  chevrondown: '<path d="m6 9 6 6 6-6"/>',
  filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>',
  chevronright: '<path d="m9 18 6-6-6-6"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  alarm: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3 2 6"/><path d="m22 6-3-3"/><path d="M6.38 18.7 4 21"/><path d="M17.64 18.67 20 21"/>',
  circlecheck: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  columns: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/>',
  mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>',
  mic_old: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  film: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18"/><path d="M3 7.5h4"/><path d="M3 12h18"/><path d="M3 16.5h4"/><path d="M17 3v18"/><path d="M17 7.5h4"/><path d="M17 16.5h4"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  ext: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  send: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  star: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
  list: '<path d="M3 5h.01"/><path d="M3 12h.01"/><path d="M3 19h.01"/><path d="M8 5h13"/><path d="M8 12h13"/><path d="M8 19h13"/>',
  text: '<path d="M21 6H3"/><path d="M15 12H3"/><path d="M17 18H3"/>',
  paperclip: '<path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  spark: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.45 10.45 0 0 1-1.449 2.59"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
}
const icon = (n, s = 18) =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ""}</svg>`

// Mesmas regras de nomes e variáveis do sistema (server/src/lib/names.ts e quick-reply-vars.ts)
function cleanNameParts(name) {
  if (!name || name === "Cliente WhatsApp") return []
  return name.replace(/[^\p{L}\s]/gu, " ").split(/\s+/).filter((p) => p && !/^clientes?$/i.test(p))
}
const firstName = (n) => cleanNameParts(n)[0] || ""
const fullName = (n) => cleanNameParts(n).join(" ")

function renderVariables(text) {
  const now = new Date()
  const TZ = "America/Sao_Paulo"
  const hour = parseInt(now.toLocaleString("pt-BR", { hour: "2-digit", hour12: false, timeZone: TZ }), 10)
  const greet = hour >= 5 && hour < 12 ? "Bom dia" : hour >= 12 && hour < 18 ? "Boa tarde" : "Boa noite"
  const contactName = (state.contact && state.contact.name) || state.name
  const values = {
    "{primeiro_nome}": firstName(contactName),
    "{nome_completo}": fullName(contactName),
    "{saudacao}": greet,
    "{seu_nome}": (state.myName || "").trim(),
    "{telefone}": state.phone || "",
    "{data_de_hoje}": now.toLocaleDateString("pt-BR", { timeZone: TZ }),
    "{hora_agora}": now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ }),
  }
  let out = text
  let anyEmpty = false
  for (const [token, value] of Object.entries(values)) {
    if (!out.includes(token)) continue
    if (!value) anyEmpty = true
    out = out.split(token).join(value)
  }
  if (anyEmpty) out = out.replace(/[ \t]+([,.!?;:])/g, "$1").replace(/[ \t]{2,}/g, " ")
  return out
}

function chargeMessage(c) {
  const value = brl(c.amount)
  const due = new Date(c.dueDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" })
  const who = firstName(c.contactName)
  const what = c.description && c.description.trim() ? ` (${c.description.trim()})` : ""
  const lines = [`Oi${who ? `, ${who}` : ""}! Passando pra lembrar do pagamento${what} no valor de ${value}, com vencimento em ${due}.`]
  if (c.paymentLink && c.paymentLink.trim()) lines.push("", `Pra pagar: ${c.paymentLink.trim()}`)
  lines.push("", "Qualquer dúvida é só me chamar. Obrigada!")
  return lines.join("\n")
}

/** Converte o campo text de uma resposta SEQUENCE em lista de passos [{ text, delaySec }]. */
function parseSequenceSteps(raw) {
  if (!raw || typeof raw !== "string") return [{ text: "", delaySec: 2 }]
  const t = raw.trim()
  if (t.startsWith("[")) {
    try {
      const arr = JSON.parse(t)
      if (Array.isArray(arr) && arr.length) {
        return arr.map((s) => ({
          text: String((s && s.text) || ""),
          delaySec: Math.max(0, Math.min(60, Number((s && s.delaySec) ?? 2) || 0)),
          quickReplyId: typeof s?.quickReplyId === "string" ? s.quickReplyId : undefined,
        }))
      }
    } catch {}
  }
  const parts = t.split(/\n---\n/).map((p) => p.trim()).filter(Boolean)
  return parts.length ? parts.map((p) => ({ text: p, delaySec: 2 })) : [{ text: t, delaySec: 2 }]
}

/** Gera link para adicionar lembrete/agendamento no Google Agenda (1 clique, estilo HotZapp). */
function googleCalendarUrl({ title, details, dueAt }) {
  const start = new Date(dueAt || Date.now() + 3600e3)
  const end = new Date(start.getTime() + 30 * 60e3)
  const fmt = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title || "Retorno WhatsApp — VisionSync",
    dates: `${fmt(start)}/${fmt(end)}`,
    details: details || "",
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

// ── WhatsApp Web: conversa ativa e campo de mensagem ──────────────────────────

function getActivePhone() {
  const main = document.querySelector("#main")
  if (!main) return null
  for (const el of main.querySelectorAll("[data-id]")) {
    const id = el.getAttribute("data-id") || ""
    if (id.includes("@g.us")) return null // grupo
    const m = id.match(/_(\d+)@c\.us/)
    if (m) return m[1]
  }
  return null
}

// Pede à página (page-bridge.js) a conversa aberta. Devolve {phone, name, dbg} ou null.
let bridgeSeq = 0
function askBridge(kind = "chat", timeoutMs = 1200, arg = null) {
  return new Promise((resolve) => {
    const id = ++bridgeSeq
    const done = (ev) => {
      let d = null
      try { d = JSON.parse(ev.detail) } catch {}
      if (!d || d.id !== id) return
      document.removeEventListener("vcrm-v2-res", done)
      cancelLater(t)
      resolve(d)
    }
    const t = later(() => { document.removeEventListener("vcrm-v2-res", done); resolve(null) }, timeoutMs)
    listenGlobal(document, "vcrm-v2-res", done)
    document.dispatchEvent(new CustomEvent("vcrm-v2-req", { detail: JSON.stringify({ id, kind, arg }) }))
  })
}

/** Telefone da conversa: dados internos (ponte) primeiro; senão o que a página mostra. */
async function resolveChat() {
  const b = await askBridge()
  state.bridgeDbg = b ? b.dbg : { semResposta: true }
  if (b && b.phone === "GROUP") return { phone: null, name: null }
  if (b && b.phone) return { phone: b.phone, name: (b.name || getActiveName() || "").trim() || null, key: b.key || "", lastT: b.lastT || 0, pic: b.pic || document.querySelector("#main header img")?.src || "" }
  // plano B: título do cabeçalho é um número (contato sem nome salvo)
  const nm = getActiveName()
  const only = nm ? nm.replace(/[ ()+\- ]/g, "") : ""
  if (/^[0-9]{10,15}$/.test(only)) return { phone: only, name: nm }
  const legacy = getActivePhone()
  return { phone: legacy, name: nm }
}

function getActiveName() {
  const header = document.querySelector("#main header")
  if (!header) return null
  const titled = header.querySelector("span[title]")
  if (titled && titled.getAttribute("title")) return titled.getAttribute("title").trim()
  const span = header.querySelector("span[dir='auto']")
  return span ? span.textContent.trim() : null
}

function getComposer() {
  return (
    document.querySelector('#main footer div[contenteditable="true"][role="textbox"]') ||
    document.querySelector('#main footer div[contenteditable="true"]')
  )
}

/** Diagnóstico: só a ESTRUTURA da página (números viram 9), nada de texto de conversa. */
function collectDiagnostic() {
  return JSON.stringify({ version: SCRIPT_VERSION, status: state.status, lastSyncAt: state.lastSyncAt || null,
    main: !!document.querySelector("#main"), composer: !!getComposer(), contactResolved: !!state.phone,
    expired: extensionLife.expired, sendStatus: sendFeedback.status,
  }, null, 2)
}

/** Escreve no campo de mensagem (não envia: quem aperta Enter é ela). */
function insertIntoComposer(text) {
  const box = getComposer()
  if (!box) { toast("Abra uma conversa pra usar a mensagem."); return false }
  let ok = false
  try {
    box.focus()
    try {
      const dt = new DataTransfer()
      dt.setData("text/plain", text)
      // paste tratado pelo WhatsApp devolve false (preventDefault).
      ok = !box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }))
    } catch { ok = false }
    if (!ok && typeof document.execCommand === "function") ok = !!document.execCommand("insertText", false, text)
  } catch { ok = false }
  if (ok) return true

  toast("Não consegui escrever no campo. Copie a mensagem manualmente se necessário.")
  try {
    const clipboard = navigator.clipboard
    if (clipboard && typeof clipboard.writeText === "function") {
      const copied = clipboard.writeText(text)
      // Algumas integrações retornam undefined. Não chamar .catch nesse valor
      // nem anunciar uma cópia que não pôde ser confirmada.
      if (copied && typeof copied.then === "function") {
        Promise.resolve(copied).then(
          () => toast("Não consegui escrever no campo. Texto copiado; cole no WhatsApp e revise."),
          () => toast("Não consegui escrever nem copiar. Copie a mensagem manualmente."),
        ).catch(() => {})
      }
    }
  } catch { /* Área de transferência indisponível: manter o aviso de cópia manual. */ }
  return false
}

// ── Interface: raiz, coluna de ícones, painel ────────────────────────────────

const TABS = [
  { id: "conversa", label: "Esta conversa", icon: "user" },
  { id: "notas", label: "Notas", icon: "note" },
  { id: "lembretes", label: "Lembretes", icon: "bell" },
  { id: "cobrancas", label: "Cobranças", icon: "wallet" },
  { id: "respostas", label: "Respostas rápidas", icon: "zap" },
  { id: "importar", label: "Importar do WhatsApp", icon: "download" },
  { id: "aparencia", label: "Aparência", icon: "settings" },
]

function ensureRoot() {
  let root = document.getElementById(ROOT_ID)
  if (root) return root
  root = document.createElement("div")
  root.id = ROOT_ID
  root.addEventListener("click", guardedEvent(onClick), true)
  root.addEventListener("submit", guardedEvent(onSubmit), true)
  root.addEventListener("input", onInput)
  root.addEventListener("change", guardedEvent(onMediaUpload))
  document.body.appendChild(root)
  document.documentElement.classList.add("vcrm-on")
  return root
}

function applyLayout() {
  document.documentElement.style.setProperty("--vcrm-pad", state.open ? `calc(${RAIL_W}px + var(--vcrm-panel-width))` : `${RAIL_W}px`)
}

function toast(msg) {
  state.toast = msg
  const root = document.getElementById(ROOT_ID)
  if (root) {
    let notice = root.querySelector(".vc-toast")
    if (!notice) { notice = document.createElement("div"); notice.className = "vc-toast"; notice.setAttribute("role", "status"); root.appendChild(notice) }
    notice.textContent = msg
  }
  cancelLater(toast.t)
  toast.t = later(() => { state.toast = ""; document.querySelector("#vcrm-root .vc-toast")?.remove() }, 5000)
}

function mediaPicker(id) {
  return `<label>Áudio ou imagem</label><select id="${id}" name="scheduledReplyId"><option value="">Sem anexo</option>${state.replies.filter(r => ["AUDIO", "IMAGE"].includes(r.type) && !r.viewOnce).map(r => `<option value="${esc(r.id)}">${esc(r.name)} (${r.type === "AUDIO" ? "áudio" : "imagem"})</option>`).join("")}</select>
    <p class="vc-muted vc-tiny">Lembrete no navegador: avisa no horário e precisa da sua ação. Para execução automática, use Envios no servidor no site.</p><label class="vc-upload">Anexar arquivo do computador<input type="file" data-upload-picker="${id}" accept=".ogg,.mp3,.jpg,.jpeg,.png,.webp" /></label><small>Até 4 MB. Para áudio, deixe o campo de texto vazio.</small>`
}
let mediaUploadCount = 0
async function uploadReplyFile(file, options = {}) {
  if (!file?.size || file.size > 4 * 1024 * 1024) throw new Error("Escolha um arquivo de até 4 MB.")
  const ext = file.name.split(".").pop().toLowerCase()
  const mime = { ogg: "audio/ogg", mp3: "audio/mpeg", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" }[ext]
  if (!mime) throw new Error("Use áudio OGG/MP3 ou imagem PNG/JPEG/WebP.")
  const mediaType = mime.startsWith("audio/") ? "AUDIO" : "IMAGE"
  if (options.type && options.type !== mediaType) throw new Error("O arquivo não corresponde ao tipo selecionado.")
  mediaUploadCount++
  try {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ""
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  const result = await runtimeMessage({ type: "upload-reply", name: (options.name || file.name).slice(0, 80), mediaType, mime, base64: btoa(binary), caption: mediaType === "IMAGE" ? (options.text || "").slice(0, 1024) : "", asVoiceNote: !!options.asVoiceNote, category: options.category || "", shortcut: options.shortcut || "" })
  if (!result.ok) throw new Error(result.data?.error || (extensionLife.expired ? "Extension context invalidated" : "Não foi possível salvar o arquivo. Confira a conexão."))
  state.replies = [...state.replies.filter(r => r.id !== result.data.id), result.data]
  ensureBar()
  return result.data
  } finally { mediaUploadCount-- }
}
async function onMediaUpload(event) {
  const input = event.target.closest("input[data-upload-picker]")
  if (!input?.files?.[0]) return
  const phone = state.phone, select = document.getElementById(input.dataset.uploadPicker)
  input.disabled = true
  try {
    const reply = await uploadReplyFile(input.files[0])
    if (state.phone === phone && select?.isConnected) {
      const option = document.createElement("option"); option.value = reply.id; option.textContent = reply.name; option.selected = true; select.appendChild(option)
      toast("Anexo carregado e selecionado para o agendamento.")
    } else toast("Arquivo salvo na biblioteca. A conversa mudou; selecione-o no novo agendamento.")
  } catch (error) { handleExtensionError(error); if (!extensionLife.expired) toast(error.message) }
  finally { input.disabled = false }
}

function render() {
  const root = ensureRoot()
  if (state.open && state.tab === "respostas" && rp.form && root.querySelector('form[data-form="rpform"] input[name="replyFile"]')?.files?.length) return
  applyLayout()
  ensureHeaderBar()
  // Coluna fina, só ícones (como a do Hotzapp), com uma linha separando o grupo da conversa do resto
  const openReminders = state.reminders.filter((r) => r.state !== "feito").length
  const rail = TABS.map(
    (t, i) =>
      `<button class="vc-ico ${state.open && state.tab === t.id ? "on" : ""}" data-tab="${t.id}" title="${t.label}">${icon(t.icon, 19)}${t.id === "lembretes" && openReminders ? `<b class="vc-badge-n">${openReminders}</b>` : ""}</button>` +
      (i === 3 ? '<div class="vc-sep"></div>' : "")
  ).join("")

  const active = TABS.find((t) => t.id === state.tab)
  // Se o formulário de resposta está aberto, guarda o que foi digitado e onde estava o cursor,
  // porque a tela se redesenha sozinha de vez em quando (nada do que você digita pode sumir).
  let keep = null
  if (rp.form) {
    syncReplyForm()
    const a = document.activeElement
    if (a && root.contains(a) && a.name) keep = { name: a.name, s: a.selectionStart, e: a.selectionEnd }
  }
  root.innerHTML = `
    <aside class="vc-rail">
      <div class="vc-logo vc-brand-symbol" role="img" aria-label="VisionSync" title="VisionSync">${pluginBrand()}</div>
      ${rail}
      <div class="vc-sep"></div>
      <button class="vc-ico" data-act="kanban" title="Quadro Kanban no WhatsApp">${icon("columns", 19)}</button>
      <button class="vc-ico" data-act="dial" title="Abrir conversa sem salvar número">${icon("phone", 19)}</button>
      <button class="vc-ico ${prefs.blur ? "on" : ""}" data-act="blur" title="Modo Privacidade (borrar nomes e valores)">${icon(prefs.blur ? "eyeoff" : "eye", 19)}</button>
      <button class="vc-ico" data-act="inbox-filters" title="Filtros de conversas" aria-label="Filtros de conversas" aria-expanded="${inboxFiltersOpen}">${icon("filter", 19)}</button>
      ${hdrHidden && state.phone ? `<button class="vc-ico" data-act="schedule-chat" title="Agendar conversa" aria-label="Agendar conversa">${icon("alarm", 19)}</button><button class="vc-ico" data-act="funnel-chat" title="Etapa do funil" aria-label="Etapa do funil">${icon("columns", 19)}</button>` : ""}
      <div class="vc-grow"></div>
      <button class="vc-ico" data-act="web" title="Abrir o painel web">${icon("ext", 19)}</button>
    </aside>
    ${state.open ? `
    <section class="vc-panel">
      <header class="vc-head">
        <div class="vc-title">${esc(active ? active.label : "")}</div><small class="vc-version">v${SCRIPT_VERSION}</small>
        <button class="vc-x" data-act="close" title="Fechar">${icon("x", 18)}</button>
      </header>
      <div class="vc-body"><div class="vc-send-feedback">${renderSendFeedback()}</div>${renderBody()}</div>
    </section>` : ""}
    ${state.toast ? `<div class="vc-toast">${esc(state.toast)}</div>` : ""}
  `
  if (keep) {
    const el = root.querySelector(`[name="${keep.name}"]`)
    if (el) { el.focus(); try { el.setSelectionRange(keep.s, keep.e) } catch {} }
  }
}

function renderBody() {
  if (state.tab === "aparencia") return `<label for="vc-theme">Esquema de cores</label><select id="vc-theme" data-theme-select><option value="dark" ${prefs.theme === "dark" ? "selected" : ""}>Vision escuro</option><option value="light" ${prefs.theme === "light" ? "selected" : ""}>Vision claro</option><option value="minimal" ${prefs.theme === "minimal" ? "selected" : ""}>Vision minimalista</option></select><p class="vc-muted">A preferência também pode ser alterada no ícone da extensão.</p>`
  if (state.status === "no_config") return empty("Extensão não configurada", "Clique no ícone da extensão no Chrome e informe a URL do sistema e o token (gerado em Configurações).")
  if (state.status === "bad_token") return empty("Token inválido", "Gere um token novo em Configurações no painel web e atualize na extensão.")
  if (state.status === "offline") return empty("Sem conexão", "Confira a URL do sistema no ícone da extensão. O sistema precisa estar no ar.")
  if (state.tab === "respostas") return renderReplies()
  if (state.tab === "importar") return renderImport()
  if (!state.phone) return empty("Abra uma conversa", "Escolha uma conversa individual, com mensagens, pra ver os dados da cliente.")
  if (state.status === "loading" && !state.contact) return `<div class="vc-muted">Carregando…</div>`
  if (state.tab === "notas") return renderNotes()
  if (state.tab === "lembretes") return renderReminders()
  if (state.tab === "cobrancas") return renderCharges()
  return renderConversa() + `<button class="vc-link vc-tiny" data-act="ad-copy" title="Lê o que o WhatsApp guarda sobre o anúncio desta conversa">Copiar origem do anúncio (diagnóstico)</button>`
}

const empty = (t, s) => `<div class="vc-empty"><b>${esc(t)}</b><p>${esc(s)}</p><button class="vc-ghost" data-act="diag" style="margin-top:12px">Copiar diagnóstico</button></div>`

// ── Aba: Esta conversa ────────────────────────────────────────────────────────

// ── Origem do anúncio: tudo que o WhatsApp guarda sobre como esta cliente chegou ──
function adFields(a) {
  const f = {}
  if (!a) return f
  Object.assign(f, a.chatKeys || {})
  for (const m of a.mensagens || []) Object.assign(f, m.suspeitos || {})
  return f
}

function adOriginBlock() {
  const a = state.adInfo
  const head = `<div class="vc-sec first">Origem do anúncio</div>`
  if (a === undefined) return `<div class="vc-card ad">${head}<p class="vc-muted">Lendo a conversa…</p></div>`
  const rows = Object.entries(adFields(a)).slice(0, 14)
  const banner = a && a.banner
  const found = rows.length > 0 || !!banner
  return `<div class="vc-card ad">${head}
    ${banner ? `<p class="vc-ad-banner">${esc(banner.texto)}</p>` : ""}
    ${rows.map(([k, v]) => `<div class="vc-ad-row"><span>${esc(k)}</span><b>${esc(String(v))}</b></div>`).join("")}
    ${banner && banner.links && banner.links.length ? `<div class="vc-ad-row"><span>link</span><b>${esc(banner.links[0])}</b></div>` : ""}
    ${found ? "" : `<p class="vc-muted">Não achei dado de anúncio nesta conversa. Pode ser conversa orgânica, ou o começo dela ainda não carregou: role até o topo da conversa e abra de novo.</p>`}
    <button class="vc-link" data-act="ad-copy">Copiar detalhes técnicos</button></div>`
}

async function loadAdInfo(forChat) {
  const r = await askBridge("adinfo", 5000)
  if (state.phone !== forChat) return // trocou de conversa enquanto lia
  state.adInfo = r && !r.erro ? r : null
  if (state.open && state.tab === "conversa") render()
}

function renderConversa() {
  const c = state.contact
  if (!c) return ""
  const name = esc(c.name || state.name || "Cliente")
  const head = `
    <div class="vc-person">
      <div class="vc-avatar">${avatarPreview.phone === state.phone && avatarPreview.url ? `<img src="${esc(avatarPreview.url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">` : esc((fullName(c.name || state.name) || "?").slice(0, 1).toUpperCase())}</div>
      <div><div class="vc-name">${name}</div><div class="vc-sub">${esc(state.phone)}</div></div>
    </div>`

  if (!c.found) {
    return `${head}
      <div class="vc-card">
        <p class="vc-muted">Esta cliente ainda não está no CRM.</p>
        <button class="vc-btn" data-act="add-contact">${icon("plus", 15)} Adicionar ao CRM</button>
      </div>
      ${purchaseForm()}`
  }

  const s = c.stats
  const applied = c.lists || []
  const ids = new Set(applied.map((l) => l.id))
  const chips = applied.map((l) => `<span class="vc-chip" style="--c:${esc(l.color)}">${esc(l.name)}<button data-remove-list="${esc(l.id)}" title="Tirar da lista">×</button></span>`).join("")
  const free = state.lists.filter((l) => !ids.has(l.id))
  const d = (state.detail && state.detail.contact) || c
  const SOURCES = { anuncio: "Anúncio", organico: "Orgânico", indicacao: "Indicação", outro: "Outro" }
  const LIFECYCLES = { assinante: "Assinante", lead: "Lead", mql: "MQL (Qualificado)", sql: "SQL (Oportunidade)", oportunidade: "Em Negociação", cliente: "Cliente", evangelista: "VIP / Promotor" }
  const LEAD_STATUS = { novo: "Novo", em_atendimento: "Em atendimento", aguardando: "Aguardando retorno", qualificado: "Qualificado", sem_interesse: "Sem interesse" }
  const DEAL_STAGES = { aberto: "Em negociação", ganho: "Ganho (Fechado)", perdido: "Perdido" }
  const curLifecycle = (d && d.lifecycleStage) || (s.count > 0 ? "cliente" : "lead")
  const curLeadStatus = (d && d.leadStatus) || "novo"
  const curDealStage = (d && d.dealStage) || ((d && d.dealValue) ? "aberto" : "aberto")
  const nextStepDay = d && d.nextStepAt ? String(d.nextStepAt).slice(0, 10) : ""

  return `${head}
    <div class="vc-tags">${chips || `<span class="vc-muted">Em nenhuma lista</span>`}</div>
    <div class="vc-add">
      <button class="vc-btn" data-act="toggle-lists">${icon("plus", 15)} Adicionar à lista</button>
      <div class="vc-menu" id="vc-listmenu" hidden>
        ${free.map((l) => `<button data-add-list="${esc(l.id)}"><i style="background:${esc(l.color)}"></i>${esc(l.name)}</button>`).join("") || `<div class="vc-muted pad">Nenhuma lista livre</div>`}
        <form class="vc-newlist" data-form="newlist"><input name="name" placeholder="Nova lista" maxlength="60" /><button class="vc-btn sm">Criar</button></form>
      </div>
    </div>

    <div class="vc-badges">
      <span class="vc-badge">${esc(s.tierLabel)}</span>
      <span class="vc-badge">${esc(LIFECYCLES[curLifecycle] || "Lead")}</span>
      <span class="vc-badge">${esc(LEAD_STATUS[curLeadStatus] || "Novo")}</span>
      ${s.cadenceLabel ? `<span class="vc-badge gold">${esc(s.cadenceLabel)}</span>` : ""}
      ${d && d.source ? `<span class="vc-badge">${esc(SOURCES[d.source] || d.source)}</span>` : ""}
    </div>

    <div class="vc-stats">
      <div><b>${s.count}</b><span>compras</span></div>
      <div><b>${brl(s.totalSpent)}</b><span>total</span></div>
      <div><b>${s.daysSinceLast == null ? "—" : s.daysSinceLast + "d"}</b><span>última</span></div>
    </div>

    ${purchaseForm()}

    <form class="vc-card" data-form="lead-deal">
      <div class="vc-sec first">Negócio &amp; Dados HubSpot</div>
      <label class="rp-l">Oportunidade / Negócio</label>
      <div class="vc-grid2">
        <input name="dealTitle" placeholder="Ex.: Pacote Anual" maxlength="120" value="${esc((d && d.dealTitle) || "")}" />
        <input name="dealValue" type="number" step="0.01" min="0" placeholder="Valor R$" value="${d && d.dealValue != null ? esc(d.dealValue) : ""}" />
      </div>
      <select name="dealStage" class="vc-select">
        ${Object.entries(DEAL_STAGES).map(([k, lbl]) => `<option value="${k}" ${curDealStage === k ? "selected" : ""}>Status do negócio: ${lbl}</option>`).join("")}
      </select>
      <label class="rp-l">Próximo passo (Follow-up)</label>
      <div class="vc-grid2">
        <input name="nextStep" placeholder="Ex.: Enviar proposta" maxlength="200" value="${esc((d && d.nextStep) || "")}" />
        <input name="nextStepAt" type="date" value="${esc(nextStepDay)}" />
      </div>
      <label class="rp-l">Qualificação (HubSpot)</label>
      <div class="vc-grid2">
        <select name="lifecycleStage" class="vc-select">
          ${Object.entries(LIFECYCLES).map(([k, lbl]) => `<option value="${k}" ${curLifecycle === k ? "selected" : ""}>${lbl}</option>`).join("")}
        </select>
        <select name="leadStatus" class="vc-select">
          ${Object.entries(LEAD_STATUS).map(([k, lbl]) => `<option value="${k}" ${curLeadStatus === k ? "selected" : ""}>${lbl}</option>`).join("")}
        </select>
      </div>
      <div class="vc-grid2">
        <select name="source" class="vc-select">
          <option value="">Origem: Não informada</option>
          ${Object.entries(SOURCES).map(([k, lbl]) => `<option value="${k}" ${(d && d.source) === k ? "selected" : ""}>Origem: ${lbl}</option>`).join("")}
        </select>
        <input name="birthDate" type="date" title="Data de nascimento" value="${esc((d && d.birthDate) || "")}" />
      </div>
      <input name="email" type="email" placeholder="E-mail da cliente (opcional)" value="${esc((d && d.email) || "")}" />
      <button class="vc-btn">${icon("check", 15)} Salvar dados do lead</button>
      <div class="vc-note" data-msg="lead-deal"></div>
    </form>

    <div class="vc-sec">Histórico</div>
    ${c.purchases.length ? c.purchases.slice(0, 15).map((p) => `
      <div class="vc-row"><div><b>${esc(p.productName || "Compra")}</b><span>${fmtDate(p.purchasedAt)}</span></div><em>${brl(p.amount)}</em></div>`).join("") : `<p class="vc-muted">Nenhuma compra registrada.</p>`}
  `
}

function purchaseForm() {
  return `
    <form class="vc-card" data-form="purchase">
      <div class="vc-sec first">Registrar compra</div>
      <input name="amount" type="number" step="0.01" min="0" placeholder="Valor (R$)" required />
      <input name="product" type="text" placeholder="Produto ou serviço (opcional)" />
      <button class="vc-btn">${icon("check", 15)} Registrar compra</button>
      <div class="vc-note" data-msg="purchase"></div>
    </form>`
}

// ── Aba: Notas ────────────────────────────────────────────────────────────────

function renderNotes() {
  const notes = (state.detail && state.detail.notes) || []
  return `
    <form class="vc-card" data-form="note">
      <textarea name="text" rows="3" maxlength="2000" placeholder="Escreva uma anotação sobre esta cliente…"></textarea>
      <button class="vc-btn">${icon("plus", 15)} Adicionar nota</button>
      <div class="vc-note" data-msg="note"></div>
    </form>
    ${notes.length ? notes.map((n) => `
      <div class="vc-card note"><div class="vc-sub">${esc(new Date(n.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }))}</div><p>${esc(n.text)}</p></div>`).join("") : `<p class="vc-muted">Nenhuma nota ainda.</p>`}
  `
}

// ── Aba: Importar do WhatsApp ─────────────────────────────────────────────────

const imp = { phase: "idle", scan: null, result: null, msg: "", done: 0, total: 0, withoutLabel: false, archived: true, onlyNew: true, known: new Set(), selected: new Set() }

const importPhone = (phone) => {
  const digits = String(phone || "").replace(/\D/g, "").replace(/^0+/, "")
  return digits.length === 10 || digits.length === 11 ? "55" + digits : digits
}

/** Conversas que vão entrar, já só com as etiquetas escolhidas (e, no modo "só novos", sem quem já está no CRM). */
function importable() {
  const s = imp.scan
  if (!s) return []
  const out = []
  for (const c of s.chats) {
    if (!imp.archived && c.archived) continue
    if (imp.onlyNew && imp.known.has(importPhone(c.phone))) continue
    const mine = c.labels.filter((l) => imp.selected.has(l))
    if (mine.length) out.push({ ...c, labels: mine })
    else if (imp.withoutLabel) out.push({ ...c, labels: [] }) // sem etiqueta, ou só com etiquetas não escolhidas
  }
  return out
}

function renderImport() {
  const s = imp.scan
  const box = (inner) => `<div class="vc-card">${inner}</div>`
  if (imp.phase === "scanning") return box(`<p class="vc-muted">Lendo o seu WhatsApp… pode levar alguns segundos.</p>`)
  if (imp.phase === "importing") {
    const pct = imp.total ? Math.round((imp.done / imp.total) * 100) : 0
    return box(`<b style="color:#fff">Importando… ${imp.done} de ${imp.total}</b><div class="vc-bar"><i style="width:${pct}%"></i></div><p class="vc-muted">Não feche esta aba do WhatsApp.</p>`)
  }
  if (imp.phase === "done" && imp.result) {
    const r = imp.result
    return box(`<b style="color:#fff">Pronto!</b>
      <p class="vc-muted">${r.created} contatos novos${r.existing ? `, ${r.existing} já estavam no CRM (não mexi)` : ""}${r.updated ? `, ${r.updated} atualizados` : ""}, ${r.listsCreated} listas criadas, ${r.memberships} ligações às listas.${r.skipped ? ` ${r.skipped} sem telefone válido foram pulados.` : ""}</p>
      <p class="vc-muted">Agora abra o painel web, em <b>Configurações</b>, e ligue cada lista ao pixel dela.</p>
      <button class="vc-ghost" data-act="imp-reset">Ler de novo</button>`)
  }
  if (imp.phase === "ready" && s) {
    const list = importable()
    const withLabel = s.chats.filter((c) => c.labels.length).length
    const noLabel = s.chats.length - withLabel
    const counts = new Map()
    for (const c of s.chats) for (const l of c.labels) counts.set(l, (counts.get(l) || 0) + 1)
    const names = [...new Set([...s.labels.map((l) => l.name), ...counts.keys()])]
    const already = s.chats.filter((c) => imp.known.has(importPhone(c.phone))).length
    return box(`<b style="color:#fff">Encontrei no seu WhatsApp</b>
      <p class="vc-muted">${s.labels.length} etiquetas · ${s.chats.length} conversas com telefone (${s.chats.length - already} novas, ${already} já estão no CRM)${s.semTelefone ? ` · ${s.semTelefone} sem telefone descoberto (não entram)` : ""}${s.grupos ? ` · ${s.grupos} grupos ignorados` : ""}.</p>
      <label class="vc-check"><input type="checkbox" data-imp-opt="onlyNew" ${imp.onlyNew ? "checked" : ""}/> <span>Só contatos novos (não mexe em quem já está no CRM)</span></label>
      <div class="vc-sec first">Quais etiquetas importar?</div>
      <div class="vc-quick"><button class="vc-ghost" data-act="imp-all">Marcar todas</button><button class="vc-ghost" data-act="imp-none">Desmarcar todas</button></div>
      <div class="vc-labels">${names.length ? names.map((n) => `<label class="vc-check"><input type="checkbox" data-imp-label="${esc(n)}" ${imp.selected.has(n) ? "checked" : ""}/> <span>${esc(n)}</span> <em>${counts.get(n) || 0}</em></label>`).join("") : `<p class="vc-muted">Nenhuma etiqueta encontrada.</p>`}</div>
      <label class="vc-check"><input type="checkbox" data-imp-opt="withoutLabel" ${imp.withoutLabel ? "checked" : ""}/> <span>Também as conversas sem etiqueta</span> <em>${noLabel}</em></label>
      <label class="vc-check"><input type="checkbox" data-imp-opt="archived" ${imp.archived ? "checked" : ""}/> <span>Incluir conversas arquivadas</span></label>
      <button class="vc-btn" data-act="imp-go" ${list.length ? "" : "disabled"}>${icon("download", 15)} Importar ${list.length} contatos</button>
      <button class="vc-ghost" data-act="imp-diag">Copiar diagnóstico da leitura</button>`)
  }
  return box(`<b style="color:#fff">Trazer seus contatos pro CRM</b>
    <p class="vc-muted">Lê as suas etiquetas (viram listas), os contatos e o estado das conversas (respondida, não lida, arquivada). Só copia pro SEU CRM. Nada é enviado nem alterado no WhatsApp.</p>
    ${imp.msg ? `<div class="vc-note">${esc(imp.msg)}</div>` : ""}
    <button class="vc-btn" data-act="imp-scan">${icon("download", 15)} Ler meu WhatsApp</button>
    ${imp.scan ? `<button class="vc-ghost" data-act="imp-diag">Copiar diagnóstico da leitura</button>` : ""}`)
}

async function importScan() {
  imp.phase = "scanning"; imp.msg = ""; render()
  const r = await askBridge("scan", 20000)
  if (!r || !r.chats) {
    imp.phase = "idle"
    imp.msg = "Não consegui ler o WhatsApp. Aperte F5 e tente de novo."
    imp.scan = r || { dbg: { semResposta: true }, labels: [], chats: [] }
    return render()
  }
  imp.scan = r
  const known = await api("GET", "/api/crm/import")
  if (!known.ok || !known.data || !Array.isArray(known.data.phones)) {
    imp.phase = "idle"
    imp.msg = "Não consegui verificar os contatos do CRM. Atualize o servidor e tente novamente."
    return render()
  }
  imp.known = new Set(known.data.phones)
  imp.selected = new Set([...r.labels.map((l) => l.name), ...r.chats.flatMap((c) => c.labels)]) // começa com todas marcadas
  imp.phase = r.chats.length ? "ready" : "idle"
  if (!r.chats.length) imp.msg = "Não achei conversas pra importar. Clique em \"Copiar diagnóstico da leitura\" e me mande."
  render()
}

async function importGo() {
  const list = importable()
  const used = new Set(list.flatMap((c) => c.labels))
  const labels = imp.scan.labels.filter((l) => used.has(l.name))
  imp.phase = "importing"; imp.done = 0; imp.total = list.length
  imp.result = { existing: 0, created: 0, updated: 0, skipped: 0, listsCreated: 0, memberships: 0 }
  render()
  const BATCH = 250
  for (let i = 0; i < list.length; i += BATCH) {
    const res = await api("POST", "/api/crm/import", { labels, contacts: list.slice(i, i + BATCH), onlyNew: imp.onlyNew })
    if (!res.ok || !res.data) {
      imp.phase = "idle"
      imp.msg = `Parou em ${imp.done} de ${imp.total}: ${(res.data && res.data.error) || "erro de conexão"}. Pode clicar de novo, o que já entrou não duplica.`
      return render()
    }
    for (const k of Object.keys(imp.result)) imp.result[k] += res.data[k] || 0
    imp.done = Math.min(list.length, i + BATCH)
    render()
  }
  imp.phase = "done"
  state.replies = []; state.lists = []
  render()
}

// ── Aba: Lembretes ────────────────────────────────────────────────────────────

const whenFmt = (iso) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })

function tomorrow9() {
  const d = new Date(Date.now() + 864e5)
  d.setHours(9, 0, 0, 0)
  const p = (n) => String(n).padStart(2, "0")
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes())
}

function renderReminders() {
  const mine = state.reminders
  return `
    <form class="vc-card" data-form="reminder">
      <div class="vc-sec first">Lembrete com mensagem preparada</div>
      <input name="text" maxlength="300" placeholder="O que lembrar? Ex.: cobrar o pacote" required />
      <textarea name="scheduledMessage" rows="2" maxlength="2000" placeholder="Mensagem para revisar no horário (opcional — usa variáveis como {primeiro_nome})"></textarea>
      ${mediaPicker("reminder-media")}
      <input name="at" type="datetime-local" value="${tomorrow9()}" required />
      <div class="vc-actions">
        <button class="vc-btn">${icon("plus", 15)} Agendar</button>
        <button type="button" class="vc-ghost" data-act="gcal-form" title="Abrir no Google Agenda">${icon("calendar", 14)} + Google Agenda</button>
      </div>
      <div class="vc-note" data-msg="reminder"></div>
    </form>
    ${mine.length ? mine.map((r) => `
      <div class="vc-card charge ${r.state === "atrasado" ? "vencida" : ""}">
        <div class="vc-row flat"><div><b>${esc(r.text)}</b><span>${whenFmt(r.dueAt)}${r.snoozeCount ? " · adiado " + r.snoozeCount + "×" : ""}</span></div><span class="vc-badge ${r.state === "atrasado" ? "vencida" : r.state === "hoje" ? "pendente" : "cancelada"}">${r.state === "atrasado" ? "Atrasado" : r.state === "hoje" ? "Hoje" : "Próximo"}</span></div>
        ${r.scheduledMessage ? `<div class="vc-sched-msg"><small>Mensagem preparada para o lembrete:</small><p>${esc(r.scheduledMessage)}</p></div>` : ""}
        <div class="vc-actions">
          ${r.scheduledMessage || r.scheduledReplyId ? `<button class="vc-btn sm" data-rem-send="${esc(r.id)}">${icon("send", 13)} ${prefs.sendDirect ? "Solicitar envio" : "Preparar para revisão"}</button>` : ""}
          <button class="vc-btn sm" data-rem-done="${esc(r.id)}">Feito</button>
          <button class="vc-ghost" data-rem-snooze="${esc(r.id)}:1h">+1h</button>
          <button class="vc-ghost" data-rem-snooze="${esc(r.id)}:amanha">Amanhã</button>
          <button class="vc-ghost" data-gcal-rem="${esc(r.id)}" title="Adicionar ao Google Agenda">${icon("calendar", 13)}</button>
        </div>
      </div>`).join("") : `<p class="vc-muted">Nenhum lembrete aberto para esta cliente.</p>`}
  `
}

// ── Aba: Cobranças ────────────────────────────────────────────────────────────

function renderCharges() {
  const mine = state.charges.filter((c) => state.contact && c.contactId === state.contact.contactId)
  const label = { vencida: "Vencida", pendente: "A receber", paga: "Paga", cancelada: "Cancelada" }
  return `
    <form class="vc-card" data-form="charge">
      <div class="vc-sec first">Nova cobrança</div>
      <input name="amount" type="number" step="0.01" min="0" placeholder="Valor (R$)" required />
      <input name="due" type="date" value="${todayPlus(3)}" required />
      <input name="desc" type="text" maxlength="200" placeholder="Descrição (opcional)" />
      <input name="link" type="text" maxlength="1000" placeholder="Link de pagamento ou Pix (opcional)" />
      <button class="vc-btn">${icon("plus", 15)} Criar cobrança</button>
      <div class="vc-note" data-msg="charge"></div>
    </form>
    ${mine.length ? mine.map((c) => `
      <div class="vc-card charge ${c.state}">
        <div class="vc-row flat"><div><b>${brl(c.amount)}</b><span>${esc(c.description || "Sem descrição")} · vence ${fmtDate(c.dueDate)}</span></div><span class="vc-badge ${c.state}">${label[c.state]}</span></div>
        ${c.state === "pendente" || c.state === "vencida" ? `
        <div class="vc-actions">
          <button class="vc-ghost" data-charge-send="${esc(c.id)}">${icon("send", 14)} Cobrar</button>
          <button class="vc-btn sm" data-charge-pay="${esc(c.id)}">Marcar paga</button>
          <button class="vc-ghost" data-charge-cancel="${esc(c.id)}">Cancelar</button>
        </div>` : ""}
      </div>`).join("") : `<p class="vc-muted">Nenhuma cobrança para esta cliente.</p>`}
  `
}

// ── Aba: Respostas rápidas ────────────────────────────────────────────────────

const TYPE_ICON = { TEXT: "text", CONTACT: "user", AUDIO: "paperclip", IMAGE: "paperclip", VIDEO: "paperclip", DOCUMENT: "paperclip", SEQUENCE: "list" }

function matchReplies(q) {
  const s = q.trim().toLowerCase()
  const list = state.replies.filter((r) => !s || r.name.toLowerCase().includes(s) || (r.shortcut || "").toLowerCase().includes(s) || (r.text || "").toLowerCase().includes(s))
  return list.sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.usageCount - a.usageCount)
}

// ── Aba: Respostas rápidas (cópia do painel do Hotzapp, tudo dentro da conversa) ──

const rp = { form: null, prefsOpen: false, msg: "" }
const catName = (r) => r.category || "Sem categoria"
const VAR_CHIPS = [["{primeiro_nome}", "Primeiro nome"], ["{nome_completo}", "Nome completo"], ["{saudacao}", "Saudação"], ["{seu_nome}", "Seu nome"], ["{telefone}", "Telefone"], ["{data_de_hoje}", "Data de hoje"], ["{hora_agora}", "Hora agora"]]

let librarySyncBusy = false
async function loadReplies() {
  const res = await api("GET", "/api/crm/quick-replies")
  if (res.ok && Array.isArray(res.data)) { state.replies = res.data; state.lastSyncAt = new Date().toISOString(); return true }
  return false
}
async function syncReplyLibrary(manual = false) {
  if (librarySyncBusy || extensionLife.expired || (!manual && document.hidden)) return
  librarySyncBusy = true
  try {
    const loaded = await loadReplies()
    if (loaded) { ensureBar(); if (state.tab === "respostas" && state.open && !rp.form) render() }
    if (manual) toast(loaded ? "Respostas atualizadas." : "Não foi possível atualizar. A biblioteca anterior foi mantida.")
  } finally { librarySyncBusy = false }
}

function openReplyForm(init) {
  state.open = true
  state.tab = "respostas"
  const baseSteps = init && init.type === "SEQUENCE" ? parseSequenceSteps(init.text) : [{ text: (init && init.text) || "", delaySec: 2 }, { text: "", delaySec: 3 }]
  rp.form = { mode: "new", type: "TEXT", id: null, name: "", category: "", shortcut: "", text: "", contactName: "", contactPhone: "", steps: baseSteps, ...init }
  rp.msg = ""
  render()
}

/** Guarda o que foi digitado, pra não se perder ao trocar de tipo. */
function syncReplyForm() {
  const form = document.querySelector("#vcrm-root form[data-form='rpform']")
  if (!form || !rp.form) return
  const fd = new FormData(form)
  for (const k of ["name", "category", "shortcut", "text", "contactName", "contactPhone"]) if (fd.has(k)) rp.form[k] = String(fd.get(k))
  if (rp.form.type === "SEQUENCE") {
    const texts = [...form.querySelectorAll("[data-seq-text]")].map((el) => el.value)
    const delays = [...form.querySelectorAll("[data-seq-delay]")].map((el) => Math.max(0, Math.min(60, parseInt(el.value, 10) || 0)))
    if (texts.length) {
      const media = [...form.querySelectorAll("[data-seq-media]")].map(el => el.value)
      rp.form.steps = texts.map((t, i) => ({ text: t, delaySec: delays[i] ?? 2, ...(media[i] ? { quickReplyId: media[i] } : {}) }))
    }
  }
}

function rpCard(r) {
  const compact = prefs.compact
  const acts = `<span class="rp-actions">
      <button data-rp-act="send" data-rp-id="${esc(r.id)}" title="Enviar">${icon("send", 14)}</button>
      <button data-rp-act="dup" data-rp-id="${esc(r.id)}" title="Duplicar">${icon("copy", 14)}</button>
      <button data-rp-act="edit" data-rp-id="${esc(r.id)}" title="Editar">${icon("pencil", 14)}</button>
      <button data-rp-act="del" data-rp-id="${esc(r.id)}" title="Excluir">${icon("trash", 14)}</button></span>`
  const star = `<button class="rp-star ${r.favorite ? "on" : ""}" data-rp-act="fav" data-rp-id="${esc(r.id)}" title="Favorita">${icon("star", 15)}</button>`
  const tile = `<span class="rp-tile t-${r.type}">${icon(TYPE_ICON[r.type] === "paperclip" ? BAR_ICON[r.type] || "file" : TYPE_ICON[r.type] || "text", 15)}</span>`
  if (compact) {
    return `<div class="rp-card compact">${tile}<b class="rp-name">${esc(r.name)}</b>${acts}<em>${r.usageCount}×</em>${star}</div>`
  }
  const preview =
    r.type === "TEXT" ? esc((r.text || "").slice(0, 120))
    : r.type === "SEQUENCE" ? esc(`Sequência com ${parseSequenceSteps(r.text).length} passos`)
    : ""
  return `<div class="rp-card">${tile}
    <div class="rp-main"><b class="rp-name">${esc(r.name)}${r.shortcut ? ` <code>;${esc(r.shortcut)}</code>` : ""}</b>
      ${preview ? `<div class="rp-preview">${preview}</div>` : ""}
      <div class="rp-meta">${r.category ? `<span class="rp-cat" style="--h:${catHue(r.category)}">${esc(r.category)}</span>` : ""}<em>usada ${r.usageCount}×</em></div></div>
    ${star}${acts}</div>`
}

function renderReplies() {
  if (rp.form) return renderReplyForm()
  const q = state.repliesQuery.trim().toLowerCase()
  const list = state.replies.filter((r) => !q || r.name.toLowerCase().includes(q) || (r.shortcut || "").toLowerCase().includes(q) || (r.text || "").toLowerCase().includes(q) || catName(r).toLowerCase().includes(q))
  const groups = new Map()
  for (const r of list) { const c = catName(r); if (!groups.has(c)) groups.set(c, []); groups.get(c).push(r) }
  const position = name => state.replies.find(reply => catName(reply) === name)?.categoryPosition ?? 9999
  const cats = [...groups.keys()].sort((a, b) => (a === "Sem categoria" ? 1 : b === "Sem categoria" ? -1 : position(a) - position(b)))

  const prefsBox = rp.prefsOpen ? `<div class="vc-card rp-prefs">
      <div class="vc-sec first">Preferências</div>
      <div class="rp-line"><span>Estilo dos chips</span><span class="rp-seg"><button type="button" data-rp-act="style-icon" class="${prefs.chipStyle === "icon" ? "on" : ""}">Ícone</button><button type="button" data-rp-act="style-color" class="${prefs.chipStyle === "color" ? "on" : ""}">Colorido</button></span></div>
      <label class="vc-check"><input type="checkbox" data-pref="sendDirect" ${prefs.sendDirect ? "checked" : ""}/> <span>Enviar agora ao clicar</span></label>
    </div>` : ""

  return `<div class="vc-send-modes" role="group" aria-label="Modo de envio"><button data-rp-act="mode-review" aria-pressed="${!prefs.sendDirect}">Preparar para revisão</button><button data-rp-act="mode-send" aria-pressed="${!!prefs.sendDirect}">Enviar agora</button></div><p class="vc-muted vc-tiny">${prefs.sendDirect ? "Clicar em uma resposta solicita o envio. Sequências executam todos os passos." : "Clicar prepara a resposta. Sequências não enviam neste modo."}</p><button class="vc-link vc-tiny" data-rp-act="sync">Atualizar respostas</button><small class="vc-library-sync">${state.lastSyncAt ? "Sincronizado às " + new Date(state.lastSyncAt).toLocaleTimeString("pt-BR") : "Biblioteca ainda não sincronizada"}</small><div class="rp-top">
      <div class="rp-search"><input class="vc-search" data-search placeholder="Buscar mensagem…" value="${esc(state.repliesQuery)}" /></div>
      <button class="vc-btn" data-rp-act="new">${icon("plus", 14)} Nova</button>
    </div>
    <div class="rp-sub"><span>Na conversa, comece com <code>;</code> e escolha uma.</span>
      <span class="rp-tools"><button data-rp-act="compact" class="${prefs.compact ? "on" : ""}" title="Lista compacta">${icon("list", 16)}</button><button data-rp-act="prefs" class="${rp.prefsOpen ? "on" : ""}" title="Preferências">${icon("settings", 16)}</button></span></div>
    ${prefsBox}
    ${rp.msg ? `<div class="vc-note">${esc(rp.msg)}</div>` : ""}
    ${cats.length ? cats.map((c) => {
      const closed = !!(prefs.collapsed && prefs.collapsed[c])
      const items = groups.get(c)
      return `<div class="rp-cat-head" data-rp-act="toggle" data-rp-cat="${esc(c)}"><i style="background:${esc(state.replies.find(reply => catName(reply) === c)?.categoryColor || `hsl(${catHue(c)} 60% 55%)`)}"></i><b>${esc(c.toUpperCase())}</b><span>(${items.length})</span><em>${icon(closed ? "chevronright" : "chevrondown", 14)}</em></div>${closed ? "" : items.map(rpCard).join("")}`
    }).join("") : `<p class="vc-muted">${state.replies.length ? "Nenhuma resposta encontrada." : "Você ainda não tem respostas rápidas. Clique em + Nova pra criar a primeira."}</p>`}`
}

function renderReplyForm() {
  const f = rp.form
  const isEdit = f.mode === "edit"
  const cats = [...new Set(state.replies.map((r) => r.category).filter(Boolean))]
  const steps = Array.isArray(f.steps) && f.steps.length ? f.steps : parseSequenceSteps(f.text)
  const typeLabel = ({ TEXT: "mensagem de texto", AUDIO: "mensagem de áudio", IMAGE: "imagem", CONTACT: "cartão de contato", SEQUENCE: "sequência de mensagens" })[f.type] || "resposta rápida"
  return `<form class="vc-card rp-form" data-form="rpform">
    <div class="vc-sec first">${isEdit ? "Editar" : "Nova"} ${typeLabel}</div>
    ${isEdit ? "" : `<div class="rp-seg wide">
        <button type="button" data-rp-act="type-TEXT" class="${f.type === "TEXT" ? "on" : ""}">Texto</button>
        <button type="button" data-rp-act="type-SEQUENCE" class="${f.type === "SEQUENCE" ? "on" : ""}">Sequência</button>
        <button type="button" data-rp-act="type-AUDIO" class="${f.type === "AUDIO" ? "on" : ""}">Áudio</button><button type="button" data-rp-act="type-IMAGE" class="${f.type === "IMAGE" ? "on" : ""}">Imagem</button><button type="button" data-rp-act="type-CONTACT" class="${f.type === "CONTACT" ? "on" : ""}">Contato</button>
      </div>
      <p class="vc-hint">Texto, áudio e imagem podem ser criados aqui. Vídeo e documento: use o painel web.</p>`}
    <label class="rp-l">Nome <b>*</b></label>
    <input name="name" maxlength="80" placeholder="Como você vai achar essa mensagem depois" value="${esc(f.name)}" required />
    <label class="rp-l">Categoria <span>· só você vê (opcional)</span></label>
    <input name="category" maxlength="40" list="rp-cats" placeholder="Ex.: Orçamentos" value="${esc(f.category)}" />
    <datalist id="rp-cats">${cats.map((c) => `<option value="${esc(c)}"></option>`).join("")}</datalist>
    ${f.type === "TEXT" ? `
      <label class="rp-l">Mensagem <b>*</b></label>
      <textarea name="text" rows="6" maxlength="4096" placeholder="Digite sua mensagem aqui…" required>${esc(f.text)}</textarea>
      <div class="rp-vars">${VAR_CHIPS.map(([t, l]) => `<button type="button" data-rp-var="${esc(t)}">${esc(l)}</button>`).join("")}</div>
      <p class="vc-hint">Clique pra inserir. O cliente recebe tudo preenchido.</p>`
    : ["AUDIO", "IMAGE"].includes(f.type) ? `
      <label class="rp-l">Arquivo (até 4 MB)</label><input type="file" name="replyFile" accept="${f.type === "AUDIO" ? ".ogg,.mp3" : ".png,.jpg,.jpeg,.webp"}" required />
      ${f.type === "IMAGE" ? `<label>Legenda</label><textarea name="text" maxlength="1024">${esc(f.text || "")}</textarea>` : `<label><input type="checkbox" name="asVoiceNote" /> Nota de voz (OGG/Opus e conector do servidor)</label>`}
    ` : f.type === "SEQUENCE" ? `
      <label class="rp-l">Passos do roteiro / sequência <b>*</b></label>
      ${steps.map((st, idx) => `
        <div class="vc-seq-step">
          <div class="vc-seq-head">
            <b>Passo ${idx + 1}</b>
            <label>Aguardar <input type="number" data-seq-delay="${idx}" min="0" max="60" value="${esc(st.delaySec ?? 2)}" /> seg</label>
            ${steps.length > 1 ? `<button type="button" class="vc-link" data-rp-act="seq-del" data-rp-id="${idx}">Remover</button>` : ""}
          </div>

          <select data-seq-media="${idx}"><option value="">Somente texto</option>${state.replies.filter(r => ["AUDIO", "IMAGE"].includes(r.type) && !r.viewOnce).map(r => `<option value="${esc(r.id)}" ${st.quickReplyId === r.id ? "selected" : ""}>${esc(r.name)} (${esc(r.type)})</option>`).join("")}</select>
          <textarea data-seq-text="${idx}" rows="3" maxlength="1500" placeholder="Mensagem do passo ${idx + 1} (aceita {primeiro_nome}, {saudacao}…)">${esc(st.text)}</textarea>
        </div>
      `).join("")}
      <button type="button" class="vc-ghost" data-rp-act="seq-add">${icon("plus", 14)} Adicionar passo na sequência</button>`
    : `
      <label class="rp-l">Nome do contato <b>*</b></label>
      <input name="contactName" maxlength="100" value="${esc(f.contactName)}" required />
      <label class="rp-l">Telefone do contato <b>*</b></label>
      <input name="contactPhone" maxlength="30" placeholder="11 99999-8888" value="${esc(f.contactPhone)}" required />`}
    <label class="rp-l">Atalho <span>· opcional, digite ; e o atalho na conversa</span></label>
    <input name="shortcut" maxlength="30" placeholder="ex.: pix" value="${esc(f.shortcut)}" />
    <div class="vc-note">${esc(rp.msg)}</div>
    <div class="vc-actions"><button type="button" class="vc-ghost" data-rp-act="cancel">Cancelar</button><button class="vc-btn">Salvar</button></div>
  </form>`
}

async function onReplyAction(act, id, btn) {
  const r = id ? state.replies.find((x) => x.id === id) : null
  if (act === "mode-review" || act === "mode-send") { prefs.sendDirect = act === "mode-send"; savePrefs(); ensureBar(); return render() }
  if (act === "sync") return syncReplyLibrary(true)
  if (act === "new") return window.open(state.apiUrl + "/dashboard/respostas?nova=1", "_blank", "noopener,noreferrer")
  if (act === "cancel") { rp.form = null; rp.msg = ""; return render() }
  if (act === "compact") { prefs.compact = !prefs.compact; savePrefs(); return render() }
  if (act === "prefs") { rp.prefsOpen = !rp.prefsOpen; return render() }
  if (act === "style-icon" || act === "style-color") { prefs.chipStyle = act === "style-icon" ? "icon" : "color"; savePrefs(); ensureBar(); return render() }
  if (act === "toggle") {
    const c = btn.getAttribute("data-rp-cat")
    prefs.collapsed = prefs.collapsed || {}
    prefs.collapsed[c] = !prefs.collapsed[c]
    savePrefs()
    return render()
  }
  if (act.startsWith("type-")) { syncReplyForm(); rp.form.type = act.slice(5); return render() }
  if (act === "seq-add") {
    syncReplyForm()
    rp.form.steps = [...(rp.form.steps || []), { text: "", delaySec: 2 }]
    return render()
  }
  if (act === "seq-del") {
    syncReplyForm()
    const idx = parseInt(id, 10)
    if (Array.isArray(rp.form.steps) && rp.form.steps.length > 1) rp.form.steps.splice(idx, 1)
    return render()
  }
  if (!r) return
  if (act === "send") return useReply(r)
  if (act === "fav") {
    r.favorite = !r.favorite
    render()
    const res = await api("PATCH", `/api/crm/quick-replies/${r.id}`, { favorite: r.favorite })
    if (!res.ok) { r.favorite = !r.favorite; toast("Não consegui favoritar."); render() }
    ensureBar()
    return
  }
  if (act === "dup") {
    const res = await api("POST", `/api/crm/quick-replies/${r.id}/duplicate`)
    if (!res.ok) return toast((res.data && res.data.error) || "Não consegui duplicar.")
    await loadReplies(); ensureBar(); render()
    return toast("Duplicada.")
  }
  if (act === "edit") {
    if (r.type !== "TEXT" && r.type !== "CONTACT" && r.type !== "SEQUENCE") return toast("Pra editar áudio, imagem, vídeo ou documento, use o painel web.")
    return openReplyForm({ mode: "edit", id: r.id, type: r.type, name: r.name, category: r.category || "", shortcut: r.shortcut || "", text: r.text || "", contactName: r.contactName || "", contactPhone: r.contactPhone || "", steps: r.type === "SEQUENCE" ? parseSequenceSteps(r.text) : undefined })
  }
  if (act === "del") {
    if (!confirm(`Excluir a resposta "${r.name}"?`)) return
    const res = await api("DELETE", `/api/crm/quick-replies/${r.id}`)
    if (!res.ok) return toast("Não consegui excluir.")
    state.replies = state.replies.filter((x) => x.id !== r.id)
    ensureBar(); render()
    toast("Excluída.")
  }
}

async function submitReplyForm(form) {
  if (mediaUploadCount) return toast("Aguarde o arquivo terminar de carregar.")
  syncReplyForm()
  const f = rp.form
  if (["AUDIO", "IMAGE"].includes(f.type)) {
    try {
      const file = form.querySelector('input[name="replyFile"]')?.files?.[0]
      await uploadReplyFile(file, { name: f.name.trim(), category: f.category.trim(), shortcut: f.shortcut.trim(), type: f.type, text: f.text, asVoiceNote: !!form.querySelector('input[name="asVoiceNote"]')?.checked })
      rp.form = null; render(); toast("Resposta rápida salva nos favoritos.")
    } catch (error) { handleExtensionError(error); if (!extensionLife.expired) toast(error.message) }
    return
  }
  const body = { name: f.name.trim(), category: f.category.trim() || null, shortcut: f.shortcut.trim() || null }
  if (f.type === "TEXT") body.text = f.text
  else if (f.type === "SEQUENCE") {
    const cleanSteps = (f.steps || []).map((s) => ({ text: String(s.text || "").trim(), delaySec: Math.max(0, Math.min(60, Number(s.delaySec) || 0)), ...(s.quickReplyId ? { quickReplyId: s.quickReplyId } : {}) })).filter((s) => s.text || s.quickReplyId)
    if (!cleanSteps.length) { rp.msg = "Escreva pelo menos 1 passo na sequência."; return render() }
    body.text = JSON.stringify(cleanSteps)
  }
  else { body.contactName = f.contactName; body.contactPhone = f.contactPhone }
  if (f.mode === "new") body.type = f.type
  rp.msg = "Salvando…"
  render()
  const res = f.mode === "edit"
    ? await api("PATCH", `/api/crm/quick-replies/${f.id}`, body)
    : await api("POST", "/api/crm/quick-replies", body)
  if (!res.ok) { rp.msg = (res.data && res.data.error) || "Não consegui salvar."; return render() }
  rp.form = null
  rp.msg = ""
  await loadReplies()
  ensureBar()
  render()
  toast("Resposta salva.")
}

function replyPreview(r) {
  if (r.type === "TEXT") return (r.text || "").slice(0, 90)
  if (r.type === "SEQUENCE") return `Sequência (${parseSequenceSteps(r.text).length} mensagens)`
  if (r.type === "CONTACT") return `Cartão de contato: ${r.contactName || ""}`
  return r.mediaName ? `Arquivo: ${r.mediaName}` : "Anexo"
}

/** Usa uma resposta: texto, contato, sequência com delay (HotZapp) ou anexos. */
let replyBusy = false
const quickSendRequests = new Map()
async function useReply(r, options = {}) {
  if (extensionLife.expired) return false
  if (replyBusy) { toast("Aguarde a resposta atual terminar."); return false }
  replyBusy = true
  if (!(r.type === "AUDIO" && r.asVoiceNote)) lastQuickKey = null
  try {
    const direct = options.sendDirect ?? !!prefs.sendDirect
    if (direct && !(r.type === "AUDIO" && r.asVoiceNote) && String(getComposer()?.textContent || "").replace(/\u200b/g, "").trim()) {
      sendState("blocked", "Há texto no campo de mensagem. Revise, envie ou limpe o rascunho antes de usar Enviar agora. Nada foi acrescentado.")
      toast("Revise o texto já digitado antes de solicitar outro envio.")
      return false
    }
    sendState("preparing", "Nenhuma confirmação de entrega ainda.")
    return await runReply(r, direct)
  }
  catch (error) { handleExtensionError(error); if (!extensionLife.expired) { sendState("failed", "Confira a conversa antes de tentar novamente."); toast("Não foi possível preparar a resposta. Tente novamente.") }; return false }
  finally { if (sendFeedback.status === "preparing") sendState("failed", "Operação interrompida. Confira a conversa antes de tentar novamente."); replyBusy = false }
}
async function runReply(r, direct = !!prefs.sendDirect) {
  if (extensionLife.expired) return false
  if (r.type === "SEQUENCE") {
    if (!direct) {
      sendState("prepared", "Sequência não iniciada. Escolha Enviar agora para executar seus passos e intervalos.")
      toast("Sequência não enviada. Ative Enviar agora para iniciar o roteiro.")
      return false
    }
    const steps = parseSequenceSteps(r.text).filter((s) => s.text.trim() || s.quickReplyId)
    if (!steps.length) { sendState("failed", "Esta sequência está vazia."); return false }
    if (!getComposer()) { sendState("failed", "Abra uma conversa para iniciar o roteiro."); return false }
    api("POST", `/api/crm/quick-replies/${r.id}/use`)
    const phone = state.phone
    for (let i = 0; i < steps.length; i++) {
      const st = steps[i]
      if (st.delaySec > 0) {
        toast(`Sequência "${r.name}": passo ${i + 1}/${steps.length} em ${st.delaySec}s…`)
        await new Promise((res) => later(res, st.delaySec * 1000))
      } else {
        toast(`Sequência "${r.name}": enviando passo ${i + 1}/${steps.length}…`)
      }
      if (extensionLife.expired || state.phone !== phone) { sendState("canceled", "A conversa mudou. A sequência parou; confira os passos já solicitados."); toast("Sequência interrompida: a conversa mudou."); return false }
      if (st.quickReplyId) {
        const media = state.replies.find(reply => reply.id === st.quickReplyId && ["AUDIO", "IMAGE"].includes(reply.type))
        if (!media) { sendState("failed", "Mídia não encontrada. Sequência interrompida; confira os passos anteriores."); toast("Mídia do roteiro não encontrada. Atualize a biblioteca."); return false }
        const sent = await attachFile({ ...media, ...(media.type === "IMAGE" && st.text ? { text: st.text } : {}) }, direct)
        if (!sent) return false
        continue
      }
      if (String(getComposer()?.textContent || "").replace(/\u200b/g, "").trim()) {
        sendState("uncertain", "Ainda há texto no campo. Sequência interrompida para evitar juntar duas mensagens; confira a conversa.")
        return false
      }
      const msg = renderVariables(st.text)
      if (!insertIntoComposer(msg)) { sendState("failed", "A sequência parou na preparação de um passo. Confira a conversa antes de repetir."); return false }
      await new Promise((res) => later(res, 180))
      if (!await clickSend(2000, false, phone)) { sendState("uncertain", "Sequência interrompida. Confira a conversa antes de repetir."); toast("Não confirmei o envio. Sequência interrompida."); return false }
      await new Promise((res) => later(res, 350))
    }
    sendState("requested", `${steps.length} solicitações de envio executadas. Confira a conversa; entrega não confirmada pelo plugin.`)
    toast("Sequência executada. Confira a conversa para confirmar os envios.")
    return true
  }
  if (r.type === "TEXT" || r.type === "CONTACT") {
    const targetPhone = state.phone
    const text = r.type === "TEXT" ? renderVariables(r.text || "") : `${r.contactName || ""}: ${r.contactPhone || ""}`.trim()
    if (!insertIntoComposer(text)) { sendState("failed", "A resposta não foi inserida. Confira o campo de mensagem."); return false }
    api("POST", `/api/crm/quick-replies/${r.id}/use`)
    // "Enviar agora ao clicar": igual ao Hotzapp, clicar na resposta já envia
    if (direct) {
      await new Promise((res) => later(res, 150))
      if (extensionLife.expired || state.phone !== targetPhone) { sendState("canceled", "A conversa mudou. Nenhum novo envio foi solicitado."); return false }
      const requested = await clickSend(1500, false, targetPhone)
      sendState(requested ? "requested" : "uncertain", requested ? "Confira a conversa. O clique no botão não confirma entrega." : "Não foi possível confirmar a ação. Confira a conversa antes de repetir.")
      return requested
    }
    sendState("prepared", "A resposta está no campo de mensagem. Revise e envie pelo WhatsApp.")
    return false
  }
  if (["IMAGE", "VIDEO", "DOCUMENT", "AUDIO"].includes(r.type)) return attachFile(r, direct)
  toast("Este tipo de resposta ainda não funciona pela extensão.")
}

function fileApi(path) {
  return runtimeMessage({ type: "file", path })
}

/**
 * Coloca o arquivo da resposta rápida na conversa, como se você tivesse colado ele no campo
 * de mensagem. O WhatsApp abre a tela de pré-visualização; a legenda é escrita nela e QUEM
 * ENVIA É VOCÊ (Enter). Áudio entra como arquivo de áudio, ainda não como "gravado na hora".
 */
async function attachFile(r, direct = !!prefs.sendDirect) {
  const box = getComposer()
  if (!box) { toast("Abra uma conversa pra usar esta resposta."); return }
  const targetPhone = state.phone
  if (r.type === "AUDIO" && r.asVoiceNote) {
    const key = `${r.id}:${targetPhone}`
    lastQuickKey = key
    if (!quickSendRequests.has(key)) quickSendRequests.set(key, crypto.randomUUID())
    const result = await api("POST", `/api/crm/quick-replies/${r.id}/send`, { phone: targetPhone, requestId: quickSendRequests.get(key), approved: !!direct })

    if (!result.ok) { sendState(result.status ? "failed" : "uncertain", result.status ? "O servidor recusou a preparação. Confira o conector e o destinatário autorizado." : "A conexão caiu. Confira a fila do servidor antes de repetir."); toast(result.data?.error || "Nota de voz exige conector no servidor conectado e destinatário autorizado."); return false }
    sendState(SEND_LABELS[result.data?.status] ? result.data.status : (direct ? "queued" : "review"), "A nota de voz usa o conector. Acompanhe em Envios no servidor; o lembrete continua aberto.", result.data?.id || null)
    toast("Nota de voz preparada no servidor. Acompanhe o estado na fila.")
    // A queued request is not a confirmed browser send; do not complete a reminder or continue a sequence.
    return false
  }
  toast("Carregando o arquivo…")
  const res = await fileApi(`/api/crm/quick-replies/${r.id}/file`)
  if (extensionLife.expired || state.phone !== targetPhone || getComposer() !== box) { if (!extensionLife.expired) toast("Conversa mudou. Arquivo não anexado."); return false }
  if (!res.ok || !res.base64) { toast("Não consegui baixar o arquivo. Confira a conexão."); return }
  let file
  try {
    const bin = atob(res.base64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    file = new File([bytes], r.mediaName || "arquivo", { type: r.mediaMime || res.mime || "application/octet-stream" })
  } catch { toast("O arquivo veio com defeito."); return }

  box.focus()
  let handled = false
  try {
    const dt = new DataTransfer()
    dt.items.add(file)
    handled = !box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }))
  } catch { handled = false }
  if (!handled) {
    const input = [...document.querySelectorAll('#main input[type="file"]')].find(input => !input.accept || input.accept.includes(file.type) || (r.type === "IMAGE" && /image/.test(input.accept)) || (r.type === "AUDIO" && /audio/.test(input.accept)))
    if (input) { try { const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true })); handled = true } catch {} }
  }
  if (!handled) { toast("O WhatsApp não aceitou o anexo. Abra o clipe de anexos e tente novamente; nenhum envio foi confirmado."); return false }

  api("POST", `/api/crm/quick-replies/${r.id}/use`)
  // legenda: o WhatsApp abre a pré-visualização com o foco na legenda
  const caption = r.type === "AUDIO" || !r.text ? "" : renderVariables(r.text)
  if (direct) {
    // espera a pré-visualização abrir, escreve a legenda e envia (igual ao Hotzapp)
    await new Promise((res) => later(res, 1200))
    if (caption) { const editor = document.querySelector('[role="dialog"] [contenteditable="true"]'); if (!editor) { toast("Confira a prévia e escreva a legenda antes de enviar."); return false } editor.focus(); try { document.execCommand("insertText", false, caption) } catch {} await new Promise((res) => later(res, 300)) }
    if (extensionLife.expired || state.phone !== targetPhone) return false
    const sent = await clickSend(5000, true, targetPhone)
    toast(sent ? "Envio solicitado ao WhatsApp." : "Arquivo preparado. Confira e envie; a sequência não continuará sozinha.")
    sendState(sent ? "requested" : "uncertain", sent ? "Envio solicitado. Confira a conversa para confirmar o resultado." : "Confira a prévia e a conversa antes de repetir o envio.")
    return sent
  }
  if (caption) later(() => { const editor = document.querySelector('[role="dialog"] [contenteditable="true"]'); if (editor && state.phone === targetPhone) { editor.focus(); try { document.execCommand("insertText", false, caption) } catch {} } }, 1200)
  sendState("prepared", "Arquivo anexado. Revise a prévia e envie pelo WhatsApp.")
  toast(r.type === "AUDIO" ? "Áudio colocado. Confira e envie." : "Arquivo colocado. Confira a legenda e envie.")
}

/** Tem uma janela (modal) aberta no WhatsApp ou em outra extensão? Então a gente não cobre ela. */
function modalOpen() {
  try {
    return !!document.querySelector('[role="dialog"], [aria-modal="true"], [data-animate-modal-popup="true"], [data-animate-modal-body="true"]')
  } catch { return false }
}

// ── Aviso: "N clientes esperam sua resposta" ─────────────────────────────────

const WAIT_ID = "vcrm-wait"
const WAIT_MIN_MINUTES = 1 // avisa assim que a cliente espera há 1 minuto
const WAIT_MAX_HOURS = 72 // e ignora o que é mais velho que 3 dias
let waitSnoozeUntil = 0
let waitList = []
let waitHandled = {} // conversa -> hora da última mensagem que você marcou como "já resolvi"

// A foto da cliente: se a imagem falhar em carregar, volta pra inicial do nome
listenGlobal(document, "error", (e) => {
  const img = e.target
  if (img && img.tagName === "IMG" && img.dataset && img.dataset.ini !== undefined) {
    const s = document.createElement("span")
    s.className = "vw-av"
    s.textContent = img.dataset.ini
    img.replaceWith(s)
  }
}, true)

const waitFmt = (mins) => (mins >= 1440 ? Math.floor(mins / 1440) + " d" : mins >= 60 ? Math.floor(mins / 60) + " h" : mins + " min")

function renderWaiting() {
  let el = document.getElementById(WAIT_ID)
  const hide = !waitList.length || Date.now() < waitSnoozeUntil || state.status === "no_config" || state.status === "bad_token" || modalOpen()
  if (hide) { if (el) el.remove(); return }
  if (!el) {
    el = document.createElement("div")
    el.id = WAIT_ID
    el.addEventListener("click", guardedEvent(async (e) => {
      const open = e.target.closest("[data-wait-open]")
      if (open) {
        const r = await askBridge("open", 3000, open.getAttribute("data-wait-open"))
        if (!r || !r.opened) toast("Não consegui abrir sozinho. Procure o nome na lista de conversas.")
        return
      }
      const done = e.target.closest("[data-wait-done]")
      if (done) {
        const w = waitList.find((x) => x.key === done.getAttribute("data-wait-done"))
        if (w) {
          waitHandled[w.key] = w.lastT
          savePrefs({ vcrmHandled: waitHandled }).catch(() => {})
          waitList = waitList.filter((x) => x.key !== w.key)
          renderWaiting()
        }
        return
      }
      const act = e.target.closest("[data-wait-act]")
      if (!act) return
      if (act.getAttribute("data-wait-act") === "later") { waitSnoozeUntil = Date.now() + 30 * 60000; renderWaiting() }
      if (act.getAttribute("data-wait-act") === "panel" && state.apiUrl) window.open(state.apiUrl + "/dashboard/painel", "_blank")
    }))
    document.body.appendChild(el)
  }
  const shown = waitList.slice(0, 8)
  const more = waitList.length - shown.length
  const html = `
    <b>${waitList.length} ${waitList.length === 1 ? "cliente espera" : "clientes esperam"} sua resposta</b>
    <p>Clique no nome para abrir a conversa.</p>
    ${shown.map((w) => `
      <div class="vw-line">
        <button class="vw-row" data-wait-open="${esc(w.key)}">
          ${w.pic ? `<img class="vw-av" src="${esc(w.pic)}" data-ini="${esc((w.name || "?").trim().slice(0, 1).toUpperCase())}" alt="" />` : `<span class="vw-av">${esc((w.name || "?").trim().slice(0, 1).toUpperCase())}</span>`}
          <span class="vw-tx"><b>${esc(w.name)}</b><small>${esc(w.preview)}</small></span>
          <span class="vw-time ${w.mins >= 180 ? "late" : w.mins < 60 ? "ok" : ""}">${waitFmt(w.mins)}</span>
        </button>
        <button class="vw-done" data-wait-done="${esc(w.key)}" title="Já resolvi (volta a avisar se ela mandar outra mensagem)">${icon("check", 14)}</button>
      </div>`).join("")}
    ${more > 0 ? `<p class="vw-more">e mais ${more}</p>` : ""}
    <div class="vw-foot"><button data-wait-act="panel">Abrir o Painel do Dia</button><button data-wait-act="later">Agora não</button></div>`
  if (el.dataset.sig !== html) { el.innerHTML = html; el.dataset.sig = html }
}

/** Plano B da foto: pega a que o WhatsApp já mostra na lista de conversas, achando pelo nome. */
function photoFromList(name) {
  if (!name) return ""
  try {
    const side = document.querySelector("#pane-side")
    if (!side) return ""
    for (const t of side.querySelectorAll("span[title]")) {
      if (t.getAttribute("title") !== name) continue
      const row = t.closest('[role="listitem"], [role="row"], [data-testid="cell-frame-container"]') || t.parentElement?.parentElement?.parentElement
      const img = row && row.querySelector("img[src^='https:'], img[src^='blob:']")
      if (img) return img.getAttribute("src") || ""
    }
  } catch {}
  return ""
}

async function checkWaiting() {
  if (!document.querySelector("#app")) return
  const r = await askBridge("waiting", 5000, { minMinutes: WAIT_MIN_MINUTES, maxHours: WAIT_MAX_HOURS })
  ensureHeaderBar()
  if (r && Array.isArray(r.waiting)) {
    waitList = r.waiting.filter((w) => !(waitHandled[w.key] >= w.lastT))
    for (const w of waitList) if (!w.pic) w.pic = photoFromList(w.name)
  }
  renderWaiting()
}

// ── Botões no cabeçalho da conversa: agendar, encerrar, funil (cópia do desenho do Hotzapp) ──

const HDR_ID = "vcrm-hdr"
const HPOP_ID = "vcrm-hpop"
let hdrPop = null // "sched" | "funnel" | null
let hdrHidden = false // "Deixar só na barrinha": esconde os botões do cabeçalho

/** Onde termina o NOME da conversa (os botões ficam logo depois dele, como no Hotzapp). */
function titleEnd(header) {
  const t = header.querySelector("span[dir='auto'][title]") || header.querySelector("span[title]") || header.querySelector("span[dir='auto']")
  if (!t) return null
  const box = t.getBoundingClientRect()
  let right = box.right
  try {
    const range = document.createRange()
    range.selectNodeContents(t)
    const text = range.getBoundingClientRect()
    if (text.width > 0) right = Math.min(right, text.right) // nome curto: encosta no texto; nome cortado: no fim da caixa
  } catch {}
  return right
}

function ensureHeaderBar() {
  const header = document.querySelector("#main header")
  let el = document.getElementById(HDR_ID)
  const off = !header || !state.phone || state.status === "no_config" || state.status === "bad_token" || modalOpen() || hdrHidden
  if (off) {
    if (el) el.style.display = "none"
    if (hdrPop && (!hdrHidden || !state.phone || modalOpen())) { hdrPop = null; renderHdrPop() }
    return
  }
  if (!el) {
    el = document.createElement("div")
    el.id = HDR_ID
    el.addEventListener("click", (e) => {
      const b = e.target.closest("button")
      if (!b) return
      if (b.dataset.h === "end") return endConversation()
      toggleHdrPop(b.dataset.h)
    })
    document.body.appendChild(el)
  }
  el.style.display = ""
  const cur = ((state.contact && state.contact.lists) || [])[0]
  const pill = cur
    ? `<button class="vh-pill on" data-h="funnel" title="Etapa do funil">${icon("columns", 15)}<i style="background:${esc(cur.color)}"></i><span>${esc(cur.name)}</span>${icon("chevrondown", 13)}</button>`
    : `<button class="vh-pill" data-h="funnel" title="Adicionar ao funil">${icon("columns", 15)}<span>+ Funil</span></button>`
  const html =
    `<button class="vh-round" data-h="sched" title="Agendar conversa">${icon("alarm", 17)}</button>` +
    `<button class="vh-round" data-h="end" title="Encerrar conversa">${icon("circlecheck", 17)}</button>` + pill
  if (el.dataset.sig !== html) { el.innerHTML = html; el.dataset.sig = html }

  const r = header.getBoundingClientRect()
  const end = titleEnd(header)
  const maxLeft = r.right - 330 - el.offsetWidth // não invade os ícones do próprio WhatsApp
  const left = Math.max(r.left + 120, Math.min(end == null ? r.left + 260 : end + 14, maxLeft))
  el.style.top = Math.round(r.top + (r.height - 36) / 2) + "px"
  el.style.left = Math.round(left) + "px"
  el.style.right = "auto"
  if (hdrPop) renderHdrPop()
}

function toggleHdrPop(kind) {
  hdrPop = hdrPop === kind ? null : kind
  renderHdrPop()
}

function schedPresets() {
  const now = new Date()
  const at = (days, h) => { const d = new Date(now); d.setDate(d.getDate() + days); d.setHours(h, 0, 0, 0); return d }
  return [
    ["Daqui 1 hora", new Date(now.getTime() + 3600e3)],
    ["Hoje às 18h", at(0, 18)],
    ["Amanhã 9h", at(1, 9)],
    ["Em 3 dias", at(3, 9)],
    ["Semana que vem", at(7, 9)],
  ].filter(([, d]) => d.getTime() > now.getTime() + 60e3)
}

function renderHdrPop() {
  let pop = document.getElementById(HPOP_ID)
  const bar = document.getElementById(HDR_ID)
  const side = document.querySelector(`#${ROOT_ID} [data-act="${hdrPop === "sched" ? "schedule-chat" : "funnel-chat"}"]`)
  const anchor = !hdrHidden && bar && bar.style.display !== "none" ? bar : side
  if (!hdrPop || !anchor) { if (pop) pop.remove(); return }
  if (!pop) {
    pop = document.createElement("div")
    pop.id = HPOP_ID
    pop.addEventListener("click", guardedEvent(onHdrPopClick), true)
    pop.addEventListener("submit", guardedEvent(onHdrPopSubmit), true)
    pop.addEventListener("change", guardedEvent(onMediaUpload))
    document.body.appendChild(pop)
  }
  const r = anchor.getBoundingClientRect()
  pop.style.top = Math.max(8, Math.min(Math.round(r.bottom + 8), window.innerHeight - Math.min(pop.offsetHeight || 400, window.innerHeight - 16) - 8)) + "px"
  pop.style.left = Math.max(8, Math.min(Math.round(anchor === side ? r.right + 8 : r.left), window.innerWidth - Math.min(300, window.innerWidth - 16) - 8)) + "px"
  pop.style.right = "auto"
  pop.classList.toggle("funnel", hdrPop === "funnel")

  let html = ""
  if (hdrPop === "sched") {
    html = `<b>Agendar conversa / mensagem</b>
      <input id="vh-text" maxlength="300" placeholder="Lembrete (opcional). Ex.: cobrar o pacote" />
      <textarea id="vh-msg" rows="2" maxlength="2000" placeholder="Mensagem para revisar no horário (opcional)…"></textarea>
      ${mediaPicker("vh-media")}
      <div class="vh-chips">${schedPresets().map(([l, d]) => `<button data-sched="${d.toISOString()}">${esc(l)}</button>`).join("")}</div>
      <form data-hform="sched">
        <input id="vh-at" type="datetime-local" value="${tomorrow9()}" required />
        <button class="vc-btn sm">Agendar</button>
        <button type="button" class="vc-ghost" data-fact="gcal-sched" title="Adicionar ao Google Agenda">${icon("calendar", 14)}</button>
      </form>`
  } else {
    const cur = ((state.contact && state.contact.lists) || [])[0]
    html = `<div class="vf-head"><b>Etapa do funil, no seu CRM</b><span>Escolha em que ponto da venda esta conversa está.</span></div>
      <div class="vf-sep"></div>
      ${state.lists.length ? state.lists.map((l) => `<button class="vf-row" data-stage="${esc(l.id)}"><i style="background:${esc(l.color)}"></i><span>${esc(l.name)}</span>${cur && cur.id === l.id ? icon("check", 16) : ""}</button>`).join("") : `<p class="vf-empty">Você ainda não tem etapas. Crie abaixo.</p>`}
      <form class="vf-new" data-hform="newlist"><input name="name" placeholder="Nova etapa" maxlength="60" /><button class="vc-btn sm">Criar</button></form>
      <div class="vf-sep"></div>
      <button class="vf-row" data-fact="kanban">${icon("columns", 16)}<span>Abrir Kanban aqui no WhatsApp</span></button>
      <button class="vf-row" data-fact="out" ${cur ? "" : "disabled"}>${icon("circleminus", 16)}<span>Tirar do funil</span></button>
      <button class="vf-row" data-fact="config">${icon("settings", 16)}<span>Configurar funil no Painel Web</span></button>
      <div class="vf-sep"></div>
      <button class="vf-row" data-fact="hide">${icon("panelleft", 16)}<span>${hdrHidden ? "Mostrar no cabeçalho" : "Deixar só na barrinha"}</span></button>`
  }
  // No agendamento NÃO redesenha enquanto está aberto (senão o que você digitou se apaga); no funil, só se mudar.
  const sigKey = hdrPop === "sched" ? "sched" : hdrPop + html
  if (pop.dataset.sig !== sigKey) { pop.innerHTML = html; pop.dataset.sig = sigKey }
  // sempre dentro da tela: se não coubrer embaixo, sobe
  const maxTop = window.innerHeight - pop.offsetHeight - 12
  if (parseInt(pop.style.top, 10) > maxTop) pop.style.top = Math.max(8, Math.round(maxTop)) + "px"
}

async function setStage(listId) {
  const id = await ensureContact()
  if (!id) return toast("Não consegui salvar esta cliente.")
  const cur = ((state.contact && state.contact.lists) || [])[0]
  if (cur && cur.id === listId) return
  const res = cur
    ? await api("POST", "/api/crm/funnel/move", { contactId: id, fromListId: cur.id, toListId: listId })
    : await api("POST", "/api/crm/contact/tags", { phone: state.phone, name: state.name || undefined, listId, action: "add" })
  if (!res.ok) return toast("Não consegui mudar a etapa.")
  hdrPop = null // fecha o menu depois de escolher (como no Hotzapp)
  renderHdrPop()
  await refresh(true)
}

async function leaveFunnel() {
  const lists = (state.contact && state.contact.lists) || []
  for (const l of lists) await api("POST", "/api/crm/contact/tags", { phone: state.phone, listId: l.id, action: "remove" })
  hdrPop = null
  await refresh(true)
  renderHdrPop()
  toast("Tirei esta conversa do funil.")
}

async function onHdrPopClick(e) {
  const b = e.target.closest("button")
  if (!b || b.disabled) return
  if (b.dataset.sched) {
    const t = document.getElementById("vh-text")
    const m = document.getElementById("vh-msg")
    return scheduleChat(new Date(b.dataset.sched), t ? t.value : "", m ? m.value : "", document.getElementById("vh-media")?.value || null)
  }
  if (b.dataset.stage) return setStage(b.dataset.stage)
  const act = b.dataset.fact
  if (act === "kanban") { hdrPop = null; renderHdrPop(); return openKanbanModal() }
  if (act === "gcal-sched") {
    const t = (document.getElementById("vh-text") && document.getElementById("vh-text").value) || `Voltar a falar com ${(state.contact && state.contact.name) || state.name || state.phone}`
    const m = (document.getElementById("vh-msg") && document.getElementById("vh-msg").value) || ""
    const atVal = document.getElementById("vh-at") && document.getElementById("vh-at").value
    const dueAt = atVal ? new Date(atVal).toISOString() : new Date(Date.now() + 3600e3).toISOString()
    window.open(googleCalendarUrl({ title: `${t} (${(state.contact && state.contact.name) || state.name || state.phone})`, details: m ? `Mensagem agendada:\n${m}` : `Telefone: ${state.phone}`, dueAt }), "_blank")
    return
  }
  if (act === "out") return leaveFunnel()
  if (act === "config") { if (state.apiUrl) window.open(state.apiUrl + "/dashboard/funil", "_blank"); return }
  if (act === "hide") {
    hdrHidden = !hdrHidden
    savePrefs({ vcrmHdrHidden: hdrHidden }).catch(() => {})
    hdrPop = null
    renderHdrPop()
    ensureHeaderBar()
    render()
    toast(hdrHidden ? "Agendar e Funil agora ficam na barra lateral." : "Botões de volta no cabeçalho.")
  }
}

async function onHdrPopSubmit(e) {
  e.preventDefault()
  const form = e.target.closest("form[data-hform]")
  if (!form) return
  if (form.dataset.hform === "sched") {
    const v = document.getElementById("vh-at").value
    const d = new Date(v)
    if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) return toast("Escolha um horário no futuro.")
    const t = document.getElementById("vh-text")
    const m = document.getElementById("vh-msg")
    return scheduleChat(d, t ? t.value : "", m ? m.value : "", document.getElementById("vh-media")?.value || null)
  }
  const name = String(new FormData(form).get("name") || "").trim()
  if (!name) return
  const res = await api("POST", "/api/crm/lists", { name })
  if (res.ok && res.data) { state.lists.push(res.data); await setStage(res.data.id) }
}

async function scheduleChat(due, text, scheduledMessage = "", scheduledReplyId = null) {
  if (mediaUploadCount) return toast("Aguarde o anexo terminar de carregar antes de agendar.")
  const id = await ensureContact()
  if (!id) return toast("Não consegui salvar esta cliente.")
  const label = (text || "").trim() || `Voltar a falar com ${firstName((state.contact && state.contact.name) || state.name) || "a cliente"}`
  const msgClean = (scheduledMessage || "").trim() || null
  const res = await api("POST", "/api/crm/reminders", { contactId: id, text: label, scheduledMessage: msgClean, scheduledReplyId, dueAt: due.toISOString() })
  if (!res.ok) return toast((res.data && res.data.error) || "Não consegui agendar.")
  hdrPop = null
  renderHdrPop()
  toast("Agendado para " + whenFmt(due.toISOString()))
  refresh(true)
  refreshInboxData()
}

/** Encerrar: some do aviso "clientes esperam sua resposta" até a cliente escrever de novo. */
function endConversation() {
  if (!state.chatKey) return toast("Não consegui identificar esta conversa.")
  waitHandled[state.chatKey] = state.lastT || Date.now()
  savePrefs({ vcrmHandled: waitHandled }).catch(() => {})
  waitList = waitList.filter((x) => x.key !== state.chatKey)
  renderWaiting()
  toast("Conversa encerrada. Ela some do aviso até a cliente escrever de novo.")
}

// ── Barra de respostas acima do campo + atalho ";" ───────────────────────────

const BAR_ICON = { TEXT: "text", CONTACT: "user", AUDIO: "mic", IMAGE: "image", VIDEO: "film", DOCUMENT: "file", SEQUENCE: "play" }

// ── Preferências da barra (como a engrenagem do Hotzapp) ──
const prefs = { sendDirect: true, chipStyle: "icon", barMin: false, barCat: null, compact: false, collapsed: {}, blur: false, theme: "dark" }
function pluginBrand() {
  return '<img src="' + chrome.runtime.getURL('brand/icon.png') + '" alt="" />'
}
function applyPluginTheme(theme) {
  prefs.theme = ["light", "minimal"].includes(theme) ? theme : "dark"
  document.documentElement.dataset.vcrmTheme = prefs.theme
}

/** Cor estável por categoria (a categoria é só um texto; a cor sai do nome). */
function catHue(name) {
  let h = 0
  for (const ch of String(name || "")) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}

/** Botão de enviar do WhatsApp (no campo ou na pré-visualização de arquivo). */
function findSendButton() {
  const el = document.querySelector('button[aria-label="Enviar"], [role="button"][aria-label="Enviar"], span[data-icon="send"], span[data-icon="wds-ic-send-filled"], [data-icon="send"]')
  return el ? el.closest('button, [role="button"]') || el : null
}

/** Clica em enviar assim que o botão existir (espera até `timeoutMs`). Sem botão, tenta o Enter no campo. */
async function clickSend(timeoutMs = 1500, mediaOnly = false, expectedPhone = state.phone) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    if (extensionLife.expired) return false
    const b = mediaOnly ? document.querySelector('[role="dialog"] [data-icon="send"], [role="dialog"] [data-icon="wds-ic-send-filled"], [data-testid="media-send"]')?.closest('button, [role="button"]') : findSendButton()
    if (b) { if (expectedPhone && (await resolveChat()).phone !== expectedPhone) return false; if (extensionLife.expired) return false; b.click(); return true }
    await new Promise((r) => later(r, 120))
  }
  if (mediaOnly) return false

  return false
}

function barReplies() {
  let list = matchReplies("")
  if (prefs.barCat) list = list.filter((r) => (r.category || "Sem categoria") === prefs.barCat)
  return list.slice(0, 80)
}

function ensureBar() {
  const footer = document.querySelector("#main footer")
  let bar = document.getElementById(BAR_ID)
  if (!footer || state.status === "no_config" || state.status === "bad_token" || modalOpen()) {
    if (bar) bar.style.display = "none"
    return
  }
  if (!state.replies.length) { if (bar) bar.remove(); return }
  if (!bar) {
    bar = document.createElement("div")
    bar.id = BAR_ID
    bar.addEventListener("mousedown", (e) => { if (e.target.closest("button")) e.preventDefault() })
    bar.addEventListener("wheel", e => {
      const chips = bar.querySelector(".vb-chips")
      if (chips && chips.scrollWidth > chips.clientWidth && e.deltaY && !e.deltaX) { chips.scrollLeft += e.deltaY; e.preventDefault() }
    }, { passive: false })
    bar.addEventListener("click", guardedEvent(onBarClick), true)
  }
  bar.style.display = ""
  const list = barReplies()
  const chips = list.map((r) => {
    const hue = catHue(r.category || "Sem categoria")
    const tint = prefs.chipStyle === "color" ? ` style="--h:${hue}"` : ""
    return `<button class="vb-chip t-${r.type}${prefs.chipStyle === "color" ? " tinted" : ""}" data-bar-reply="${esc(r.id)}" title="${esc(replyPreview(r))}"${tint}><i class="vb-ic">${icon(r.favorite ? "star" : BAR_ICON[r.type] || "text", 13)}</i><span>${esc(r.name)}</span></button>`
  }).join("")
  const html =
    `<button class="vb-mode" data-bar="mode" title="Alternar modo de envio" aria-label="Modo atual: ${prefs.sendDirect ? "Enviar agora" : "Preparar para revisão"}">${prefs.sendDirect ? "Enviar agora" : "Revisar"}</button>` +
    `<button class="vb-filter${prefs.barCat ? " on" : ""}" data-bar="filter" title="Filtrar por categoria">${icon("filter", 15)}</button>` +
    `<button class="vb-min" data-bar="min" title="${prefs.barMin ? "Mostrar respostas" : "Recolher"}">${prefs.barMin ? icon("plus", 13) : "−"}</button>` +
    (prefs.barMin ? "" : `<div class="vb-chips">${chips || '<span class="vb-none">Nenhuma resposta nesta categoria.</span>'}</div><button class="vb-next" data-bar="next" title="Mais">${icon("chevronright", 14)}</button>`)
  if (bar.dataset.sig !== html) {
    const scroll = bar.querySelector(".vb-chips") ? bar.querySelector(".vb-chips").scrollLeft : 0
    bar.innerHTML = html
    bar.dataset.sig = html
    const c = bar.querySelector(".vb-chips")
    if (c) c.scrollLeft = scroll
  }
  // O Hotzapp põe a barra EMBAIXO do campo de mensagem
  if (bar.parentNode !== footer) footer.appendChild(bar)
}

function closeBarMenu() { const m = document.getElementById("vcrm-barmenu"); if (m) m.remove() }

function openBarMenu(anchor) {
  closeBarMenu()
  const cats = [...new Set(state.replies.map((r) => r.category || "Sem categoria"))].sort((a, b) => a.localeCompare(b, "pt-BR"))
  const m = document.createElement("div")
  m.id = "vcrm-barmenu"
  m.innerHTML = `<b>Mostrar na barra</b>
    <button data-cat="" class="${!prefs.barCat ? "on" : ""}">Todas</button>
    ${cats.map((c) => `<button data-cat="${esc(c)}" class="${prefs.barCat === c ? "on" : ""}"><i style="background:${esc(state.replies.find(reply => catName(reply) === c)?.categoryColor || `hsl(${catHue(c)} 60% 55%)`)}"></i>${esc(c)}</button>`).join("")}
    <div class="vm-sep"></div>
    <label class="vm-toggle"><input type="checkbox" data-pref="sendDirect" ${prefs.sendDirect ? "checked" : ""}/> <span>Enviar agora ao clicar</span></label>
    <div class="vm-seg"><button data-style="icon" class="${prefs.chipStyle === "icon" ? "on" : ""}">Ícone</button><button data-style="color" class="${prefs.chipStyle === "color" ? "on" : ""}">Colorido</button></div>`
  m.addEventListener("mousedown", (e) => { if (e.target.tagName !== "INPUT") e.preventDefault() })
  m.addEventListener("click", (e) => {
    const b = e.target.closest("button")
    if (b && b.dataset.cat !== undefined) { prefs.barCat = b.dataset.cat || null; savePrefs(); closeBarMenu(); ensureBar(); return }
    if (b && b.dataset.style) { prefs.chipStyle = b.dataset.style; savePrefs(); openBarMenu(anchor); ensureBar(); return }
  })
  m.addEventListener("change", (e) => {
    if (e.target.matches("[data-pref='sendDirect']")) { prefs.sendDirect = e.target.checked; savePrefs() }
  })
  document.body.appendChild(m)
  const r = anchor.getBoundingClientRect()
  m.style.left = Math.round(r.left) + "px"
  m.style.bottom = Math.round(window.innerHeight - r.top + 8) + "px"
  later(() => listenGlobal(document, "click", function off(ev) {
    if (!ev.target.closest("#vcrm-barmenu, #vcrm-bar [data-bar='filter']")) { closeBarMenu(); document.removeEventListener("click", off, true) }
  }, true), 0)
}

function onBarClick(e) {
  const reply = e.target.closest("[data-bar-reply]")
  if (reply) {
    const r = state.replies.find((x) => x.id === reply.getAttribute("data-bar-reply"))
    if (r) useReply(r)
    return
  }
  const b = e.target.closest("[data-bar]")
  if (!b) return
  const k = b.dataset.bar
  if (k === "mode") { prefs.sendDirect = !prefs.sendDirect; savePrefs(); ensureBar(); if (state.open) render(); return }
  if (k === "min") { prefs.barMin = !prefs.barMin; savePrefs(); return ensureBar() }
  if (k === "next") { const c = document.querySelector("#vcrm-bar .vb-chips"); if (c) c.scrollBy({ left: 320, behavior: "smooth" }); return }
  if (k === "filter") { return document.getElementById("vcrm-barmenu") ? closeBarMenu() : openBarMenu(b) }
}

function closePop() { const p = document.getElementById(POP_ID); if (p) p.remove() }

function onComposerInput(e) {
  const box = getComposer()
  if (!box || e.target !== box && !box.contains(e.target)) return
  const m = box.textContent.match(/(?:^|\s);([\p{L}\d_]*)$/u)
  if (!m) return closePop()
  const q = m[1]
  const list = matchReplies("").filter((r) => r.shortcut && r.shortcut.toLowerCase().startsWith(q.toLowerCase())).slice(0, 6)
  closePop()
  if (!list.length) return
  const pop = document.createElement("div")
  pop.id = POP_ID
  pop.innerHTML = list.map((r) => `<button data-pop="${esc(r.id)}"><code>;${esc(r.shortcut)}</code> <b>${esc(r.name)}</b><span>${esc(replyPreview(r))}</span></button>`).join("")
  pop.addEventListener("mousedown", (ev) => ev.preventDefault())
  pop.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-pop]")
    if (!b) return
    const r = state.replies.find((x) => x.id === b.getAttribute("data-pop"))
    closePop()
    if (!r) return
    for (let i = 0; i < q.length + 1; i++) document.execCommand("delete") // apaga ";atalho"
    useReply(r)
  })
  const footer = document.querySelector("#main footer")
  ;(footer ? footer.parentNode : document.body).insertBefore(pop, footer || null)
}

// ── "Salvar como resposta rápida" a partir de uma mensagem sua ───────────────

const MSG_BTN_ID = "vcrm-msgbtn"
const MSG_MENU_ID = "vcrm-msgmenu"
const TEXT_SEL = '[data-testid="selectable-text"], span.selectable-text'
let msgHover = null // { text }
let msgHideTimer = null

/** Texto de uma mensagem (inclui emojis, que no WhatsApp são imagens com o emoji no "alt"). */
function messageText(row) {
  const parts = []
  for (const el of row.querySelectorAll(TEXT_SEL)) {
    if (el.parentElement && el.parentElement.closest(TEXT_SEL)) continue // não repete elementos aninhados
    let t = ""
    const walk = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) t += c.nodeValue
        else if (c.nodeName === "IMG" && c.alt) t += c.alt
        else if (c.nodeName === "BR") t += "\n"
        else walk(c)
      }
    }
    walk(el)
    if (t.trim()) parts.push(t.trim())
  }
  return parts.join("\n").trim()
}

function hideMsgUi() {
  const b = document.getElementById(MSG_BTN_ID)
  const m = document.getElementById(MSG_MENU_ID)
  if (b) b.style.display = "none"
  if (m) m.remove()
}
function hideMsgSoon() {
  cancelLater(msgHideTimer)
  msgHideTimer = later(hideMsgUi, 350)
}

function onMsgHover(e) {
  if (extensionLife.expired) return
  if (state.status === "no_config" || state.status === "bad_token" || modalOpen()) return
  const t = e.target
  if (t.closest && t.closest(`#${MSG_BTN_ID}, #${MSG_MENU_ID}`)) { cancelLater(msgHideTimer); return }
  const row = t.closest && t.closest('[class*="message-out"], [class*="message-in"]')
  const main = document.querySelector("#main")
  if (!row || !main || !main.contains(row)) return hideMsgSoon()
  const text = messageText(row)
  const messageId = (row.closest("[data-id]") || row.querySelector("[data-id]"))?.getAttribute("data-id")
  if (!text && !messageId) return hideMsgSoon()
  cancelLater(msgHideTimer)
  const first = row.querySelector(TEXT_SEL) || row
  const r = first.getBoundingClientRect()
  let b = document.getElementById(MSG_BTN_ID)
  if (!b) {
    b = document.createElement("button")
    b.id = MSG_BTN_ID
    b.title = "Salvar como resposta rápida"
    b.setAttribute("aria-label", "Salvar como resposta rápida")
    b.innerHTML = icon("zap", 16)
    b.addEventListener("mouseleave", hideMsgSoon)
    b.addEventListener("click", onMsgButtonClick)
    document.body.appendChild(b)
  }
  msgHover = { text, messageId }
  b.style.display = "grid"
  b.style.left = Math.max(8, Math.round(r.left - 52)) + "px"
  b.style.top = Math.round(r.top + r.height / 2 - 14) + "px"
}

function onMsgButtonClick() {
  const b = document.getElementById(MSG_BTN_ID)
  if (!b || !msgHover) return
  let m = document.getElementById(MSG_MENU_ID)
  if (m) return m.remove()
  m = document.createElement("div")
  m.id = MSG_MENU_ID
  m.innerHTML = `<small>VisionSync</small><button>${icon("plus", 16)}<span>Salvar como resposta rápida</span><em>Texto / mídia</em></button>`
  m.addEventListener("mouseenter", () => cancelLater(msgHideTimer))
  m.addEventListener("mouseleave", hideMsgSoon)
  m.querySelector("button").addEventListener("click", guardedEvent(async () => {
    const selected = { ...msgHover }
    hideMsgUi()
    if (!selected.messageId) { openReplyForm({ text: selected.text }); return }
    const media = await askBridge("export-message", 15000, selected.messageId)
    if (extensionLife.expired) return
    if (media?.base64) {
      const name = window.prompt("Nome para salvar esta resposta rápida favorita:", media.type === "AUDIO" ? "Áudio salvo" : "Imagem salva")
      if (!name?.trim()) return
      const saved = await runtimeMessage({ type: "upload-reply", name: name.trim().slice(0, 80), mediaType: media.type, mime: media.mime, base64: media.base64, asVoiceNote: media.asVoiceNote, caption: media.type === "IMAGE" ? (media.caption || "").slice(0, 1024) : "" })
      toast(saved.ok ? "Mídia salva nas respostas rápidas e favoritas." : saved.data?.error || "Não consegui salvar esta mídia.")
      if (saved.ok) { await loadReplies(); ensureBar() }
      return
    }
    if (!selected.text) { toast(media?.error || "Não foi possível ler essa mensagem."); return }
    openReplyForm({ text: selected.text })
    later(() => { const i = document.querySelector("#vcrm-root input[name='name']"); if (i) i.focus() }, 80)
  }))
  document.body.appendChild(m)
  const r = b.getBoundingClientRect()
  m.style.left = Math.round(Math.max(8, r.left - 20)) + "px"
  m.style.top = Math.round(r.bottom + 6) + "px"
}

// ── Eventos do painel ────────────────────────────────────────────────────────

async function onClick(e) {
  // Respostas rápidas (cartões, botões ao passar o mouse, categorias, formulário)
  const rpEl = e.target.closest("[data-rp-act]")
  if (rpEl) return onReplyAction(rpEl.dataset.rpAct, rpEl.dataset.rpId, rpEl)
  const rpVar = e.target.closest("[data-rp-var]")
  if (rpVar) {
    const ta = document.querySelector("#vcrm-root textarea[name='text']")
    if (ta) {
      ta.focus()
      ta.setRangeText(rpVar.dataset.rpVar, ta.selectionStart, ta.selectionEnd, "end")
    }
    return
  }
  const t = e.target.closest("button")
  if (!t) return

  if (t.dataset.tab) {
    if (state.open && state.tab === t.dataset.tab) state.open = false
    else { state.open = true; state.tab = t.dataset.tab; refresh(true) }
    return render()
  }
  const act = t.dataset.act
  if (act === "inbox-filters") {
    inboxFiltersOpen = !inboxFiltersOpen
    ensureInboxTabs()
    t.setAttribute("aria-expanded", String(inboxFiltersOpen))
    return
  }
  if (act === "schedule-chat" || act === "funnel-chat") return toggleHdrPop(act === "schedule-chat" ? "sched" : "funnel")
  if (act === "new-server-send") {
    if (replyBusy || !lastQuickKey) return
    if (!confirm("Confira a conversa e a fila antes de continuar. Preparar outro envio permite enviar a mesma nota de voz novamente. Deseja continuar?")) return
    quickSendRequests.delete(lastQuickKey); lastQuickKey = null; sendState("idle"); return
  }
  if (act === "send-status") return refreshSendStatus()
  if (act === "server-queue") { if (state.apiUrl) window.open(state.apiUrl + "/dashboard/whatsapp", "_blank", "noopener,noreferrer"); return }
  if (act === "close") { state.open = false; return render() }
  if (act === "diag") {
    const text = collectDiagnostic()
    try { await navigator.clipboard.writeText(text); toast("Diagnóstico copiado. Cole aqui no chat.") } catch { window.prompt("Copie este texto e cole no chat:", text) }
    return
  }
  if (act === "ad-copy") {
    // Só lê quando você clica. Não grava nada, não manda nada.
    toast("Lendo a conversa…")
    const r = await askBridge("adinfo", 6000)
    const text = JSON.stringify(r || { aviso: "não consegui ler a conversa" }, null, 1)
    try { await navigator.clipboard.writeText(text); toast("Copiado. Cole aqui no chat.") } catch { window.prompt("Copie e cole no chat:", text) }
    return
  }
  if (act === "imp-scan") return importScan()
  if (act === "imp-go") return importGo()
  if (act === "imp-all" || act === "imp-none") {
    imp.selected = act === "imp-all"
      ? new Set([...imp.scan.labels.map((l) => l.name), ...imp.scan.chats.flatMap((c) => c.labels)])
      : new Set()
    return render()
  }
  if (act === "imp-reset") { imp.phase = "idle"; imp.result = null; return render() }
  if (act === "imp-diag") {
    const s = imp.scan || {}
    const text = JSON.stringify({
      versao: "imp-diag1",
      etiquetas: (s.labels || []).length,
      conversas: (s.chats || []).length,
      semTelefone: s.semTelefone,
      grupos: s.grupos,
      comEtiqueta: (s.chats || []).filter((c) => c.labels.length).length,
      aguardando: (s.chats || []).filter((c) => c.lastFromMe === false).length,
      arquivadas: (s.chats || []).filter((c) => c.archived).length,
      ponte: s.dbg || null,
    }, null, 1)
    try { await navigator.clipboard.writeText(text); toast("Diagnóstico copiado. Cole aqui no chat.") } catch { window.prompt("Copie este texto e cole no chat:", text) }
    return
  }
  if (act === "web") { if (state.apiUrl) window.open(state.apiUrl + "/dashboard/funil", "_blank"); return }
  if (act === "kanban") return openKanbanModal()
  if (act === "dial") return openDialModal()
  if (act === "blur") {
    prefs.blur = !prefs.blur
    document.documentElement.classList.toggle("vcrm-blur", prefs.blur)
    savePrefs()
    render()
    toast(prefs.blur ? "Modo Privacidade ativado (nomes e valores borrados)." : "Modo Privacidade desativado.")
    return
  }
  if (act === "gcal-form") {
    const form = document.querySelector("#vcrm-root form[data-form='reminder']")
    const text = (form && form.querySelector("[name='text']") && form.querySelector("[name='text']").value) || `Retorno: ${(state.contact && state.contact.name) || state.name || state.phone}`
    const sm = (form && form.querySelector("[name='scheduledMessage']") && form.querySelector("[name='scheduledMessage']").value) || ""
    const atVal = form && form.querySelector("[name='at']") && form.querySelector("[name='at']").value
    const dueAt = atVal ? new Date(atVal).toISOString() : new Date(Date.now() + 3600e3).toISOString()
    window.open(googleCalendarUrl({ title: `${text} (${(state.contact && state.contact.name) || state.name || state.phone})`, details: sm ? `Mensagem agendada:\n${sm}` : `Cliente: ${state.phone}`, dueAt }), "_blank")
    return
  }
  if (act === "toggle-lists") { const m = document.getElementById("vc-listmenu"); if (m) m.hidden = !m.hidden; return }
  if (act === "add-contact") { await ensureContact(); return refresh(true) }

  if (t.dataset.addList) return changeList(t.dataset.addList, "add")
  if (t.dataset.removeList) return changeList(t.dataset.removeList, "remove")
  if (t.dataset.reply) { const r = state.replies.find((x) => x.id === t.dataset.reply); if (r) useReply(r); return }

  if (t.dataset.gcalRem) {
    const r = state.reminders.find((x) => x.id === t.dataset.gcalRem)
    if (r) {
      window.open(googleCalendarUrl({ title: `${r.text} (${r.contactName || state.name || state.phone})`, details: r.scheduledMessage ? `Mensagem agendada:\n${r.scheduledMessage}` : `WhatsApp: ${r.contactPhone || state.phone}`, dueAt: r.dueAt }), "_blank")
    }
    return
  }
  if (t.dataset.remSend) {
    const reminder = state.reminders.find(r => r.id === t.dataset.remSend)
    if (reminder && await sendScheduledReminder(reminder)) {
      await api("PATCH", `/api/crm/reminders/${reminder.id}`, { action: "done" })
      toast("Envio solicitado. Confira a conversa ou a fila do servidor.")
      void refresh(true); void refreshInboxData()
    }
    return
  }
  if (t.dataset.remDone) {
    await api("PATCH", `/api/crm/reminders/${t.dataset.remDone}`, { action: "done" })
    refreshInboxData()
    return refresh(true)
  }
  if (t.dataset.remSnooze) {
    const [id, kind] = t.dataset.remSnooze.split(":")
    const d = kind === "1h" ? new Date(Date.now() + 3600e3) : new Date(tomorrow9())
    const res = await api("PATCH", `/api/crm/reminders/${id}`, { action: "snooze", until: d.toISOString() })
    if (!res.ok) toast((res.data && res.data.error) || "Não consegui adiar.")
    return refresh(true)
  }

  if (t.dataset.chargeSend) {
    const c = state.charges.find((x) => x.id === t.dataset.chargeSend)
    if (c && insertIntoComposer(chargeMessage(c))) toast("Mensagem de cobrança escrita no campo. Revise e envie.")
    return
  }
  if (t.dataset.chargePay || t.dataset.chargeCancel) {
    const id = t.dataset.chargePay || t.dataset.chargeCancel
    const action = t.dataset.chargePay ? "pay" : "cancel"
    if (action === "pay" && !confirm("Marcar como paga? Isso registra a compra e envia a conversão pro Meta.")) return
    if (action === "cancel" && !confirm("Cancelar esta cobrança?")) return
    const res = await api("PATCH", `/api/crm/charges/${id}`, { action })
    if (!res.ok) toast((res.data && res.data.error) || "Não foi possível atualizar a cobrança.")
    return refresh(true)
  }
}

async function onSubmit(e) {
  const form = e.target.closest("form[data-form]")
  if (!form) return
  e.preventDefault()
  const kind = form.dataset.form
  if (kind === "rpform") return submitReplyForm(form)
  const f = new FormData(form)
  const msg = (m) => { const el = form.querySelector("[data-msg]"); if (el) el.textContent = m }

  if (kind === "newlist") {
    const name = String(f.get("name") || "").trim()
    if (!name) return
    const res = await api("POST", "/api/crm/lists", { name })
    if (res.ok && res.data) { state.lists.push(res.data); await changeList(res.data.id, "add") }
    return
  }

  if (kind === "purchase") {
    const amount = parseFloat(f.get("amount"))
    if (!amount || amount <= 0) return msg("Informe um valor válido.")
    msg("Registrando…")
    const res = await api("POST", "/api/crm/purchase", {
      phone: state.phone,
      name: (state.contact && state.contact.name) || state.name || undefined,
      amount,
      productName: String(f.get("product") || "") || undefined,
      source: "whatsapp",
    })
    if (res.ok) return refresh(true)
    return msg((res.data && res.data.error) || "Erro ao registrar. Confira a conexão.")
  }

  const id = await ensureContact()
  if (!id) return msg("Não consegui salvar esta cliente.")

  if (kind === "lead-deal") {
    msg("Salvando…")
    const dealValRaw = String(f.get("dealValue") || "").trim()
    const dealValue = dealValRaw ? parseFloat(dealValRaw) : null
    const body = {
      email: String(f.get("email") || "").trim() || null,
      source: String(f.get("source") || "").trim() || null,
      birthDate: String(f.get("birthDate") || "").trim() || null,
      lifecycleStage: String(f.get("lifecycleStage") || "lead"),
      leadStatus: String(f.get("leadStatus") || "novo"),
      dealTitle: String(f.get("dealTitle") || "").trim() || null,
      dealValue: dealValue != null && !Number.isNaN(dealValue) ? dealValue : null,
      dealStage: String(f.get("dealStage") || "aberto"),
      nextStep: String(f.get("nextStep") || "").trim() || null,
      nextStepAt: String(f.get("nextStepAt") || "").trim() || null,
    }
    const res = await api("PATCH", `/api/crm/contacts/${id}`, body)
    if (!res.ok) return msg((res.data && res.data.error) || "Erro ao salvar dados.")
    toast("Dados do lead e negócio salvos!")
    return refresh(true)
  }

  if (kind === "note") {
    const text = String(f.get("text") || "").trim()
    if (!text) return msg("Escreva a nota.")
    const res = await api("POST", `/api/crm/contacts/${id}/notes`, { text })
    if (res.ok) return refresh(true)
    return msg((res.data && res.data.error) || "Erro ao salvar a nota.")
  }

  if (kind === "reminder") {
    if (mediaUploadCount) return msg("Aguarde o anexo terminar de carregar.")
    const text = String(f.get("text") || "").trim()
    const scheduledMessage = String(f.get("scheduledMessage") || "").trim() || null
    const at = new Date(String(f.get("at")))
    if (!text) return msg("Escreva o lembrete.")
    if (Number.isNaN(at.getTime())) return msg("Informe data e hora.")
    const res = await api("POST", "/api/crm/reminders", { contactId: id, text, scheduledMessage, scheduledReplyId: String(f.get("scheduledReplyId") || "") || null, dueAt: at.toISOString() })
    if (res.ok) { refreshInboxData(); return refresh(true) }
    return msg((res.data && res.data.error) || "Erro ao criar o lembrete.")
  }

  if (kind === "charge") {
    const amount = parseFloat(f.get("amount"))
    if (!amount || amount <= 0) return msg("Informe um valor válido.")
    const res = await api("POST", "/api/crm/charges", {
      contactId: id,
      amount,
      dueDate: String(f.get("due")),
      description: String(f.get("desc") || "") || undefined,
      paymentLink: String(f.get("link") || "") || undefined,
    })
    if (res.ok) return refresh(true)
    return msg((res.data && res.data.error) || "Erro ao criar a cobrança.")
  }
}

function onInput(e) {
  if (e.target.matches("[data-theme-select]")) {
    applyPluginTheme(e.target.value)
    void savePrefs().then(result => { if (!result?.ok) toast("Não foi possível salvar a aparência. Tente novamente.") })
    return
  }
  if (e.target.matches("[data-pref]")) {
    prefs[e.target.getAttribute("data-pref")] = e.target.checked
    savePrefs()
    ensureBar(); if (state.tab === "respostas" && state.open) render()
    return
  }
  if (e.target.matches("[data-imp-label]")) {
    const n = e.target.getAttribute("data-imp-label")
    if (e.target.checked) imp.selected.add(n)
    else imp.selected.delete(n)
    return render()
  }
  if (e.target.matches("[data-imp-opt]")) {
    imp[e.target.getAttribute("data-imp-opt")] = e.target.checked
    return render()
  }
  if (e.target.matches("[data-search]")) {
    state.repliesQuery = e.target.value
    const pos = e.target.selectionStart
    render()
    const el = document.querySelector("#vcrm-root [data-search]")
    if (el) { el.focus(); el.setSelectionRange(pos, pos) }
  }
}

// ── Dados ────────────────────────────────────────────────────────────────────

/** Garante que a cliente exista no CRM (notas e cobranças precisam disso). */
async function ensureContact() {
  if (state.contact && state.contact.contactId) return state.contact.contactId
  const name = (state.name || "").trim() || state.phone
  const res = await api("POST", "/api/crm/contacts", { name, phone: state.phone })
  return res.ok && res.data ? res.data.id : null
}

async function changeList(listId, action) {
  const res = await api("POST", "/api/crm/contact/tags", { phone: state.phone, name: state.name || undefined, listId, action })
  if (res.ok) return refresh(true)
  toast("Não foi possível mudar a lista.")
}

async function loadShared() {
  const [lists, replies, me] = await Promise.all([
    api("GET", "/api/crm/lists"),
    api("GET", "/api/crm/quick-replies"),
    api("GET", "/api/crm/me"),
  ])
  if (lists.ok && Array.isArray(lists.data)) state.lists = lists.data
  if (replies.ok && Array.isArray(replies.data)) { state.replies = replies.data; state.lastSyncAt = new Date().toISOString() }
  if (me.ok && me.data) state.myName = me.data.name || ""
}

let seq = 0
const avatarAttempts = new Map()
let avatarPreview = { phone: "", url: "" }
function previewContactAvatar(found) {
  if (!found.phone || state.phone !== found.phone) return
  const url = String(found.pic || "")
  const safe = url.startsWith("blob:https://web.whatsapp.com/") || /^https:\/\/([a-z0-9-]+\.)*(whatsapp\.net|fbcdn\.net)\//i.test(url)
  if (safe) avatarPreview = { phone: found.phone, url }
  else if (avatarPreview.phone !== found.phone) avatarPreview = { phone: found.phone, url: "" }
  const avatar = document.querySelector?.("#vcrm-root .vc-avatar")
  if (safe && avatar && avatar.querySelector("img")?.getAttribute("src") !== url) avatar.innerHTML = `<img src="${esc(url)}" alt="Foto do contato" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">`
}

async function syncContactAvatar(found, contact, version) {
  if (version !== seq || extensionLife.expired) return
  previewContactAvatar(found)
  const id = contact?.contactId
  if (!id || !found.phone || !found.pic || version !== seq || state.phone !== found.phone) return
  const attemptKey = `${state.apiUrl}|${id}`
  if (Date.now() - (avatarAttempts.get(attemptKey) || 0) < 5 * 60 * 1000) return
  avatarAttempts.set(attemptKey, Date.now())
  try {
    let base64 = ""
    if (found.pic.startsWith("blob:https://web.whatsapp.com/")) {
      const res = await fetch(found.pic, { signal: AbortSignal.timeout(10000) })
      const blob = await res.blob()
      if (!blob.size || blob.size > 512 * 1024) return
      const bytes = new Uint8Array(await blob.arrayBuffer())
      let binary = ""
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      base64 = btoa(binary)
    } else {
      const image = await runtimeMessage({ type: "avatar-fetch", url: found.pic })
      if (!image?.ok || !image.base64) return
      base64 = image.base64
    }
    // Recheck the active identity after the download, so rapid chat switches cannot mix photos.
    const active = await resolveChat()
    if (version !== seq || state.phone !== found.phone || active.phone !== found.phone || (found.key && active.key !== found.key)) return
    const saved = await api("PUT", `/api/crm/contacts/${id}/avatar`, { base64 })
    if (saved.ok && version === seq && state.phone === found.phone) {
      contact.avatarUrl = saved.data.avatarUrl
      const mime = base64.startsWith("iVBOR") ? "image/png" : base64.startsWith("UklG") ? "image/webp" : "image/jpeg"
      avatarPreview = { phone: found.phone, url: `data:${mime};base64,${base64}` }
      render()
    }
  } catch (error) { handleExtensionError(error) }
}
async function refresh(force) {
  if (extensionLife.expired) return
  const hasChat = !!document.querySelector("#main")
  const found = hasChat ? await resolveChat() : { phone: null, name: null }
  const phone = found.phone
  const name = found.name
  state.chatKey = found.key || ""
  state.lastT = found.lastT || 0
  const changed = phone !== state.phone
  state.phone = phone
  state.name = name
  previewContactAvatar(found)
  if (!force && !changed) { void syncContactAvatar(found, state.contact, seq); return }

  const mine = ++seq
  const cfg = await runtimeMessage({ type: "config-status" })
  if (extensionLife.expired) return
  state.apiUrl = (cfg.apiUrl || "").replace(/\/+$/, "")
  if (!cfg.configured) { state.status = "no_config"; return render() }

  if (changed) { state.contact = null; state.detail = null; state.charges = []; state.reminders = []; state.adInfo = undefined }
  state.status = "loading"
  if (state.open) render()

  if (!state.replies.length && !state.lists.length) await loadShared()
  if (!phone) { state.status = "ok"; ensureBar(); return render() }

  const res = await api("GET", `/api/crm/contact?phone=${encodeURIComponent(phone)}&name=${encodeURIComponent(name || "")}`)
  if (mine !== seq) return // chegou resposta velha: outra conversa já foi aberta
  if (res.status === 401) { state.status = "bad_token"; return render() }
  if (!(res.ok && res.data)) { state.status = "offline"; return render() }

  state.contact = res.data
  if (res.data.avatarUrl && !found.pic) {
    runtimeMessage({ type: "file", path: res.data.avatarUrl }).then(image => {
      if (mine === seq && state.phone === phone && image?.ok && image.base64) {
        avatarPreview = { phone, url: `data:image/webp;base64,${image.base64}` }
        render()
      }
    }).catch(() => {})
  }
  void syncContactAvatar(found, res.data, mine)
  state.detail = null
  state.charges = []
  state.reminders = []
  if (res.data.contactId) {
    const [d, ch, rem] = await Promise.all([api("GET", `/api/crm/contacts/${res.data.contactId}`), api("GET", "/api/crm/charges?status=todas"), api("GET", `/api/crm/reminders?contactId=${res.data.contactId}`)])
    if (mine !== seq) return
    if (d.ok) state.detail = d.data
    if (ch.ok && ch.data) state.charges = ch.data.charges || []
    if (rem.ok && rem.data) state.reminders = rem.data.reminders || []
  }
  state.status = "ok"
  ensureBar()
  ensureInboxTabs()
  render()
}

// ── HotZapp: Abas de Filtro acima da lista de conversas (#pane-side) ─────────

const INBOX_TABS_ID = "vcrm-inbox-tabs"
const INBOX_LIST_ID = "vcrm-inbox-list"
let inboxFiltersOpen = false
const inbox = {
  tab: "all", // "all" | "unread" | "waiting" | "scheduled" | "funnel"
  stageId: "all",
  chats: [],
  allReminders: [],
  funnelData: null,
  lastScanAt: 0,
}

async function refreshInboxData(forceScan = false) {
  if (state.status === "no_config" || state.status === "bad_token") return
  const now = Date.now()
  if (forceScan || now - inbox.lastScanAt > 8000 || !inbox.chats.length) {
    inbox.lastScanAt = now
    const r = await askBridge("scan", 6000)
    if (r && Array.isArray(r.chats)) inbox.chats = r.chats
  }
  const [remRes, funRes] = await Promise.all([
    api("GET", "/api/crm/reminders"),
    api("GET", "/api/crm/funnel"),
  ])
  if (remRes.ok && remRes.data && Array.isArray(remRes.data.reminders)) inbox.allReminders = remRes.data.reminders
  if (funRes.ok && funRes.data) inbox.funnelData = funRes.data
  ensureInboxTabs()
  checkDueReminders()
}

function ensureInboxTabs() {
  const pane = document.querySelector("#pane-side")
  let bar = document.getElementById(INBOX_TABS_ID)
  let listEl = document.getElementById(INBOX_LIST_ID)
  if (!pane || state.status === "no_config" || state.status === "bad_token") {
    if (bar) bar.remove()
    if (listEl) listEl.remove()
    if (pane) pane.style.display = ""
    return
  }
  if (!bar) {
    bar = document.createElement("div")
    bar.id = INBOX_TABS_ID
    bar.addEventListener("click", guardedEvent(async (e) => {
      const b = e.target.closest("button[data-ib-tab]")
      if (b) {
        const next = b.dataset.ibTab
        inbox.tab = inbox.tab === next && next !== "all" ? "all" : next
        if (inbox.tab !== "all") await refreshInboxData(true)
        else ensureInboxTabs()
        return
      }
      const st = e.target.closest("button[data-ib-stage]")
      if (st) {
        inbox.stageId = st.dataset.ibStage
        ensureInboxTabs()
      }
    }))
    document.body.appendChild(bar)
  }
  bar.hidden = !inboxFiltersOpen

  const unreadCount = inbox.chats.filter((c) => !c.archived && c.unread > 0).length
  const waitCount = waitList.length || inbox.chats.filter((c) => !c.archived && c.lastFromMe === false).length
  const schedCount = inbox.allReminders.filter((r) => r.state !== "feito").length
  const funnelLists = (inbox.funnelData && inbox.funnelData.lists) || state.lists || []

  const tabsHtml = `
    <div class="vib-row">
      <button data-ib-tab="all" class="${inbox.tab === "all" ? "on" : ""}">Todas</button>
      <button data-ib-tab="unread" class="${inbox.tab === "unread" ? "on" : ""}">Não lidas${unreadCount ? ` <b>${unreadCount}</b>` : ""}</button>
      <button data-ib-tab="waiting" class="${inbox.tab === "waiting" ? "on" : ""}">Esperando${waitCount ? ` <b>${waitCount}</b>` : ""}</button>
      <button data-ib-tab="scheduled" class="${inbox.tab === "scheduled" ? "on" : ""}">Agendadas${schedCount ? ` <b class="amber">${schedCount}</b>` : ""}</button>
      <button data-ib-tab="funnel" class="${inbox.tab === "funnel" ? "on" : ""}">Funil</button>
    </div>
    ${inbox.tab === "funnel" ? `
    <div class="vib-stages">
      <button data-ib-stage="all" class="${inbox.stageId === "all" ? "on" : ""}">Todas etapas</button>
      ${funnelLists.map((l) => `<button data-ib-stage="${esc(l.id)}" class="${inbox.stageId === l.id ? "on" : ""}"><i style="background:${esc(l.color)}"></i>${esc(l.name)}</button>`).join("")}
    </div>` : ""}
  `
  if (bar.dataset.sig !== tabsHtml) { bar.innerHTML = tabsHtml; bar.dataset.sig = tabsHtml }

  if (inbox.tab === "all") {
    if (listEl) listEl.remove()
    pane.style.display = ""
    return
  }

  // Renderiza lista filtrada sobre o #pane-side (funciona mesmo para conversas que o WhatsApp rolou pra fora do DOM)
  if (!listEl) {
    listEl = document.createElement("div")
    listEl.id = INBOX_LIST_ID
    listEl.addEventListener("click", guardedEvent(async (e) => {
      const item = e.target.closest("[data-ib-open]")
      if (!item) return
      const key = item.getAttribute("data-ib-open")
      const r = await askBridge("open", 3500, key)
      if (!r || !r.opened) toast("Não consegui abrir direto. Use a busca do WhatsApp.")
    }))
    pane.parentNode.insertBefore(listEl, pane)
  }
  pane.style.display = "none"

  let items = []
  if (inbox.tab === "unread") {
    items = inbox.chats.filter((c) => !c.archived && c.unread > 0).map((c) => ({
      key: c.key || c.phone,
      name: c.name || c.phone,
      sub: c.preview || c.phone,
      badge: `${c.unread} não lida${c.unread > 1 ? "s" : ""}`,
      badgeCls: "green",
      pic: c.pic || photoFromList(c.name),
    }))
  } else if (inbox.tab === "waiting") {
    const source = waitList.length ? waitList : inbox.chats.filter((c) => !c.archived && c.lastFromMe === false)
    items = source.map((w) => ({
      key: w.key || w.phone,
      name: w.name || w.phone,
      sub: w.preview || "Aguardando sua resposta",
      badge: w.mins != null ? waitFmt(w.mins) : "Aguardando",
      badgeCls: w.mins >= 180 ? "red" : "amber",
      pic: w.pic || photoFromList(w.name),
    }))
  } else if (inbox.tab === "scheduled") {
    items = inbox.allReminders.filter((r) => r.state !== "feito").map((r) => ({
      key: r.contactPhone,
      name: r.contactName || r.contactPhone,
      sub: r.scheduledMessage ? `📤 ${r.scheduledMessage}` : `⏰ ${r.text}`,
      badge: whenFmt(r.dueAt),
      badgeCls: r.state === "atrasado" ? "red" : "amber",
      pic: photoFromList(r.contactName),
    }))
  } else if (inbox.tab === "funnel") {
    const cols = ((inbox.funnelData && inbox.funnelData.lists) || []).filter((l) => inbox.stageId === "all" || l.id === inbox.stageId)
    for (const col of cols) {
      for (const card of col.cards || []) {
        items.push({
          key: card.phone,
          name: card.name || card.phone,
          sub: card.dealValue ? `Negócio: ${brl(card.dealValue)}${card.nextStep ? " · " + card.nextStep : ""}` : card.nextStep || `Total comprado: ${brl(card.totalSpent)}`,
          badge: col.name,
          badgeColor: col.color,
          pic: photoFromList(card.name),
        })
      }
    }
  }

  const listHtml = `
    <div class="vib-head">
      <span>${items.length} conversa${items.length === 1 ? "" : "s"} neste filtro</span>
      <button class="vc-link" data-ib-clear="1">Voltar para Todas</button>
    </div>
    ${items.length ? items.map((it) => `
      <button class="vib-item" data-ib-open="${esc(it.key)}">
        ${it.pic ? `<img class="vw-av" src="${esc(it.pic)}" data-ini="${esc((it.name || "?").slice(0, 1).toUpperCase())}" alt="" />` : `<span class="vw-av">${esc((it.name || "?").slice(0, 1).toUpperCase())}</span>`}
        <div class="vib-tx">
          <b>${esc(it.name)}</b>
          <small>${esc(it.sub)}</small>
        </div>
        <span class="vib-tag ${it.badgeCls || ""}" ${it.badgeColor ? `style="border-color:${esc(it.badgeColor)};color:${esc(it.badgeColor)}"` : ""}>${esc(it.badge)}</span>
      </button>
    `).join("") : `<div class="vib-empty">Nenhuma conversa encontrada neste filtro.</div>`}
  `
  if (listEl.dataset.sig !== listHtml) {
    listEl.innerHTML = listHtml
    listEl.dataset.sig = listHtml
    const clearBtn = listEl.querySelector("[data-ib-clear]")
    if (clearBtn) clearBtn.addEventListener("click", () => { inbox.tab = "all"; ensureInboxTabs() })
  }
}

// ── HotZapp: Quadro Kanban Tela Cheia dentro do WhatsApp Web ─────────────────

const KANBAN_MODAL_ID = "vcrm-kanban-modal"
let kbSearch = ""

async function openKanbanModal() {
  let modal = document.getElementById(KANBAN_MODAL_ID)
  if (modal) { modal.remove(); return }
  modal = document.createElement("div")
  modal.id = KANBAN_MODAL_ID
  modal.innerHTML = `<div class="vkb-box"><div class="vkb-top"><b>Carregando Quadro Kanban…</b><button class="vc-x" data-kb-close="1">${icon("x", 18)}</button></div></div>`
  document.body.appendChild(modal)

  modal.addEventListener("click", guardedEvent(async (e) => {
    if (e.target === modal || e.target.closest("[data-kb-close]")) { modal.remove(); return }
    const openBtn = e.target.closest("[data-kb-open]")
    if (openBtn) {
      const phone = openBtn.getAttribute("data-kb-open")
      modal.remove()
      const r = await askBridge("open", 3500, phone)
      if (!r || !r.opened) toast("Não consegui abrir a conversa automaticamente.")
      return
    }
  }))

  modal.addEventListener("change", guardedEvent(async (e) => {
    const sel = e.target.closest("select[data-kb-move]")
    if (!sel) return
    const contactId = sel.getAttribute("data-kb-move")
    const fromListId = sel.getAttribute("data-kb-from") || null
    const toListId = sel.value || null
    const res = await api("POST", "/api/crm/funnel/move", { contactId, fromListId, toListId })
    if (!res.ok) return toast("Não consegui mover o card.")
    toast("Etapa atualizada!")
    renderKanbanModalContent()
    refresh(true)
  }))

  modal.addEventListener("submit", guardedEvent(async (e) => {
    const form = e.target.closest("form[data-kb-newlist]")
    if (!form) return
    e.preventDefault()
    const name = String(new FormData(form).get("name") || "").trim()
    if (!name) return
    const res = await api("POST", "/api/crm/lists", { name })
    if (res.ok && res.data) {
      state.lists.push(res.data)
      renderKanbanModalContent()
    }
  }))

  modal.addEventListener("input", (e) => {
    if (e.target.matches("[data-kb-search]")) {
      kbSearch = e.target.value
      renderKanbanModalContent(true)
    }
  })

  await renderKanbanModalContent()
}

async function renderKanbanModalContent(skipFetch = false) {
  const modal = document.getElementById(KANBAN_MODAL_ID)
  if (!modal) return
  if (!skipFetch || !inbox.funnelData) {
    const res = await api("GET", "/api/crm/funnel")
    if (!res.ok || !res.data) {
      modal.innerHTML = `<div class="vkb-box"><div class="vkb-top"><b>Erro ao carregar o Funil</b><button class="vc-x" data-kb-close="1">${icon("x", 18)}</button></div><p class="vc-muted" style="padding:20px">Verifique a conexão com o servidor.</p></div>`
      return
    }
    inbox.funnelData = res.data
  }
  const f = inbox.funnelData
  const allCols = [
    { id: "", name: "Sem etapa", color: "#71717a", total: f.unassigned.total, cards: f.unassigned.cards },
    ...f.lists,
  ]
  const q = kbSearch.trim().toLowerCase()
  const match = (c) => !q || (c.name || "").toLowerCase().includes(q) || (c.phone || "").includes(q) || (c.dealTitle || "").toLowerCase().includes(q)

  const boxHtml = `
    <div class="vkb-box">
      <header class="vkb-top">
        <div>
          <b>Quadro Kanban — VisionSync &amp; HubSpot Pipeline</b>
          <span class="vkb-kpis">
            <em>Contatos: <b>${f.totals.contacts}</b></em>
            <em>Em negociação: <b class="gold">${brl(f.totals.pipelineValue || 0)}</b></em>
            <em>Total vendido: <b class="green">${brl(f.totals.totalSpent || 0)}</b></em>
          </span>
        </div>
        <div class="vkb-tools">
          <input class="vc-search" data-kb-search placeholder="Buscar cliente ou negócio…" value="${esc(kbSearch)}" />
          <form class="vkb-newcol" data-kb-newlist="1">
            <input name="name" placeholder="+ Nova coluna" maxlength="50" />
            <button class="vc-btn sm">Criar</button>
          </form>
          <button class="vc-x" data-kb-close="1" title="Fechar (Esc)">${icon("x", 20)}</button>
        </div>
      </header>
      <div class="vkb-cols">
        ${allCols.map((col) => {
          const cards = (col.cards || []).filter(match)
          const colDealSum = cards.reduce((s, c) => s + (c.dealValue || 0), 0)
          return `
            <div class="vkb-col" data-kb-col="${esc(col.id)}">
              <div class="vkb-col-head">
                <i style="background:${esc(col.color)}"></i>
                <b>${esc(col.name)}</b>
                <span>${cards.length}</span>
                ${colDealSum > 0 ? `<em class="vkb-col-sum">${brl(colDealSum)}</em>` : ""}
              </div>
              <div class="vkb-col-body">
                ${cards.length ? cards.map((c) => `
                  <div class="vkb-card" draggable="true" data-kb-card="${esc(c.id)}" data-kb-from="${esc(col.id)}">
                    <div class="vkb-card-top">
                      <b>${esc(c.name || c.phone)}</b>
                      <button class="vkb-open" data-kb-open="${esc(c.phone)}" title="Abrir conversa no WhatsApp">${icon("send", 12)} Conversar</button>
                    </div>
                    <div class="vkb-card-sub">${esc(c.phone)}</div>
                    <div class="vkb-badges">
                      ${c.dealValue ? `<span class="vc-badge gold">${esc(c.dealTitle || "Negócio")}: ${brl(c.dealValue)}</span>` : ""}
                      ${c.totalSpent > 0 ? `<span class="vc-badge">${c.purchases}× · ${brl(c.totalSpent)}</span>` : ""}
                      ${c.chargesDue && c.chargesDue.overdue ? `<span class="vc-badge vencida">Vencida ${brl(c.chargesDue.overdueTotal)}</span>` : ""}
                    </div>
                    ${c.nextStep ? `<div class="vkb-step ${c.nextStepState === "atrasado" ? "late" : ""}">⏭ ${esc(c.nextStep)}</div>` : ""}
                    <select class="vkb-move" data-kb-move="${esc(c.id)}" data-kb-from="${esc(col.id)}">
                      <option value="" ${!col.id ? "selected" : ""}>Sem etapa</option>
                      ${f.lists.map((l) => `<option value="${esc(l.id)}" ${col.id === l.id ? "selected" : ""}>Mover → ${esc(l.name)}</option>`).join("")}
                    </select>
                  </div>
                `).join("") : `<div class="vkb-empty">Vazio</div>`}
              </div>
            </div>
          `
        }).join("")}
      </div>
    </div>
  `
  const searchActive = document.activeElement && document.activeElement.matches("[data-kb-search]")
  const pos = searchActive ? document.activeElement.selectionStart : null
  modal.innerHTML = boxHtml
  if (searchActive) {
    const inp = modal.querySelector("[data-kb-search]")
    if (inp) { inp.focus(); try { inp.setSelectionRange(pos, pos) } catch {} }
  }

  // Drag and drop nas colunas do Kanban dentro do WhatsApp
  let dragCardId = null
  let dragFromId = null
  modal.querySelectorAll("[data-kb-card]").forEach((el) => {
    el.addEventListener("dragstart", () => {
      dragCardId = el.getAttribute("data-kb-card")
      dragFromId = el.getAttribute("data-kb-from") || null
    })
  })
  modal.querySelectorAll("[data-kb-col]").forEach((colEl) => {
    colEl.addEventListener("dragover", (ev) => { ev.preventDefault(); colEl.classList.add("dragover") })
    colEl.addEventListener("dragleave", () => colEl.classList.remove("dragover"))
    colEl.addEventListener("drop", guardedEvent(async (ev) => {
      ev.preventDefault()
      colEl.classList.remove("dragover")
      const toListId = colEl.getAttribute("data-kb-col") || null
      if (!dragCardId || dragFromId === toListId) return
      await api("POST", "/api/crm/funnel/move", { contactId: dragCardId, fromListId: dragFromId, toListId })
      toast("Card movido!")
      renderKanbanModalContent()
      refresh(true)
    }))
  })
}

// ── HotZapp: Abrir conversa sem salvar número na agenda (Click-to-Chat) ──────

const DIAL_MODAL_ID = "vcrm-dial-modal"

function openDialModal() {
  let m = document.getElementById(DIAL_MODAL_ID)
  if (m) { m.remove(); return }
  m = document.createElement("div")
  m.id = DIAL_MODAL_ID
  m.innerHTML = `
    <form class="vdial-box">
      <div class="vkb-top">
        <b>Abrir conversa sem salvar contato</b>
        <button type="button" class="vc-x" data-dial-close="1">${icon("x", 18)}</button>
      </div>
      <p class="vc-muted">Digite o DDD + número para iniciar a conversa direto aqui no WhatsApp Web.</p>
      <input name="phone" placeholder="Ex.: 11 99999-8888" autofocus required />
      <textarea name="msg" rows="3" placeholder="Mensagem inicial (opcional — já cola no campo ao abrir)"></textarea>
      <div class="vc-actions">
        <button type="button" class="vc-ghost" data-dial-close="1">Cancelar</button>
        <button class="vc-btn">${icon("send", 14)} Abrir conversa</button>
      </div>
    </form>
  `
  m.addEventListener("click", (e) => {
    if (e.target === m || e.target.closest("[data-dial-close]")) m.remove()
  })
  m.querySelector("form").addEventListener("submit", guardedEvent(async (e) => {
    e.preventDefault()
    const fd = new FormData(e.target)
    const raw = String(fd.get("phone") || "").replace(/\D/g, "")
    const msg = String(fd.get("msg") || "").trim()
    if (raw.length < 10) return toast("Digite o DDD + número com pelo menos 10 dígitos.")
    const full = raw.length <= 11 && !raw.startsWith("55") ? "55" + raw : raw
    m.remove()
    const r = await askBridge("open", 4000, full)
    if (r && r.opened) {
      if (msg) later(() => insertIntoComposer(renderVariables(msg)), 900)
      toast("Conversa aberta!")
    } else {
      toast("Não consegui abrir sem recarregar. Verifique o número.")
    }
  }))
  document.body.appendChild(m)
}

// ── HotZapp: Aviso ativo quando mensagem agendada / lembrete chega na hora ───

const DUE_ALERT_ID = "vcrm-due-alert"
const dismissedReminders = new Set()
const sendingReminders = new Set()
async function sendScheduledReminder(reminder) {
  if (extensionLife.expired || sendingReminders.has(reminder.id)) return false
  sendingReminders.add(reminder.id)
  try {
    const current = await resolveChat()
    if (current.phone !== (reminder.contactPhone || state.phone)) { toast("Abra a conversa correta antes de enviar o agendamento."); return false }
    sendState("preparing", "Prévia do lembrete em preparação.", null, current.phone)
    if (reminder.scheduledReplyId) {
      const response = await api("GET", "/api/crm/quick-replies")
      const reply = response.ok && response.data?.find(r => r.id === reminder.scheduledReplyId && ["AUDIO", "IMAGE"].includes(r.type))
      if (!reply) { toast("O anexo agendado não está disponível na biblioteca."); return false }
      return await useReply({ ...reply, ...(reply.type === "IMAGE" && reminder.scheduledMessage ? { text: reminder.scheduledMessage } : {}) })
    }
    if (!reminder.scheduledMessage || !insertIntoComposer(renderVariables(reminder.scheduledMessage))) return false
    if (!prefs.sendDirect) { sendState("prepared", "Revise e envie pelo WhatsApp; o lembrete continua aberto."); toast("Mensagem preparada. Revise e envie; conclua o lembrete depois."); return false }
    await new Promise(resolve => later(resolve, 160))
    if (extensionLife.expired || (await resolveChat()).phone !== current.phone) return false
    const requested = await clickSend(1800, false, current.phone)
    sendState(requested ? "requested" : "uncertain", "Confira a conversa para confirmar o resultado.")
    return requested
  } finally { sendingReminders.delete(reminder.id) }
}

function checkDueReminders() {
  let el = document.getElementById(DUE_ALERT_ID)
  const now = Date.now()
  const due = (inbox.allReminders || []).find(
    (r) => !r.doneAt && r.state !== "feito" && !dismissedReminders.has(r.id) && new Date(r.dueAt).getTime() <= now
  )
  if (!due || state.status === "no_config" || state.status === "bad_token") {
    if (el) el.remove()
    return
  }
  if (!el) {
    el = document.createElement("div")
    el.id = DUE_ALERT_ID
    document.body.appendChild(el)
  }
  const html = `
    <div class="vdue-main">
      ${icon("alarm", 18)}
      <div>
        <b>Horário agendado: ${esc(due.contactName || due.contactPhone)}</b>
        <span>${esc(due.text)}${due.scheduledMessage ? ` — Mensagem pronta: "${esc(due.scheduledMessage.slice(0, 60))}"` : ""}</span>
      </div>
    </div>
    <div class="vdue-acts">
      <button class="vc-btn sm" data-due-go="${esc(due.id)}">${icon("send", 13)} ${due.scheduledMessage || due.scheduledReplyId ? (prefs.sendDirect ? "Abrir e solicitar envio" : "Abrir e revisar") : "Abrir conversa"}</button>
      <button class="vc-ghost" data-due-dismiss="${esc(due.id)}">Depois</button>
    </div>
  `
  if (el.dataset.sig !== html) {
    el.innerHTML = html
    el.dataset.sig = html
    el.onclick = guardedEvent(async (e) => {
      const go = e.target.closest("[data-due-go]")
      if (go) {
        await askBridge("open", 3500, due.contactPhone)
        await new Promise(resolve => later(resolve, 900))
        await refresh(true)
        if (!await sendScheduledReminder(due)) return
        await api("PATCH", `/api/crm/reminders/${due.id}`, { action: "done" })
        dismissedReminders.add(due.id)
        await refreshInboxData()
        refresh(true)
        return
      }
      const dis = e.target.closest("[data-due-dismiss]")
      if (dis) {
        dismissedReminders.add(due.id)
        checkDueReminders()
      }
    })
  }
}

// ── Início ───────────────────────────────────────────────────────────────────

function startObserver() {
  const root = document.querySelector("#app") || document.body
  let timer = null
  const obs = new MutationObserver((muts) => {
    if (muts.every((m) => m.target.closest && m.target.closest(`#${ROOT_ID}, #${BAR_ID}, #${POP_ID}, #${INBOX_TABS_ID}, #${INBOX_LIST_ID}, #${KANBAN_MODAL_ID}`))) return
    cancelLater(timer)
    timer = later(() => { refresh(false); ensureBar(); ensureHeaderBar(); ensureInboxTabs() }, 400)
  })
  obs.observe(root, { childList: true, subtree: true })
  extensionLife.observers.add(obs)
  // janelas (modais) às vezes entram direto no <body>: esconde a barrinha e o aviso na hora
  let bodyTimer = null
  const bodyObserver = new MutationObserver((muts) => {
    if (muts.every((m) => [...m.addedNodes, ...m.removedNodes].every((n) => n.id === ROOT_ID || n.id === BAR_ID || n.id === POP_ID || n.id === WAIT_ID))) return
    cancelLater(bodyTimer)
    bodyTimer = later(() => { ensureHeaderBar(); renderWaiting() }, 150)
  })
  bodyObserver.observe(document.body, { childList: true })
  extensionLife.observers.add(bodyObserver)
  listenGlobal(window, "resize", () => { ensureHeaderBar(); if (hdrPop) renderHdrPop() })
  listenGlobal(document, "click", (e) => {
    if (hdrPop && !e.target.closest(`#${HDR_ID}, #${HPOP_ID}, #${ROOT_ID} [data-act="schedule-chat"], #${ROOT_ID} [data-act="funnel-chat"]`)) { hdrPop = null; renderHdrPop() }
    if (inboxFiltersOpen && !e.target.closest(`#${INBOX_TABS_ID}, #${ROOT_ID} [data-act="inbox-filters"]`)) {
      inboxFiltersOpen = false
      ensureInboxTabs()
      document.querySelector(`#${ROOT_ID} [data-act="inbox-filters"]`)?.setAttribute("aria-expanded", "false")
    }
  }, true)
  listenGlobal(document, "mouseover", onMsgHover, true)
  listenGlobal(document, "input", onComposerInput, true)
  listenGlobal(document, "keydown", (e) => { if (e.key === "Escape") closePop() }, true)
  // token/URL mudaram no popup: recarrega
  repeat(() => { if (!document.hidden) refresh(true) }, 30000)
}

function init() {
  const token = `${SCRIPT_VERSION}:${Math.random()}`
  document.dispatchEvent(new CustomEvent("vcrm-dispose", { detail: token }))
  listenGlobal(document, "vcrm-dispose", event => { if (event.detail !== token) invalidateExtension(true) })
  for (const element of document.querySelectorAll('[id^="vcrm-"]')) element.remove()
  ensureRoot()
  document.getElementById(ROOT_ID).dataset.vcrmBuild = SCRIPT_VERSION
  render()
  startObserver()
  refresh(true)
  // aviso de quem espera resposta: confere ao abrir (depois que o WhatsApp carregou) e a cada minuto
  runtimeMessage({ type: "prefs-get" }).then((c) => {
    waitHandled = c.vcrmHandled || {}
    hdrHidden = !!c.vcrmHdrHidden
    if (c.vcrmPrefs) Object.assign(prefs, c.vcrmPrefs)
    applyPluginTheme(prefs.theme)
    document.documentElement.classList.toggle("vcrm-blur", !!prefs.blur)
    ensureHeaderBar(); ensureBar(); ensureInboxTabs(); render()
  }).catch(() => {})
  later(() => { checkWaiting(); refreshInboxData(true) }, 4000)
  repeat(checkWaiting, 5000) // lê só a memória do WhatsApp: é leve, e mantém a lista em tempo real
  repeat(() => refreshInboxData(false), 25000)
  chrome.runtime.onMessage?.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || extensionLife.expired) return false
    if (message?.type === "theme") {
      applyPluginTheme(message.theme)
      const select = document.querySelector("#vcrm-root [data-theme-select]")
      if (select) select.value = prefs.theme
    }
    if (message?.type === "connection-probe") {
      askBridge("chat", 1500).then(bridge => respond({ protocol: 1, version: SCRIPT_VERSION, main: !!document.querySelector("#main"), composer: !!getComposer(), bridge: !!bridge, expired: extensionLife.expired, lastSyncAt: state.lastSyncAt || null })).catch(() => respond({ protocol: 1, version: SCRIPT_VERSION, expired: true }))
      return true
    }
    return false
  })
  listenGlobal(window, "focus", () => { if (state.apiUrl) void syncReplyLibrary() })
  repeat(() => { if (state.apiUrl) void syncReplyLibrary() }, 60000)
  repeat(() => { if (!document.hidden) void refreshSendStatus() }, 15000)
  repeat(() => { try { if (!chrome.runtime.id) invalidateExtension() } catch (error) { handleExtensionError(error) } }, 2000)
}

const boot = repeat(() => {
  if (document.querySelector("#app")) { cancelRepeat(boot); init() }
}, 500)
