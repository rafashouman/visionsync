import { safeServerHealth, safeTabHealth } from "./diagnostics"
import { allowedAvatarUrl, allowedMessage, allowedUpload, normalizeApiUrl, type ApiMessage, type FileMessage, type UploadMessage } from "./policy"

type Result = { ok: boolean; status: number; error?: string; data?: unknown; base64?: string; mime?: string }
function preferenceTheme(value: unknown): unknown {
  return value && typeof value === "object" && "theme" in value ? value.theme : undefined
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.vcrmPrefs) return
  const previous = preferenceTheme(changes.vcrmPrefs.oldValue)
  const theme = preferenceTheme(changes.vcrmPrefs.newValue)
  if (theme === previous || typeof theme !== "string" || !["dark", "light", "minimal"].includes(theme)) return
  void chrome.tabs.query({ url: "https://web.whatsapp.com/*" }).then(tabs =>
    Promise.allSettled(tabs.flatMap(tab => tab.id === undefined ? [] : [chrome.tabs.sendMessage(tab.id, { type: "theme", theme })]))
  ).catch(error => console.error("Não foi possível atualizar o tema nas abas do WhatsApp.", error))
})
async function uploadReply(msg: UploadMessage): Promise<Result> {
  const cfg = await chrome.storage.local.get(["apiUrl", "token"])
  if (!cfg.apiUrl || !cfg.token) return { ok: false, status: 0 }
  const bytes = Uint8Array.from(atob(msg.base64), c => c.charCodeAt(0))
  if (bytes.length > 4 * 1024 * 1024) return { ok: false, status: 413 }
  const ext = msg.mime.includes("ogg") ? "ogg" : msg.mime === "audio/mpeg" ? "mp3" : msg.mime === "image/png" ? "png" : msg.mime === "image/webp" ? "webp" : "jpg"
  const form = new FormData()
  form.set("file", new Blob([bytes], { type: msg.mime }), `mensagem.${ext}`)
  form.set("type", msg.mediaType); form.set("name", msg.name); form.set("favorite", "true")
  form.set("asVoiceNote", String(!!msg.asVoiceNote)); form.set("text", msg.caption || "")
  if (msg.category) form.set("category", msg.category)
  if (msg.shortcut) form.set("shortcut", msg.shortcut)
  const res = await fetch(normalizeApiUrl(String(cfg.apiUrl)) + "/api/crm/quick-replies/upload", { method: "POST", headers: { Authorization: `Bearer ${cfg.token}` }, body: form, redirect: "error", credentials: "omit", signal: AbortSignal.timeout(20000) })
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) }
}

async function fetchAvatar(url: string): Promise<Result> {
  // Never forward the CRM credential to WhatsApp's image CDN.
  const res = await fetch(url, { credentials: "omit", redirect: "error", signal: AbortSignal.timeout(10_000) })
  if (!res.ok || Number(res.headers.get("content-length")) > 512 * 1024) return { ok: false, status: 400 }
  const reader = res.body?.getReader()
  if (!reader) return { ok: false, status: 400 }
  const chunks: Uint8Array[] = []; let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > 512 * 1024) { await reader.cancel(); return { ok: false, status: 413 } }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  let binary = ""
  for (const chunk of chunks) for (let i = 0; i < chunk.length; i += 0x8000) binary += String.fromCharCode(...chunk.subarray(i, i + 0x8000))
  return { ok: true, status: 200, base64: btoa(binary), mime: res.headers.get("content-type") ?? "image/jpeg" }
}

async function request(msg: ApiMessage | FileMessage): Promise<Result> {
  const cfg = await chrome.storage.local.get(["apiUrl", "token"])
  if (!cfg.apiUrl || !cfg.token) return { ok: false, status: 0, error: "not_configured" }
  const origin = normalizeApiUrl(String(cfg.apiUrl))
  const headers: Record<string, string> = { Authorization: `Bearer ${cfg.token}` }
  const file = msg.type === "file"
  if (!file) {
    headers["Content-Type"] = "application/json"
    if (msg.requestKey) headers["Idempotency-Key"] = msg.requestKey
  }
  const res = await fetch(origin + msg.path, {
    method: file ? "GET" : msg.method,
    headers,
    body: !file && msg.body !== undefined ? JSON.stringify(msg.body) : undefined,
    redirect: "error", credentials: "omit", signal: AbortSignal.timeout(20_000),
  })
  if (!file) return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) }
  if (!res.ok) return { ok: false, status: res.status }
  const bytes = new Uint8Array(await res.arrayBuffer())
  if (bytes.byteLength > 4 * 1024 * 1024) return { ok: false, status: 413 }
  let data = ""
  for (let i = 0; i < bytes.length; i += 0x8000) data += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return { ok: true, status: res.status, base64: btoa(data), mime: res.headers.get("content-type") ?? "" }
}

