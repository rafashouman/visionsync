"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut, useSession } from "next-auth/react"
import {
  Bell, Bot, Calendar, ChartColumn, Kanban, LogOut, Settings, Sparkles, Users, Wallet, Wrench, Zap,
  type LucideIcon,
} from "lucide-react"

type Item = { label: string; icon: LucideIcon; href?: string } // sem href = ainda não existe ("em breve")

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "SEU DIA",
    items: [
      { label: "Pendências", icon: Bell, href: "/dashboard/pendencias" },
      { label: "Agenda", icon: Calendar },
      { label: "Painel do dia", icon: ChartColumn, href: "/dashboard/painel" },
    ],
  },
  {
    title: "VENDAS",
    items: [
      { label: "Funil", icon: Kanban, href: "/dashboard/funil" },
      { label: "Cobranças", icon: Wallet, href: "/dashboard/cobrancas" },
      { label: "Contatos", icon: Users },
    ],
  },
  {
    title: "MENSAGENS",
    items: [
      { label: "Respostas rápidas", icon: Zap, href: "/dashboard/respostas" },
      { label: "Mensagens automáticas", icon: Bot },
    ],
  },
  {
    title: "FERRAMENTAS",
    items: [
      { label: "Ferramentas", icon: Wrench, href: "/dashboard/ferramentas" },
      { label: "Configurações", icon: Settings, href: "/dashboard/configuracoes" },
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
  const { data: session } = useSession()
  const name = session?.user?.name

  return (
    <aside className="v-card v-side">
      <Link href="/dashboard" className="v-brand">
        <span className="v-mark"><Sparkles size={18} /></span>
        <span>Vision <b>CRM</b></span>
      </Link>

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
              <Link key={it.label} href={it.href} className={`v-nav${active ? " on" : ""}`} aria-current={active ? "page" : undefined}>
                <Icon size={18} />
                {it.label}
              </Link>
            )
          })}
        </div>
      ))}

      <div className="v-me">
        <span className="v-av">{initials(name)}</span>
        <div className="who">
          {name ?? "Minha conta"}
          <small>Vision CRM</small>
        </div>
        <button className="v-out" onClick={() => signOut({ callbackUrl: "/login" })} title="Sair" aria-label="Sair">
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  )
}
