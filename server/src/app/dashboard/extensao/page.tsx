import Link from "next/link"
import { Download, Puzzle, ShieldCheck } from "lucide-react"
import { ExtensionPreview } from "@/components/extension-preview"
import { PageHeader } from "@/components/page-header"

export default function ExtensionPage() {
  return <div className="vs-stack">
    <PageHeader title="Seu CRM, dentro da conversa" subtitle="Conecte o plugin do Chrome ao WhatsApp Web e cuide do atendimento sem perder o contexto." />
    <section className="vs-plugin-hero">
      <div><span className="vs-eyebrow">PLUGIN WHATSAPP</span><h2>Mais contexto.<br />Menos troca de telas.</h2><p>Contatos, notas, cobranças, lembretes e respostas rápidas ao lado de cada conversa.</p><a href="/visionsync-extension.zip" className="vs-primary"><Download size={18} /> Baixar plugin para Chrome</a><small>Versão 0.22.0 · Instalação manual no Chrome desktop</small></div>
      <ExtensionPreview />
    </section>
    <section className="vs-install-grid">
      {[{ step: "01", title: "Instale no Chrome", text: "Baixe e extraia o arquivo. Abra chrome://extensions, ative Modo do desenvolvedor e escolha Carregar sem compactação. Selecione a pasta extraída." }, { step: "02", title: "Conecte sua conta", text: "Gere um token em Configurações. No ícone do plugin, cole a URL deste sistema e o token. Permita acesso somente ao seu endereço e teste a conexão." }, { step: "03", title: "Abra uma conversa", text: "Recarregue o WhatsApp Web e abra uma conversa individual. Use o painel para consultar e registrar informações. Você continua decidindo quando enviar mensagens." }].map(item => <article key={item.step} className="vs-install-card"><span>{item.step}</span><h3>{item.title}</h3><p>{item.text}</p></article>)}
    </section>
    <div className="vs-plugin-note"><ShieldCheck size={22} /><p>O plugin depende do WhatsApp Web e pode precisar de ajustes quando a interface mudar. No celular, continue pelo painel web. <Link href="/dashboard/configuracoes">Gerenciar conexão e token</Link>.</p><Puzzle size={22} /></div>
  </div>
}
