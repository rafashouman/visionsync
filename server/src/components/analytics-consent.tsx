"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { analyticsFrame, analyticsPage } from "@/lib/analytics"
import { btn, card, ghost } from "@/lib/ui"

const key = "visionsync-analytics-consent"
const changed = "visionsync-analytics-consent-changed"
let blocked = false

function subscribe(callback: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key === key || event.key === null) { blocked = false; callback() }
  }
  window.addEventListener("storage", onStorage)
  window.addEventListener(changed, callback)
  return () => { window.removeEventListener("storage", onStorage); window.removeEventListener(changed, callback) }
}

function preference() {
  if (blocked) return "unavailable"
  try {
    const value = localStorage.getItem(key)
    return value === "accepted" || value === "rejected" ? value : "unset"
  } catch {
    return "unavailable"
  }
}

export function useBrowserPreference() {
  return useSyncExternalStore(subscribe, preference, () => "loading")
}

export function saveBrowserPreference(accepted: boolean) {
  try {
    localStorage.setItem(key, accepted ? "accepted" : "rejected")
    blocked = false
    window.dispatchEvent(new Event(changed))
  } catch {
    blocked = true
    window.dispatchEvent(new Event(changed))
    throw new Error("Não foi possível salvar a escolha neste navegador.")
  }
}

export function AnalyticsConsent() {
  const page = analyticsPage(usePathname())
  const consent = useBrowserPreference()
  const { data: session, status } = useSession()
  const accountId = session?.user?.id
  const accountConsent = session?.user?.analyticsConsent
  useEffect(() => {
    if (status !== "authenticated" || !accountId) return
    try { saveBrowserPreference(accountConsent === true) }
    catch { console.error("Não foi possível sincronizar a preferência de analytics neste navegador.") }
  }, [status, accountId, accountConsent])
  const accepted = status === "authenticated" ? session.user.analyticsConsent : status === "unauthenticated" && consent === "accepted"
  if (!page || !accepted) return null
  return <iframe key={page} title="Analytics" hidden sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={analyticsFrame(page)} />
}

export function AnalyticsRegistrationChoice({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  const [error, setError] = useState("")
  return <div className="vs-analytics-registration">
    <label><input type="checkbox" checked={value} onChange={event => {
      const accepted = event.target.checked
      onChange(accepted)
      try { saveBrowserPreference(accepted); setError("") }
      catch { setError("Não foi possível salvar a escolha neste navegador. Sua preferência poderá ser salva na conta ao concluir o cadastro.") }
    }} /> Permito o uso de analytics nas páginas públicas.</label>
    <p>Você pode alterar em Configurações.</p>
    {error && <p role="alert" className="vs-error">{error}</p>}
  </div>
}

export function AnalyticsSettings() {
  const { data: session, status, update } = useSession()
  const browserPreference = useBrowserPreference()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  async function choose(accepted: boolean) {
    setBusy(true); setError(""); setMessage("")
    try {
      const response = await fetch("/api/crm/analytics-consent", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ analyticsConsent: accepted }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar a preferência.")
      let browserError = false
      try { saveBrowserPreference(accepted) } catch { browserError = true }
      const refreshed = await update()
      if (!refreshed) throw new Error("Preferência salva na conta, mas não foi possível atualizar a sessão. Recarregue a página.")
      if (browserError) throw new Error("Preferência salva na conta, mas não foi possível salvá-la neste navegador para visitas sem login.")
      setMessage("Preferência salva na conta e neste navegador.")
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível salvar a preferência.") }
    finally { setBusy(false) }
  }

  return <section style={{ ...card, padding: 24 }} aria-labelledby="analytics-settings">
    <h2 id="analytics-settings" style={{ marginTop: 0 }}>Privacidade e analytics</h2>
    <p>O Google Tag Manager mede acessos às páginas públicas quando permitido. O painel, os dados dos formulários e os parâmetros da URL não são enviados por esta integração.</p>
    <p>A preferência fica na sua conta e é sincronizada neste navegador para visitas sem login.</p>
    <p>Na conta: {status !== "authenticated" ? "consultando…" : session.user.analyticsConsent ? "permitido" : "não permitido"}</p>
    {browserPreference === "unavailable" && <p role="alert" className="vs-error">Não foi possível sincronizar a preferência para visitas sem login neste navegador.</p>}
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      <button type="button" style={ghost} disabled={busy || status !== "authenticated"} onClick={() => void choose(false)}>Não permitir</button>
      <button type="button" style={btn} disabled={busy || status !== "authenticated"} onClick={() => void choose(true)}>Permitir analytics</button>
    </div>
    {error && <p role="alert" className="vs-error">{error}</p>}
    {message && <p role="status">{message}</p>}
  </section>
}
