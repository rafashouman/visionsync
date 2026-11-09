import { createHash } from "node:crypto"
import { prisma } from "@/lib/prisma"

export async function allowAuthAttempt(key: string, limit: number, windowMs: number, now = new Date()) {
  const id = createHash("sha256").update(key).digest("hex")
  const expired = { $lte: [{ $ifNull: ["$expiresAt", { $date: "1970-01-01T00:00:00.000Z" }] }, { $date: now.toISOString() }] }
  // MongoDB update pipelines make reset + increment one atomic operation.
  const result = await prisma.$runCommandRaw({ findAndModify: "auth_attempts", query: { _id: id }, update: [{ $set: {
    count: { $cond: [expired, 1, { $add: [{ $ifNull: ["$count", 0] }, 1] }] },
    expiresAt: { $cond: [expired, { $date: new Date(now.getTime() + windowMs).toISOString() }, "$expiresAt"] },
  } }], upsert: true, new: true })
  const count = (result.value as { count?: number } | undefined)?.count
  return typeof count === "number" && count <= limit
}
