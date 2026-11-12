import { test } from "node:test"
import assert from "node:assert/strict"
import { analyticsFrame, analyticsPage } from "../src/lib/analytics"

test("analytics permits only exact public paths and exposes no query parameters", () => {
  for (const path of ["/login", "/cadastro", "/recuperar-senha", "/redefinir-senha"]) assert.equal(analyticsPage(path), path)
  for (const path of [null, "/", "/dashboard", "/login?token=secret", "/redefinir-senha?token=secret", "/login/other"]) assert.equal(analyticsPage(path), null)
  const page = analyticsPage("/redefinir-senha")
  assert.ok(page)
  const frame = analyticsFrame(page)
  assert.match(frame, /GTM-MXB9LSL6/)
  assert.match(frame, /visionsync_page_view/)
  assert.match(frame, /"\/redefinir-senha"/)
  assert.doesNotMatch(frame, /token=secret/)
})
