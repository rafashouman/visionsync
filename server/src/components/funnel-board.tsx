"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Ellipsis, Flame, HandCoins, MessageSquare, Plus, Search, TrendingUp } from "lucide-react"
import type { Funnel, FunnelCard, FunnelColumn } from "@/lib/funnel"
import { withCountryCode } from "@/lib/phone"
import { SOURCES, SOURCE_LABEL, sourceLabel } from "@/lib/sources"
import dynamic from "next/dynamic"
const ContactDrawer = dynamic(() => import("./contact-drawer").then(module => module.ContactDrawer), { loading: () => <p role="status">Abrindo contato…</p> })
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

const pendingSales = new Map<string, string>()
async function call(method: string, url: string, body?: unknown) {
  const signature = method === "POST" && url.endsWith("/purchase") ? url + JSON.stringify(body) : null
  const key = signature ? pendingSales.get(signature) || crypto.randomUUID() : null
  if (signature && key) pendingSales.set(signature, key)
  const res = await fetch(url, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(key ? { "Idempotency-Key": key } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (signature && (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429))) pendingSales.delete(signature)
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`)
  return data
}

export function FunnelBoard({ initial }: { initial?: Funnel }) {
  const [pages, setPages] = useState<Record<string, number>>({})
  const sequence = useRef(0)
  const skipInitial = useRef(Boolean(initial))
  const [funnel, setFunnel] = useState<Funnel | null>(initial ?? null)
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
    const version = ++sequence.current
    try {
      const params = new URLSearchParams({ q: search, step: stepFilter, source: sourceFilter, idle: onlyIdle ? "1" : "0", pages: JSON.stringify(pages) })
      const data = await call("GET", `/api/crm/funnel?${params}`)
      if (version !== sequence.current) return
      setFunnel(data); setError(null)
    } catch (e) { if (version === sequence.current) setError(e instanceof Error ? e.message : "Não consegui carregar o funil.") }
  }, [search, stepFilter, sourceFilter, onlyIdle, pages])
  const invalidate = useCallback(() => { sequence.current++ }, [])
  useEffect(() => {
    if (skipInitial.current) { skipInitial.current = false; return }
    const timer = setTimeout(() => void load(), 250)
    return () => { clearTimeout(timer); invalidate() }
  }, [load, invalidate])
  const changePage = (id: string, page: number) => setPages(old => ({ ...old, [id]: page }))

  async function moveCard(contactId: string, fromId: string | null, toId: string | null) {
    if (fromId === toId) return

    try {
      await call("POST", "/api/crm/funnel/move", { contactId, fromListId: fromId, toListId: toId })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui mover.")
    }
  }

  function onDrop(colId: string | null) {
    if (drag) moveCard(drag.contactId, drag.fromId, colId)
    setDrag(null)
    setOverCol(null)
  }

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
          <span className="v-pill mute">{filtering ? `${funnel.matched} neste filtro` : "no funil"}</span>
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
          <div className="l">Em negociação (Pipeline)</div>
          <div className="n">{brl(funnel.totals.pipelineValue ?? 0)}</div>
          <span className="v-pill wait">{funnel.totals.openDealsCount ?? 0} {(funnel.totals.openDealsCount ?? 0) === 1 ? "oportunidade" : "oportunidades"}</span>
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
            onChange={(e) => { setPages({}); setSearch(e.target.value) }}
            placeholder="Buscar por nome ou número"
            style={{ ...bare, flex: 1 }}
          />
        </div>
        <select aria-label="Filtrar por próximo passo" value={stepFilter} onChange={(e) => { setPages({}); setStepFilter(e.target.value as StepFilter) }} style={{ ...field, width: "auto" }}>
          <option value="todos">Próximo passo: todos</option>
          <option value="atrasado">Atrasado</option>
          <option value="hoje">Para hoje</option>
          <option value="nenhum">Nenhum</option>
        </select>
        <select aria-label="Filtrar por origem" value={sourceFilter} onChange={(e) => { setPages({}); setSourceFilter(e.target.value as SourceFilter) }} style={{ ...field, width: "auto" }}>
          <option value="todas">Origem: todas</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>{SOURCE_LABEL[s]}</option>
          ))}
          <option value="sem">Sem origem</option>
        </select>
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6, color: "var(--text-2)" }}>
          <input type="checkbox" checked={onlyIdle} onChange={(e) => { setPages({}); setOnlyIdle(e.target.checked) }} />
          Paradas ({IDLE_DAYS}+ dias)
        </label>
      </div>

      {error && <p role="alert" style={errorText}>{error}</p>}
      {funnel.truncated && (
        <p style={{ color: "var(--wait)", fontSize: 12, margin: 0 }}>Cada coluna mostra até 100 contatos por página. Use Anterior/Próxima para continuar.</p>
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
          page={funnel.pages.__none ?? 1}
          onPage={page => changePage("__none", page)}
          destinations={funnel.lists}
          onMove={(id, to) => moveCard(id, null, to)}
          id={null}
          name="Sem lista"
          color="var(--muted)"
          total={funnel.unassigned.total}
          cards={funnel.unassigned.cards}
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
            page={funnel.pages[l.id] ?? 1}
            onPage={page => changePage(l.id, page)}
            destinations={funnel.lists}
            onMove={(id, to) => moveCard(id, l.id, to)}
            id={l.id}
            name={l.name}
            color={l.color}
            total={l.total}
            cards={l.cards}
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
  page: number
  onPage: (page: number) => void
  destinations: { id: string; name: string }[]
  onMove: (id: string, to: string | null) => Promise<void>
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
        {p.cards.some((c) => (c.dealValue ?? 0) > 0) && (
          <span style={{ ...chip("wait"), fontSize: 10.5, padding: "2px 7px" }} title="Total em negociação nesta coluna">
            {brl(p.cards.reduce((sum, c) => sum + (c.dealValue ?? 0), 0))}
          </span>
        )}
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
            destinations={p.destinations.filter(l => l.id !== p.id)}
            canUnassign={p.id !== null}
            onMove={to => p.onMove(c.id, to)}
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
        {p.total > 100 && <div className="vs-actions" aria-label={`Paginação de ${p.name}`}>
          <button style={ghostSm} disabled={p.page === 1} onClick={() => p.onPage(p.page - 1)}>Anterior</button>
          <span>{p.page} / {Math.ceil(p.total / 100)}</span>
          <button style={ghostSm} disabled={p.page * 100 >= p.total} onClick={() => p.onPage(p.page + 1)}>Próxima</button>
        </div>}
      </div>
    </div>
  )
}

/* ───────────── Card ───────────── */

function CardView({
  card: c, onDragStart, onDragEnd, onChanged, onError, onOpen, destinations, canUnassign, onMove,
}: {
  destinations: { id: string; name: string }[]
  canUnassign: boolean
  onMove: (to: string | null) => Promise<void>
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
        <button type="button"
          onClick={onOpen}
          title="Abrir dados, notas e histórico"
          style={{ background: "none", border: 0, padding: 0, fontWeight: 700, textAlign: "left", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer", color: "var(--strong)" }}
        >
          {c.name}
        </button>
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
      <label style={{ fontSize: 12, color: "var(--muted)" }}>Mover para
        <select style={field} value="" disabled={busy} onChange={e => { const to = e.target.value; if (to) void run(() => onMove(to === "__none" ? null : to)) }}>
          <option value="">Selecione uma lista</option>
          {canUnassign && <option value="__none">Sem lista</option>}
          {destinations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </label>
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
      {(c.dealValue ?? 0) > 0 && (
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--wait)", marginTop: 3 }}>
          Negócio: {c.dealTitle ? `${c.dealTitle} · ` : ""}{brl(c.dealValue!)}
        </div>
      )}

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
