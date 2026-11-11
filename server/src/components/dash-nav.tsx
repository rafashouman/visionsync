"use client"

import Link from "next/link"
import { BrandLogo } from "./brand-logo"
import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { signOut, useSession } from "next-auth/react"
import {
  Bell, Bot, Calendar, ChartColumn, Kanban, LogOut, Settings, Users, Wallet, Wrench, Zap, Puzzle,
  Menu, X, type LucideIcon,
} from "lucide-react"

type Item = { label: string; icon: LucideIcon; href?: string } // sem href = ainda não existe ("em breve")

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "SEU DIA",
    items: [
      { label: "Pendências", icon: Bell, href: "/dashboard/pendencias" },
      { label: "Agenda", icon: Calendar, href: "/dashboard/agenda" },
      { label: "Painel do dia", icon: ChartColumn, href: "/dashboard/painel" },
    ],
  },
  {
    title: "VENDAS",
    items: [
      { label: "Funil", icon: Kanban, href: "/dashboard/funil" },
      { label: "Cobranças", icon: Wallet, href: "/dashboard/cobrancas" },
      { label: "Contatos", icon: Users, href: "/dashboard/contatos" },
    ],
  },
  {
    title: "MENSAGENS",
    items: [
      { label: "Respostas rápidas", icon: Zap, href: "/dashboard/respostas" },
      { label: "Mensagens automáticas", icon: Bot, href: "/dashboard/automacoes" },
      { label: "Envios no servidor", icon: Zap, href: "/dashboard/whatsapp" },
    ],
  },
  {
    title: "FERRAMENTAS",
    items: [
      { label: "Ferramentas", icon: Wrench, href: "/dashboard/ferramentas" },
      { label: "Configurações", icon: Settings, href: "/dashboard/configuracoes" },
      { label: "Guia de primeiro acesso", icon: Puzzle, href: "/dashboard/tutorial" },
      { label: "Plugin WhatsApp", icon: Puzzle, href: "/dashboard/extensao" },
    ],
  },
]

const initials = (name?: string | null) =>
  (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "VC"

export function DashNav() {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const { data: session } = useSession()
  const name = session?.user?.name
  const [sendAlert, setSendAlert] = useState("")

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>
    async function check() {
      try {
        const response = await fetch("/api/crm/whatsapp/health", { cache: "no-store" })
        if (!response.ok) throw new Error("Falha na consulta")
        const health: { connectionProblem: boolean; review: number; unreviewed: number } = await response.json()
        const warnings = [health.connectionProblem ? "Conexão precisa de atenção" : "", health.unreviewed ? `${health.unreviewed} resultado(s) incerto(s)` : "", health.review ? `${health.review} aguardando aprovação` : ""].filter(Boolean)
        if (active) setSendAlert(warnings.join(" · "))
      } catch {
        if (active) setSendAlert("Não foi possível verificar os envios")
      }
      if (active) timer = setTimeout(check, 30000)
    }
    if (session?.user?.id) void check()
    return () => { active = false; clearTimeout(timer) }
  }, [session?.user?.id])

  return (
    <aside className="v-card v-side">
      <Link href="/dashboard" className="v-brand">
        <BrandLogo />
      </Link>

      <button ref={menuButton} type="button" className="vs-menu-toggle" aria-expanded={menuOpen} aria-controls="dashboard-navigation" onClick={() => setMenuOpen(!menuOpen)}>
        {menuOpen ? <X size={18} /> : <Menu size={18} />}
        {menuOpen ? "Fechar" : "Menu"}
      </button>
      {sendAlert && <Link href="/dashboard/whatsapp" role="status" style={{ color: "var(--wait-text)", fontSize: 12, margin: "8px 0", display: "block" }}>{sendAlert}</Link>}
      <nav id="dashboard-navigation" aria-label="Navegação principal" className={`vs-dashboard-navigation${menuOpen ? " is-open" : ""}`} onKeyDown={(event) => {
        if (event.key === "Escape" && menuOpen) { setMenuOpen(false); menuButton.current?.focus() }
      }}>
      {GROUPS.map((g) => (
        <div key={g.title} style={{ display: "contents" }}>
          <div className="v-grp">{g.title}</div>
          {g.items.map((it) => {
            const Icon = it.icon
            if (!it.href) {
              return (
                <span key={it.label} className="v-nav off" aria-disabled="true" title="Em breve">
                  <Icon size={18} />
                  {it.label}
                  <span className="v-soon">em breve</span>
                </span>
              )
            }
            const active = pathname.startsWith(it.href)
            return (
              <Link key={it.label} href={it.href} className={`v-nav${active ? " on" : ""}`} aria-current={active ? "page" : undefined} onClick={() => { if (menuOpen) { setMenuOpen(false); menuButton.current?.focus() } }}>
                <Icon size={18} />
                {it.label}
              </Link>
            )
          })}
        </div>
      ))}

      </nav>
      <div className="v-me">
        <span className="v-av">{initials(name)}</span>
        <div className="who">
          {name ?? "Minha conta"}
          <small>VisionSync</small>
        </div>
        <button className="v-out" onClick={() => signOut({ callbackUrl: "/login" })} title="Sair" aria-label="Sair">
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  )
}
