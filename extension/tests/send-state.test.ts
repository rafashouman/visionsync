import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { randomUUID } from "node:crypto"

const source = readFileSync(new URL("../content.js", import.meta.url), "utf8")
function fixture() {
  const sent: unknown[][] = [], requests: { path: string; body?: { requestId?: string } }[] = []
  const context = { document: { addEventListener() {}, querySelector() { return null } }, setInterval() { return 1 }, setTimeout: (fn: () => void) => setTimeout(fn, 0), clearTimeout, chrome: { runtime: { id: "test" } }, crypto: { randomUUID }, sent, requests }
  const adapter = runInNewContext(`${source}
    toast = () => {}; ensureBar = () => {}; getComposer = () => ({}); insertIntoComposer = () => true;
    state.phone = '5511999999999'; resolveChat = async () => ({ phone: state.phone });
    clickSend = async (...args) => { sent.push(args); return true };
    let response = { ok: true, status: 202, data: { id: '11111111-1111-4111-8111-111111111111', status: 'queued' } };
    api = async (method, path, body) => { requests.push({path, body}); return response };
    ({ useReply, sendScheduledReminder, refreshSendStatus, renderSendFeedback, feedback: () => sendFeedback,
       mode: direct => prefs.sendDirect = direct, phone: phone => state.phone = phone, response: value => response = value,
       draft: value => getComposer = () => ({ textContent: value }), insert: fn => insertIntoComposer = fn, replies: items => state.replies = items })`, context) as {
    useReply: (reply: unknown) => Promise<unknown>; sendScheduledReminder: (reminder: unknown) => Promise<unknown>;
    renderSendFeedback: () => string; refreshSendStatus: () => Promise<void>; feedback: () => { status: string; jobId: string | null };
    mode: (direct: boolean) => void; phone: (phone: string) => void; response: (value: unknown) => void;
    draft: (value: string) => void; insert: (fn: () => boolean) => void; replies: (items: unknown[]) => void;
  }
  return { ...adapter, sent, requests }
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
test("queued voice notes keep reminders open and repeated clicks reuse the request identity", async () => {
  const f = fixture(); f.mode(true)
  assert.equal(await f.useReply(voice), false)
  assert.equal(f.feedback().status, "queued")
  assert.equal(await f.useReply(voice), false)
  const posts = f.requests.filter(request => request.path.endsWith("/send"))
  assert.equal(posts[0].body?.requestId, posts[1].body?.requestId)
  f.response({ ok: true, status: 200, data: [voice] })
  // No prepared text can complete a reminder in review mode either.
  f.mode(false)
  assert.equal(await f.sendScheduledReminder({ id: "rem", contactPhone: "5511999999999", scheduledMessage: "Retorno" }), false)
  assert.equal(f.sent.length, 0)
})
test("an interrupted server response retains the idempotency key and cannot be called delivered", async () => {
  const f = fixture(); f.mode(true); f.response({ ok: false, status: 0 })
  await f.useReply(voice); await f.useReply(voice)
  assert.equal(f.feedback().status, "uncertain")
  assert.equal(f.requests[0].body?.requestId, f.requests[1].body?.requestId)
})
test("delivery status changes only from an authenticated job status response", async () => {
  const f = fixture(); await f.useReply(voice)
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
  const f = fixture(); await f.useReply(voice)
  f.phone("5521999999999")
  await f.refreshSendStatus()
  assert.match(f.renderSendFeedback(), /outra conversa/)
  f.phone("5511999999999")
  assert.match(f.renderSendFeedback(), /Na fila do servidor/)
})
