"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AuthBackground } from "./auth-background"
import { BrandLogo } from "./brand-logo"
import { PasswordInput } from "./password-input"

export function PasswordRecovery({ reset = false, initialToken = "" }: { reset?: boolean; initialToken?: string }) {
  const router = useRouter()
  const [token] = useState(initialToken)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(reset && !/^[a-f0-9]{64}$/.test(initialToken) ? "Link inválido. Solicite um novo email de recuperação." : "")
  const [message, setMessage] = useState("")
  useEffect(() => {
    if (reset) window.history.replaceState(null, "", window.location.pathname)
  }, [reset])
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (reset && password !== confirmPassword) { setError("As senhas não são iguais."); return }
    setLoading(true); setError("")
    try {
      const response = await fetch(`/api/auth/${reset ? "reset-password" : "forgot-password"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(reset ? { token, password, confirmPassword } : { email }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Não foi possível concluir.")
      if (reset) router.replace("/login?senha=redefinida")
      else setMessage(data.message)
    } catch (error) { setError(error instanceof Error ? error.message : "Não foi possível conectar ao servidor.") }
    finally { setLoading(false) }
  }
  return <AuthBackground><form className="auth-card" onSubmit={submit}>
    <h1 className="auth-title"><BrandLogo size="big" /></h1>
    <p className="auth-sub">{reset ? "Defina sua nova senha" : "Recupere seu acesso"}</p>
    {reset ? <>
      <label className="auth-label" htmlFor="new-password">Nova senha (mínimo 8 caracteres)</label>
      <PasswordInput id="new-password" variant="dark" value={password} onChange={setPassword} minLength={8} autoComplete="new-password" preventCopy />
      <label className="auth-label" htmlFor="confirm-password">Digite a senha novamente</label>
      <PasswordInput id="confirm-password" variant="dark" value={confirmPassword} onChange={setConfirm} minLength={8} autoComplete="new-password" confirmManually />
    </> : <><label className="auth-label" htmlFor="recovery-email">Email da sua conta</label><input id="recovery-email" type="email" className="auth-input" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></>}
    {error && <p className="auth-error" role="alert">{error}</p>}
    {message && <p role="status" style={{ color: "var(--auth-link)" }}>{message}</p>}
    <button className="auth-btn" disabled={loading || !!message || (reset && !/^[a-f0-9]{64}$/.test(token))}>{loading ? "Aguarde..." : reset ? "Salvar nova senha" : "Enviar link de recuperação"}</button>
    <p className="auth-foot"><Link href="/login">Voltar ao login</Link>{reset && <> · <Link href="/recuperar-senha">Solicitar novo link</Link></>}</p>
  </form></AuthBackground>
}
