import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { randomUUID } from "node:crypto"

const source = readFileSync(new URL("../content.js", import.meta.url), "utf8")
function fixture() {
  const sent: unknown[][] = [], requests: { path: string; body?: { requestId?: string } }[] = []
  const bridge: { kind: string; arg: { requestId?: string; action?: string } }[] = [], previews: unknown[][] = []
  const context = { document: { addEventListener() {}, querySelector() { return null } }, setInterval() { return 1 }, setTimeout: (fn: () => void) => setTimeout(fn, 0), clearTimeout, chrome: { runtime: { id: "test" } }, crypto: { randomUUID }, sent, requests, bridge, previews }
  const adapter = runInNewContext(`${source}
    const box = { textContent: '' };
    toast = () => {}; ensureBar = () => {}; getComposer = () => box; insertIntoComposer = text => { box.textContent = text; return true };
    state.phone = '5511999999999'; resolveChat = async () => ({ phone: state.phone, key: state.phone + '@c.us' });
    clickSend = async (...args) => { sent.push(args); box.textContent = ''; return true };
    let response = { ok: true, status: 202, data: { id: '11111111-1111-4111-8111-111111111111', status: 'queued' } };
    api = async (method, path, body) => { requests.push({path, body}); return response };
    let nativeResponse = {ok:true,messageId:'local-message'}, presenceHook = () => {};
    fileApi = async () => ({ok:true,base64:'T2dnUw==',mime:'audio/ogg'});
    openVoicePreview = (...args) => previews.push(args);
    askBridge = async (kind, timeout, arg) => { bridge.push({kind,arg}); if (kind === 'send-audio') return nativeResponse; presenceHook(arg); return {ok:true}; };
    ({ useReply, sendScheduledReminder, refreshSendStatus, renderSendFeedback, feedback: () => sendFeedback,
       mode: direct => prefs.sendDirect = direct, phone: phone => state.phone = phone, response: value => response = value,
       draft: value => box.textContent = value, insert: fn => insertIntoComposer = fn, replies: items => state.replies = items,
       nativeResponse: value => nativeResponse = value, presence: fn => presenceHook = fn,
       legacyJob: () => sendState('queued','', 'job-id') })`, context) as {
    useReply: (reply: unknown) => Promise<unknown>; sendScheduledReminder: (reminder: unknown) => Promise<unknown>;
    renderSendFeedback: () => string; refreshSendStatus: () => Promise<void>; feedback: () => { status: string; jobId: string | null };
    mode: (direct: boolean) => void; phone: (phone: string) => void; response: (value: unknown) => void;
    draft: (value: string) => void; insert: (fn: () => boolean) => void; replies: (items: unknown[]) => void;
    nativeResponse: (value: unknown) => void; presence: (fn: (arg: { action: string }) => void) => void; legacyJob: () => void;
  }
  return { ...adapter, sent, requests, bridge, previews }
}
const text = { id: "reply", type: "TEXT", text: "Olá" }
const voice = { id: "voice", type: "AUDIO", asVoiceNote: true }

