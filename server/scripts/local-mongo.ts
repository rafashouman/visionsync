import { config as loadEnv } from "dotenv"
import { MongoClient } from "mongodb"
import { execFile, spawn } from "node:child_process"
import { existsSync, mkdirSync, readdirSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { ensureIndexes } from "./indexes"

const serverDir = path.resolve(import.meta.dirname, "..")
const rootDir = path.resolve(serverDir, "..")

loadEnv({ path: path.join(serverDir, ".env") })
loadEnv({ path: path.join(rootDir, ".env"), override: false })

const DEFAULT_URI = "mongodb://127.0.0.1:27018/visionsync?replicaSet=rs0&directConnection=true"
const uri = process.env.DATABASE_URL || DEFAULT_URI
process.env.DATABASE_URL = uri

function findMongodBinary(): string {
  const candidates: string[] = [
    "C:\\Program Files\\MongoDB\\Server\\9.0\\bin\\mongod.exe",
    "C:\\Program Files\\MongoDB\\Server\\8.0\\bin\\mongod.exe",
    "C:\\Program Files\\MongoDB\\Server\\7.0\\bin\\mongod.exe",
  ]
  const cacheDir = path.join(os.homedir(), ".cache", "mongodb-binaries")
  if (existsSync(cacheDir)) {
    for (const file of readdirSync(cacheDir)) {
      if (file.startsWith("mongod") && file.endsWith(".exe")) {
        candidates.push(path.join(cacheDir, file))
      }
    }
  }
  for (const bin of candidates) {
    if (existsSync(bin)) return bin
  }
  throw new Error("Binário mongod.exe não encontrado para iniciar o Replica Set local.")
}

async function inspectInstance(port: number): Promise<"down" | "uninitialized" | "ready"> {
  const adminUri = `mongodb://127.0.0.1:${port}/admin?directConnection=true`
  const client = new MongoClient(adminUri, {
    serverSelectionTimeoutMS: 1500,
    connectTimeoutMS: 1500,
    directConnection: true,
  })
  try {
    await client.connect()
    const hello = await client.db("admin").command({ hello: 1 })
    if (hello.setName && hello.isWritablePrimary) return "ready"
    return "uninitialized"
  } catch (error) {
    // A restricted shell can see disk files but cannot reach the host's loopback.
    // Do not mistake permission denial for a stopped database and launch another mongod.
    if (String(error).includes("EACCES") || String(error).includes("EPERM")) {
      throw new Error("Acesso à conexão local do MongoDB bloqueado pelo ambiente. Execute npm run db:prepare no terminal do computador.")
    }
    return "down"
  } finally {
    await client.close().catch(() => {})
  }
}

async function ensureLocalReplicaSet(port: number, host: string) {
  const state = await inspectInstance(port)
  const dataDir = path.join(rootDir, ".mongodb-data")
  const logPath = path.join(dataDir, "mongod.log")

  if (state === "ready") return

  if (state === "down") {
    const mongod = findMongodBinary()
    mkdirSync(dataDir, { recursive: true })
    console.log(`[local-mongo] Iniciando MongoDB Replica Set (rs0) em ${host}:${port}...`)
    const child = spawn(
      mongod,
      [
        "--replSet",
        "rs0",
        "--port",
        String(port),
        "--bind_ip",
        "127.0.0.1",
        "--dbpath",
        dataDir,
        "--logpath",
        logPath,
        "--logappend",
      ],
      { detached: true, stdio: "ignore", windowsHide: true }
    )
    child.unref()
  }

  const adminUri = `mongodb://127.0.0.1:${port}/admin?directConnection=true`
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500))
    const client = new MongoClient(adminUri, { serverSelectionTimeoutMS: 1500, directConnection: true })
    try {
      await client.connect()
      const admin = client.db("admin")
      const hello = await admin.command({ hello: 1 })
      if (!hello.isWritablePrimary) {
        try {
          await admin.command({
            replSetInitiate: {
              _id: "rs0",
              members: [{ _id: 0, host: `127.0.0.1:${port}` }],
            },
          })
        } catch {
          // Já iniciado ou elegendo primário
        }
      }
      const after = await admin.command({ hello: 1 })
      if (after.setName && after.isWritablePrimary) {
        await client.close()
        return
      }
    } catch {
      // Aguardando processo subir
    } finally {
      await client.close().catch(() => {})
    }
  }

  throw new Error(`Não foi possível inicializar o Replica Set rs0 em 127.0.0.1:${port}. Verifique ${logPath}.`)
}

async function main() {
  const parsed = new URL(uri)
  const host = parsed.hostname
  const port = Number(parsed.port || 27017)

  if (host === "127.0.0.1" || host === "localhost") {
    await ensureLocalReplicaSet(port, host)
  }

  const prismaBin = path.resolve(rootDir, "node_modules/prisma/build/index.js")
  const schemaPath = path.resolve(serverDir, "prisma/schema.prisma")
  await promisify(execFile)(
    process.execPath,
    [prismaBin, "db", "push", "--skip-generate", "--schema", schemaPath],
    { cwd: serverDir, env: process.env, timeout: 60_000 }
  )
  await ensureIndexes(uri)

  console.log(`[local-mongo] MongoDB Replica Set pronto em ${host}:${port}`)
}

main().catch((err) => {
  console.error("[local-mongo] Erro:", err)
  process.exit(1)
})
