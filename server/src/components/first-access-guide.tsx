"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, Check, Compass, Puzzle, Users, Zap, Kanban, Calendar } from "lucide-react"
import { btn, card, ghost } from "@/lib/ui"

const steps = [
  { icon: Compass, title: "Bem-vindo ao VisionSync", text: "Seu atendimento, contatos e próximos passos em um só lugar. Este guia mostra como preparar sua conta e começar a usar o CRM.", href: "/dashboard/painel", action: "Conhecer o painel" },
  { icon: Puzzle, title: "Conecte o plugin ao WhatsApp", text: "Abra Plugin WhatsApp, baixe e instale a extensão seguindo as instruções. Depois, em Configurações, gere seu token e informe a URL do sistema e o token no ícone da extensão. Abra ou recarregue o WhatsApp Web. Guarde o token como uma senha.", href: "/dashboard/extensao", action: "Instalar o plugin" },
  { icon: Users, title: "Cadastre seus primeiros contatos", text: "Abra uma conversa individual no WhatsApp Web e use o painel VisionSync para cadastrar o contato. Você também pode gerenciar os contatos pelo site. Confira nome e telefone antes de salvar.", href: "/dashboard/contatos", action: "Ver contatos" },
  { icon: Zap, title: "Crie uma resposta rápida", text: "Clique em Nova e escolha Texto, Áudio, Imagem ou outro tipo disponível. Defina nome, categoria e atalho. No plugin, + Nova abre o editor no site. Ao voltar ao WhatsApp, atualize as respostas se necessário e confira o destinatário antes de enviar.", href: "/dashboard/respostas?nova=1", action: "Criar primeira resposta" },
  { icon: Kanban, title: "Organize suas oportunidades", text: "Use o funil para acompanhar cada oportunidade. Registre o valor previsto e o próximo passo do atendimento para saber quem precisa de atenção.", href: "/dashboard/funil", action: "Abrir funil" },
  { icon: Calendar, title: "Prepare sua rotina", text: "Acompanhe lembretes na Agenda e atendimentos em Pendências. Envios pelo servidor exigem configuração e conexão próprias em Envios no servidor. Você pode rever este guia pelo menu a qualquer momento.", href: "/dashboard/agenda", action: "Ver agenda" },
]

export function FirstAccessGuide({ completed = false, alwaysShow = false }: { completed?: boolean; alwaysShow?: boolean }) {
  const [visible, setVisible] = useState(!completed || alwaysShow)
  const [index, setIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  if (!visible) return null
  const step = steps[index]
  const Icon = step.icon
  async function finish() {
    setSaving(true); setError("")
    try {
      const response = await fetch("/api/crm/onboarding", { method: "POST" })
      if (!response.ok) throw new Error()
      setVisible(false)
    } catch { setError("Não foi possível salvar seu progresso. Tente novamente.") }
    finally { setSaving(false) }
  }
  return <section aria-labelledby="welcome-title" style={{ ...card, padding: "clamp(20px, 4vw, 36px)", marginBottom: 24, borderColor: "var(--accent)" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
      <Icon size={34} style={{ color: "var(--accent-text)" }} />
      <div style={{ flex: 1 }}><p style={{ margin: "0 0 6px", color: "var(--accent-text)", fontSize: 12, letterSpacing: 1 }}>PRIMEIROS PASSOS · {index + 1} DE {steps.length}</p><h2 id="welcome-title" style={{ margin: 0, fontSize: 24 }}>{step.title}</h2></div>
      <button style={ghost} disabled={saving} onClick={finish}>Ver depois</button>
    </div>
    <div role="progressbar" aria-label="Progresso do tutorial" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={index + 1} style={{ height: 4, borderRadius: 4, background: "var(--line)", marginTop: 22 }}><div style={{ width: `${(index + 1) / steps.length * 100}%`, background: "var(--accent)", height: "100%" }} /></div>
    <div aria-live="polite"><p style={{ color: "var(--muted)", lineHeight: 1.8, maxWidth: 780 }}>{step.text}</p></div>
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
      <Link href={step.href} target="_blank" rel="noopener noreferrer" style={ghost}>{step.action} ↗</Link>
      {index > 0 && <button style={ghost} onClick={() => setIndex(index - 1)}>Voltar</button>}
      <button style={{ ...btn, display: "inline-flex", alignItems: "center", gap: 8 }} disabled={saving} onClick={index === steps.length - 1 ? finish : () => setIndex(index + 1)}>{index === steps.length - 1 ? <><Check size={16} />Concluir guia</> : <>Próximo<ArrowRight size={16} /></>}</button>
    </div>
    {error && <p role="alert" style={{ color: "var(--danger)" }}>{error}</p>}
  </section>
}
