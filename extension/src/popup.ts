import { normalizeApiUrl } from "./policy"

const input = (id: string) => document.getElementById(id) as HTMLInputElement
const url = input("apiUrl")
const token = input("token")
const save = document.getElementById("save") as HTMLButtonElement
const message = document.getElementById("msg")!
function show(text: string, error = false) { message.textContent = text; message.className = `msg ${error ? "err" : "ok"}` }
const theme = document.getElementById("theme") as HTMLSelectElement
function applyTheme(value: string) { document.documentElement.dataset.vcrmTheme = ["light", "minimal"].includes(value) ? value : "dark" }
const storedPreferences = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {}
chrome.storage.local.get("vcrmPrefs").then(cfg => { theme.value = ["light", "minimal"].includes(String(storedPreferences(cfg.vcrmPrefs).theme)) ? String(storedPreferences(cfg.vcrmPrefs).theme) : "dark"; applyTheme(theme.value) }).catch(() => show("Não foi possível carregar a aparência.", true))
theme.addEventListener("change", async () => {
  try {
    applyTheme(theme.value)
    const cfg = await chrome.storage.local.get("vcrmPrefs")
    await chrome.storage.local.set({ vcrmPrefs: { ...storedPreferences(cfg.vcrmPrefs), theme: theme.value } })
    const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" })
    await Promise.allSettled(tabs.filter(t => t.id !== undefined).map(tab => chrome.tabs.sendMessage(tab.id!, { type: "theme", theme: theme.value })))
  } catch { show("Não foi possível aplicar o tema.", true) }
})
document.getElementById("repair")!.addEventListener("click", async () => {
  try { const result = await chrome.runtime.sendMessage({ type: "repair-tabs" }); show(result?.ok ? (result.repaired ? "Painel reativado nas abas abertas." : "Abra o WhatsApp Web para usar o painel.") : "Recarregue a aba do WhatsApp para concluir.", !result?.ok) }
  catch { show("Recarregue a extensão e tente novamente.", true) }
})

chrome.storage.local.get(["apiUrl"]).then(cfg => { url.value = typeof cfg.apiUrl === "string" ? cfg.apiUrl : "http://localhost:3001" }).catch(() => show("Reabra a extensão para carregar a configuração.", true))
token.placeholder = "Cole um novo token ou mantenha o atual"
save.addEventListener("click", async () => {
  save.disabled = true
  try {
    const apiUrl = normalizeApiUrl(url.value.trim())
    const origin = `${apiUrl}/*`
    if (!(await chrome.permissions.request({ origins: [origin] }))) {
      throw new Error("Permita acesso ao endereço do seu CRM para conectar.")
    }
    const previous = await chrome.storage.local.get(["apiUrl", "token"])
    const secret = token.value.trim() || (previous.apiUrl === apiUrl ? previous.token : "")
    if (!/^crm_[a-f0-9]{48}$/.test(String(secret))) throw new Error("Gere um token nas Configurações e cole aqui.")
    await chrome.storage.local.set({ apiUrl, token: secret })
    await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })
    token.value = ""
    show("Testando conexão…")
    const res = await chrome.runtime.sendMessage({ type: "api", method: "GET", path: "/api/crm/me" })
    if (!res?.ok) throw new Error(res?.status === 401 ? "Token inválido ou expirado. Gere outro no CRM." : "Não conectou. Confira se o CRM está aberto.")
    show(`Conectado como ${res.data.name || res.data.email}.`)
  } catch (error) { show(error instanceof Error ? error.message : "Falha ao conectar.", true) }
  finally { save.disabled = false }
})
