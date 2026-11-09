import { PrismaClient } from "@prisma/client"
// Preserve existing typed queries using the supported MongoDB connector.
const globalDb = globalThis as unknown as { visionDb?: PrismaClient }
export const prisma = globalDb.visionDb ?? new PrismaClient({ log: [] })
if (process.env.NODE_ENV !== "production") globalDb.visionDb = prisma
