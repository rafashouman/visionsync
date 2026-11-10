import type { AuthenticationState } from "@whiskeysockets/baileys"
import type { Db } from "mongodb"
import { createHash } from "node:crypto"
import { encryptSecret, decryptSecret } from "../crypto"

type AuthRow = { _id: string; userId: string; key: string; encrypted: string }
export async function mongoAuthState(db: Db, userId: string) {
  const { BufferJSON, initAuthCreds, proto } = await import("@whiskeysockets/baileys")
  const collection = db.collection<AuthRow>("wa_auth")
  let pending: Promise<unknown> = Promise.resolve()
  const idFor = (key: string) => createHash("sha256").update(JSON.stringify([userId, key])).digest("hex")
  async function read(key: string) {
    await pending
    const row = await collection.findOne({ _id: idFor(key), userId })
    return row ? JSON.parse(decryptSecret(row.encrypted), BufferJSON.reviver) : null
  }
  async function write(key: string, value: unknown) {
    const encrypted = value == null ? null : encryptSecret(JSON.stringify(value, BufferJSON.replacer))
    const operation = pending.then(async () => {
      if (encrypted === null) { await collection.deleteOne({ _id: idFor(key), userId }); return }
      await collection.updateOne({ _id: idFor(key), userId }, { $set: { userId, key, encrypted } }, { upsert: true })
    })
    pending = operation
    await operation
  }
  const creds = await read("creds") ?? initAuthCreds()
  const state: AuthenticationState = {
    creds,
    keys: {
      async get(type, ids) {
        const result: Record<string, Awaited<ReturnType<typeof read>>> = {}
        for (const id of ids) {
          let value = await read(`${type}:${id}`)
          if (type === "app-state-sync-key" && value) value = proto.Message.AppStateSyncKeyData.fromObject(value)
          result[id] = value
        }
        return result
      },
      async set(data) {
        for (const [type, entries] of Object.entries(data)) for (const [id, value] of Object.entries(entries ?? {})) await write(`${type}:${id}`, value)
      },
    },
  }
  return { state, saveCreds: () => write("creds", creds) }
}
