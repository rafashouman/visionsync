// Service worker da extensão.
// Faz TODAS as chamadas à API do sistema de agendamento.
// Rodar aqui (e não no content script) resolve dois problemas:
//   1. A CSP do WhatsApp Web bloquearia fetch pra outro domínio.
//   2. Com host_permissions, o service worker tem acesso cross-origin sem CORS.

async function getConfig() {
  const { apiUrl, token } = await chrome.storage.local.get(["apiUrl", "token"])
  return {
    apiUrl: (apiUrl || "").replace(/\/+$/, ""),
    token: token || "",
  }
}

async function apiFetch(method, path, body) {
  const { apiUrl, token } = await getConfig()
  if (!apiUrl || !token) {
    return { ok: false, status: 0, error: "not_configured" }
  }
  try {
    const res = await fetch(apiUrl + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => null)
    return { ok: res.ok, status: res.status, data }
  } catch (e) {
    return { ok: false, status: 0, error: String(e) }
  }
}

// Baixa um arquivo (áudio, imagem, vídeo, documento de uma resposta rápida).
// Volta em base64 porque as mensagens entre o service worker e a página só levam texto/JSON.
async function fileFetch(path) {
  const { apiUrl, token } = await getConfig()
  if (!apiUrl || !token) return { ok: false, status: 0, error: "not_configured" }
  try {
    const res = await fetch(apiUrl + path, { headers: { Authorization: "Bearer " + token } })
    if (!res.ok) return { ok: false, status: res.status }
    const buf = new Uint8Array(await res.arrayBuffer())
    let bin = ""
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000))
    return { ok: true, status: 200, base64: btoa(bin), mime: res.headers.get("content-type") || "" }
  } catch (e) {
    return { ok: false, status: 0, error: String(e) }
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "api") {
    apiFetch(msg.method, msg.path, msg.body).then(sendResponse)
    return true // resposta assíncrona
  }
  if (msg && msg.type === "file") {
    fileFetch(msg.path).then(sendResponse)
    return true
  }
})
