"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AuthBackground } from "@/components/auth-background"
import { BrandLogo } from "@/components/brand-logo"
import { ThemePicker } from "@/components/theme-picker"
import { PasswordInput } from "@/components/password-input"

export default function CadastroPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const mismatch = confirm.length > 0 && password !== confirm

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirm) {
      setError("As senhas não são iguais.")
      return
    }

    setLoading(true)
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, confirmPassword: confirm }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error || "Erro ao cadastrar.")
        return
      }
      router.push("/login?cadastro=sucesso")
    } catch {
      setError("Não foi possível conectar ao servidor. Tente novamente.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthBackground>
      <form onSubmit={handleSubmit} className="auth-card">
        <h1 className="auth-title"><BrandLogo size="big" /></h1>
        <p className="auth-sub">Crie sua conta</p>
        <label className="auth-label" htmlFor="name">Nome</label>
        <input id="name" className="auth-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
        <label className="auth-label" htmlFor="email">Email</label>
        <input id="email" className="auth-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        <label className="auth-label" htmlFor="password">Senha (mínimo 8 caracteres)</label>
        <PasswordInput id="password" variant="dark" value={password} onChange={setPassword} preventCopy minLength={8} autoComplete="new-password" />
        <label className="auth-label" htmlFor="confirm-password">Confirmar senha</label>
        <PasswordInput id="confirm-password" variant="dark" value={confirm} onChange={setConfirm} confirmManually minLength={8} autoComplete="new-password" />
        {mismatch && <p className="auth-error" style={{ fontSize: 12, marginTop: 6 }}>As senhas não são iguais.</p>}
        {error && <p className="auth-error">{error}</p>}
        <button className="auth-btn" disabled={loading || mismatch}>{loading ? "Criando..." : "Criar conta"}</button>
        <p className="auth-foot">
          Já tem conta ou acabou de criar? <Link href="/login">Entrar</Link>
        </p>
        <details className="vs-auth-appearance"><summary>Aparência</summary><ThemePicker compact /></details>
      </form>
    </AuthBackground>
  )
}
