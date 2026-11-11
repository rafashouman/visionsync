import { crmFailure, type ConnectionReport } from "./diagnostics"
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
    await diagnose()
  } catch (error) { show(error instanceof Error ? error.message : "Falha ao conectar.", true) }
  finally { save.disabled = false }
})

const diagnoseButton = document.getElementById("diagnose") as HTMLButtonElement
const copyButton = document.getElementById("copy-diagnostic") as HTMLButtonElement
const health = document.getElementById("health")!
let report: ConnectionReport | null = null
function healthLine(label: string, value: string) {
  const term = document.createElement("dt"), description = document.createElement("dd")
  term.textContent = label; description.textContent = value
  health.append(term, description)
}
async function diagnose() {
  diagnoseButton.disabled = true; copyButton.disabled = true
  health.replaceChildren(); healthLine("Verificação", "Consultando conexões…")
  try {
    const result = await chrome.runtime.sendMessage({ type: "connection-diagnostics" })
    if (!result || result.error) throw new Error("Reabra a extensão para tentar novamente.")
    report = result as ConnectionReport
    health.replaceChildren()
    healthLine("Configuração", !report.configured ? "Informe URL e token e salve acima." : report.permitted ? "Permissão de acesso concedida" : "Clique em Salvar e autorize acesso ao CRM.")
    healthLine("CRM", report.crm.ok ? "Conectado" : crmFailure(report.crm.status))
    if (report.server?.tokenExpiresAt) healthLine("Token válido até", new Date(report.server.tokenExpiresAt).toLocaleString("pt-BR"))
    const tabs = report.tabs
    healthLine("WhatsApp Web", !tabs.length ? "Abra o WhatsApp Web no Chrome." : `${tabs.filter(tab => tab.responsive && !tab.expired).length} de ${tabs.length} abas com o plugin respondendo`)
    const ready = tabs.some(tab => tab.responsive && !tab.expired && tab.bridge)
    healthLine("Integração com o WhatsApp", ready ? "Ponte respondendo" : "Abra uma conversa; se persistir, reative o painel ou recarregue a aba.")
    if (tabs.some(tab => tab.currentVersion && tab.currentVersion !== report!.version)) healthLine("Versão nas abas", "Há uma aba com versão antiga. Reative o painel ou recarregue o WhatsApp.")
    const syncs = tabs.flatMap(tab => tab.lastSyncAt ? [tab.lastSyncAt] : []).sort()
    healthLine("Última sincronização de respostas", syncs.length ? new Date(syncs.at(-1)!).toLocaleString("pt-BR") : "Ainda não confirmada nesta sessão.")
    const connector = report.server?.connector
    healthLine("Envios no servidor", !connector ? "Não foi possível consultar." : !connector.configured || !connector.enabled ? "Não configurado — respostas comuns continuam pelo navegador." : !connector.workerOnline ? "Processo de envios offline. Confira o servidor." : !connector.connected ? "Desconectado. Vincule em Envios no servidor." : connector.paused ? "Conectado, com fila pausada." : "Conectado, com fila ativa.")
    healthLine("Verificado em", new Date(report.checkedAt).toLocaleTimeString("pt-BR"))
    copyButton.disabled = false
  } catch (error) { report = null; health.replaceChildren(); healthLine("Falha na verificação", error instanceof Error ? error.message : "Não foi possível verificar.") }
  finally { diagnoseButton.disabled = false }
}
diagnoseButton.addEventListener("click", diagnose)
copyButton.addEventListener("click", async () => {
  if (!report) return
  try { await navigator.clipboard.writeText(JSON.stringify(report, null, 2)); show("Diagnóstico copiado sem credenciais ou dados das conversas.") }
  catch { show("Não foi possível copiar. Clique novamente com a janela aberta.", true) }
})
