import { createHash, randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises"
import path from "node:path"

// Outside public/: files are served only after account ownership is checked.
export function uploadsRoot() {
  return path.resolve(process.env.UPLOADS_DIR || path.join(process.cwd(), "../storage/uploads"))
}

function filePath(key: string) {
  if (!/^(avatars|files)\/[a-f0-9]{32}\/[a-f0-9-]{36}$/.test(key)) throw new Error("Invalid storage key")
  return path.join(uploadsRoot(), ...key.split("/"))
}

export async function storeFile(userId: string, kind: "avatars" | "files", bytes: Uint8Array) {
  const owner = createHash("sha256").update(userId).digest("hex").slice(0, 32)
  const key = `${kind}/${owner}/${randomUUID()}`
  const target = filePath(key)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, bytes, { flag: "wx", mode: 0o600 })
  return key
}

export async function readStoredFile(key: string) { return readFile(filePath(key)) }

export async function removeStoredFile(key: string | null | undefined) {
  if (!key) return
  try { await unlink(filePath(key)) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
}

export function isMissingFile(error: unknown) { return (error as NodeJS.ErrnoException)?.code === "ENOENT" }

/** Bound the actual stream, including requests without Content-Length. */
export async function limitedBody(req: Request, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  if (Number(req.headers.get("content-length")) > limit) throw new Error("body_too_large")
  const reader = req.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > limit) { await reader.cancel(); throw new Error("body_too_large") }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  return Buffer.concat(chunks, size)
}

export async function limitedFormData(req: Request, limit: number) {
  const bytes = await limitedBody(req, limit)
  return new Response(bytes, { headers: { "Content-Type": req.headers.get("content-type") ?? "" } }).formData()
}
