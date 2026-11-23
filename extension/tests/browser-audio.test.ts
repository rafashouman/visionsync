import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { randomUUID } from "node:crypto"

const source = readFileSync(new URL("../page-bridge.js", import.meta.url), "utf8")
type Result = { ok: boolean; canceled?: boolean; uncertain?: boolean; error?: string; messageId?: string }
function fixture() {
  let chat = { id: { user: "5511999999999", server: "c.us", _serialized: "5511999999999@c.us" } }
  const calls: { id: unknown; blob: Blob; options: { isPtt: boolean } }[] = [], presence: unknown[][] = []
  const sdk = { isReady: true, chat: {
    sendFileMessage: async (id: unknown, blob: Blob, options: { isPtt: boolean }) => { calls.push({ id, blob, options }); return { id: "native-message" } },
    markIsRecording: async (id: unknown) => { presence.push(["recording", id]) },
    markIsComposing: async (id: unknown) => { presence.push(["composing", id]) },
    markIsPaused: async (id: unknown) => { presence.push(["stop", id]) },
  } }
  const window = { __vcrmWA: sdk, require(name: string) { return name === "WAWebCollections" ? { Chat: { getActive: () => chat } } : null } }
  const code = source.replace(/\}\)\(\)\s*$/, "return { sendAudio, presence }; })()")
  const api = runInNewContext(code, { window, document: { addEventListener() {}, removeEventListener() {} }, Blob, atob, Uint8Array }) as {
    sendAudio: (arg: Record<string, unknown>) => Promise<Result>;
    presence: (arg: Record<string, unknown>) => Promise<Result>;
  }
  return { ...api, calls, indicators: presence, sdk, switchChat() { chat = { id: { user: "5521999999999", server: "c.us", _serialized: "5521999999999@c.us" } } } }
}
const audio = () => ({ requestId: randomUUID(), phone: "5511999999999", key: "5511999999999@c.us", base64: "T2dnUw==", mime: "audio/ogg", name: "saudacao.ogg", asVoiceNote: true })

test("native browser audio uses the active chat and the voice-note option", async () => {
  const f = fixture()
  const result = await f.sendAudio(audio())
  assert.equal(result.ok, true)
  assert.equal(result.messageId, "native-message")
  assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0].options.isPtt, true)
  assert.equal(await f.calls[0].blob.text(), "OggS")
})

test("audio is refused for another phone, another chat key or an unready WhatsApp adapter", async () => {
  const f = fixture()
  assert.equal((await f.sendAudio({ ...audio(), phone: "5521999999999" })).canceled, true)
  assert.equal((await f.sendAudio({ ...audio(), key: "different@lid" })).canceled, true)
  f.sdk.isReady = false
  assert.equal((await f.sendAudio(audio())).ok, false)
  assert.equal(f.calls.length, 0)
})

test("concurrent or repeated operation IDs call WhatsApp only once", async () => {
  const f = fixture(), request = audio()
  const results = await Promise.all([f.sendAudio(request), f.sendAudio(request)])
  assert.ok(results.every(result => result.ok))
  assert.equal((await f.sendAudio(request)).ok, true)
  assert.equal(f.calls.length, 1)
})

test("an error after entering WhatsApp is ambiguous and is not retried for the same operation", async () => {
  const f = fixture(), request = audio()
  let calls = 0
  f.sdk.chat.sendFileMessage = async () => { calls++; throw Error("transport interrupted") }
  assert.equal((await f.sendAudio(request)).uncertain, true)
  assert.equal((await f.sendAudio(request)).uncertain, true)
  assert.equal(calls, 1)
})

test("presence is cleared on the original chat even after the user switches conversations", async () => {
  const f = fixture(), request = audio()
  assert.equal((await f.presence({ ...request, action: "recording" })).ok, true)
  f.switchChat()
  assert.equal((await f.presence({ requestId: request.requestId, action: "stop" })).ok, true)
  assert.deepEqual(f.indicators.map(call => call[0]), ["recording", "stop"])
  assert.equal(f.indicators[0][1], f.indicators[1][1])
})

test("invalid MIME, malformed data and oversized audio never reach WhatsApp", async () => {
  const f = fixture()
  for (const fields of [{ mime: "text/html" }, { base64: "!invalid" }, { base64: "A".repeat(5592409) }]) {
    assert.equal((await f.sendAudio({ ...audio(), ...fields })).ok, false)
  }
  assert.equal(f.calls.length, 0)
})

test("canceling while the recording indicator starts also clears its late completion", async () => {
  const f = fixture(), request = audio()
  let finish!: () => void
  f.sdk.chat.markIsRecording = () => new Promise<void>(resolve => { finish = resolve })
  const start = f.presence({ ...request, action: "recording" })
  await f.presence({ requestId: request.requestId, action: "stop" })
  finish()
  assert.equal((await start).canceled, true)
  assert.deepEqual(f.indicators.map(call => call[0]), ["stop", "stop"])
})

test("cache pruning keeps an older in-flight audio from being sent a second time", async () => {
  const f = fixture(), request = audio()
  let finish!: () => void, calls = 0
  f.sdk.chat.sendFileMessage = async () => { calls++; if (calls === 1) await new Promise<void>(resolve => { finish = resolve }); return { id: "message" } }
  const first = f.sendAudio(request)
  for (let i = 0; i < 50; i++) await f.sendAudio(audio())
  const duplicate = f.sendAudio(request)
  finish()
  await Promise.all([first, duplicate])
  assert.equal(calls, 51)
})
