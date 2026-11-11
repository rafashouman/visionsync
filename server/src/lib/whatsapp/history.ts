import type { Db, Filter } from "mongodb"
import { z } from "zod"
import { kinds } from "./policy"
import type { Connection, Job } from "./store"

export const jobStatuses = ["review", "queued", "sending", "submitted", "delivered", "read", "uncertain", "canceled", "expired"] as const
const cursorSchema = z.object({ createdAt: z.string().datetime(), id: z.string().uuid() }).strict()
export const historyParams = z.object({
  status: z.enum(jobStatuses).optional(),
  kind: z.enum(kinds).optional(),
  q: z.string().trim().max(100).optional(),
  cursor: z.string().max(256).optional(),
})
type HistoryParams = z.infer<typeof historyParams>

export function parseCursor(value: string) {
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")))
  } catch {
    throw new Error("Cursor de histórico inválido.")
  }
}

export async function listWhatsappHistory(db: Db, userId: string, params: HistoryParams) {
  const clauses: Filter<Job>[] = [{ userId }]
  if (params.status) clauses.push({ status: params.status })
  if (params.kind) clauses.push({ kind: params.kind })
  if (params.q) {
    const term = params.q.toLowerCase()
    clauses.push({ $expr: { $or: ["name", "phone", "text"].map(field => ({
      $gte: [{ $indexOfCP: [{ $toLower: [..."ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ"].reduce<object>((input, letter) => ({
        $replaceAll: { input, find: letter, replacement: letter.toLowerCase() },
      }), { $ifNull: [`$${field}`, ""] }) }, term] }, 0],
    })) } })
  }
  if (params.cursor) {
    const cursor = parseCursor(params.cursor)
    const createdAt = new Date(cursor.createdAt)
    clauses.push({ $or: [{ createdAt: { $lt: createdAt } }, { createdAt, _id: { $lt: cursor.id } }] })
  }
  const rows = await db.collection<Job>("wa_jobs").find({ $and: clauses }).sort({ createdAt: -1, _id: -1 }).limit(31).toArray()
  const jobs = rows.slice(0, 30)
  const last = jobs[jobs.length - 1]
  const nextCursor = rows.length > 30 && last
    ? Buffer.from(JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last._id })).toString("base64url")
    : null
  return { jobs, nextCursor }
}

export async function whatsappQueueHealth(db: Db, userId: string, now = new Date()) {
  const collection = db.collection<Job>("wa_jobs")
  const [counts, overdue, unreviewed] = await Promise.all([
    collection.aggregate<{ _id: Job["status"]; count: number }>([{ $match: { userId } }, { $group: { _id: "$status", count: { $sum: 1 } } }]).toArray(),
    collection.countDocuments({ userId, status: "queued", dueAt: { $lte: now }, expiresAt: { $gt: now } }),
    collection.countDocuments({ userId, status: "uncertain", checkedAt: { $exists: false } }),
  ])
  const count = (status: Job["status"]) => counts.find(row => row._id === status)?.count ?? 0
  return { review: count("review"), queued: count("queued"), overdue, uncertain: count("uncertain"), unreviewed, expired: count("expired") }
}

export function whatsappConnectionHealth(connection: Connection | null, now = new Date()) {
  const workerOnline = Boolean(connection?.heartbeat && now.getTime() - connection.heartbeat.getTime() < 45000)
  const connectionProblem = Boolean(connection && ((connection.desired && !workerOnline) || ["logged_out", "conflict", "reconnecting"].includes(connection.state ?? "")))
  return { workerOnline, connectionProblem }
}
