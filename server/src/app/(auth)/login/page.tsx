"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { PasswordInput } from "@/components/password-input"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await signIn("credentials", { email, password, redirect: false })
    setLoading(false)
    if (res?.error) {
      setError("Email ou senha incorretos. Se ainda não tem conta, clique em Cadastre-se.")
    } else {
      router.push("/dashboard")
      router.refresh()
    }
  }

  return (
    <div className="auth-bg">
      <form onSubmit={handleSubmit} className="auth-card">
        <h1 className="auth-title">✦ Vision CRM</h1>
        <p className="auth-sub">Entre na sua conta</p>
        <label className="auth-label">Email</label>
        <input className="auth-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        <label className="auth-label">Senha</label>
        <PasswordInput variant="dark" value={password} onChange={setPassword} autoComplete="current-password" />
        {error && <p className="auth-error">{error}</p>}
        <button className="auth-btn" disabled={loading}>{loading ? "Entrando..." : "Entrar"}</button>
        <p className="auth-foot">
          Não tem conta? <Link href="/cadastro">Cadastre-se</Link>
        </p>
      </form>
    </div>
  )
}
