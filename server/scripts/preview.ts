import { MongoMemoryReplSet } from "mongodb-memory-server"
import { execFile, spawn } from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"
import { randomBytes } from "node:crypto"
import { ensureIndexes } from "./indexes"
import { seedPreview } from "./preview-data"

async function main() {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } })
  process.env.DATABASE_URL = mongo.getUri("visionsync_preview")
  process.env.AUTH_SECRET = process.env.NEXTAUTH_SECRET = randomBytes(32).toString("hex")
  process.env.NEXTAUTH_URL = "http://localhost:3001"
  process.env.AUTH_URL = "http://localhost:3001"
  process.env.META_SEND_ENABLED = "false"
  process.env.ALLOWED_USER_EMAILS = "aurora@visionsync.local,horizonte@visionsync.local,estrela@visionsync.local"
  const { prisma } = await import("../src/lib/prisma")
  await promisify(execFile)(process.execPath, [path.resolve("../node_modules/prisma/build/index.js"), "db", "push", "--skip-generate"], { env: process.env, timeout: 60_000 })
  await ensureIndexes(process.env.DATABASE_URL)
  await seedPreview(prisma)
  await prisma.$disconnect()
  const child = spawn(process.execPath, [path.resolve("../node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", "3001"], { env: process.env, stdio: "inherit", windowsHide: true })
  let closing = false
  const cleanup = async () => { if (closing) return; closing = true; child.kill(); await mongo.stop(); process.exit(0) }
  process.on("SIGINT", () => void cleanup()); process.on("SIGTERM", () => void cleanup()); child.on("exit", () => void cleanup())
  console.log("Demonstração temporária em http://localhost:3001 — dados fictícios; encerramento apaga a base.")
}
main().catch(error => { console.error(error); process.exit(1) })
