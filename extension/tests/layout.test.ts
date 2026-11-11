import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"

const source = readFileSync(new URL("../content.js", import.meta.url), "utf8")
type FakeEvent = { target: { closest: (selector: string) => { dataset: { ibTab: string } } | null }; stopPropagation: () => void }
type FakeNode = {
  id: string
  dataset: Record<string, string>
  hidden: boolean
  innerHTML: string
  listeners: Record<string, (event: FakeEvent) => void>
  addEventListener: (name: string, handler: (event: FakeEvent) => void) => void
  querySelector: () => null
  remove: () => void
}

test("filters open from the rail without inserting a bar above the contacts", async () => {
  const elements = new Map<string, FakeNode>()
  const parent = { insertBefore(node: FakeNode) { elements.set(node.id, node) } }
  const pane = { style: { display: "" }, parentNode: parent }
  const document = {
    querySelector(selector: string) { return selector === "#pane-side" ? pane : null },
    getElementById(id: string) { return elements.get(id) },
    createElement() {
      return {
        id: "", dataset: {}, hidden: false, innerHTML: "", listeners: {} as Record<string, (event: FakeEvent) => void>,
        addEventListener(name: string, handler: (event: FakeEvent) => void) { this.listeners[name] = handler },
        querySelector() { return null },
        remove() { elements.delete(this.id) },
      }
    },
    body: { appendChild(node: FakeNode) { elements.set(node.id, node) } },
    addEventListener() {},
  }
  const context = { document, setInterval() { return 1 }, clearInterval() {}, setTimeout, clearTimeout }
  const api = runInNewContext(`${source}
    state.status = "ok";
    refreshInboxData = async () => ensureInboxTabs();
    ({ ensureInboxTabs, onClick, inbox, state })`, context) as {
      ensureInboxTabs: () => void
      onClick: (event: unknown) => Promise<void>
      inbox: { tab: string }
      state: { status: string }
    }
  api.ensureInboxTabs()
  const bar = elements.get("vcrm-inbox-tabs")
  assert.ok(bar)
  assert.equal(bar.hidden, true)
  assert.equal(pane.style.display, "")
  const button = { dataset: { act: "inbox-filters" }, setAttribute() {} }
  await api.onClick({ target: { closest(selector: string) { return selector === "button" ? button : null } } })
  assert.equal(bar.hidden, false)
  bar.listeners.click({ target: { closest(selector: string) { return selector === "button[data-ib-tab]" ? { dataset: { ibTab: "unread" } } : null } }, stopPropagation() {} })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(api.inbox.tab, "unread")
  assert.equal(pane.style.display, "none")
  api.state.status = "no_config"
  api.ensureInboxTabs()
  assert.equal(pane.style.display, "")
})

test("appearance is available without a connection and the selected theme is saved", async () => {
  const messages: unknown[] = []
  const document = { documentElement: { dataset: {} }, addEventListener() {} }
  const context = {
    document, setInterval() { return 1 }, clearInterval() {}, setTimeout, clearTimeout,
    chrome: { runtime: { id: "test", sendMessage(message: unknown, callback: (result: unknown) => void) { messages.push(message); callback({ ok: true }) } } },
  }
  const api = runInNewContext(`${source}
    state.tab = "aparencia"; state.status = "no_config";
    ({ renderBody, onInput })`, context) as { renderBody: () => string; onInput: (event: unknown) => void }
  assert.match(api.renderBody(), /Vision minimalista/)
  api.onInput({ target: { value: "minimal", matches: (selector: string) => selector === "[data-theme-select]" } })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal((document.documentElement.dataset as { vcrmTheme?: string }).vcrmTheme, "minimal")
  assert.equal((messages[0] as { values: { vcrmPrefs: { theme: string } } }).values.vcrmPrefs.theme, "minimal")
})
