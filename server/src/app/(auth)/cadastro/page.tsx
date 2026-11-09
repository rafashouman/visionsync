"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
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
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error || "Erro ao cadastrar.")
      setLoading(false)
      return
    }
    await signIn("credentials", { email, password, redirect: false })
    setLoading(false)
    router.push("/dashboard")
    router.refresh()
  }

  return (
    <div className="auth-bg">
      <form onSubmit={handleSubmit} className="auth-card">
        <h1 className="auth-title">✦ Vision CRM</h1>
        <p className="auth-sub">Crie sua conta</p>
        <label className="auth-label">Nome</label>
        <input className="auth-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
        <label className="auth-label">Email</label>
        <input className="auth-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        <label className="auth-label">Senha (mínimo 6 caracteres)</label>
        <PasswordInput variant="dark" value={password} onChange={setPassword} minLength={6} autoComplete="new-password" />
        <label className="auth-label">Confirmar senha</label>
        <PasswordInput variant="dark" value={confirm} onChange={setConfirm} minLength={6} autoComplete="new-password" />
        {mismatch && <p className="auth-error" style={{ fontSize: 12, marginTop: 6 }}>As senhas não são iguais.</p>}
        {error && <p className="auth-error">{error}</p>}
        <button className="auth-btn" disabled={loading || mismatch}>{loading ? "Criando..." : "Criar conta"}</button>
        <p className="auth-foot">
          Já tem conta? <Link href="/login">Entrar</Link>
        </p>
      </form>
    </div>
  )
}