test("review mode prepares a text and cannot execute a sequence", async () => {
  const f = fixture(); f.mode(false)
  assert.equal(await f.useReply(text), false)
  assert.equal(f.feedback().status, "prepared")
  await f.useReply({ id: "sequence", type: "SEQUENCE", text: '[{"text":"Olá","delaySec":0}]' })
  assert.equal(f.sent.length, 0)
  assert.equal(f.feedback().status, "prepared")
})
test("a browser click is reported as requested, never as delivered", async () => {
  const f = fixture(); f.mode(true)
  assert.equal(await f.useReply(text), true)
  assert.equal(f.feedback().status, "requested")
  assert.equal(f.sent[0][2], "5511999999999")
})
test("switching conversations after insertion prevents a text send", async () => {
  const f = fixture(); f.mode(true)
  f.insert(() => { f.phone("5521999999999"); return true })
  assert.equal(await f.useReply(text), false)
  assert.equal(f.sent.length, 0)
  assert.equal(f.feedback().status, "canceled")
})
test("voice notes use the open browser session, without a server job or another phone login", async () => {
  const f = fixture(); f.mode(true)
  assert.equal(await f.useReply(voice), true)
  assert.equal(f.feedback().status, "requested")
  assert.equal(f.requests.some(request => request.path.endsWith("/send")), false)
  assert.deepEqual(f.bridge.map(call => call.kind), ["presence", "presence", "send-audio"])
  assert.equal(f.bridge[0].arg.action, "recording")
  f.response({ ok: true, status: 200, data: [voice] })
  // No prepared text can complete a reminder in review mode either.
  f.mode(false)
  assert.equal(await f.sendScheduledReminder({ id: "rem", contactPhone: "5511999999999", scheduledMessage: "Retorno" }), false)
  assert.equal(f.sent.length, 0)
})
test("an ambiguous browser response retains its operation identity and cannot be called delivered", async () => {
  const f = fixture(); f.mode(true); f.nativeResponse(null)
  await f.useReply(voice); await f.useReply(voice)
  assert.equal(f.feedback().status, "uncertain")
  const calls = f.bridge.filter(call => call.kind === "send-audio")
  assert.equal(calls[0].arg.requestId, calls[1].arg.requestId)
})
test("delivery status changes only from an authenticated job status response", async () => {
  const f = fixture(); f.legacyJob()
  await f.refreshSendStatus(); assert.equal(f.feedback().status, "queued")
  f.response({ ok: true, status: 200, data: { status: "delivered" } })
  await f.refreshSendStatus(); assert.equal(f.feedback().status, "delivered")
})

test("send-now never appends a saved answer to an existing draft and sends both", async () => {
  const f = fixture(); f.mode(true); f.draft("Rascunho que ainda precisa de revisão")
  assert.equal(await f.useReply(text), false)
  assert.equal(f.sent.length, 0)
  assert.equal(f.feedback().status, "blocked")
})

test("a job polled after a chat switch remains visibly associated with the original conversation", async () => {
  const f = fixture(); f.legacyJob()
  f.phone("5521999999999")
  await f.refreshSendStatus()
  assert.match(f.renderSendFeedback(), /outra conversa/)
  f.phone("5511999999999")
  assert.match(f.renderSendFeedback(), /Na fila do servidor/)
})

test("audio review stays inside WhatsApp without sending or completing a reminder", async () => {
  const f = fixture(); f.mode(false); f.response({ ok: true, status: 200, data: [voice] })
  assert.equal(await f.sendScheduledReminder({ id: "rem", contactPhone: "5511999999999", scheduledReplyId: "voice" }), false)
  assert.equal(f.previews.length, 1)
  assert.equal(f.feedback().status, "prepared")
  assert.equal(f.bridge.length, 0)
  assert.equal(f.requests.some(request => request.path.endsWith("/send")), false)
})

test("a new intentional audio click after a confirmed request gets a fresh operation identity", async () => {
  const f = fixture(); f.mode(true)
  await f.useReply(voice); await f.useReply(voice)
  const calls = f.bridge.filter(call => call.kind === "send-audio")
  assert.notEqual(calls[0].arg.requestId, calls[1].arg.requestId)
})

test("changing chat during the recording indicator cancels audio and clears the indicator", async () => {
  const f = fixture(); f.mode(true)
  f.presence(arg => { if (arg.action === "recording") f.phone("5521999999999") })
  assert.equal(await f.useReply(voice), false)
  assert.equal(f.feedback().status, "canceled")
  assert.equal(f.bridge.some(call => call.kind === "send-audio"), false)
  assert.equal(f.bridge.at(-1)?.arg.action, "stop")
})

test("a draft typed during composing is preserved and prevents a quick-reply send", async () => {
  const f = fixture(); f.mode(true)
  f.presence(arg => { if (arg.action === "composing") f.draft("Outra mensagem") })
  assert.equal(await f.useReply(text), false)
  assert.equal(f.feedback().status, "blocked")
  assert.equal(f.sent.length, 0)
})
