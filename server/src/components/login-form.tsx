"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AuthBackground } from "@/components/auth-background"
import { BrandLogo } from "@/components/brand-logo"
import { ThemePicker } from "@/components/theme-picker"
import { PasswordInput } from "@/components/password-input"

export function LoginForm({ notice = "", replies = "" }: { notice?: string; replies?: string }) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await signIn("credentials", { email, password, redirect: false })
      if (!res?.ok || res.error) setError("Email ou senha incorretos. Confira seus dados ou recupere sua senha.")
      else {
        router.push(replies === "nova" ? "/dashboard/respostas?nova=1" : replies === "lista" ? "/dashboard/respostas" : "/dashboard")
        router.refresh()
      }
    } catch { setError("Não foi possível conectar ao servidor. Tente novamente.") }
    finally { setLoading(false) }
  }

  return (
    <AuthBackground>
      <form onSubmit={handleSubmit} className="auth-card">
        <h1 className="auth-title"><BrandLogo size="big" /></h1>
        <p className="auth-sub">Entre na sua conta</p>
        <label className="auth-label" htmlFor="login-email">Email</label>
        <input id="login-email" className="auth-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        <label className="auth-label" htmlFor="login-password">Senha</label>
        <PasswordInput id="login-password" variant="dark" value={password} onChange={setPassword} autoComplete="current-password" />
        {notice && <p role="status" style={{ color: "var(--auth-link)" }}>{notice}</p>}
        <p className="auth-foot"><Link href="/recuperar-senha">Esqueci minha senha</Link></p>
        {error && <p className="auth-error">{error}</p>}
        <button className="auth-btn" disabled={loading}>{loading ? "Entrando..." : "Entrar"}</button>
        <p className="auth-foot">
          Não tem conta? <Link href="/cadastro">Cadastre-se</Link>
        </p>
        <details className="vs-auth-appearance"><summary>Aparência</summary><ThemePicker compact /></details>
      </form>
    </AuthBackground>
  )
}
