import "dotenv/config"
import type { WASocket } from "@whiskeysockets/baileys"
import pino from "pino"
import { randomUUID } from "node:crypto"
import { encryptSecret } from "../src/lib/crypto"
import { mongoAuthState } from "../src/lib/whatsapp/auth-store"
import { whatsappDb, ensureWhatsappIndexes, type Connection, type Job } from "../src/lib/whatsapp/store"
import { dispatchOne, generateBirthdays, recordIncoming, isOptOut } from "../src/lib/whatsapp/engine"
import { outgoingContent } from "../src/lib/whatsapp/media"
import { isAllowedUser } from "../src/lib/allowed-users"

async function main() {
const { default: makeWASocket, DisconnectReason, jidNormalizedUser, proto } = await import("@whiskeysockets/baileys")
const workerId = randomUUID()
const logger = pino({ level: "silent" })
const sessions = new Map<string, { socket: WASocket; command: string; retryAt: number; closed: boolean; readyAt: number; inbound: Set<Promise<unknown>> }>()
let running = true
const db = await whatsappDb()
await ensureWhatsappIndexes(db)
if (!process.env.NEXTAUTH_SECRET) throw new Error("Configure NEXTAUTH_SECRET antes de iniciar o conector.")
const connections = db.collection<Connection>("wa_connections")
const jobs = db.collection<Job>("wa_jobs")

async function connect(connection: Connection) {
  const userId = connection._id
  const { state, saveCreds } = await mongoAuthState(db, userId)
  const socket = makeWASocket({ auth: state, logger, markOnlineOnConnect: false, syncFullHistory: false, shouldSyncHistoryMessage: () => false, getMessage: async () => undefined })
  const entry = { socket, command: connection.command, retryAt: 0, closed: false, readyAt: Number.POSITIVE_INFINITY, inbound: new Set<Promise<unknown>>() }
  sessions.set(userId, entry)
  const owned = { _id: userId, workerId, command: connection.command }
  const handle = (task: Promise<unknown>) => task.catch(() => {
    console.error("Falha no evento do conector; conexão interrompida para recuperação.")
    if (sessions.get(userId) === entry) { entry.closed = true; entry.retryAt = Date.now() + 15000; socket.end(new Error("event persistence failed")) }
  })
  socket.ev.on("creds.update", () => { if (sessions.get(userId) === entry) void handle(saveCreds()) })
  socket.ev.on("connection.update", update => { void handle((async () => {
    if (sessions.get(userId) !== entry) return
    if (update.qr) await connections.updateOne(owned, { $set: { qrEncrypted: encryptSecret(update.qr), qrUntil: new Date(Date.now() + 45000), state: "pairing" } })
    if (update.connection === "open") {
      await connections.updateOne(owned, { $set: { state: "syncing", phone: jidNormalizedUser(socket.user?.id ?? "").split("@")[0], qrEncrypted: null } })
      console.log("Sessão WhatsApp conectada. Envios seguem os controles do CRM.")
    }
    if (update.receivedPendingNotifications) {
      entry.readyAt = Date.now() + 15000
      await connections.updateOne(owned, { $set: { state: "syncing" } })
    }
    if (update.connection === "close") {
      entry.closed = true
      const error = update.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined
      const code = error?.output?.statusCode
      const revoked = code === DisconnectReason.loggedOut || code === DisconnectReason.badSession
      const conflict = code === DisconnectReason.connectionReplaced
      entry.retryAt = Date.now() + 15000
      await connections.updateOne(owned, { $set: { state: revoked ? "logged_out" : conflict ? "conflict" : "reconnecting", qrEncrypted: null, ...((revoked || conflict) ? { desired: false, "config.paused": true } : {}) } })
      if (revoked) await db.collection("wa_auth").deleteMany({ userId })
    }
  })()) })
  socket.ev.on("messages.upsert", event => { const task = handle((async () => {
    if (event.type !== "notify" || sessions.get(userId) !== entry) return
    const active = await connections.findOne({ ...owned, desired: true, leaseUntil: { $gt: new Date() } })
    if (!active) return
    for (const message of event.messages) {
      if (message.key.fromMe) continue
      let jid = message.key.remoteJidAlt ?? message.key.remoteJid ?? ""
      if (jid.endsWith("@lid")) jid = await socket.signalRepository.lidMapping.getPNForLID(jid) ?? ""
      if (!jid.endsWith("@s.whatsapp.net")) continue
      const phone = jidNormalizedUser(jid).split("@")[0]
      if (!await db.collection("contacts").findOne({ userId, phone }, { projection: { _id: 1 } })) continue
      const text = message.message?.conversation ?? message.message?.extendedTextMessage?.text ?? ""
      const seconds = Number(message.messageTimestamp)
      if (!Number.isFinite(seconds)) continue
      await recordIncoming(db, userId, phone, new Date(seconds * 1000), isOptOut(text))
    }
  })()); entry.inbound.add(task); void task.finally(() => entry.inbound.delete(task)) })
  socket.ev.on("messages.update", updates => { void handle((async () => {
    for (const { key, update } of updates) {
      if (!key.fromMe || !key.id || update.status == null) continue
      const status = update.status >= proto.WebMessageInfo.Status.READ ? "read" : update.status >= proto.WebMessageInfo.Status.DELIVERY_ACK ? "delivered" : null
      if (status) await jobs.updateOne({ userId, messageId: key.id, status: { $in: status === "read" ? ["sending", "submitted", "uncertain", "delivered"] : ["sending", "submitted", "uncertain"] } }, { $set: { status, updatedAt: new Date() } })
    }
  })()) })
}

async function tick() {
  const all = connections.find({})
  for await (const snapshot of all) {
    const user = await db.collection<{ _id: string; email: string }>("users").findOne({ _id: snapshot._id }, { projection: { email: 1 } })
    if (!isAllowedUser(user?.email)) {
      const session = sessions.get(snapshot._id)
      if (session) { sessions.delete(snapshot._id); session.socket.end(new Error("user access revoked")) }
      continue
    }
    const now = new Date()
    const previous = await connections.findOneAndUpdate({ _id: snapshot._id, $or: [{ workerId }, { leaseUntil: { $lte: now } }, { leaseUntil: { $exists: false } }] }, { $set: { workerId, heartbeat: now, leaseUntil: new Date(now.getTime() + 90000) } }, { returnDocument: "before" })
    if (!previous) {
      sessions.get(snapshot._id)?.socket.end(new Error("worker lease lost"))
      sessions.delete(snapshot._id)
      continue
    }
    if (previous.workerId !== workerId) await jobs.updateMany({ userId: snapshot._id, status: "sending" }, { $set: { status: "uncertain", reason: "Processo reiniciado durante envio; confira a conversa", updatedAt: now } })
    const current = (await connections.findOne({ _id: snapshot._id, workerId }))!
    const active = sessions.get(current._id)
    if (!current.desired || !current.config.enabled || active?.command !== current.command) {
      if (active) {
        sessions.delete(current._id)
        if (!current.desired && active.command !== current.command) await active.socket.logout().catch(() => {})
        active.socket.end(new Error("connection stopped"))
      }
      if (!current.desired) {
        // Disconnect explicitly clears only this account's encrypted session.
        await db.collection("wa_auth").deleteMany({ userId: current._id })
        await connections.updateOne({ _id: current._id, workerId }, { $set: { state: "disconnected", qrEncrypted: null } })
        continue
      }
      if (!current.config.enabled) continue
    }
    const live = sessions.get(current._id)
    if (!live || (live.closed && Date.now() >= live.retryAt)) {
      if (live) { sessions.delete(current._id); live.socket.end(new Error("reconnecting")) }
      await connections.updateOne({ _id: current._id, workerId }, { $set: { state: "connecting" } })
      await connect(current)
    }
    try { await generateBirthdays(db, current._id) }
    catch (error) { console.error("Falha ao preparar aniversários; confira a mídia e a configuração da conta.", error) }
    const ready = sessions.get(current._id)
    if (ready && !ready.closed && Date.now() >= ready.readyAt) {
      await Promise.all(ready.inbound)
      await connections.updateOne({ _id: current._id, workerId, command: current.command, desired: true }, { $set: { state: "connected" } })
    }
    if (ready && !ready.closed) await dispatchOne(db, current._id, workerId, async (phone, text, messageId, job) => {
      const content = await outgoingContent(db, current._id, { ...job, text })
      const result = await ready.socket.sendMessage(`${phone}@s.whatsapp.net`, content, { messageId })
      if (!result?.key.id) throw new Error("No message acknowledgement")
    })
  }
}

process.on("SIGINT", () => { running = false })
process.on("SIGTERM", () => { running = false })
console.log(`Worker WhatsApp iniciado (PID ${process.pid}). Vincule a conta no CRM.`)
while (running) {
  try { await tick() } catch (error) { console.error("Worker indisponível temporariamente; nova tentativa em 5 segundos.", error) }
  if (running) await new Promise(resolve => setTimeout(resolve, 5000))
}
for (const entry of sessions.values()) entry.socket.end(new Error("worker shutdown"))
await connections.updateMany({ workerId }, { $set: { leaseUntil: new Date(), state: "worker_offline", qrEncrypted: null } })
process.exit(0)
}
void main().catch(() => { console.error("Não foi possível iniciar o worker. Confira MongoDB e NEXTAUTH_SECRET em server/.env."); process.exitCode = 1 })
