import { test } from "node:test"
import assert from "node:assert/strict"
import { allowedAvatarUrl, allowedMessage, allowedUpload, normalizeApiUrl } from "../src/policy"
test("credential cannot be forwarded to arbitrary origins or paths", () => {
  assert.equal(normalizeApiUrl("http://localhost:3001"), "http://localhost:3001")
  for (const url of ["http://example.com", "https://user:pass@example.com", "https://example.com/path", "https://example.com/?secret=x"]) assert.throws(() => normalizeApiUrl(url))
  for (const path of ["//evil.com", "/api/crm/../token", "/api/crm/%2e%2e/token", "/api/crm/token"]) assert.equal(allowedMessage({ type: "api", method: "GET", path }), false)
  assert.equal(allowedMessage({ type: "api", method: "GET", path: "/api/crm/contact?phone=5511999999999" }), true)
  assert.equal(allowedMessage({ type: "file", path: "/api/crm/contacts" }), false)
})
test("message capture upload accepts only bounded image/audio payloads", () => {
  const message = { type: "upload-reply", name: "Áudio", mediaType: "AUDIO", mime: "audio/ogg", base64: "T2dnUw==", asVoiceNote: true }
  assert.equal(allowedUpload(message), true)
  assert.equal(allowedUpload({ ...message, mime: "text/html" }), false)
  assert.equal(allowedUpload({ ...message, base64: "!invalid!" }), false)
  assert.equal(allowedUpload({ ...message, caption: "a".repeat(1025) }), false)
  assert.equal(allowedUpload({ ...message, base64: "a".repeat(5592409) }), false)
})

test("avatar fetch is limited to WhatsApp CDN, authenticated CRM avatar reads stay scoped", () => {
  for (const url of ["https://pps.whatsapp.net/photo", "https://media.xx.fbcdn.net/photo"]) assert.equal(allowedAvatarUrl(url), true)
  for (const url of ["http://pps.whatsapp.net/photo", "https://whatsapp.net.evil.test/x", "http://127.0.0.1:27018", "https://evil.test/photo", "https://user:pass@pps.whatsapp.net/x", "https://pps.whatsapp.net:444/x"]) assert.equal(allowedAvatarUrl(url), false)
  assert.equal(allowedMessage({ type: "file", path: "/api/crm/contacts/abc/avatar?v=123" }), true)
  assert.equal(allowedMessage({ type: "file", path: "/api/crm/contacts/abc/avatar?v=../../token" }), false)
})
