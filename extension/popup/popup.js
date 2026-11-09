const urlEl = document.getElementById("apiUrl")
const tokenEl = document.getElementById("token")
const msgEl = document.getElementById("msg")

// Carrega valores salvos
chrome.storage.local.get(["apiUrl", "token"], (cfg) => {
  urlEl.value = cfg.apiUrl || ""
  tokenEl.value = cfg.token || ""
})

document.getElementById("save").addEventListener("click", async () => {
  const apiUrl = urlEl.value.trim().replace(/\/+$/, "")
  const token = tokenEl.value.trim()

  if (!apiUrl || !token) {
    show("Preencha a URL e o token.", "err")
    return
  }

  await chrome.storage.local.set({ apiUrl, token })
  show("Testando conexão…", "")

  const res = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "api", method: "GET", path: "/api/crm/me" }, resolve)
  })

  if (res && res.ok && res.data && res.data.ok) {
    show(`Conectado como ${res.data.name || res.data.email}. ✓`, "ok")
  } else if (res && res.status === 401) {
    show("Token inválido. Gere um novo em Configurações.", "err")
  } else {
    show("Não conectou. Confira a URL (o sistema precisa estar no ar).", "err")
  }
})

function show(text, cls) {
  msgEl.textContent = text
  msgEl.className = "msg " + cls
}
