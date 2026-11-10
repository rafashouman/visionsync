import { test } from "node:test"
import assert from "node:assert/strict"
import { MongoMemoryServer } from "mongodb-memory-server"
import { Binary, MongoClient } from "mongodb"
import { randomUUID } from "node:crypto"
import { atNine, afterDays, defaults, canSend, localParts, configSchema, renderMessage } from "../src/lib/whatsapp/policy"
import { dispatchOne, generateBirthdays, recordIncoming, isOptOut } from "../src/lib/whatsapp/engine"
import { ensureWhatsappIndexes, putJob, type Job, type Connection } from "../src/lib/whatsapp/store"
import { mongoAuthState } from "../src/lib/whatsapp/auth-store"
import { readReplyMedia, prepareMedia, outgoingContent, PreparationError } from "../src/lib/whatsapp/media"

test("pilot policy: full numbers, two-recipient cap, Brasilia calendar and opt-out", () => {
  assert.equal(configSchema.safeParse({ ...defaults, phones: ["5511999999999"] }).success, true)
  assert.equal(configSchema.safeParse({ ...defaults, phones: ["123"] }).success, false)
  assert.equal(configSchema.safeParse({ ...defaults, phones: ["5511999999999", "5521999999999", "5531999999999"] }).success, false)
  assert.equal(atNine("2026-11-10").toISOString(), "2026-11-10T12:00:00.000Z")
  assert.equal(afterDays(new Date("2026-12-31T22:00:00Z"), 2).toISOString(), "2027-01-02T12:00:00.000Z")
  assert.equal(localParts(new Date("2026-11-10T01:00:00Z")).day, "2026-11-09")
  const config = { ...defaults, enabled: true, paused: false, phones: ["5511999999999"] }
  assert.equal(canSend(config, config.phones[0], new Date("2026-11-10T23:00:00Z")), false)
  assert.equal(canSend(config, config.phones[0], new Date("2026-11-10T23:00:00Z"), true), true)
  assert.equal(canSend(config, "5521999999999", new Date("2026-11-10T12:00:00Z"), true), false)
  assert.equal(renderMessage("Oi {primeiro_nome}: {nome}", "Ana Silva"), "Oi Ana: Ana Silva")
  assert.ok(isOptOut("NÃO QUERO RECEBER!"))
  assert.equal(isOptOut("Quero cancelar meu orçamento"), false)
})

