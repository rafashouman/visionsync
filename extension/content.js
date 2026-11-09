// ─────────────────────────────────────────────────────────────────────────────
// Vision CRM — content script (roda dentro do WhatsApp Web)
//
// Coluna de ícones na direita (estilo Hotzapp) + painel que abre ao lado:
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
const PANEL_W = 340
const RAIL_W = 44

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

// ── Utilidades ───────────────────────────────────────────────────────────────

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
const brl = (n) => (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const fmtDate = (iso) => {
  if (!iso) return "—"
  try { return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" }) } catch { return "—" }
}
const todayPlus = (n) => new Date(Date.now() + n * 864e5).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })

function api(method, path, body) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: "api", method, path, body }, (r) => resolve(r || { ok: false, status: 0 }))
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
      document.removeEventListener("vcrm-res", done)
      clearTimeout(t)
      resolve(d)
    }
    const t = setTimeout(() => { document.removeEventListener("vcrm-res", done); resolve(null) }, timeoutMs)
    document.addEventListener("vcrm-res", done)
    document.dispatchEvent(new CustomEvent("vcrm-req", { detail: JSON.stringify({ id, kind, arg }) }))
  })
}

/** Telefone da conversa: dados internos (ponte) primeiro; senão o que a página mostra. */
async function resolveChat() {
  const b = await askBridge()
  state.bridgeDbg = b ? b.dbg : { semResposta: true }
  if (b && b.phone === "GROUP") return { phone: null, name: null }
  if (b && b.phone) return { phone: b.phone, name: (b.name || getActiveName() || "").trim() || null, key: b.key || "", lastT: b.lastT || 0 }
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
  const mask = (t) => String(t || "").replace(/[0-9]/g, "9").slice(0, 120)
  const main = document.querySelector("#main")
  const header = document.querySelector("#main header") || document.querySelector("header")
  const ids = main ? [...main.querySelectorAll("[data-id]")].slice(0, 6).map((e) => mask(e.getAttribute("data-id"))) : []
  const pre = main ? [...main.querySelectorAll("[data-pre-plain-text]")].slice(0, 2).map((e) => mask(e.getAttribute("data-pre-plain-text"))) : []
  const titles = header ? [...header.querySelectorAll("[title]")].slice(0, 4).map((e) => mask(e.getAttribute("title"))) : []
  const attrs = new Set()
  if (main) main.querySelectorAll("*").forEach((e) => { for (const a of e.attributes) if (/^data-/.test(a.name)) attrs.add(a.name) })
  return JSON.stringify({
    versao: "diag2",
    temMain: !!main,
    temHeader: !!header,
    totalDataId: main ? main.querySelectorAll("[data-id]").length : 0,
    exemplosDataId: ids,
    exemplosPrePlain: pre,
    titulosHeader: titles,
    atributosData: [...attrs].slice(0, 25),
    temCampo: !!getComposer(),
    telefoneLido: state.phone ? "sim" : "nao",
    ponte: state.bridgeDbg || null,
  }, null, 1)
}

/** Escreve no campo de mensagem (não envia: quem aperta Enter é ela). */
function insertIntoComposer(text) {
  const box = getComposer()
  if (!box) { toast("Abra uma conversa pra usar a mensagem."); return false }
  box.focus()
  let ok = false
  try {
    const dt = new DataTransfer()
    dt.setData("text/plain", text)
    ok = box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }))
    // paste tratado pelo WhatsApp devolve false (preventDefault)
    ok = !ok
  } catch { ok = false }
  if (!ok) ok = document.execCommand("insertText", false, text)
  if (!ok) toast("Não consegui escrever no campo. Copiei o texto.")
  if (!ok) navigator.clipboard && navigator.clipboard.writeText(text).catch(() => {})
  return ok
}

// ── Interface: raiz, coluna de ícones, painel ────────────────────────────────

const TABS = [
  { id: "conversa", label: "Esta conversa", icon: "user" },
  { id: "notas", label: "Notas", icon: "note" },
  { id: "lembretes", label: "Lembretes", icon: "bell" },
  { id: "cobrancas", label: "Cobranças", icon: "wallet" },
  { id: "respostas", label: "Respostas rápidas", icon: "zap" },
  { id: "importar", label: "Importar do WhatsApp", icon: "download" },
]

