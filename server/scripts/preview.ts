import { MongoMemoryReplSet } from "mongodb-memory-server"
import { execFile, spawn } from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"
import { randomBytes } from "node:crypto"
import bcrypt from "bcryptjs"
import { ensureIndexes } from "./indexes"

async function main() {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } })
  process.env.DATABASE_URL = mongo.getUri("visionsync_preview")
  process.env.AUTH_SECRET = process.env.NEXTAUTH_SECRET = randomBytes(32).toString("hex")
  process.env.NEXTAUTH_URL = "http://localhost:3001"
  process.env.AUTH_URL = "http://localhost:3001"
  process.env.META_SEND_ENABLED = "false"
  const { prisma } = await import("../src/lib/prisma")
  await promisify(execFile)(process.execPath, [path.resolve("../node_modules/prisma/build/index.js"), "db", "push", "--skip-generate"], { env: process.env, timeout: 60_000 })
  await ensureIndexes(process.env.DATABASE_URL)
  const owner = await prisma.user.create({ data: { name: "Conta de demonstração", email: "demo@visionsync.local", password: await bcrypt.hash("VisionSync-demo-2026", 12) } })
  const lists = await Promise.all(["Novos contatos", "Em atendimento", "Clientes"].map((name, order) => prisma.crmList.create({ data: { userId: owner.id, name, order, color: ["#22d3ee", "#e0245e", "#34d399"][order] } })))
  for (const [i, name] of ["Contato de exemplo A", "Contato de exemplo B", "Contato de exemplo C"].entries()) {
    const contact = await prisma.contact.create({ data: { userId: owner.id, name, phone: `551100000000${i}`, source: "outro", nextStep: "Retomar conversa de demonstração", nextStepAt: new Date() } })
    await prisma.crmListMember.create({ data: { contactId: contact.id, listId: lists[i].id } })
    if (i === 2) await prisma.purchase.create({ data: { userId: owner.id, contactId: contact.id, amount: 150, amountMinor: 15000, productName: "Demonstração" } })
  }
  await prisma.$disconnect()
  const child = spawn(process.execPath, [path.resolve("../node_modules/next/dist/bin/next"), "start", "-p", "3001"], { env: process.env, stdio: "inherit", windowsHide: true })
  let closing = false
  const cleanup = async () => { if (closing) return; closing = true; child.kill(); await mongo.stop(); process.exit(0) }
  process.on("SIGINT", () => void cleanup()); process.on("SIGTERM", () => void cleanup()); child.on("exit", () => void cleanup())
  console.log("Demonstração temporária em http://localhost:3001 — dados fictícios; encerramento apaga a base.")
}
main().catch(error => { console.error(error); process.exit(1) })
