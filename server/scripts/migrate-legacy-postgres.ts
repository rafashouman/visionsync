import { config as loadEnv } from "dotenv"
import { createHash } from "crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { prisma } from "../src/lib/prisma"
import { encryptSecret } from "../src/lib/crypto"

const here = path.dirname(fileURLToPath(import.meta.url))
loadEnv({ path: path.resolve(here, "..", ".env") })
loadEnv({ path: path.resolve(here, "..", "..", ".env"), override: false })

type Row = Record<string, unknown>
type QueryResult<T> = { rows: T[] }
type PgClientLike = {
  connect(): Promise<void>
  end(): Promise<void>
  query<T>(sql: string): Promise<QueryResult<T>>
}

const SOURCE_URL = process.env.MIGRATION_SOURCE_DATABASE_URL
const APPLY = process.argv.includes("--apply")
const REPLACE_TARGET = process.env.MIGRATION_REPLACE_TARGET === "true"
const BATCH = 500

if (!SOURCE_URL) throw new Error("Defina MIGRATION_SOURCE_DATABASE_URL no server/.env.")
const sourceUrl: string = SOURCE_URL

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex")

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : v == null ? null : String(v)
}

function asDate(v: unknown): Date | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(String(v))
  return Number.isFinite(d.getTime()) ? d : null
}

function asBool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback
}

