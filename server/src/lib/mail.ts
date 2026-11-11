import nodemailer from "nodemailer"

export function smtpConfig(env: Record<string, string | undefined> = process.env) {
  const host = env.SMTP_HOST?.trim()
  const portText = env.SMTP_PORT?.trim()
  const user = env.SMTP_USER?.trim()
  const password = env.SMTP_PASSWORD
  const from = env.SMTP_FROM?.trim()
  if (!host || !portText || !/^\d+$/.test(portText) || !user || !password || !from) return null
  const port = Number(portText)
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null
  return { host, port, user, password, from }
}

export function isAccessEmailConfigured() {
  return !!smtpConfig() && !!(process.env.AUTH_URL || process.env.NEXTAUTH_URL)
}

export async function sendAccessEmail(to: string, subject: string, text: string) {
  const config = smtpConfig()
  if (!config) throw new Error("SMTP configuration missing or invalid")
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    requireTLS: config.port !== 465,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
  })
  await transport.sendMail({ from: config.from, to, subject, text })
}
