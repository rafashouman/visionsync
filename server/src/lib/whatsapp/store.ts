import { MongoClient, type Db } from "mongodb"
import { randomUUID } from "node:crypto"
import { defaults, type PilotConfig, type MessageKind } from "./policy"
import type { Attachment } from "./media"

export type Connection = {
  _id: string; config: PilotConfig; desired: boolean; command: string;
  state?: string; phone?: string; qrEncrypted?: string | null; qrUntil?: Date;
  heartbeat?: Date; leaseUntil?: Date; workerId?: string; updatedAt: Date;
}
export type Job = {
  _id: string; userId: string; contactId: string; phone: string; name: string;
  kind: MessageKind; text: string; dueAt: Date; expiresAt: Date;
  status: "review" | "queued" | "sending" | "submitted" | "delivered" | "read" | "uncertain" | "canceled" | "expired";
  key: string; createdAt: Date; updatedAt: Date; attemptedAt?: Date; messageId?: string; reason?: string;
  eventAt: Date; approved?: boolean;
  attachment?: Attachment;
}
export type PilotContact = { _id: string; userId: string; name: string; phone: string; birthDate?: Date; waLastAt?: Date | null; waLastFromMe?: boolean; dealStage?: string; leadStatus?: string }
const cache = globalThis as unknown as { waMongo?: Promise<MongoClient> }
export async function whatsappDb(): Promise<Db> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada")
  cache.waMongo ??= new MongoClient(process.env.DATABASE_URL, { maxPoolSize: 4, serverSelectionTimeoutMS: 5000 }).connect().catch(error => { cache.waMongo = undefined; throw error })
  return (await cache.waMongo).db()
}
export async function ensureWhatsappIndexes(db: Db) {
  await db.collection<Job>("wa_jobs").createIndex({ userId: 1, key: 1 }, { unique: true })
  await db.collection<Job>("wa_jobs").createIndex({ userId: 1, status: 1, dueAt: 1 })
  await db.collection<Job>("wa_jobs").createIndex({ userId: 1, messageId: 1 })
  await db.collection("wa_auth").createIndex({ userId: 1, key: 1 }, { unique: true })
  await db.collection("wa_exclusions").createIndex({ userId: 1, phone: 1 }, { unique: true })
}
export async function getConnection(db: Db, userId: string) {
  return db.collection<Connection>("wa_connections").findOne({ _id: userId })
}
export async function putJob(db: Db, job: Omit<Job, "_id" | "createdAt" | "updatedAt">) {
  const now = new Date()
  try {
    await db.collection<Job>("wa_jobs").updateOne({ userId: job.userId, key: job.key }, { $setOnInsert: { ...job, _id: randomUUID(), createdAt: now, updatedAt: now } }, { upsert: true })
  } catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === 11000)) throw error }
}
export async function saveConfig(db: Db, userId: string, config: PilotConfig) {
  await db.collection<Connection>("wa_connections").updateOne({ _id: userId }, {
    $set: { config: { ...config, phones: [...new Set(config.phones)] }, updatedAt: new Date() },
    $setOnInsert: { desired: false, command: randomUUID(), state: "disconnected" },
  }, { upsert: true })
}
export { defaults }
