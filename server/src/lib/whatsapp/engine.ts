import type { Db } from "mongodb"
import { randomUUID } from "node:crypto"
import { canSend, localParts, renderMessage } from "./policy"
import { getConnection, putJob, type Job, type PilotContact } from "./store"
import { readReplyMedia, PreparationError } from "./media"

export async function generateBirthdays(db: Db, userId: string, now = new Date()) {
  const connection = await getConnection(db, userId)
  if (!connection?.config.enabled || !connection.config.birthday || connection.config.paused) return
  const today = localParts(now)
  const contacts = db.collection<PilotContact>("contacts").find({ userId, birthDate: { $type: "date" } })
  for await (const contact of contacts) {
    if (!contact.birthDate || localParts(contact.birthDate).monthDay !== today.monthDay) continue
    if (await db.collection("wa_exclusions").findOne({ userId, phone: contact.phone })) continue
    const media = connection.config.birthdayReplyId ? await readReplyMedia(db, userId, connection.config.birthdayReplyId) : null
    await putJob(db, { userId, contactId: contact._id, phone: contact.phone, name: contact.name, kind: "birthday", text: media?.attachment.type === "AUDIO" ? "" : renderMessage(connection.config.birthdayText, contact.name), ...(media ? { attachment: media.attachment } : {}), dueAt: now, expiresAt: new Date(now.getTime() + 24 * 3600000), eventAt: now, status: connection.config.automatic ? "queued" : "review", key: `birthday:${contact._id}:${today.year}` })
  }
}

export async function recordIncoming(db: Db, userId: string, phone: string, at: Date, optOut: boolean) {
  // Only metadata is persisted; message bodies and chat history are not imported.
  await db.collection<PilotContact>("contacts").updateOne({ userId, phone, $or: [{ waLastAt: { $lt: at } }, { waLastAt: null }, { waLastAt: { $exists: false } }] }, { $set: { waLastAt: at, waLastFromMe: false } })
  if (optOut) await db.collection<{ userId: string; phone: string }>("wa_exclusions").updateOne({ userId, phone }, { $set: { userId, phone } }, { upsert: true })
  await db.collection<Job>("wa_jobs").updateMany({ userId, phone, status: { $in: ["review", "queued"] }, eventAt: { $lte: at }, ...(optOut ? {} : { kind: "quote" }) }, { $set: { status: "canceled", reason: optOut ? "Contato pediu para parar" : "Cliente respondeu", updatedAt: new Date() } })
}

export function isOptOut(text: string) {
  return /^(parar|sair|cancelar mensagens|nao quero receber|nao me envie mais)([.!\s]*)$/i.test(text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim())
}

export async function dispatchOne(db: Db, userId: string, workerId: string, send: (phone: string, text: string, id: string, job: Job) => Promise<void>, now = new Date()) {
  const connection = await getConnection(db, userId)
  if (!connection || connection.workerId !== workerId || !connection.leaseUntil || connection.leaseUntil <= now || connection.state !== "connected" || !connection.desired) return
  await db.collection<Job>("wa_jobs").updateMany({ userId, status: { $in: ["queued", "review"] }, expiresAt: { $lte: now } }, { $set: { status: "expired", updatedAt: now } })
  if (!connection.config.enabled || connection.config.paused) return
  const jobs = db.collection<Job>("wa_jobs")
  const candidate = await jobs.findOne({ userId, status: "queued", dueAt: { $lte: now }, expiresAt: { $gt: now } }, { sort: { dueAt: 1 } })
  if (!candidate) return
  if (!canSend(connection.config)) return
  const contact = await db.collection<PilotContact>("contacts").findOne({ _id: candidate.contactId, userId, phone: candidate.phone })
  const excluded = await db.collection("wa_exclusions").findOne({ userId, phone: candidate.phone })
  const disabledRule = candidate.kind === "birthday" ? !connection.config.birthday : candidate.kind === "quote" ? !connection.config.quote : candidate.kind === "after_sale" ? !connection.config.afterSale : false
  const staleQuote = candidate.kind === "quote" && (contact?.dealStage === "ganho" || contact?.dealStage === "perdido" || contact?.leadStatus === "sem_interesse" || (contact?.waLastAt && !contact.waLastFromMe && contact.waLastAt > candidate.eventAt))
  if (!contact || excluded || disabledRule || staleQuote) {
    await jobs.updateOne({ _id: candidate._id, userId, status: "queued" }, { $set: { status: "canceled", reason: "Contato ou regra não elegível", updatedAt: now } })
    return
  }
  if (!connection.config.automatic && !candidate.approved) {
    await jobs.updateOne({ _id: candidate._id, userId, status: "queued" }, { $set: { status: "review", updatedAt: now } })
    return
  }
  const messageId = randomUUID().replaceAll("-", "").toUpperCase()
  const claimed = await jobs.findOneAndUpdate({ _id: candidate._id, userId, status: "queued" }, { $set: { status: "sending", messageId, attemptedAt: now, updatedAt: now } }, { returnDocument: "after" })
  if (!claimed) return
  // Recheck mutable controls after claiming, before crossing the transport boundary.
  const latest = await getConnection(db, userId)
  const nowExcluded = await db.collection("wa_exclusions").findOne({ userId, phone: claimed.phone })
  if (!latest || latest.workerId !== workerId || !latest.leaseUntil || latest.leaseUntil <= now || latest.state !== "connected" || !latest.desired || nowExcluded || (!latest.config.automatic && !claimed.approved) || !canSend(latest.config)) {
    await jobs.updateOne({ _id: claimed._id, userId, status: "sending" }, { $set: { status: "queued", updatedAt: new Date() }, $unset: { attemptedAt: "", messageId: "" } })
    return
  }
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([send(claimed.phone, claimed.text, messageId, claimed), new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("timeout")), 20000) })])
    await jobs.updateOne({ _id: claimed._id, userId, status: "sending" }, { $set: { status: "submitted", updatedAt: new Date() } })
  } catch (error) {
    // A network error may happen after delivery. Never retry automatically.
    await jobs.updateOne({ _id: claimed._id, userId, status: "sending" }, { $set: { status: error instanceof PreparationError ? "canceled" : "uncertain", reason: error instanceof PreparationError ? error.message : "Confira a conversa antes de agendar outro envio", updatedAt: new Date() } })
  } finally { if (timeout) clearTimeout(timeout) }
}
