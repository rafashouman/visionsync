import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto"

/**
 * Criptografia simétrica (AES-256-GCM) para segredos guardados no banco,
 * como o token de acesso do Meta. A chave é derivada do NEXTAUTH_SECRET.
 *
 * Atenção: se o NEXTAUTH_SECRET mudar, os tokens guardados deixam de abrir
 * e a taróloga precisa salvar o token do Meta de novo.
 */
function getKey() {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error("NEXTAUTH_SECRET não configurado")
  return createHash("sha256").update(`crm-secrets:${secret}`).digest()
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv)
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return ["v1", iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":")
}

export function decryptSecret(payload: string): string {
  const [version, iv, tag, data] = payload.split(":")
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Formato de segredo inválido")
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64"))
  decipher.setAuthTag(Buffer.from(tag, "base64"))
  const dec = Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()])
  return dec.toString("utf8")
}
