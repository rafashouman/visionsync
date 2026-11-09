import { MongoClient } from "mongodb"
import "dotenv/config"

export async function ensureIndexes(uri: string) {
  const client = new MongoClient(uri)
  try {
    await client.connect()
    const db = client.db()
    await db.collection("auth_attempts").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "auth_attempt_expiry" })
    await db.collection("charges").createIndex({ userId: 1, status: 1, dueDate: 1, _id: 1 }, { name: "charges_account_due" })
    await db.collection("contacts").createIndex({ userId: 1, lastActivityAt: -1, _id: -1 }, { name: "contacts_account_cursor" })
    await db.collection("users").createIndex({ apiTokenHash: 1 }, { unique: true, partialFilterExpression: { apiTokenHash: { $type: "string" } }, name: "credential_hash_unique" })
    await db.collection("quick_replies").createIndex({ userId: 1, shortcut: 1 }, { unique: true, partialFilterExpression: { shortcut: { $type: "string" } }, name: "shortcut_unique_present" })
    await db.collection("charges").createIndex({ purchaseId: 1 }, { unique: true, partialFilterExpression: { purchaseId: { $type: "string" } }, name: "purchase_unique_present" })
  } finally { await client.close() }
}
if (process.argv[1]?.endsWith("indexes.ts")) {
  if (!process.env.DATABASE_URL) throw new Error("Defina DATABASE_URL no arquivo server/.env.")
  ensureIndexes(process.env.DATABASE_URL).then(() => console.log("Índices parciais criados. Execute depois de db:push.")).catch(error => { console.error(error); process.exitCode = 1 })
}
