import { allowedMessage, normalizeApiUrl, type ApiMessage, type FileMessage } from "./policy"

type Result = { ok: boolean; status: number; error?: string; data?: unknown; base64?: string; mime?: string }

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

chrome.runtime.onInstalled.addListener(() => {
  // Tokens are inaccessible to untrusted content-script storage contexts.
  void chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })
})

chrome.runtime.onMessage.addListener((value: unknown, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return false
  const popup = sender.url?.startsWith(chrome.runtime.getURL("popup/"))
  const whatsapp = sender.url?.startsWith("https://web.whatsapp.com/")
  if (!popup && !whatsapp) return false
  if (value && typeof value === "object" && "type" in value && (value.type === "prefs-get" || value.type === "prefs-set")) {
    const keys = ["vcrmHandled", "vcrmHdrHidden", "vcrmPrefs"]
    if (value.type === "prefs-get") chrome.storage.local.get(keys).then(respond)
    else {
      const values = "values" in value && value.values && typeof value.values === "object" ? value.values : {}
      const safe = Object.fromEntries(Object.entries(values).filter(([key]) => keys.includes(key)))
      if (JSON.stringify(safe).length > 100_000) { respond({ ok: false }); return false }
      chrome.storage.local.set(safe).then(() => respond({ ok: true }))
    }
    return true
  }
  if (value && typeof value === "object" && "type" in value && value.type === "config-status") {
    chrome.storage.local.get(["apiUrl", "token"]).then(cfg => respond({ configured: Boolean(cfg.apiUrl && cfg.token), apiUrl: cfg.apiUrl || "" }))
    return true
  }
  if (!allowedMessage(value)) { respond({ ok: false, status: 400, error: "invalid_request" }); return false }
  request(value).then(respond).catch(() => respond({ ok: false, status: 0, error: "Não foi possível conectar ao CRM." }))
  return true
})