async function repairTabs() {
  const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" })
  const results = await Promise.allSettled(tabs.filter(tab => tab.id !== undefined).map(async tab => {
    const target = { tabId: tab.id! }
    await chrome.scripting.executeScript({ target, world: "MAIN", files: ["page-bridge.js"] })
    await chrome.scripting.insertCSS({ target, files: ["panel.css"] })
    await chrome.scripting.executeScript({ target, files: ["content.js"] })
  }))
  return { ok: results.every(r => r.status === "fulfilled"), repaired: results.filter(r => r.status === "fulfilled").length }
}
async function runDiagnostics() {
  const cfg = await chrome.storage.local.get(["apiUrl", "token"])
  const configured = Boolean(cfg.apiUrl && cfg.token)
  let permitted = false
  try { permitted = !!cfg.apiUrl && await chrome.permissions.contains({ origins: [normalizeApiUrl(String(cfg.apiUrl)) + "/*"] }) } catch { /* invalid URL */ }
  const result = configured && permitted ? await request({ type: "api", method: "GET", path: "/api/crm/diagnostics" }).catch(() => ({ ok: false, status: 0, data: null })) : { ok: false, status: 0, data: null }
  const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" })
  const checks = await Promise.all(tabs.slice(0, 8).map(async tab => {
    try { return safeTabHealth(await Promise.race([chrome.tabs.sendMessage(tab.id!, { type: "connection-probe" }), new Promise(resolve => setTimeout(() => resolve(null), 3000))])) }
    catch { return safeTabHealth(null) }
  }))
  const server = result.ok ? safeServerHealth(result.data) : null
  const compatible = server?.protocol === 1
  return { version: chrome.runtime.getManifest().version, checkedAt: new Date().toISOString(), configured, permitted, crm: { ok: result.ok && compatible, status: result.ok && !compatible ? 426 : result.status }, server: compatible ? server : null, tabs: checks }
}

chrome.runtime.onInstalled.addListener(() => {
  // Tokens are inaccessible to untrusted content-script storage contexts.
  void chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }).catch(() => {})
  void repairTabs().catch(() => {})
})

chrome.runtime.onMessage.addListener((value: unknown, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return false
  const popup = sender.url?.startsWith(chrome.runtime.getURL("popup/"))
  const whatsapp = sender.url?.startsWith("https://web.whatsapp.com/")
  if (!popup && !whatsapp) return false
  if (popup && value && typeof value === "object" && "type" in value && value.type === "repair-tabs") {
    repairTabs().then(respond).catch(() => respond({ ok: false, repaired: 0 }))
    return true
  }
  if (popup && value && typeof value === "object" && "type" in value && value.type === "connection-diagnostics") {
    runDiagnostics().then(respond).catch(() => respond({ error: "diagnostic_failed" }))
    return true
  }
  if (whatsapp && allowedUpload(value)) {
    uploadReply(value).then(respond).catch(() => respond({ ok: false, status: 0 }))
    return true
  }
  if (whatsapp && value && typeof value === "object" && "type" in value && value.type === "avatar-fetch") {
    const url = "url" in value ? value.url : null
    if (!allowedAvatarUrl(url)) { respond({ ok: false, status: 400 }); return false }
    fetchAvatar(url).then(respond).catch(() => respond({ ok: false, status: 0 }))
    return true
  }
  if (value && typeof value === "object" && "type" in value && (value.type === "prefs-get" || value.type === "prefs-set")) {
    const keys = ["vcrmHandled", "vcrmHdrHidden", "vcrmPrefs"]
    if (value.type === "prefs-get") chrome.storage.local.get(keys).then(respond).catch(() => respond({ ok: false, status: 0 }))
    else {
      const values = "values" in value && value.values && typeof value.values === "object" ? value.values : {}
      const safe = Object.fromEntries(Object.entries(values).filter(([key]) => keys.includes(key)))
      if (JSON.stringify(safe).length > 100_000) { respond({ ok: false }); return false }
      chrome.storage.local.set(safe).then(() => respond({ ok: true })).catch(() => respond({ ok: false, status: 0 }))
    }
    return true
  }
  if (value && typeof value === "object" && "type" in value && value.type === "config-status") {
    chrome.storage.local.get(["apiUrl", "token"]).then(cfg => respond({ configured: Boolean(cfg.apiUrl && cfg.token), apiUrl: cfg.apiUrl || "" })).catch(() => respond({ configured: false }))
    return true
  }
  if (!allowedMessage(value)) { respond({ ok: false, status: 400, error: "invalid_request" }); return false }
  request(value).then(respond).catch(() => respond({ ok: false, status: 0, error: "Não foi possível conectar ao CRM." }))
  return true
})
