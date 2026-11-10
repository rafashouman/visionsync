import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"

const script = readFileSync(new URL("../content.js", import.meta.url), "utf8")
function fixture(clipboard: unknown, options: { exec?: () => boolean; paste?: boolean; missing?: boolean } = {}) {
  const notices: string[] = []
  const box = { focus() {}, dispatchEvent() { return options.paste ? false : true } }
  const context = {
    document: { addEventListener() {}, querySelector() { return options.missing ? null : box }, execCommand: options.exec ?? (() => false) },
    navigator: { clipboard }, notices, setInterval() { return 1 },
    DataTransfer: class { setData() {} }, ClipboardEvent: class {},
    chrome: { runtime: { sendMessage(_message: unknown, callback: (data: unknown) => void) { callback({ ok: true, status: 200 }) } } },
  }
  const adapter = runInNewContext(`${script}\ntoast = message => notices.push(message); let sent = 0; clickSend = async () => { sent++; return true }; ({ insertIntoComposer, useReply, sends: () => sent })`, context) as {
    insertIntoComposer: (text: string) => boolean
    useReply: (reply: unknown) => Promise<void>
    sends: () => number
  }
  return { ...adapter, notices }
}

test("undefined clipboard return cannot crash a quick-reply sequence or continue sending", async () => {
  const adapter = fixture({ writeText() { return undefined } })
  await assert.doesNotReject(adapter.useReply({ id: "test", name: "Teste", type: "SEQUENCE", text: JSON.stringify([{ text: "Mensagem de teste", delaySec: 0 }]) }))
  assert.equal(adapter.sends(), 0)
  assert.ok(!adapter.notices.some(text => text.includes("Texto copiado")))
})

test("clipboard rejection and synchronous failures stay inside the insertion fallback", async () => {
  for (const clipboard of [undefined, {}, { writeText() { throw new Error("blocked") } }, { writeText() { return Promise.reject(new Error("denied")) } }]) {
    const adapter = fixture(clipboard, { exec() { throw new Error("editor unavailable") } })
    assert.equal(adapter.insertIntoComposer("Teste"), false)
    await new Promise<void>(resolve => setImmediate(resolve))
    assert.ok(!adapter.notices.some(text => text.includes("Texto copiado")))
  }
})

test("copy success is announced only after the clipboard promise resolves", async () => {
  let resolveCopy!: () => void
  const adapter = fixture({ writeText() { return new Promise<void>(resolve => { resolveCopy = resolve }) } })
  assert.equal(adapter.insertIntoComposer("Teste"), false)
  assert.ok(!adapter.notices.some(text => text.includes("Texto copiado")))
  resolveCopy()
  await new Promise<void>(resolve => setImmediate(resolve))
  assert.ok(adapter.notices.some(text => text.includes("Texto copiado")))
})

test("successful paste or insertText keeps insertion working without clipboard fallback", () => {
  for (const options of [{ paste: true }, { exec: () => true }]) {
    let copied = 0
    const adapter = fixture({ writeText() { copied++; return Promise.resolve() } }, options)
    assert.equal(adapter.insertIntoComposer("Teste"), true)
    assert.equal(copied, 0)
  }
  assert.equal(fixture(undefined, { missing: true }).insertIntoComposer("Teste"), false)
})