function ensureRoot() {
  let root = document.getElementById(ROOT_ID)
  if (root) return root
  root = document.createElement("div")
  root.id = ROOT_ID
  root.addEventListener("click", onClick)
  root.addEventListener("submit", onSubmit)
  root.addEventListener("input", onInput)
  document.body.appendChild(root)
  document.documentElement.classList.add("vcrm-on")
  return root
}

function applyLayout() {
  document.documentElement.style.setProperty("--vcrm-pad", `${RAIL_W + (state.open ? PANEL_W : 0)}px`)
}

function toast(msg) {
  state.toast = msg
  render()
  clearTimeout(toast.t)
  toast.t = setTimeout(() => { state.toast = ""; render() }, 3200)
}

function render() {
  const root = ensureRoot()
  applyLayout()
  ensureSide()
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
      <div class="vc-logo" title="Vision CRM">${icon("spark", 20)}</div>
      ${rail}
      <div class="vc-grow"></div>
      <button class="vc-ico" data-act="web" title="Abrir o painel web">${icon("ext", 19)}</button>
    </aside>
    ${state.open ? `
    <section class="vc-panel">
      <header class="vc-head">
        <div class="vc-title">${esc(active ? active.label : "")}</div>
        <button class="vc-x" data-act="close" title="Fechar">${icon("x", 18)}</button>
      </header>
      <div class="vc-body">${renderBody()}</div>
    </section>` : ""}
    ${state.toast ? `<div class="vc-toast">${esc(state.toast)}</div>` : ""}
  `
  if (keep) {
    const el = root.querySelector(`[name="${keep.name}"]`)
    if (el) { el.focus(); try { el.setSelectionRange(keep.s, keep.e) } catch {} }
  }
}

function renderBody() {
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
      <div class="vc-avatar">${esc((fullName(c.name || state.name) || "?").slice(0, 1).toUpperCase())}</div>
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
  const d = state.detail && state.detail.contact
  const SOURCES = { anuncio: "Anúncio", organico: "Orgânico", indicacao: "Indicação", outro: "Outro" }

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
      ${s.cadenceLabel ? `<span class="vc-badge gold">${esc(s.cadenceLabel)}</span>` : ""}
      ${d && d.source ? `<span class="vc-badge">${esc(SOURCES[d.source] || d.source)}</span>` : ""}
    </div>

    <div class="vc-stats">
      <div><b>${s.count}</b><span>compras</span></div>
      <div><b>${brl(s.totalSpent)}</b><span>total</span></div>
      <div><b>${s.daysSinceLast == null ? "—" : s.daysSinceLast + "d"}</b><span>última</span></div>
    </div>

    ${purchaseForm()}

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

const tailOf = (phone) => String(phone || "").replace(/\D/g, "").slice(-8)

/** Conversas que vão entrar, já só com as etiquetas escolhidas (e, no modo "só novos", sem quem já está no CRM). */
function importable() {
  const s = imp.scan
  if (!s) return []
  const out = []
  for (const c of s.chats) {
    if (!imp.archived && c.archived) continue
    if (imp.onlyNew && imp.known.has(tailOf(c.phone))) continue
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
    const already = s.chats.filter((c) => imp.known.has(tailOf(c.phone))).length
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
  imp.known = new Set(known.ok && known.data && Array.isArray(known.data.tails) ? known.data.tails : [])
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
      <div class="vc-sec first">Novo lembrete</div>
      <input name="text" maxlength="300" placeholder="O que lembrar? Ex.: cobrar o pacote" required />
      <input name="at" type="datetime-local" value="${tomorrow9()}" required />
      <button class="vc-btn">${icon("plus", 15)} Criar lembrete</button>
      <div class="vc-note" data-msg="reminder"></div>
    </form>
    ${mine.length ? mine.map((r) => `
      <div class="vc-card charge ${r.state === "atrasado" ? "vencida" : ""}">
        <div class="vc-row flat"><div><b>${esc(r.text)}</b><span>${whenFmt(r.dueAt)}${r.snoozeCount ? " · adiado " + r.snoozeCount + "×" : ""}</span></div><span class="vc-badge ${r.state === "atrasado" ? "vencida" : r.state === "hoje" ? "pendente" : "cancelada"}">${r.state === "atrasado" ? "Atrasado" : r.state === "hoje" ? "Hoje" : "Próximo"}</span></div>
        <div class="vc-actions">
          <button class="vc-btn sm" data-rem-done="${esc(r.id)}">Feito</button>
          <button class="vc-ghost" data-rem-snooze="${esc(r.id)}:1h">+1 hora</button>
          <button class="vc-ghost" data-rem-snooze="${esc(r.id)}:amanha">Amanhã</button>
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

async function loadReplies() {
  const res = await api("GET", "/api/crm/quick-replies")
  if (res.ok && Array.isArray(res.data)) state.replies = res.data
}

function openReplyForm(init) {
  state.open = true
  state.tab = "respostas"
  rp.form = { mode: "new", type: "TEXT", id: null, name: "", category: "", shortcut: "", text: "", contactName: "", contactPhone: "", ...init }
  rp.msg = ""
  render()
}

/** Guarda o que foi digitado, pra não se perder ao trocar de tipo. */
function syncReplyForm() {
  const form = document.querySelector("#vcrm-root form[data-form='rpform']")
  if (!form || !rp.form) return
  const fd = new FormData(form)
  for (const k of ["name", "category", "shortcut", "text", "contactName", "contactPhone"]) if (fd.has(k)) rp.form[k] = String(fd.get(k))
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
  const preview = r.type === "TEXT" ? esc((r.text || "").slice(0, 120)) : ""
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
  const cats = [...groups.keys()].sort((a, b) => (a === "Sem categoria" ? 1 : b === "Sem categoria" ? -1 : a.localeCompare(b, "pt-BR")))

  const prefsBox = rp.prefsOpen ? `<div class="vc-card rp-prefs">
      <div class="vc-sec first">Preferências</div>
      <div class="rp-line"><span>Estilo dos chips</span><span class="rp-seg"><button type="button" data-rp-act="style-icon" class="${prefs.chipStyle === "icon" ? "on" : ""}">Ícone</button><button type="button" data-rp-act="style-color" class="${prefs.chipStyle === "color" ? "on" : ""}">Colorido</button></span></div>
      <label class="vc-check"><input type="checkbox" data-pref="sendDirect" ${prefs.sendDirect ? "checked" : ""}/> <span>Mensagem sai direto</span></label>
    </div>` : ""

  return `<div class="rp-top">
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
      return `<div class="rp-cat-head" data-rp-act="toggle" data-rp-cat="${esc(c)}"><i style="background:hsl(${catHue(c)} 60% 55%)"></i><b>${esc(c.toUpperCase())}</b><span>(${items.length})</span><em>${icon(closed ? "chevronright" : "chevrondown", 14)}</em></div>${closed ? "" : items.map(rpCard).join("")}`
    }).join("") : `<p class="vc-muted">${state.replies.length ? "Nenhuma resposta encontrada." : "Você ainda não tem respostas rápidas. Clique em + Nova pra criar a primeira."}</p>`}`
}

function renderReplyForm() {
  const f = rp.form
  const isEdit = f.mode === "edit"
  const cats = [...new Set(state.replies.map((r) => r.category).filter(Boolean))]
  return `<form class="vc-card rp-form" data-form="rpform">
    <div class="vc-sec first">${isEdit ? "Editar" : "Nova"} ${f.type === "CONTACT" ? "cartão de contato" : "mensagem de texto"}</div>
    ${isEdit ? "" : `<div class="rp-seg wide"><button type="button" data-rp-act="type-TEXT" class="${f.type === "TEXT" ? "on" : ""}">Texto</button><button type="button" data-rp-act="type-CONTACT" class="${f.type === "CONTACT" ? "on" : ""}">Contato</button></div>
      <p class="vc-hint">Áudio, imagem, vídeo e documento: crie pelo painel web (é preciso enviar o arquivo).</p>`}
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
  if (act === "new") return openReplyForm({})
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
    if (r.type !== "TEXT" && r.type !== "CONTACT") return toast("Pra editar áudio, imagem, vídeo ou documento, use o painel web.")
    return openReplyForm({ mode: "edit", id: r.id, type: r.type, name: r.name, category: r.category || "", shortcut: r.shortcut || "", text: r.text || "", contactName: r.contactName || "", contactPhone: r.contactPhone || "" })
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
  syncReplyForm()
  const f = rp.form
  const body = { name: f.name.trim(), category: f.category.trim() || null, shortcut: f.shortcut.trim() || null }
  if (f.type === "TEXT") body.text = f.text
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
  if (r.type === "CONTACT") return `Cartão de contato: ${r.contactName || ""}`
  return r.mediaName ? `Arquivo: ${r.mediaName}` : "Anexo"
}

/** Usa uma resposta: texto vai pro campo; anexos ainda são feitos pelo painel web. */
async function useReply(r) {
  if (r.type === "TEXT" || r.type === "CONTACT") {
    const text = r.type === "TEXT" ? renderVariables(r.text || "") : `${r.contactName || ""}: ${r.contactPhone || ""}`.trim()
    if (!insertIntoComposer(text)) return
    api("POST", `/api/crm/quick-replies/${r.id}/use`)
    // "Mensagem sai direto": igual ao Hotzapp, clicar na resposta já envia
    if (prefs.sendDirect) {
      await new Promise((res) => setTimeout(res, 150))
      await clickSend(1500)
    }
    return
  }
  if (["IMAGE", "VIDEO", "DOCUMENT", "AUDIO"].includes(r.type)) return attachFile(r)
  toast("Este tipo de resposta ainda não funciona pela extensão.")
}

function fileApi(path) {
  return new Promise((resolve) => {
    try { chrome.runtime.sendMessage({ type: "file", path }, (r) => resolve(r || { ok: false, status: 0 })) } catch { resolve({ ok: false, status: 0 }) }
  })
}

/**
 * Coloca o arquivo da resposta rápida na conversa, como se você tivesse colado ele no campo
 * de mensagem. O WhatsApp abre a tela de pré-visualização; a legenda é escrita nela e QUEM
 * ENVIA É VOCÊ (Enter). Áudio entra como arquivo de áudio, ainda não como "gravado na hora".
 */
async function attachFile(r) {
  const box = getComposer()
  if (!box) { toast("Abra uma conversa pra usar esta resposta."); return }
  toast("Carregando o arquivo…")
  const res = await fileApi(`/api/crm/quick-replies/${r.id}/file`)
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
  if (!handled) { toast("O WhatsApp não aceitou o arquivo colado. Use o clipe de anexo e o arquivo do painel web."); return }

  api("POST", `/api/crm/quick-replies/${r.id}/use`)
  // legenda: o WhatsApp abre a pré-visualização com o foco na legenda
  const caption = r.type === "AUDIO" || !r.text ? "" : renderVariables(r.text)
  if (prefs.sendDirect) {
    // espera a pré-visualização abrir, escreve a legenda e envia (igual ao Hotzapp)
    await new Promise((res) => setTimeout(res, 1200))
    if (caption) { try { document.execCommand("insertText", false, caption) } catch {} await new Promise((res) => setTimeout(res, 300)) }
    const sent = await clickSend(5000)
    toast(sent ? "Enviado." : "Coloquei o arquivo. Confira e envie.")
    return
  }
  if (caption) setTimeout(() => { try { document.execCommand("insertText", false, caption) } catch {} }, 1200)
  toast(r.type === "AUDIO" ? "Áudio colocado. Confira e envie." : "Arquivo colocado. Confira a legenda e envie.")
}

// ── Barrinha lateral ao lado da conversa (atalhos pras abas) ──────────────────

const SIDE_ID = "vcrm-side"
let sideCollapsed = false

/** Tem uma janela (modal) aberta no WhatsApp ou em outra extensão? Então a gente não cobre ela. */
function modalOpen() {
  try {
    return !!document.querySelector('[role="dialog"], [aria-modal="true"], [data-animate-modal-popup="true"], [data-animate-modal-body="true"]')
  } catch { return false }
}

function ensureSide() {
  const main = document.querySelector("#main")
  let el = document.getElementById(SIDE_ID)
  if (modalOpen()) { if (el) el.style.display = "none"; return }
  if (el) el.style.display = ""
  if (!main || state.status === "no_config" || state.status === "bad_token") { if (el) el.remove(); return }
  if (!el) {
    el = document.createElement("div")
    el.id = SIDE_ID
    el.addEventListener("click", (e) => {
      const b = e.target.closest("button")
      if (!b) return
      if (b.dataset.collapse) { sideCollapsed = !sideCollapsed; return ensureSide() }
      if (b.dataset.go === "__sched" || b.dataset.go === "__funnel") return toggleHdrPop(b.dataset.go === "__sched" ? "sched" : "funnel")
      state.open = true
      state.tab = b.dataset.go
      refresh(true)
      render()
    })
    document.body.appendChild(el)
  }
  const n = state.reminders.filter((r) => r.state !== "feito").length
  const items = [
    ...(hdrHidden ? [{ go: "__sched", icon: "alarm", label: "Agendar" }, { go: "__funnel", icon: "columns", label: "Funil" }] : []),
    { go: "lembretes", icon: "checklist", label: "Lembretes", badge: n },
    { go: "notas", icon: "note", label: "Notas" },
    { go: "conversa", icon: "user", label: "Dados" },
    { go: "cobrancas", icon: "wallet", label: "Cobrar" },
  ]
  const html = `<button class="vs-top" data-collapse="1" title="${sideCollapsed ? "Expandir" : "Recolher"}">${icon("chevron", 12)}</button>` +
    (items.map((i) => `<button data-go="${i.go}" title="${i.label}">${icon(i.icon, 18)}${i.badge ? `<b>${i.badge}</b>` : ""}<span>${i.label}</span></button>`).join(""))
  if (el.dataset.sig !== html) { el.innerHTML = html; el.dataset.sig = html }
  el.classList.toggle("vs-min", sideCollapsed)
  const r = main.getBoundingClientRect()
  el.style.left = Math.round(r.left + 6) + "px"
  el.style.top = Math.round(r.top + r.height * 0.42) + "px"
}

// ── Aviso: "N clientes esperam sua resposta" ─────────────────────────────────

const WAIT_ID = "vcrm-wait"
const WAIT_MIN_MINUTES = 1 // avisa assim que a cliente espera há 1 minuto
const WAIT_MAX_HOURS = 72 // e ignora o que é mais velho que 3 dias
let waitSnoozeUntil = 0
let waitList = []
let waitHandled = {} // conversa -> hora da última mensagem que você marcou como "já resolvi"

// A foto da cliente: se a imagem falhar em carregar, volta pra inicial do nome
document.addEventListener("error", (e) => {
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
    el.addEventListener("click", async (e) => {
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
          chrome.storage.local.set({ vcrmHandled: waitHandled }).catch(() => {})
          waitList = waitList.filter((x) => x.key !== w.key)
          renderWaiting()
        }
        return
      }
      const act = e.target.closest("[data-wait-act]")
      if (!act) return
      if (act.getAttribute("data-wait-act") === "later") { waitSnoozeUntil = Date.now() + 30 * 60000; renderWaiting() }
      if (act.getAttribute("data-wait-act") === "panel" && state.apiUrl) window.open(state.apiUrl + "/dashboard/painel", "_blank")
    })
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
  ensureSide() // esconde/mostra a barrinha conforme tem janela aberta
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
    if (hdrPop && (!hdrHidden || !document.getElementById(SIDE_ID))) { hdrPop = null; renderHdrPop() }
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
    document.addEventListener("click", (e) => {
      if (hdrPop && !e.target.closest(`#${HDR_ID}, #${HPOP_ID}, #${SIDE_ID}`)) { hdrPop = null; renderHdrPop() }
    }, true)
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
  const side = document.getElementById(SIDE_ID)
  const anchor = !hdrHidden && bar && bar.style.display !== "none" ? bar : side
  if (!hdrPop || !anchor) { if (pop) pop.remove(); return }
  if (!pop) {
    pop = document.createElement("div")
    pop.id = HPOP_ID
    pop.addEventListener("click", onHdrPopClick)
    pop.addEventListener("submit", onHdrPopSubmit)
    document.body.appendChild(pop)
  }
  const r = anchor.getBoundingClientRect()
  pop.style.top = Math.round(r.bottom + 8) + "px"
  pop.style.left = Math.round(anchor === side ? r.right + 8 : r.left) + "px"
  pop.style.right = "auto"
  pop.classList.toggle("funnel", hdrPop === "funnel")

  let html = ""
  if (hdrPop === "sched") {
    html = `<b>Agendar conversa</b>
      <input id="vh-text" maxlength="300" placeholder="Lembrete (opcional). Ex.: cobrar o pacote" />
      <div class="vh-chips">${schedPresets().map(([l, d]) => `<button data-sched="${d.toISOString()}">${esc(l)}</button>`).join("")}</div>
      <form data-hform="sched"><input id="vh-at" type="datetime-local" required /><button class="vc-btn sm">Agendar</button></form>`
  } else {
    const cur = ((state.contact && state.contact.lists) || [])[0]
    html = `<div class="vf-head"><b>Etapa do funil, no seu CRM</b><span>Escolha em que ponto da venda esta conversa está.</span></div>
      <div class="vf-sep"></div>
      ${state.lists.length ? state.lists.map((l) => `<button class="vf-row" data-stage="${esc(l.id)}"><i style="background:${esc(l.color)}"></i><span>${esc(l.name)}</span>${cur && cur.id === l.id ? icon("check", 16) : ""}</button>`).join("") : `<p class="vf-empty">Você ainda não tem etapas. Crie abaixo.</p>`}
      <form class="vf-new" data-hform="newlist"><input name="name" placeholder="Nova etapa" maxlength="60" /><button class="vc-btn sm">Criar</button></form>
      <div class="vf-sep"></div>
      <button class="vf-row" data-fact="out" ${cur ? "" : "disabled"}>${icon("circleminus", 16)}<span>Tirar do funil</span></button>
      <button class="vf-row" data-fact="config">${icon("settings", 16)}<span>Configurar funil</span></button>
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
    return scheduleChat(new Date(b.dataset.sched), t ? t.value : "")
  }
  if (b.dataset.stage) return setStage(b.dataset.stage)
  const act = b.dataset.fact
  if (act === "out") return leaveFunnel()
  if (act === "config") { if (state.apiUrl) window.open(state.apiUrl + "/dashboard/funil", "_blank"); return }
  if (act === "hide") {
    hdrHidden = !hdrHidden
    chrome.storage.local.set({ vcrmHdrHidden: hdrHidden }).catch(() => {})
    hdrPop = null
    renderHdrPop()
    ensureHeaderBar()
    ensureSide()
    toast(hdrHidden ? "Agendar e Funil agora ficam só na barrinha." : "Botões de volta no cabeçalho.")
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
    return scheduleChat(d, t ? t.value : "")
  }
  const name = String(new FormData(form).get("name") || "").trim()
  if (!name) return
  const res = await api("POST", "/api/crm/lists", { name })
  if (res.ok && res.data) { state.lists.push(res.data); await setStage(res.data.id) }
}

async function scheduleChat(due, text) {
  const id = await ensureContact()
  if (!id) return toast("Não consegui salvar esta cliente.")
  const label = (text || "").trim() || `Voltar a falar com ${firstName((state.contact && state.contact.name) || state.name) || "a cliente"}`
  const res = await api("POST", "/api/crm/reminders", { contactId: id, text: label, dueAt: due.toISOString() })
  if (!res.ok) return toast((res.data && res.data.error) || "Não consegui agendar.")
  hdrPop = null
  renderHdrPop()
  toast("Agendado para " + whenFmt(due.toISOString()))
  refresh(true)
}

/** Encerrar: some do aviso "clientes esperam sua resposta" até a cliente escrever de novo. */
function endConversation() {
  if (!state.chatKey) return toast("Não consegui identificar esta conversa.")
  waitHandled[state.chatKey] = state.lastT || Date.now()
  chrome.storage.local.set({ vcrmHandled: waitHandled }).catch(() => {})
  waitList = waitList.filter((x) => x.key !== state.chatKey)
  renderWaiting()
  toast("Conversa encerrada. Ela some do aviso até a cliente escrever de novo.")
}

// ── Barra de respostas acima do campo + atalho ";" ───────────────────────────

const BAR_ICON = { TEXT: "text", CONTACT: "user", AUDIO: "mic", IMAGE: "image", VIDEO: "film", DOCUMENT: "file" }

// ── Preferências da barra (como a engrenagem do Hotzapp) ──
const prefs = { sendDirect: true, chipStyle: "icon", barMin: false, barCat: null, compact: false, collapsed: {} }

function savePrefs() {
  try { chrome.storage.local.set({ vcrmPrefs: prefs }).catch(() => {}) } catch {}
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
async function clickSend(timeoutMs = 1500) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    const b = findSendButton()
    if (b) { b.click(); return true }
    await new Promise((r) => setTimeout(r, 120))
  }
  const box = getComposer()
  if (!box) return false
  box.focus()
  for (const type of ["keydown", "keypress", "keyup"]) {
    box.dispatchEvent(new KeyboardEvent(type, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }))
  }
  return false
}

function barReplies() {
  let list = matchReplies("").filter((r) => r.type !== "SEQUENCE")
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
    bar.addEventListener("mousedown", (e) => e.preventDefault()) // não tira o foco do campo
    bar.addEventListener("click", onBarClick)
  }
  bar.style.display = ""
  const list = barReplies()
  const chips = list.map((r) => {
    const hue = catHue(r.category || "Sem categoria")
    const tint = prefs.chipStyle === "color" ? ` style="--h:${hue}"` : ""
    return `<button class="vb-chip t-${r.type}${prefs.chipStyle === "color" ? " tinted" : ""}" data-bar-reply="${esc(r.id)}" title="${esc(replyPreview(r))}"${tint}><i class="vb-ic">${icon(r.favorite ? "star" : BAR_ICON[r.type] || "text", 13)}</i><span>${esc(r.name)}</span></button>`
  }).join("")
  const html =
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
  if (bar.parentNode !== footer.parentNode || bar.previousSibling !== footer) footer.parentNode.insertBefore(bar, footer.nextSibling)
}

function closeBarMenu() { const m = document.getElementById("vcrm-barmenu"); if (m) m.remove() }

function openBarMenu(anchor) {
  closeBarMenu()
  const cats = [...new Set(state.replies.map((r) => r.category || "Sem categoria"))].sort((a, b) => a.localeCompare(b, "pt-BR"))
  const m = document.createElement("div")
  m.id = "vcrm-barmenu"
  m.innerHTML = `<b>Mostrar na barra</b>
    <button data-cat="" class="${!prefs.barCat ? "on" : ""}">Todas</button>
    ${cats.map((c) => `<button data-cat="${esc(c)}" class="${prefs.barCat === c ? "on" : ""}"><i style="background:hsl(${catHue(c)} 60% 55%)"></i>${esc(c)}</button>`).join("")}
    <div class="vm-sep"></div>
    <label class="vm-toggle"><input type="checkbox" data-pref="sendDirect" ${prefs.sendDirect ? "checked" : ""}/> <span>Mensagem sai direto</span></label>
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
  setTimeout(() => document.addEventListener("click", function off(ev) {
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
  clearTimeout(msgHideTimer)
  msgHideTimer = setTimeout(hideMsgUi, 350)
}

function onMsgHover(e) {
  if (state.status === "no_config" || state.status === "bad_token" || modalOpen()) return
  const t = e.target
  if (t.closest && t.closest(`#${MSG_BTN_ID}, #${MSG_MENU_ID}`)) { clearTimeout(msgHideTimer); return }
  const row = t.closest && t.closest('[class*="message-out"]')
  const main = document.querySelector("#main")
  if (!row || !main || !main.contains(row)) return hideMsgSoon()
  const text = messageText(row)
  if (!text) return hideMsgSoon() // áudio, foto, figurinha: sem texto pra copiar
  clearTimeout(msgHideTimer)
  const first = row.querySelector(TEXT_SEL)
  const r = first.getBoundingClientRect()
  let b = document.getElementById(MSG_BTN_ID)
  if (!b) {
    b = document.createElement("button")
    b.id = MSG_BTN_ID
    b.title = "Salvar como resposta rápida"
    b.innerHTML = icon("zap", 16)
    b.addEventListener("mouseleave", hideMsgSoon)
    b.addEventListener("click", onMsgButtonClick)
    document.body.appendChild(b)
  }
  msgHover = { text }
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
  m.innerHTML = `<small>VISION CRM</small><button>${icon("text", 16)}<span>Salvar como resposta rápida</span><em>Texto</em></button>`
  m.addEventListener("mouseenter", () => clearTimeout(msgHideTimer))
  m.addEventListener("mouseleave", hideMsgSoon)
  m.querySelector("button").addEventListener("click", () => {
    const text = msgHover.text
    hideMsgUi()
    openReplyForm({ text })
    setTimeout(() => { const i = document.querySelector("#vcrm-root input[name='name']"); if (i) i.focus() }, 80)
  })
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
  if (act === "toggle-lists") { const m = document.getElementById("vc-listmenu"); if (m) m.hidden = !m.hidden; return }
  if (act === "add-contact") { await ensureContact(); return refresh(true) }

  if (t.dataset.addList) return changeList(t.dataset.addList, "add")
  if (t.dataset.removeList) return changeList(t.dataset.removeList, "remove")
  if (t.dataset.reply) { const r = state.replies.find((x) => x.id === t.dataset.reply); if (r) useReply(r); return }

  if (t.dataset.remDone) {
    await api("PATCH", `/api/crm/reminders/${t.dataset.remDone}`, { action: "done" })
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

  if (kind === "note") {
    const text = String(f.get("text") || "").trim()
    if (!text) return msg("Escreva a nota.")
    const res = await api("POST", `/api/crm/contacts/${id}/notes`, { text })
    if (res.ok) return refresh(true)
    return msg((res.data && res.data.error) || "Erro ao salvar a nota.")
  }

  if (kind === "reminder") {
    const text = String(f.get("text") || "").trim()
    const at = new Date(String(f.get("at")))
    if (!text) return msg("Escreva o lembrete.")
    if (Number.isNaN(at.getTime())) return msg("Informe data e hora.")
    const res = await api("POST", "/api/crm/reminders", { contactId: id, text, dueAt: at.toISOString() })
    if (res.ok) return refresh(true)
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
  if (e.target.matches("[data-pref]")) {
    prefs[e.target.getAttribute("data-pref")] = e.target.checked
    savePrefs()
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
  if (replies.ok && Array.isArray(replies.data)) state.replies = replies.data
  if (me.ok && me.data) state.myName = me.data.name || ""
}

let seq = 0
async function refresh(force) {
  const hasChat = !!document.querySelector("#main")
  const found = hasChat ? await resolveChat() : { phone: null, name: null }
  const phone = found.phone
  const name = found.name
  state.chatKey = found.key || ""
  state.lastT = found.lastT || 0
  const changed = phone !== state.phone
  state.phone = phone
  state.name = name
  if (!force && !changed) return

  const mine = ++seq
  const cfg = await chrome.storage.local.get(["apiUrl", "token"]).catch(() => ({}))
  state.apiUrl = (cfg.apiUrl || "").replace(/\/+$/, "")
  if (!cfg.apiUrl || !cfg.token) { state.status = "no_config"; return render() }

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
  render()
}

// ── Início ───────────────────────────────────────────────────────────────────

function startObserver() {
  const root = document.querySelector("#app") || document.body
  let timer = null
  const obs = new MutationObserver((muts) => {
    if (muts.every((m) => m.target.closest && m.target.closest(`#${ROOT_ID}, #${BAR_ID}, #${POP_ID}`))) return
    clearTimeout(timer)
    timer = setTimeout(() => { refresh(false); ensureBar(); ensureSide(); ensureHeaderBar() }, 400)
  })
  obs.observe(root, { childList: true, subtree: true })
  // janelas (modais) às vezes entram direto no <body>: esconde a barrinha e o aviso na hora
  let bodyTimer = null
  new MutationObserver((muts) => {
    if (muts.every((m) => [...m.addedNodes, ...m.removedNodes].every((n) => n.id === ROOT_ID || n.id === BAR_ID || n.id === POP_ID || n.id === SIDE_ID || n.id === WAIT_ID))) return
    clearTimeout(bodyTimer)
    bodyTimer = setTimeout(() => { ensureSide(); ensureHeaderBar(); renderWaiting() }, 150)
  }).observe(document.body, { childList: true })
  window.addEventListener("resize", () => { ensureSide(); ensureHeaderBar() })
  document.addEventListener("mouseover", onMsgHover, true)
  document.addEventListener("input", onComposerInput, true)
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePop() }, true)
  // token/URL mudaram no popup: recarrega
  chrome.storage.onChanged.addListener(() => { state.replies = []; state.lists = []; refresh(true) })
}

function init() {
  ensureRoot()
  render()
  startObserver()
  refresh(true)
  // aviso de quem espera resposta: confere ao abrir (depois que o WhatsApp carregou) e a cada minuto
  chrome.storage.local.get(["vcrmHandled", "vcrmHdrHidden", "vcrmPrefs"]).then((c) => {
    waitHandled = c.vcrmHandled || {}
    hdrHidden = !!c.vcrmHdrHidden
    if (c.vcrmPrefs) Object.assign(prefs, c.vcrmPrefs)
    ensureHeaderBar(); ensureSide(); ensureBar()
  }).catch(() => {})
  setTimeout(checkWaiting, 4000)
  setInterval(checkWaiting, 5000) // lê só a memória do WhatsApp: é leve, e mantém a lista em tempo real
}

const boot = setInterval(() => {
  if (document.querySelector("#app")) { clearInterval(boot); init() }
}, 500)
