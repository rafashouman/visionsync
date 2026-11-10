import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"

// CRX3 developer packaging, following Chromium components/crx_file/crx3.proto
// and crx_creator.cc. Never creates or prints a signing key.
function varint(value) {
  const bytes = []
  do { bytes.push((value & 127) | (value > 127 ? 128 : 0)); value = Math.floor(value / 128) } while (value)
  return Buffer.from(bytes)
}
const field = (number, bytes) => Buffer.concat([varint(number * 8 + 2), varint(bytes.length), bytes])
const le32 = value => { const bytes = Buffer.alloc(4); bytes.writeUInt32LE(value); return bytes }
export function createCrx(zip, pem) {
  const key = createPrivateKey(pem)
  if (key.asymmetricKeyType !== "rsa") throw new Error("A chave CRX deve ser RSA.")
  const publicKey = createPublicKey(key).export({ type: "spki", format: "der" })
  const signedHeader = field(1, createHash("sha256").update(publicKey).digest().subarray(0, 16))
  const signedData = Buffer.concat([Buffer.from("CRX3 SignedData\0"), le32(signedHeader.length), signedHeader, zip])
  const signature = sign("RSA-SHA256", signedData, key)
  if (!verify("RSA-SHA256", signedData, createPublicKey(key), signature)) throw new Error("Falha ao verificar assinatura CRX.")
  const header = Buffer.concat([field(2, Buffer.concat([field(1, publicKey), field(2, signature)])), field(10000, signedHeader)])
  return Buffer.concat([Buffer.from("Cr24"), le32(3), le32(header.length), header, zip])
}
export async function packExistingKey(zipPath, keyPath, outputPath) {
  let pem
  try { pem = await readFile(keyPath) } catch (error) { if (error.code === "ENOENT") return false; throw error }
  await writeFile(outputPath, createCrx(await readFile(zipPath), pem))
  return true
}
