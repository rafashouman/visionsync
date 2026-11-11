import { mock, test } from "node:test"
import assert from "node:assert/strict"
import nodemailer from "nodemailer"
import { isAccessEmailConfigured, sendAccessEmail, smtpConfig } from "../src/lib/mail"

test("SMTP configuration requires complete credentials and a valid port", () => {
  const env = { SMTP_HOST: "smtp.example.test", SMTP_PORT: "587", SMTP_USER: "sender@example.test", SMTP_PASSWORD: "password", SMTP_FROM: "sender@example.test" }
  assert.equal(smtpConfig(env)?.port, 587)
  for (const port of ["", "0", "65536", "587x", "1.5"]) assert.equal(smtpConfig({ ...env, SMTP_PORT: port }), null)
  for (const key of ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"] as const) assert.equal(smtpConfig({ ...env, [key]: "" }), null)
})

test("SMTP uses authenticated TLS for both submission ports and sends the requested message", async () => {
  const keys = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM", "AUTH_URL", "NEXTAUTH_URL"] as const
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  Object.assign(process.env, { SMTP_HOST: "smtp.example.test", SMTP_PORT: "587", SMTP_USER: "sender@example.test", SMTP_PASSWORD: "test-password", SMTP_FROM: "sender@example.test", AUTH_URL: "https://example.test" })
  const options: unknown[] = [], messages: unknown[] = []
  const createTransport = nodemailer.createTransport
  const smtp = mock.method(nodemailer, "createTransport", (config: unknown) => {
    options.push(config)
    return createTransport({
      name: "test", version: "1",
      send(mail, callback) {
        messages.push(mail.data)
        callback(null, { envelope: mail.message.getEnvelope(), messageId: "test", accepted: ["user@example.test"], rejected: [], pending: [], response: "OK" })
      },
    })
  })
  try {
    assert.equal(isAccessEmailConfigured(), true)
    await sendAccessEmail("user@example.test", "Confirmação", "Link de teste")
    process.env.SMTP_PORT = "465"
    await sendAccessEmail("user@example.test", "Recuperação", "Outro link")
    assert.deepEqual(options, [587, 465].map(port => ({
      host: "smtp.example.test", port, secure: port === 465, requireTLS: port !== 465,
      auth: { user: "sender@example.test", pass: "test-password" }, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 10_000,
    })))
    assert.deepEqual(messages.map(message => {
      assert.ok(message && typeof message === "object" && "to" in message && "subject" in message && "text" in message && "from" in message)
      return { from: message.from, to: message.to, subject: message.subject, text: message.text }
    }), [
      { from: "sender@example.test", to: "user@example.test", subject: "Confirmação", text: "Link de teste" },
      { from: "sender@example.test", to: "user@example.test", subject: "Recuperação", text: "Outro link" },
    ])
    delete process.env.AUTH_URL
    delete process.env.NEXTAUTH_URL
    assert.equal(isAccessEmailConfigured(), false)
  } finally {
    smtp.mock.restore()
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
  }
})
