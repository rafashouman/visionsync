import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import sharp from "sharp"
import { limitedBody, readStoredFile, removeStoredFile, storeFile } from "../src/lib/local-storage"
import { normalizeAvatar } from "../src/lib/contact-avatar"

test("private storage: unique files, traversal rejected, replace/delete lifecycle", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "visionsync-storage-"))
  const previous = process.env.UPLOADS_DIR
  process.env.UPLOADS_DIR = root
  try {
    const bytes = Buffer.from("private upload")
    const first = await storeFile("owner", "files", bytes)
    const second = await storeFile("owner", "files", bytes)
    assert.notEqual(first, second)
    assert.equal((await readStoredFile(first)).toString(), "private upload")
    await assert.rejects(readStoredFile("../../server/.env"))
    await removeStoredFile(first)
    await assert.rejects(readStoredFile(first))
    assert.equal((await readStoredFile(second)).toString(), "private upload")
    await removeStoredFile(first) // idempotent cleanup
  } finally {
    if (previous === undefined) delete process.env.UPLOADS_DIR; else process.env.UPLOADS_DIR = previous
    await rm(root, { recursive: true, force: true })
  }
})

test("avatar decoding: JPEG/PNG become bounded WebP, invalid/oversized/vector content rejected", async () => {
  const source = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#246888" } }).png().toBuffer()
  const result = await normalizeAvatar(source)
  const info = await sharp(result).metadata()
  assert.equal(info.format, "webp"); assert.equal(info.width, 256); assert.equal(info.height, 256)
  await assert.rejects(normalizeAvatar(Buffer.from("not an image")))
  await assert.rejects(normalizeAvatar(Buffer.alloc(512 * 1024 + 1)))
  await assert.rejects(normalizeAvatar(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>')))
})

test("request limits cover actual streams without Content-Length", async () => {
  const request = (body: string) => new Request("http://localhost/upload", { method: "POST", body })
  assert.equal(Buffer.from(await limitedBody(request("abc"), 3)).toString(), "abc")
  await assert.rejects(limitedBody(request("abcd"), 3), /body_too_large/)
})
