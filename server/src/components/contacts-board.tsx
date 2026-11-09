"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import { ContactDrawer } from "./contact-drawer"
import { PageHeader } from "./page-header"
import { btn, card, field } from "@/lib/ui"
import { MessageSquare, Plus, Search, Users } from "lucide-react"

type Contact = { id: string; name: string; phone: string }
export function ContactsBoard() {
  const [query, setQuery] = useState("")
  const [contacts, setContacts] = useState<Contact[]>([])
  const [error, setError] = useState("")
  const [selected, setSelected] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/crm/contacts?q=${encodeURIComponent(query)}`, { signal })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Não foi possível carregar os contatos.")
      setContacts(data); setError("")
    } catch (err) { if (!signal?.aborted) setError(err instanceof Error ? err.message : "Falha de conexão.") }
    finally { if (!signal?.aborted) setLoading(false) }
  }, [query])
  useEffect(() => { const abort = new AbortController(); const timer = setTimeout(() => void load(abort.signal), 250); return () => { clearTimeout(timer); abort.abort() } }, [load])
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("")
    const form = new FormData(event.currentTarget)
    try {
      const res = await fetch("/api/crm/contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.get("name"), phone: form.get("phone") }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar.")
      setAdding(false); await load(); setSelected(data.id)
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao salvar.") }
    finally { setBusy(false) }
  }
  return <div className="vs-stack">
    <PageHeader title="Contatos" subtitle="Cada conversa tem uma história. Mantenha tudo por perto." actions={<button style={btn} onClick={() => setAdding(!adding)}><Plus size={16} /> Novo contato</button>} />
    <div style={{ ...card, padding: 20 }}>
      <label className="vs-search"><Search size={18} /><input aria-label="Buscar contato" value={query} onChange={e => setQuery(e.target.value)} placeholder="Busque por nome ou telefone" style={{ ...field, flex: 1 }} /></label>
      <p className="v-sub">Busca nos contatos da sua conta. Mostrando até 20 resultados mais recentes.</p>
    </div>
    {error && <p role="alert" className="vs-error">{error}</p>}
    {adding && <form onSubmit={create} style={{ ...card, padding: 24 }} className="vs-contact-form">
      <label>Nome<input style={field} name="name" required maxLength={100} autoFocus /></label>
      <label>Telefone com DDD<input style={field} name="phone" type="tel" required placeholder="55 11 99999-9999" /></label>
      <div className="vs-actions"><button type="button" style={btn} onClick={() => setAdding(false)}>Cancelar</button><button style={btn} disabled={busy}>{busy ? "Salvando…" : "Salvar contato"}</button></div>
    </form>}
    <div style={{ ...card, padding: 8 }} aria-busy={loading}>
      {loading ? <p className="vs-empty">Carregando contatos…</p> : !contacts.length ? <div className="vs-empty"><Users size={32} /><h2>{query ? "Nenhum contato encontrado" : "Sua próxima conversa começa aqui"}</h2><p>{query ? "Tente outro nome ou número." : "Adicione um contato ou importe pelo plugin no WhatsApp."}</p></div> : contacts.map(c => <div key={c.id} className="vs-contact-row">
        <button className="vs-contact-name" onClick={() => setSelected(c.id)}><span className="vs-avatar">{c.name.slice(0, 1).toUpperCase()}</span><span><strong>{c.name}</strong><small>+{c.phone}</small></span></button>
        <a href={`https://wa.me/${c.phone}`} target="_blank" rel="noreferrer" className="vs-wa"><MessageSquare size={17} /><span>Conversar</span></a>
      </div>)}
    </div>
    {selected && <ContactDrawer contactId={selected} onClose={() => setSelected(null)} onChanged={() => load()} />}
  </div>
}
