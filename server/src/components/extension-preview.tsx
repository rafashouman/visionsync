import { Bell, Check, ExternalLink, FileText, Plus, Sparkles, User, Wallet, X, Zap } from "lucide-react"

/** Static demonstration of the extension's real panel structure, using fictional data. */
export function ExtensionPreview() {
  const sections = [User, FileText, Bell, Wallet, Zap, ExternalLink]
  return <figure className="vs-extension-demo" aria-label="Exemplo do painel da extensão com dados fictícios">
    <figcaption className="vs-demo-caption"><span>PAINEL DA EXTENSÃO</span><span>Exemplo · dados fictícios</span></figcaption>
    <div className="vs-demo-window">
      <div className="vs-demo-panel">
        <div className="vs-demo-heading"><strong>Esta conversa</strong><X size={16} aria-hidden="true" /></div>
        <div className="vs-demo-body">
          <div className="vs-demo-person"><span className="vs-demo-avatar">M</span><div><strong>Marina Costa</strong><span>Contato de demonstração</span></div></div>
          <div className="vs-demo-labels"><span>Clientes</span><span>Em atendimento</span></div>
          <span className="vs-demo-add"><Plus size={12} aria-hidden="true" /> Adicionar à lista</span>
          <div className="vs-demo-badges"><span>Cliente recorrente</span><span>Indicação</span></div>
          <dl className="vs-demo-stats"><div><dt>compras</dt><dd>3</dd></div><div><dt>total</dt><dd>R$ 450,00</dd></div><div><dt>última</dt><dd>7d</dd></div></dl>
          <div className="vs-demo-card"><strong className="vs-demo-section">Registrar compra</strong><div className="vs-demo-field">Valor (R$)</div><div className="vs-demo-field">Produto ou serviço (opcional)</div><span className="vs-demo-action"><Check size={13} aria-hidden="true" />Registrar compra</span></div>
          <div className="vs-demo-card"><strong className="vs-demo-section">Negócio &amp; dados</strong><span className="vs-demo-field-label">Próximo passo (Follow-up)</span><div className="vs-demo-field vs-demo-value">Enviar proposta de atendimento</div></div>
          <div className="vs-demo-history"><strong className="vs-demo-section">Histórico</strong><div><span>Atendimento individual<small>Última compra</small></span><b>R$ 150,00</b></div></div>
        </div>
      </div>
      <div className="vs-demo-rail" aria-hidden="true"><span className="vs-demo-logo"><Sparkles size={18} /></span>{sections.map((Icon, i) => <span className={i === 0 ? "vs-demo-rail-item active" : "vs-demo-rail-item"} key={i}><Icon size={17} /></span>)}</div>
    </div>
    <div className="vs-demo-disclaimer">Prévia ilustrativa, sem conexão com conversas reais.</div>
  </figure>
}
