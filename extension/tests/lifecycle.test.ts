import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
const source = readFileSync(new URL("../content.js", import.meta.url), "utf8")

function fixture(sendMessage: (message: unknown, callback?: (response: unknown) => void) => unknown, lastError?: { message: string }) {
  const banners: unknown[] = [], notices: string[] = [], cleared: unknown[] = []
  const box = {}
  const context = {
    document: { addEventListener() {}, createElement() { return { setAttribute() {} } }, body: { appendChild(node: unknown) { banners.push(node) } } },
    chrome: { runtime: { id: "test-extension", sendMessage, lastError } },
    setInterval() { return 42 }, clearInterval(id: unknown) { cleared.push(id) }, setTimeout, clearTimeout,
    notices, box, btoa,
  }
  const adapter = runInNewContext(`${source}
    toast = message => notices.push(message);
    getComposer = () => box; ensureBar = () => {}; state.phone = '5511999999999';
    ({ runtimeMessage, savePrefs, attachFile, useReply, parseSequenceSteps, mediaPicker, uploadReplyFile, guardedEvent, invalidateExtension, life: extensionLife, setPhone: phone => state.phone = phone, setRun: fn => runReply = fn })`, context) as {
      runtimeMessage: (message: unknown) => Promise<{ ok: boolean; error?: string }>
      savePrefs: (values?: unknown) => Promise<unknown>
      attachFile: (reply: unknown) => Promise<unknown>
      useReply: (reply: unknown) => Promise<unknown>
      parseSequenceSteps: (raw: string) => { quickReplyId?: string }[]
      mediaPicker: (id: string) => string
      uploadReplyFile: (file: File, options?: unknown) => Promise<unknown>
      guardedEvent: (handler: (event: unknown) => Promise<void>) => (event: unknown) => void
      invalidateExtension: () => void
      life: { expired: boolean }; setPhone: (phone: string) => void; setRun: (fn: () => Promise<unknown>) => void
    }
  return { ...adapter, banners, notices, cleared }
}
test("invalidated runtime: synchronous throws and promise rejection stop old loops without uncaught errors", async () => {
  for (const send of [() => { throw new Error("Extension context invalidated.") }, () => Promise.reject(new Error("Extension context invalidated."))]) {
    const f = fixture(send)
    assert.equal((await f.runtimeMessage({ type: "config-status" })).ok, false)
    assert.equal(f.life.expired, true); assert.equal(f.banners.length, 1)
    assert.ok(f.cleared.includes(42))
    await f.runtimeMessage({ type: "prefs-get" }); assert.equal(f.banners.length, 1)
  }
})
test("runtime.lastError callbacks are consumed and produce the reload notice", async () => {
  const f = fixture((_message, callback) => callback?.(undefined), { message: "Extension context invalidated." })
  await f.runtimeMessage({}); assert.equal(f.life.expired, true)
})
test("preferences persist once, without recursive savePrefs calls", async () => {
  const messages: unknown[] = []
  const f = fixture((message, callback) => { messages.push(message); callback?.({ ok: true }) })
  await f.savePrefs()
  assert.equal(messages.length, 1)
  assert.equal((messages[0] as { type: string }).type, "prefs-set")
  assert.equal((source.match(/function savePrefs\(/g) ?? []).length, 1)
})
test("changing chat during a file download prevents attachment to the new conversation", async () => {
  let respond!: (response: unknown) => void
  const f = fixture((_message, callback) => { respond = callback! })
  const task = f.attachFile({ id: "audio", type: "AUDIO" })
  f.setPhone("5521999999999")
  respond({ ok: true, base64: "YQ==" })
  assert.equal(await task, false)
  assert.ok(f.notices.some(n => n.includes("Conversa mudou")))
})
test("rapid clicks cannot run two favorite replies concurrently", async () => {
  const f = fixture(() => Promise.resolve({ ok: true }))
  let finish!: () => void, calls = 0
  f.setRun(async () => { calls++; await new Promise<void>(resolve => { finish = resolve }); return true })
  const first = f.useReply({})
  assert.equal(await f.useReply({}), false); assert.equal(calls, 1)
  finish(); await first
})
test("sequence parsing preserves an audio/image reference without requiring text", () => {
  const f = fixture(() => Promise.resolve({ ok: true }))
  assert.equal(f.parseSequenceSteps('[{"text":"","delaySec":0,"quickReplyId":"image-a"}]')[0].quickReplyId, "image-a")
})
test("invalidating while other runtime calls wait settles every pending operation", async () => {
  const f = fixture(() => undefined)
  const a = f.runtimeMessage({ type: "config-status" }), b = f.runtimeMessage({ type: "prefs-get" })
  f.invalidateExtension()
  assert.equal((await a).error, "extension_reloaded")
  assert.equal((await b).error, "extension_reloaded")
})
test("async submit boundary catches invalidated-context rejection and cancels native submit", async () => {
  const f = fixture(() => undefined)
  let prevented = false
  f.guardedEvent(async () => { throw new Error("Extension context invalidated.") })({ type: "submit", preventDefault() { prevented = true }, stopPropagation() {} })
  await new Promise<void>(resolve => setImmediate(resolve))
  assert.equal(prevented, true); assert.equal(f.life.expired, true)
})
test("both scheduler entry points expose a file input, and direct audio upload selects a reusable library item", async () => {
  const messages: unknown[] = []
  const f = fixture((message, callback) => { messages.push(message); callback?.({ ok: true, status: 201, data: { id: "new-audio", type: "AUDIO", name: "Teste", favorite: true } }) })
  assert.match(f.mediaPicker("vh-media"), /data-upload-picker="vh-media"/)
  assert.match(f.mediaPicker("reminder-media"), /name="scheduledReplyId"/)
  assert.ok(source.includes('mediaPicker("vh-media")') && source.includes('mediaPicker("reminder-media")'))
  await f.uploadReplyFile(new File(["ID3test"], "saudacao.mp3"), { name: "Teste" })
  assert.equal((messages[0] as { mediaType: string }).mediaType, "AUDIO")
  assert.equal((messages[0] as { mime: string }).mime, "audio/mpeg")
})
