import { test } from "node:test"
import assert from "node:assert/strict"
import { allowedMessage, normalizeApiUrl } from "../src/policy"
test("credential cannot be forwarded to arbitrary origins or paths", () => {
  assert.equal(normalizeApiUrl("http://localhost:3001"), "http://localhost:3001")
  for (const url of ["http://example.com", "https://user:pass@example.com", "https://example.com/path", "https://example.com/?secret=x"]) assert.throws(() => normalizeApiUrl(url))
  for (const path of ["//evil.com", "/api/crm/../token", "/api/crm/%2e%2e/token", "/api/crm/token"]) assert.equal(allowedMessage({ type: "api", method: "GET", path }), false)
  assert.equal(allowedMessage({ type: "api", method: "GET", path: "/api/crm/contact?phone=5511999999999" }), true)
  assert.equal(allowedMessage({ type: "file", path: "/api/crm/contacts" }), false)
})
