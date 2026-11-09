"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Ellipsis, Flame, HandCoins, MessageSquare, Plus, Search, TrendingUp } from "lucide-react"
import type { Funnel, FunnelCard, FunnelColumn } from "@/lib/funnel"
import { withCountryCode } from "@/lib/phone"
import { SOURCES, SOURCE_LABEL, sourceLabel } from "@/lib/sources"
import { ContactDrawer } from "@/components/contact-drawer"
import { PageHeader } from "@/components/page-header"
import { btn, btnSm, card, chip, errorText, field, ghost, ghostSm, iconBtn, inner, link } from "@/lib/ui"

const TZ = "America/Sao_Paulo"
const COLORS = ["#3b82f6", "#f5b84a", "#34d399", "#e0245e", "#a78bfa", "#22d3ee", "#fb923c", "#f472b6"]
const IDLE_DAYS = 3

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: TZ })
const dateInput = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ })

type StepFilter = "todos" | "atrasado" | "hoje" | "nenhum"
type SourceFilter = "todas" | "sem" | (typeof SOURCES)[number]
type Drag = { contactId: string; fromId: string | null } | null

async function call(method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`)
  return data
}

export function FunnelBoard() {
  const [funnel, setFunnel] = useState<Funnel | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [stepFilter, setStepFilter] = useState<StepFilter>("todos")
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("todas")
  const [openContactId, setOpenContactId] = useState<string | null>(null)
  const [onlyIdle, setOnlyIdle] = useState(false)
  const [drag, setDrag] = useState<Drag>(null)
  const [overCol, setOverCol] = useState<string | null>(null)
  const [addContactFor, setAddContactFor] = useState<string | "none" | null>(null)
  const [showNewList, setShowNewList] = useState(false)

  const load = useCallback(async () => {
    try {
      setFunnel(await call("GET", "/api/crm/funnel"))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui carregar o funil.")
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const matches = useCallback(
    (c: FunnelCard) => {
      const q = search.trim().toLowerCase()
      if (q && !c.name.toLowerCase().includes(q) && !c.phone.includes(q.replace(/\D/g, "") || "§")) return false
      if (stepFilter !== "todos" && c.nextStepState !== stepFilter) return false
      if (onlyIdle && c.daysIdle < IDLE_DAYS) return false
      if (sourceFilter === "sem" && c.source) return false
      if (sourceFilter !== "todas" && sourceFilter !== "sem" && c.source !== sourceFilter) return false
      return true
    },
    [search, stepFilter, onlyIdle, sourceFilter]
  )

  async function moveCard(contactId: string, fromId: string | null, toId: string | null) {
    if (fromId === toId) return

    // Atualiza a tela na hora; depois confere com o servidor.
    setFunnel((prev) => {
      if (!prev) return prev
      const source = fromId ? prev.lists.find((l) => l.id === fromId) : null
      const card = (source ? source.cards : prev.unassigned.cards).find((c) => c.id === contactId)
      if (!card) return prev
      const without = (cards: FunnelCard[]) => cards.filter((c) => c.id !== contactId)
      return {
        ...prev,
        lists: prev.lists.map((l) => {
          if (l.id === fromId) return { ...l, total: l.total - 1, cards: without(l.cards) }
          if (l.id === toId) return { ...l, total: l.total + 1, cards: [card, ...without(l.cards)] }
          return l
        }),
        unassigned: fromId
          ? prev.unassigned
          : { total: prev.unassigned.total - 1, cards: without(prev.unassigned.cards) },
      }
    })

    try {
      await call("POST", "/api/crm/funnel/move", { contactId, fromListId: fromId, toListId: toId })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui mover.")
    }
    await load()
  }

  function onDrop(colId: string | null) {
    if (drag) moveCard(drag.contactId, drag.fromId, colId)
    setDrag(null)
    setOverCol(null)
  }

  const visibleCount = useMemo(() => {
    if (!funnel) return 0
    const ids = new Set<string>()
    for (const col of [...funnel.lists, funnel.unassigned]) col.cards.filter(matches).forEach((c) => ids.add(c.id))
    return ids.size
  }, [funnel, matches])

  if (!funnel) {
    return <p style={{ padding: 24, color: error ? "var(--danger)" : "var(--muted)" }}>{error ?? "Carregando o funil..."}</p>
  }

  const filtering = search.trim() !== "" || stepFilter !== "todos" || onlyIdle || sourceFilter !== "todas"

  return (
    <>
      <PageHeader
        title="Funil"
        subtitle="Arraste as clientes entre as etapas. O vinho mostra o que precisa de você."
        actions={
          <>
            <button onClick={() => setShowNewList((v) => !v)} style={ghost}>+ Lista</button>
            <button onClick={() => setAddContactFor("none")} style={btn}>+ Contato</button>
          </>
        }
      />

      {/* Números do topo */}
      <div className="v-card v-kpis">
        <div className="v-kpi">
          <div className="l">Contatos</div>
          <div className="n">{funnel.totals.contacts}</div>
          <span className="v-pill mute">{filtering ? `${visibleCount} neste filtro` : "no funil"}</span>
        </div>
        <div className="v-kpi">
          <div className="l">Em compras</div>
          <div className="n">{brl(funnel.totals.totalSpent)}</div>
          <span className="v-pill ok"><TrendingUp size={13} />recebido</span>
        </div>
        <div className="v-kpi">
          <div className="l">A receber</div>
          <div className="n">{brl(funnel.charges.aReceber.total)}</div>
          <span className="v-pill wait">{funnel.charges.aReceber.count} {funnel.charges.aReceber.count === 1 ? "cobrança" : "cobranças"}</span>
        </div>
        <div className="v-kpi">
          <div className="l">Vencidas</div>
          <div className="n">{brl(funnel.charges.vencidas.total)}</div>
          <span className="v-pill late">{funnel.charges.vencidas.count} {funnel.charges.vencidas.count === 1 ? "cobrança" : "cobranças"}</span>
        </div>
      </div>

      {/* Barra de ferramentas */}
      <div style={toolbar}>
        <div style={searchBox}>
          <Search size={16} style={{ color: "var(--muted)", flex: "none" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou número"
            style={{ ...bare, flex: 1 }}
          />
        </div>
        <select value={stepFilter} onChange={(e) => setStepFilter(e.target.value as StepFilter)} style={{ ...field, width: "auto" }}>
          <option value="todos">Próximo passo: todos</option>
          <option value="atrasado">Atrasado</option>
          <option value="hoje">Para hoje</option>
          <option value="nenhum">Nenhum</option>
        </select>
        <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as SourceFilter)} style={{ ...field, width: "auto" }}>
          <option value="todas">Origem: todas</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>{SOURCE_LABEL[s]}</option>
          ))}
          <option value="sem">Sem origem</option>
        </select>
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6, color: "var(--text-2)" }}>
          <input type="checkbox" checked={onlyIdle} onChange={(e) => setOnlyIdle(e.target.checked)} />
          Paradas ({IDLE_DAYS}+ dias)
        </label>
      </div>

      {error && <p style={errorText}>{error}</p>}
      {funnel.truncated && (
        <p style={{ color: "var(--wait)", fontSize: 12, margin: 0 }}>Mostrando só os 2000 contatos mais recentes.</p>
      )}

      {showNewList && (
        <NewListForm
          nextColor={COLORS[funnel.lists.length % COLORS.length]}
          onDone={async (err) => {
            if (err) setError(err)
            else {
              setShowNewList(false)
              await load()
            }
          }}
        />
      )}

      {addContactFor && (
        <AddContactForm
          lists={funnel.lists}
          initialListId={addContactFor === "none" ? "" : addContactFor}
          onClose={() => setAddContactFor(null)}
          onDone={async () => {
            setAddContactFor(null)
            await load()
          }}
        />
      )}

      {/* Quadro */}
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", overflowX: "auto", paddingBottom: 16 }}>
        <Column
          id={null}
          name="Sem lista"
          color="var(--muted)"
          total={funnel.unassigned.total}
          cards={funnel.unassigned.cards.filter(matches)}
          over={overCol === "__none"}
          onOver={() => setOverCol("__none")}
          onDrop={() => onDrop(null)}
          onDragStart={(id) => setDrag({ contactId: id, fromId: null })}
          onDragEnd={() => { setDrag(null); setOverCol(null) }}
          onChanged={load}
          onError={setError}
          onOpen={setOpenContactId}
        />
        {funnel.lists.map((l) => (
          <Column
            key={l.id}
            id={l.id}
            name={l.name}
            color={l.color}
            total={l.total}
            cards={l.cards.filter(matches)}
            over={overCol === l.id}
            onOver={() => setOverCol(l.id)}
            onDrop={() => onDrop(l.id)}
            onDragStart={(id) => setDrag({ contactId: id, fromId: l.id })}
            onDragEnd={() => { setDrag(null); setOverCol(null) }}
            onChanged={load}
            onError={setError}
            onOpen={setOpenContactId}
            onAddContact={() => setAddContactFor(l.id)}
          />
        ))}
      </div>

      {funnel.lists.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
          Crie sua primeira lista em <b>+ Lista</b> (ex.: Novos, Em conversa, Compradoras) e arraste os contatos entre elas.
        </p>
      )}

      {openContactId && (
        <ContactDrawer contactId={openContactId} onClose={() => setOpenContactId(null)} onChanged={load} />
      )}
    </>
  )
}

/* ───────────── Coluna ───────────── */

type ColumnProps = {
  id: string | null
  name: string
  color: string
  total: number
  cards: FunnelCard[]
  over: boolean
  onOver: () => void
  onDrop: () => void
  onDragStart: (contactId: string) => void
  onDragEnd: () => void
  onChanged: () => Promise<void>
  onError: (msg: string) => void
  onOpen: (contactId: string) => void
  onAddContact?: () => void
}

function Column(p: ColumnProps) {
  const [menu, setMenu] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState(p.name)

  async function rename() {
    if (!p.id || !newName.trim()) return
    try {
      await call("PATCH", `/api/crm/lists/${p.id}`, { name: newName.trim() })
      setRenaming(false)
      await p.onChanged()
    } catch (e) {
      p.onError(e instanceof Error ? e.message : "Não consegui renomear.")
    }
  }

  async function remove() {
    if (!p.id) return
    if (!confirm(`Excluir a lista "${p.name}"? Os contatos não são apagados, só saem desta lista.`)) return
    try {
      await call("DELETE", `/api/crm/lists/${p.id}`)
      await p.onChanged()
    } catch (e) {
      p.onError(e instanceof Error ? e.message : "Não consegui excluir.")
    }
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); p.onOver() }}
      onDrop={(e) => { e.preventDefault(); p.onDrop() }}
      style={{
        ...card,
        width: 300,
        flexShrink: 0,
        padding: 12,
        borderColor: p.over ? "var(--accent)" : "var(--line)",
        boxShadow: p.over ? "0 0 0 1px var(--accent), 0 0 30px var(--glow)" : "var(--card-shadow)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, position: "relative" }}>
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: p.color, boxShadow: `0 0 8px ${p.color}`, flex: "none" }} />
        {renaming ? (
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") rename(); if (e.key === "Escape") setRenaming(false) }}
            onBlur={rename}
            style={{ ...field, flex: 1, padding: "3px 6px" }}
          />
        ) : (
          <strong style={{ fontSize: 14, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--strong)" }}>
            {p.name}
          </strong>
        )}
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{p.total}</span>
        {p.onAddContact && (
          <button onClick={p.onAddContact} title="Adicionar contato nesta lista" aria-label="Adicionar contato nesta lista" style={{ ...iconBtn, color: "var(--vred)" }}>
            <Plus size={17} />
          </button>
        )}
        {p.id && (
          <button onClick={() => setMenu((v) => !v)} style={iconBtn} title="Opções da lista" aria-label="Opções da lista">
            <Ellipsis size={17} />
          </button>
        )}
        {menu && (
          <div style={popup}>
            <button style={popupItem} onClick={() => { setMenu(false); setRenaming(true) }}>Renomear</button>
            <button style={{ ...popupItem, color: "var(--danger)" }} onClick={() => { setMenu(false); remove() }}>
              Excluir lista
            </button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 9, minHeight: 40 }}>
        {p.cards.map((c) => (
          <CardView
            key={c.id}
            card={c}
            onDragStart={() => p.onDragStart(c.id)}
            onDragEnd={p.onDragEnd}
            onChanged={p.onChanged}
            onError={p.onError}
            onOpen={() => p.onOpen(c.id)}
          />
        ))}
        {p.cards.length === 0 && (
          <p style={{ fontSize: 12, color: "var(--faint)", textAlign: "center", margin: "10px 0" }}>
            {p.total > 0 ? "Nenhum card neste filtro" : "Arraste contatos pra cá"}
          </p>
        )}
        {p.total > p.cards.length && p.cards.length > 0 && (
          <p style={{ fontSize: 11, color: "var(--faint)", textAlign: "center", margin: 0 }}>
            +{p.total - p.cards.length} não exibidos
          </p>
        )}
      </div>
    </div>
  )
}

/* ───────────── Card ───────────── */

function CardView({
  card: c, onDragStart, onDragEnd, onChanged, onError, onOpen,
}: {
  card: FunnelCard
  onDragStart: () => void
  onDragEnd: () => void
  onChanged: () => Promise<void>
  onError: (m: string) => void
  onOpen: () => void
}) {
  const [mode, setMode] = useState<null | "buy" | "step" | "charge">(null)
  const [amount, setAmount] = useState("")
  const [product, setProduct] = useState("")
  const [chAmount, setChAmount] = useState("")
  const [chDue, setChDue] = useState(() => dateInput(new Date().toISOString()))
  const [chDesc, setChDesc] = useState("")
  const [chLink, setChLink] = useState("")
  const [step, setStep] = useState(c.nextStep ?? "")
  const [due, setDue] = useState(c.nextStepAt ? dateInput(c.nextStepAt) : "")
  const [busy, setBusy] = useState(false)

  const idle = c.daysIdle >= IDLE_DAYS

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    try {
      await fn()
      setMode(null)
      await onChanged()
    } catch (e) {
      onError(e instanceof Error ? e.message : "Algo deu errado.")
    } finally {
      setBusy(false)
    }
  }

  function saveBuy() {
    const value = parseFloat(amount.replace(",", "."))
    if (!value || value <= 0) return onError("Informe um valor maior que zero.")
    run(async () => {
      await call("POST", `/api/crm/contacts/${c.id}/purchase`, { amount: value, productName: product || undefined })
      setAmount("")
      setProduct("")
    })
  }

  function saveStep() {
    run(() => call("PATCH", `/api/crm/contacts/${c.id}`, { nextStep: step, nextStepAt: due || null }))
  }

  function saveCharge() {
    const value = parseFloat(chAmount.replace(",", "."))
    if (!value || value <= 0) return onError("Informe um valor maior que zero.")
    if (!chDue) return onError("Informe o vencimento.")
    run(async () => {
      await call("POST", "/api/crm/charges", {
        contactId: c.id,
        amount: value,
        dueDate: chDue,
        description: chDesc || undefined,
        paymentLink: chLink || undefined,
      })
      setChAmount("")
      setChDesc("")
      setChLink("")
    })
  }

  const stepTone = c.nextStepState === "atrasado" ? "late" : c.nextStepState === "hoje" ? "wine" : "mute"
  const due1 = c.chargesDue

  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", c.id); e.dataTransfer.effectAllowed = "move"; onDragStart() }}
      onDragEnd={onDragEnd}
      style={{
        ...inner,
        padding: "11px 12px",
        cursor: "grab",
        borderLeft: `4px solid ${idle ? "var(--late)" : "rgba(143, 163, 214, 0.35)"}`,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <strong
          onClick={onOpen}
          title="Abrir dados, notas e histórico"
          style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer", color: "var(--strong)" }}
        >
          {c.name}
        </strong>
        <a
          href={`https://wa.me/${withCountryCode(c.phone)}`}
          target="_blank"
          rel="noreferrer"
          draggable={false}
          style={{ ...link, whiteSpace: "nowrap", textDecoration: "none", flex: "none" }}
          title="Abrir a conversa no WhatsApp"
        >
          <MessageSquare size={13} />Abrir conversa
        </a>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", margin: "2px 0 6px" }}>
        {c.phone}
        {c.notesCount > 0 && (
          <span title="Notas" style={{ marginLeft: 6, fontSize: 11 }}>
            · {c.notesCount} {c.notesCount === 1 ? "nota" : "notas"}
          </span>
        )}
      </div>

      <div style={{ fontSize: 12, fontWeight: 600, color: c.purchases ? "var(--ok)" : "var(--faint)" }}>
        {c.purchases
          ? `${brl(c.totalSpent)} · ${c.purchases} ${c.purchases === 1 ? "compra" : "compras"}`
          : "Sem compras ainda"}
      </div>

      {(sourceLabel(c.source) || due1 || c.nextStepState !== "nenhum") && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {sourceLabel(c.source) && <span style={chip("vio")}>{sourceLabel(c.source)}</span>}
          {due1 && due1.overdue && <span style={chip("late")} title="Veja a página Cobranças">Vencida {brl(due1.overdueTotal)}</span>}
          {due1 && due1.total > due1.overdueTotal && (
            <span style={chip("wait")} title="Veja a página Cobranças">A receber {brl(due1.total - due1.overdueTotal)}</span>
          )}
          {c.nextStepState !== "nenhum" && (
            <button
              onClick={() => setMode(mode === "step" ? null : "step")}
              title="Editar próximo passo"
              style={{ ...chip(stepTone), cursor: "pointer", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}
            >
              {c.nextStepState === "atrasado" ? "Atrasado · " : c.nextStepState === "hoje" ? "Hoje · " : ""}
              {c.nextStep || "Passo"}
              {c.nextStepAt ? ` (${shortDate(c.nextStepAt)})` : ""}
            </button>
          )}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 9, alignItems: "center" }}>
        <button style={link} onClick={() => setMode(mode === "buy" ? null : "buy")}><Plus size={13} />compra</button>
        <button style={link} onClick={() => setMode(mode === "charge" ? null : "charge")}><HandCoins size={13} />Cobrar</button>
        {c.nextStepState === "nenhum" && (
          <button style={link} onClick={() => setMode(mode === "step" ? null : "step")}><Plus size={13} />próximo passo</button>
        )}
        {idle && (
          <span style={{ fontSize: 11, color: "var(--late-text)", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Flame size={13} />Parada há {c.daysIdle} dias
          </span>
        )}
      </div>

      {mode === "buy" && (
        <div style={form}>
          <input
            autoFocus type="text" inputMode="decimal" placeholder="Valor (R$)" value={amount}
            onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveBuy()}
            style={field}
          />
          <input type="text" placeholder="Produto (opcional)" value={product} onChange={(e) => setProduct(e.target.value)} style={field} />
          <div style={{ display: "flex", gap: 6 }}>
            <button disabled={busy} onClick={saveBuy} style={btnSm}>{busy ? "..." : "Registrar"}</button>
            <button onClick={() => setMode(null)} style={ghostSm}>Cancelar</button>
          </div>
        </div>
      )}

      {mode === "charge" && (
        <div style={form}>
          <input
            autoFocus type="text" inputMode="decimal" placeholder="Valor a cobrar (R$)" value={chAmount}
            onChange={(e) => setChAmount(e.target.value)} style={field}
          />
          <label style={{ fontSize: 11, color: "var(--muted)" }}>Vencimento</label>
          <input type="date" value={chDue} onChange={(e) => setChDue(e.target.value)} style={field} />
          <input type="text" placeholder="Descrição (opcional)" value={chDesc} onChange={(e) => setChDesc(e.target.value)} style={field} />
          <input type="text" placeholder="Link de pagamento ou Pix (opcional)" value={chLink} onChange={(e) => setChLink(e.target.value)} style={field} />
          <div style={{ display: "flex", gap: 6 }}>
            <button disabled={busy} onClick={saveCharge} style={btnSm}>{busy ? "..." : "Criar cobrança"}</button>
            <button onClick={() => setMode(null)} style={ghostSm}>Cancelar</button>
          </div>
        </div>
      )}

      {mode === "step" && (
        <div style={form}>
          <input
            autoFocus type="text" placeholder="Ex: mandar áudio, cobrar" value={step}
            onChange={(e) => setStep(e.target.value)} style={field}
          />
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={field} />
          <div style={{ display: "flex", gap: 6 }}>
            <button disabled={busy} onClick={saveStep} style={btnSm}>{busy ? "..." : "Salvar"}</button>
            {c.nextStepState !== "nenhum" && (
              <button
                disabled={busy}
                onClick={() => run(() => call("PATCH", `/api/crm/contacts/${c.id}`, { nextStep: null }))}
                style={ghostSm}
              >
                Concluir
              </button>
            )}
            <button onClick={() => setMode(null)} style={ghostSm}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ───────────── Formulários ───────────── */

function NewListForm({ nextColor, onDone }: { nextColor: string; onDone: (error?: string) => void }) {
  const [name, setName] = useState("")
  const [color, setColor] = useState(nextColor)
  const [busy, setBusy] = useState(false)

  async function create() {
    if (!name.trim()) return
    setBusy(true)
    try {
      await call("POST", "/api/crm/lists", { name: name.trim(), color })
      onDone()
    } catch (e) {
      onDone(e instanceof Error ? e.message : "Não consegui criar a lista.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={panel}>
      <input autoFocus placeholder="Nome da lista (ex: Compradoras)" value={name} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && create()} style={{ ...field, width: 240 }} />
      <div style={{ display: "flex", gap: 7 }}>
        {COLORS.map((c) => (
          <button key={c} onClick={() => setColor(c)} aria-label={`Cor ${c}`}
            style={{ width: 22, height: 22, borderRadius: "50%", background: c, cursor: "pointer", padding: 0,
              border: color === c ? "2px solid var(--strong)" : "2px solid transparent",
              boxShadow: color === c ? `0 0 10px ${c}` : "none" }} />
        ))}
      </div>
      <button onClick={create} disabled={busy || !name.trim()} style={btn}>{busy ? "Criando..." : "Criar lista"}</button>
    </div>
  )
}

function AddContactForm({
  lists, initialListId, onClose, onDone,
}: {
  lists: FunnelColumn[]
  initialListId: string
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [listId, setListId] = useState(initialListId)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function create() {
    setBusy(true)
    setErr(null)
    try {
      await call("POST", "/api/crm/contacts", { name, phone, listId: listId || null })
      await onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não consegui criar.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={panel}>
      <input autoFocus placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} style={{ ...field, width: 180 }} />
      <input placeholder="Telefone com DDD (ex: 11999998888)" value={phone} onChange={(e) => setPhone(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && create()} style={{ ...field, width: 250 }} />
      <select value={listId} onChange={(e) => setListId(e.target.value)} style={{ ...field, width: "auto" }}>
        <option value="">Sem lista</option>
        {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
      <button onClick={create} disabled={busy || !name.trim() || !phone.trim()} style={btn}>{busy ? "Criando..." : "Adicionar"}</button>
      <button onClick={onClose} style={ghost}>Cancelar</button>
      {err && <span style={{ color: "var(--danger)", fontSize: 12 }}>{err}</span>}
    </div>
  )
}

/* ───────────── Estilos próprios do funil ───────────── */

const toolbar: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }
const searchBox: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8, minWidth: 250, flex: "0 1 320px",
  background: "var(--field)", border: "1px solid var(--soft)", borderRadius: 12, padding: "8px 12px",
}
/** Campo sem moldura própria (a moldura é do contêiner). */
const bare: React.CSSProperties = { background: "transparent", border: "none", boxShadow: "none", padding: 0, fontSize: 13, outline: "none", color: "var(--text)" }
const panel: React.CSSProperties = { ...card, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: 14 }
const form: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 7, marginTop: 11, paddingTop: 11, borderTop: "1px solid var(--soft)" }
const popup: React.CSSProperties = {
  position: "absolute", top: 28, right: 0, zIndex: 10, display: "flex", flexDirection: "column", minWidth: 140,
  background: "var(--popup)", border: "1px solid var(--line)", borderRadius: 10, boxShadow: "0 10px 28px rgba(0,0,0,0.5)", overflow: "hidden",
}
const popupItem: React.CSSProperties = { background: "none", border: "none", textAlign: "left", padding: "9px 12px", fontSize: 13, cursor: "pointer", color: "var(--text)" }
