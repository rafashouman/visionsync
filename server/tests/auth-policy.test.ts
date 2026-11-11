import { test } from "node:test"
import assert from "node:assert/strict"
import { passwordPairSchema } from "../src/lib/password-policy"
import { hasTrustedOrigin } from "../src/lib/request-origin"

test("registration/reset accept 8 characters and require an independently confirmed matching password", () => {
  const pair = (password: string, confirmPassword = password) => passwordPairSchema.safeParse({ password, confirmPassword }).success
  assert.equal(pair("12345678"), true)
  assert.equal(pair("1234567"), false)
  assert.equal(pair("12345678", "87654321"), false)
  assert.equal(passwordPairSchema.safeParse({ password: "12345678" }).success, false)
  assert.equal(pair("á".repeat(37)), false)
  assert.equal(pair("a".repeat(73)), false)
})

test("session mutations validate the public canonical origin behind a reverse proxy", () => {
  const old = { node: process.env.NODE_ENV, url: process.env.AUTH_URL, legacy: process.env.NEXTAUTH_URL }
  try {
    Object.assign(process.env, { NODE_ENV: "production" })
    process.env.AUTH_URL = "https://visionsync.nexusync.online"
    const request = (origin?: string) => new Request("http://localhost:3001/api/crm/whatsapp", { headers: origin ? { origin } : {} })
    assert.equal(hasTrustedOrigin(request("https://visionsync.nexusync.online")), true)
    assert.equal(hasTrustedOrigin(request("http://visionsync.nexusync.online")), false)
    assert.equal(hasTrustedOrigin(request("https://attacker.example")), false)
    assert.equal(hasTrustedOrigin(request("null")), false)
    assert.equal(hasTrustedOrigin(request()), false)
    Object.assign(process.env, { NODE_ENV: "development" })
    assert.equal(hasTrustedOrigin(new Request("http://192.168.0.2:3001/api/crm/whatsapp", { headers: { origin: "http://192.168.0.2:3001" } })), true)
  } finally {
    for (const [key, value] of [["NODE_ENV", old.node], ["AUTH_URL", old.url], ["NEXTAUTH_URL", old.legacy]]) {
      if (value === undefined) delete process.env[key!]
      else process.env[key!] = value
    }
  }
})
