import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"

const source = readFileSync(new URL("../page-bridge.js", import.meta.url), "utf8")

test("LID scans use contact data or supported mapping without requiring unavailable modules", async () => {
  const requested: string[] = []
  const chats = [
    { id: { user: "123", server: "lid" }, contact: { phoneNumber: { user: "5511988880000", server: "c.us" } } },
    { id: { user: "456", server: "lid" } },
    { id: { user: "789", server: "lid" } },
  ]
  const modules: Record<string, unknown> = {
    WAWebCollections: { Chat: { models: chats } },
    WAWebLidMigrationUtils: { getPhoneNumber: (id: { user: string }) => id.user === "456" ? { user: "5511977770000", server: "c.us" } : null },
    WAWebApiContact: {},
    WAWebProfilePicThumbCollection: {},
  }
  let handler: (event: { detail: string }) => Promise<void> = async () => {}
  let response = ""
  const document = {
    addEventListener(_name: string, fn: typeof handler) { handler = fn },
    dispatchEvent(event: { detail: string }) { response = event.detail },
  }
  const window = { require(name: string) { requested.push(name); if (!(name in modules)) throw Error(`unknown module: ${name}`); return modules[name] } }
  class CustomEvent { constructor(_name: string, public options: { detail: string }) {} get detail() { return this.options.detail } }
  runInNewContext(source, { window, document, CustomEvent })
  await handler({ detail: JSON.stringify({ id: 1, kind: "scan" }) })
  const result = JSON.parse(response) as { chats: { phone: string }[]; semTelefone: number }
  assert.deepEqual(result.chats.map(chat => chat.phone), ["5511988880000", "5511977770000"])
  assert.equal(result.semTelefone, 1)
  assert.equal(requested.includes("WAWebLidUtils"), false)
  assert.equal(requested.includes("WAWebLidPhoneMappingUtils"), false)
})
