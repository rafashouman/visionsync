import { test } from "node:test"
import assert from "node:assert/strict"
import { categoryViews, libraryAction, moveBefore, sameMembers } from "../src/lib/quick-reply-library"
import { previewSteps } from "../src/lib/quick-reply-preview"
import { recordingFormat, convertRecording } from "../src/lib/recorded-audio"
import { renderVariables } from "../src/lib/quick-reply-vars"

test("manual organization rejects partial, duplicate and foreign identifiers", () => {
  assert.equal(sameMembers(["a", "b"], ["b", "a"]), true)
  assert.equal(sameMembers(["a", "b"], ["a"]), false)
  assert.equal(sameMembers(["a", "b"], ["a", "a"]), false)
  assert.equal(sameMembers(["a", "b"], ["a", "foreign"]), false)
  assert.deepEqual(moveBefore(["a", "b", "c"], 2, 0), ["c", "a", "b"])
})
test("category metadata keeps manual order and colors across all items without inventing empty categories", () => {
  const categories = categoryViews([{ category: "VENDAS" }, { category: null }, { category: "SUPORTE" }, { category: "VENDAS" }], [
    { name: "SUPORTE", position: 0, color: "#4288d4" }, { name: "VENDAS", position: 1, color: "#dc5278" }, { name: "ANTIGA", position: 2, color: "#111111" },
  ])
  assert.deepEqual(categories.map(category => [category.name, category.count]), [["SUPORTE", 1], ["VENDAS", 2]])
  assert.equal(categories[0].color, "#4288d4")
  const action = libraryAction.parse({ action: "category", previous: "vendas", name: "  Pós   venda ", color: "#123456" })
  assert.equal(action.action === "category" && action.name, "PÓS VENDA")
  assert.equal(libraryAction.safeParse({ action: "category", previous: "VENDAS", name: "X", color: "red;display:none" }).success, false)
})
test("preview and subsequent edits preserve media-only steps, delays and text variables", () => {
  const steps = previewSteps('[{"text":"","delaySec":4,"quickReplyId":"voice-1"},{"text":"Olá {primeiro_nome}","delaySec":2}]')
  assert.equal(steps[0].quickReplyId, "voice-1")
  assert.equal(steps[0].delaySec, 4)
  assert.equal(previewSteps(JSON.stringify(steps))[0].quickReplyId, "voice-1")
  assert.equal(renderVariables(steps[1].text, { contactName: "Maria da Silva" }), "Olá Maria")
  assert.equal(previewSteps("Primeira\n---\nSegunda").length, 2)
})
test("recording conversion accepts known container signatures, rejects scripts and releases its processing slot on error", async () => {
  assert.equal(recordingFormat(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])), "webm")
  assert.equal(recordingFormat(Buffer.from("OggS")), "ogg")
  assert.equal(recordingFormat(Buffer.from([0, 0, 0, 20, 102, 116, 121, 112])), "mp4")
  assert.equal(recordingFormat(Buffer.from("<script>not audio</script>")), null)
  await assert.rejects(convertRecording(Buffer.from("invalid")), /Formato/)
  await assert.rejects(convertRecording(Buffer.from("invalid again")), /Formato/)
})