test("durable pilot queue with fake transport only", async t => {
  const mongo = await MongoMemoryServer.create()
  const client = await new MongoClient(mongo.getUri()).connect()
  const db = client.db("whatsapp_test")
  const now = new Date("2026-11-10T12:30:00Z")
  const userId = "agency"
  const phone = "5511999999999"
  const workerId = "worker-a"
  const config = { ...defaults, enabled: true, paused: false, automatic: true, phones: [phone], birthday: true, quote: true, afterSale: true }
  const sent: string[] = []
  const send = async (_phone: string, _text: string, id: string) => { sent.push(id) }
  async function seed() {
    await db.collection("wa_jobs").deleteMany({})
    await db.collection("wa_exclusions").deleteMany({})
    await db.collection("contacts").deleteMany({})
    await db.collection<Connection>("wa_connections").replaceOne({ _id: userId }, { config, desired: true, command: "start", state: "connected", workerId, leaseUntil: new Date(now.getTime() + 90000), updatedAt: now }, { upsert: true })
    await db.collection<{ _id: string; userId: string; phone: string; name: string; birthDate: Date }>("contacts").insertOne({ _id: "contact-a", userId, phone, name: "Ana Silva", birthDate: new Date("1990-11-10T15:00:00Z") })
    sent.length = 0
  }
  async function enqueue(extra: Partial<Job> = {}) {
    const key = randomUUID()
    await putJob(db, { userId, contactId: "contact-a", phone, name: "Ana", kind: "quote", text: "Olá", dueAt: new Date(now.getTime() - 1000), expiresAt: new Date(now.getTime() + 3600000), eventAt: new Date(now.getTime() - 86400000), status: "queued", key, ...extra })
  }
  try {
    await ensureWhatsappIndexes(db)
    await t.test("media payloads use original uploads, verify ownership and snapshots, and require genuine Opus for voice notes", async () => {
      const replies = db.collection<{ _id: string; userId: string; type: string; mediaMime: string; asVoiceNote: boolean; viewOnce?: boolean }>("quick_replies")
      const files = db.collection<{ _id: string; data: Binary }>("quick_reply_files")
      await replies.insertMany([
        { _id: "voice", userId, type: "AUDIO", mediaMime: "audio/ogg", asVoiceNote: true },
        { _id: "mp3", userId, type: "AUDIO", mediaMime: "audio/mpeg", asVoiceNote: true },
        { _id: "image", userId, type: "IMAGE", mediaMime: "image/png", asVoiceNote: false },
        { _id: "private-image", userId: "other", type: "IMAGE", mediaMime: "image/png", asVoiceNote: false },
      ])
      await files.insertMany([
        { _id: "voice", data: new Binary(Buffer.from("OggS-test-OpusHead-test")) },
        { _id: "mp3", data: new Binary(Buffer.from("ID3-test-audio")) },
        { _id: "image", data: new Binary(Buffer.from("fake-png-for-payload-unit-test")) },
      ])
      await assert.rejects(readReplyMedia(db, userId, "private-image"), PreparationError)
      await assert.rejects(readReplyMedia(db, userId, "mp3"), /OGG/)
      const voice = await readReplyMedia(db, userId, "voice")
      const content = await outgoingContent(db, userId, { text: "", attachment: voice.attachment })
      assert.equal(content.ptt, true)
      assert.equal(content.mimetype, "audio/ogg; codecs=opus")
      assert.equal("forward" in content || "contextInfo" in content, false)
      const image = await readReplyMedia(db, userId, "image")
      const picture = await outgoingContent(db, userId, { text: "Legenda", attachment: image.attachment })
      assert.equal(picture.caption, "Legenda")
      assert.ok(Buffer.isBuffer(picture.image))
      await files.updateOne({ _id: "image" }, { $set: { data: new Binary(Buffer.from("replacement")) } })
      await assert.rejects(prepareMedia(db, userId, image.attachment), /alterado/)
      await replies.updateOne({ _id: "voice" }, { $set: { viewOnce: true } })
      await assert.rejects(readReplyMedia(db, userId, "voice"), PreparationError)
    })
    await t.test("session credentials and Signal keys survive reload encrypted and isolated by account", async () => {
      process.env.NEXTAUTH_SECRET = "isolated-whatsapp-test-secret"
      const first = await mongoAuthState(db, userId)
      await first.saveCreds()
      await first.state.keys.set({ "pre-key": { "sample": { private: Buffer.from("private-session-test"), public: Buffer.from("public-session-test") } } })
      const restored = await mongoAuthState(db, userId)
      assert.deepEqual(restored.state.creds.noiseKey, first.state.creds.noiseKey)
      const keys = await restored.state.keys.get("pre-key", ["sample"])
      assert.equal(Buffer.from(keys.sample.private).toString(), "private-session-test")
      const other = await mongoAuthState(db, "other-account")
      assert.equal((await other.state.keys.get("pre-key", ["sample"])).sample, null)
      const rows = await db.collection("wa_auth").find({ userId }).toArray()
      assert.equal(rows.length, 2)
      assert.ok(rows.every(row => typeof row.encrypted === "string" && row.encrypted.startsWith("v1:")))
      assert.equal(JSON.stringify(rows).includes("private-session-test"), false)
    })
    await t.test("birthday generation is tenant-scoped and idempotent across concurrent ticks", async () => {
      await seed()
      await Promise.all([generateBirthdays(db, userId, now), generateBirthdays(db, userId, now)])
      assert.equal(await db.collection("wa_jobs").countDocuments({ userId, kind: "birthday" }), 1)
      await generateBirthdays(db, "other-account", now)
      assert.equal(await db.collection("wa_jobs").countDocuments({ userId: "other-account" }), 0)
    })
    await t.test("concurrent claims transmit once and cannot use a different worker/account", async () => {
      await seed(); await enqueue()
      await dispatchOne(db, userId, "wrong-worker", send, now)
      await dispatchOne(db, "other-account", workerId, send, now)
      assert.equal(sent.length, 0)
      await Promise.all([dispatchOne(db, userId, workerId, send, now), dispatchOne(db, userId, workerId, send, now)])
      assert.equal(sent.length, 1)
      assert.equal((await db.collection("wa_jobs").findOne({ userId }))?.status, "submitted")
    })
    await t.test("ambiguous failures are never automatically retried", async () => {
      await seed(); await enqueue()
      let attempts = 0
      await dispatchOne(db, userId, workerId, async () => { attempts++; throw new Error("connection lost after write") }, now)
      await dispatchOne(db, userId, workerId, send, now)
      assert.equal(attempts, 1); assert.equal(sent.length, 0)
      assert.equal((await db.collection("wa_jobs").findOne({ userId }))?.status, "uncertain")
    })
    await t.test("pause, expiry, exclusions and removed recipients prevent transmission", async () => {
      await seed(); await enqueue()
      await db.collection<Connection>("wa_connections").updateOne({ _id: userId }, { $set: { "config.paused": true } })
      await dispatchOne(db, userId, workerId, send, now); assert.equal(sent.length, 0)
      await seed(); await enqueue({ expiresAt: new Date(now.getTime() - 1) })
      await dispatchOne(db, userId, workerId, send, now)
      assert.equal((await db.collection("wa_jobs").findOne({ userId }))?.status, "expired")
      await seed(); await enqueue()
      await recordIncoming(db, userId, phone, now, true)
      await dispatchOne(db, userId, workerId, send, now); assert.equal(sent.length, 0)
      assert.ok(await db.collection("wa_exclusions").findOne({ userId, phone }))
      await seed(); await enqueue({ phone: "5521999999999" })
      await dispatchOne(db, userId, workerId, send, now)
      assert.equal((await db.collection("wa_jobs").findOne({ userId }))?.status, "canceled")
    })
    await t.test("a customer reply cancels follow-up but does not cancel birthday", async () => {
      await seed(); await enqueue(); await enqueue({ kind: "birthday" })
      await recordIncoming(db, userId, phone, now, false)
      assert.equal((await db.collection("wa_jobs").findOne({ kind: "quote" }))?.status, "canceled")
      assert.equal((await db.collection("wa_jobs").findOne({ kind: "birthday" }))?.status, "queued")
    })
    await t.test("review mode never sends unapproved jobs, explicit approval can proceed", async () => {
      await seed(); await enqueue()
      await db.collection<Connection>("wa_connections").updateOne({ _id: userId }, { $set: { "config.automatic": false } })
      await dispatchOne(db, userId, workerId, send, now); assert.equal(sent.length, 0)
      await db.collection("wa_jobs").updateOne({ userId }, { $set: { status: "queued", approved: true } })
      await dispatchOne(db, userId, workerId, send, now); assert.equal(sent.length, 1)
    })
    await t.test("closing a deal cancels its pending quote follow-up", async () => {
      await seed(); await enqueue()
      await db.collection("contacts").updateOne({ userId, phone }, { $set: { dealStage: "ganho" } })
      await dispatchOne(db, userId, workerId, send, now)
      assert.equal(sent.length, 0)
      assert.equal((await db.collection("wa_jobs").findOne({ userId }))?.status, "canceled")
    })
    await t.test("known preparation failures cancel without reporting a delivery attempt as uncertain", async () => {
      await seed(); await enqueue()
      await dispatchOne(db, userId, workerId, async () => { throw new PreparationError("Anexo removido") }, now)
      assert.equal((await db.collection("wa_jobs").findOne({ userId }))?.status, "canceled")
    })
  } finally { await client.close(); await mongo.stop() }
})