function asInt(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

function asFloat(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

function asBytes(v: unknown): Uint8Array<ArrayBuffer> {
  if (v instanceof Uint8Array) return Uint8Array.from(v) as Uint8Array<ArrayBuffer>
  if (Buffer.isBuffer(v)) return Uint8Array.from(v) as Uint8Array<ArrayBuffer>
  throw new Error("Valor de arquivo inválido para quick_reply_files.data")
}

async function listTables(client: PgClientLike) {
  const r = await client.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type='BASE TABLE' ORDER BY table_name"
  )
  return r.rows.map((x: { table_name: string }) => x.table_name)
}

async function readTable(client: PgClientLike, name: string): Promise<Row[]> {
  const t = await listTables(client)
  if (!t.includes(name)) return []
  const { rows } = await client.query(`SELECT * FROM "${name}"`)
  return rows as Row[]
}

async function clearTarget() {
  await prisma.quickReplyFile.deleteMany()
  await prisma.crmListMember.deleteMany()
  await prisma.note.deleteMany()
  await prisma.reminder.deleteMany()
  await prisma.charge.deleteMany()
  await prisma.purchase.deleteMany()
  await prisma.quickReply.deleteMany()
  await prisma.crmList.deleteMany()
  await prisma.metaPixel.deleteMany()
  await prisma.contact.deleteMany()
  await prisma.user.deleteMany()
}

async function ensureEmptyTarget() {
  const counts = await Promise.all([
    prisma.user.count(),
    prisma.contact.count(),
    prisma.purchase.count(),
    prisma.crmList.count(),
    prisma.crmListMember.count(),
    prisma.note.count(),
    prisma.reminder.count(),
    prisma.metaPixel.count(),
    prisma.charge.count(),
    prisma.quickReply.count(),
    prisma.quickReplyFile.count(),
  ])
  const total = counts.reduce((s, n) => s + n, 0)
  if (total > 0) throw new Error("MongoDB de destino não está vazio. Use um banco vazio ou defina MIGRATION_REPLACE_TARGET=true.")
}

async function insertInBatches<T>(items: T[], fn: (batch: T[]) => Promise<void>) {
  for (const batch of chunk(items, BATCH)) await fn(batch)
}

async function run() {
  const pgModuleName = "pg"
  const pgModule = (await import(pgModuleName)) as { Client: new (options: { connectionString: string }) => PgClientLike }
  const pg = new pgModule.Client({ connectionString: sourceUrl })
  try {
    await pg.connect()
  } catch (error) {
    throw new Error(
      "Falha ao conectar no PostgreSQL legado. Para Supabase, use a PostgreSQL URI (não a /rest/v1), com sslmode=require; se 5432 falhar, teste o pooler (porta 6543).",
      { cause: error },
    )
  }

  try {
    const tables = await listTables(pg)
    console.log("Tabelas no PostgreSQL:", tables.join(", ") || "(nenhuma)")

    const users = await readTable(pg, "users")
    const contacts = await readTable(pg, "contacts")
    const lists = await readTable(pg, "crm_lists")
    const members = await readTable(pg, "crm_list_members")
    const purchases = await readTable(pg, "purchases")
    const notes = await readTable(pg, "notes")
    const reminders = await readTable(pg, "reminders")
    const pixels = await readTable(pg, "meta_pixels")
    const charges = await readTable(pg, "charges")
    const replies = await readTable(pg, "quick_replies")
    const replyFiles = await readTable(pg, "quick_reply_files")

    console.log("Resumo origem:")
    console.log(`- users: ${users.length}`)
    console.log(`- contacts: ${contacts.length}`)
    console.log(`- crm_lists: ${lists.length}`)
    console.log(`- crm_list_members: ${members.length}`)
    console.log(`- purchases: ${purchases.length}`)
    console.log(`- notes: ${notes.length}`)
    console.log(`- reminders: ${reminders.length}`)
    console.log(`- meta_pixels: ${pixels.length}`)
    console.log(`- charges: ${charges.length}`)
    console.log(`- quick_replies: ${replies.length}`)
    console.log(`- quick_reply_files: ${replyFiles.length}`)

    if (!APPLY) {
      console.log("\nDry-run concluído. Para gravar no MongoDB execute:")
      console.log("npm run db:migrate:legacy --workspace @visionsync/web -- --apply")
      return
    }

    if (REPLACE_TARGET) {
      console.log("Limpando destino MongoDB (MIGRATION_REPLACE_TARGET=true)...")
      await clearTarget()
    } else {
      await ensureEmptyTarget()
    }

    const now = Date.now()
    const tokenExpires = new Date(now + 90 * 24 * 60 * 60 * 1000)

    await insertInBatches(users, async (batch) => {
      await prisma.user.createMany({
        data: batch.map((u) => {
          const apiToken = asString(u.apiToken)
          return {
            id: String(u.id),
            name: asString(u.name),
            email: String(u.email).toLowerCase(),
            password: asString(u.password),
            apiToken,
            apiTokenHash: apiToken ? sha256(apiToken) : null,
            apiTokenExpiresAt: apiToken ? tokenExpires : null,
            createdAt: asDate(u.createdAt) ?? new Date(),
            updatedAt: asDate(u.updatedAt) ?? new Date(),
          }
        }),
      })
    })

    await insertInBatches(contacts, async (batch) => {
      await prisma.contact.createMany({
        data: batch.map((c) => ({
          id: String(c.id),
          userId: String(c.userId),
          name: String(c.name),
          phone: String(c.phone),
          email: asString(c.email),
          source: asString(c.source),
          birthDate: asDate(c.birthDate),
          nextStep: asString(c.nextStep),
          nextStepAt: asDate(c.nextStepAt),
          lastActivityAt: asDate(c.lastActivityAt) ?? asDate(c.updatedAt) ?? asDate(c.createdAt) ?? new Date(),
          waLastAt: asDate(c.waLastAt),
          waLastFromMe: typeof c.waLastFromMe === "boolean" ? c.waLastFromMe : null,
          waUnread: asInt(c.waUnread, 0),
          waArchived: asBool(c.waArchived, false),
          waSyncedAt: asDate(c.waSyncedAt),
          createdAt: asDate(c.createdAt) ?? new Date(),
          updatedAt: asDate(c.updatedAt) ?? new Date(),
        })),
      })
    })

    await insertInBatches(pixels, async (batch) => {
      await prisma.metaPixel.createMany({
        data: batch.map((p) => {
          const rawToken = asString(p.accessToken) ?? ""
          const accessToken = rawToken.startsWith("v1:") ? rawToken : encryptSecret(rawToken)
          return {
            id: String(p.id),
            userId: String(p.userId),
            name: String(p.name),
            datasetId: String(p.datasetId),
            accessToken,
            testEventCode: asString(p.testEventCode),
            repeatMode: asString(p.repeatMode) ?? "purchase",
            isDefault: asBool(p.isDefault, false),
            createdAt: asDate(p.createdAt) ?? new Date(),
          }
        }),
      })
    })

    await insertInBatches(lists, async (batch) => {
      await prisma.crmList.createMany({
        data: batch.map((l) => ({
          id: String(l.id),
          userId: String(l.userId),
          name: String(l.name),
          color: asString(l.color) ?? "#8b5cf6",
          order: asInt(l.order, 0),
          metaPixelId: asString(l.metaPixelId),
          createdAt: asDate(l.createdAt) ?? new Date(),
          updatedAt: asDate(l.updatedAt) ?? new Date(),
        })),
      })
    })

    await insertInBatches(purchases, async (batch) => {
      await prisma.purchase.createMany({
        data: batch.map((p) => {
          const amount = asFloat(p.amount, 0)
          return {
            id: String(p.id),
            userId: String(p.userId),
            contactId: String(p.contactId),
            amount,
            requestKey: asString(p.requestKey) ?? `legacy:${String(p.id)}`,
            currency: asString(p.currency) ?? "BRL",
            amountMinor: asInt(p.amountMinor, Math.round(amount * 100)),
            productName: asString(p.productName),
            purchasedAt: asDate(p.purchasedAt) ?? new Date(),
            source: asString(p.source) ?? "whatsapp",
            metaPixelId: asString(p.metaPixelId),
            ctwaClid: asString(p.ctwaClid),
            metaEventSent: asBool(p.metaEventSent, false),
            metaEventId: asString(p.metaEventId),
            metaSentAt: asDate(p.metaSentAt),
            metaError: asString(p.metaError),
            createdAt: asDate(p.createdAt) ?? new Date(),
          }
        }),
      })
    })

    await insertInBatches(charges, async (batch) => {
      await prisma.charge.createMany({
        data: batch.map((c) => ({
          id: String(c.id),
          userId: String(c.userId),
          contactId: String(c.contactId),
          amount: asFloat(c.amount, 0),
          description: asString(c.description),
          dueDate: asDate(c.dueDate) ?? new Date(),
          status: (asString(c.status) as "PENDING" | "PAID" | "CANCELED" | null) ?? "PENDING",
          paidAt: asDate(c.paidAt),
          purchaseId: asString(c.purchaseId),
          paymentLink: asString(c.paymentLink),
          createdAt: asDate(c.createdAt) ?? new Date(),
          updatedAt: asDate(c.updatedAt) ?? new Date(),
        })),
      })
    })

    await insertInBatches(notes, async (batch) => {
      await prisma.note.createMany({
        data: batch.map((n) => ({
          id: String(n.id),
          userId: String(n.userId),
          contactId: String(n.contactId),
          text: String(n.text),
          createdAt: asDate(n.createdAt) ?? new Date(),
        })),
      })
    })

    await insertInBatches(reminders, async (batch) => {
      await prisma.reminder.createMany({
        data: batch.map((r) => ({
          id: String(r.id),
          userId: String(r.userId),
          contactId: String(r.contactId),
          text: String(r.text),
          dueAt: asDate(r.dueAt) ?? new Date(),
          doneAt: asDate(r.doneAt),
          snoozeCount: asInt(r.snoozeCount, 0),
          createdAt: asDate(r.createdAt) ?? new Date(),
        })),
      })
    })

    await insertInBatches(replies, async (batch) => {
      await prisma.quickReply.createMany({
        data: batch.map((q) => ({
          id: String(q.id),
          userId: String(q.userId),
          type: (asString(q.type) as "TEXT" | "AUDIO" | "IMAGE" | "VIDEO" | "DOCUMENT" | "CONTACT" | "SEQUENCE" | null) ?? "TEXT",
          name: String(q.name),
          category: asString(q.category),
          favorite: asBool(q.favorite, false),
          usageCount: asInt(q.usageCount, 0),
          position: asInt(q.position, 0),
          shortcut: asString(q.shortcut),
          text: asString(q.text),
          mediaName: asString(q.mediaName),
          mediaMime: asString(q.mediaMime),
          mediaSize: q.mediaSize == null ? null : asInt(q.mediaSize, 0),
          viewOnce: asBool(q.viewOnce, false),
          asVoiceNote: asBool(q.asVoiceNote, false),
          contactName: asString(q.contactName),
          contactPhone: asString(q.contactPhone),
          createdAt: asDate(q.createdAt) ?? new Date(),
          updatedAt: asDate(q.updatedAt) ?? new Date(),
        })),
      })
    })

    await insertInBatches(replyFiles, async (batch) => {
      await prisma.quickReplyFile.createMany({
        data: batch.map((f) => ({
          quickReplyId: String(f.quickReplyId),
          data: asBytes(f.data),
        })),
      })
    })

    await insertInBatches(members, async (batch) => {
      await prisma.crmListMember.createMany({
        data: batch.map((m) => ({
          id: String(m.id),
          listId: String(m.listId),
          contactId: String(m.contactId),
          createdAt: asDate(m.createdAt) ?? new Date(),
        })),
      })
    })

    console.log("Migração concluída no MongoDB.")
    const [u, c, p] = await Promise.all([prisma.user.count(), prisma.contact.count(), prisma.purchase.count()])
    console.log(`Destino: users=${u}, contacts=${c}, purchases=${p}`)
  } finally {
    await pg.end()
    await prisma.$disconnect()
  }
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
