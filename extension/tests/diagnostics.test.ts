import { test } from "node:test"
import assert from "node:assert/strict"
import { safeServerHealth, safeTabHealth, crmFailure } from "../src/diagnostics"

test("support reports allowlist health fields and discard all credentials and conversation data", () => {
  const payload = { protocol: 1, version: "0.21.0", token: "crm_secret", email: "private@example.test", phone: "5511999999999", text: "Mensagem privada", qr: "private-qr", workerId: "private-worker", checkedAt: "2026-11-10T12:00:00Z", lastSyncAt: "2026-11-10T12:00:00Z", tokenExpiresAt: "2026-12-10T12:00:00Z", bridge: true, main: true, connector: { configured: true, workerOnline: true, connected: true, enabled: true, paused: false, token: "secret", phone: "5511999999999" } }
  const json = JSON.stringify({ server: safeServerHealth(payload), tab: safeTabHealth(payload) })
  for (const secret of [payload.token, payload.email, payload.phone, payload.text, payload.qr, payload.workerId]) assert.ok(!json.includes(secret))
  assert.equal(safeServerHealth(payload).connector.paused, false)
  assert.equal(safeTabHealth(payload).bridge, true)
  assert.equal(safeServerHealth(payload).tokenExpiresAt, "2026-12-10T12:00:00.000Z")
})
test("missing, malformed and stale diagnostic data never implies a working connection", () => {
  assert.equal(safeTabHealth(null).responsive, false)
  assert.equal(safeTabHealth({ version: "<img src=x onerror=alert(1)>" }).currentVersion, null)
  assert.equal(safeServerHealth({ tokenExpiresAt: "secret", connector: { paused: "false", enabled: "yes" } }).tokenExpiresAt, null)
  assert.equal(safeServerHealth(null).connector.paused, true)
  assert.match(crmFailure(401), /Token/)
  assert.match(crmFailure(404), /Atualize/)
  assert.match(crmFailure(503), /banco de dados/)
})
