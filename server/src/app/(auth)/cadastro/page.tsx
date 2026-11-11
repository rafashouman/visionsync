"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AuthBackground } from "@/components/auth-background"
import { BrandLogo } from "@/components/brand-logo"
import { ThemePicker } from "@/components/theme-picker"

export default function CadastroPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    setLoading(true)
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
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
        <p className="auth-sub">Enviaremos um link para confirmar seu email e definir sua senha.</p>
        {error && <p className="auth-error">{error}</p>}
        <button className="auth-btn" disabled={loading}>{loading ? "Enviando..." : "Enviar link de acesso"}</button>
        <p className="auth-foot">
          Já tem conta ou acabou de criar? <Link href="/login">Entrar</Link>
        </p>
        <details className="vs-auth-appearance"><summary>Aparência</summary><ThemePicker compact /></details>
      </form>
    </AuthBackground>
  )
}
