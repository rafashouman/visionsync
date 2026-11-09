import { prisma } from "@/lib/prisma"
import {
  BLOCKED_EXTS, MAX_ACCOUNT_BYTES, MAX_FILE_BYTES, MEDIA_RULES, MIME_BY_EXT, fileExt, formatBytes,
  type MediaKind,
} from "@/lib/quick-reply-types"

/** `data` tem o tipo exato que o Prisma pede para colunas de bytes. */
export type CheckedFile = { name: string; mime: string; size: number; data: Uint8Array<ArrayBuffer> }
export type CheckResult = { ok: true; file: CheckedFile } | { ok: false; status: number; error: string }

/** Nome seguro: sem pasta, sem caracteres de controle, até 120 caracteres. */
export function sanitizeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? ""
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").replace(/\s+/g, " ").trim()
  if (!clean) return "arquivo"
  if (clean.length <= 120) return clean
  const ext = fileExt(clean)
  return clean.slice(0, 119 - ext.length).trimEnd() + (ext ? "." + ext : "")
}

const startsWith = (b: Uint8Array, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v)
const ascii = (b: Uint8Array, text: string, offset = 0) => startsWith(b, [...text].map((c) => c.charCodeAt(0)), offset)

/**
 * Confere os primeiros bytes do arquivo com o formato que a extensão promete.
 * Extensões sem assinatura conhecida (csv, txt, ...) passam.
 */
export function contentMatchesExt(ext: string, b: Uint8Array): boolean {
  switch (ext) {
    case "png": return startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    case "jpg":
    case "jpeg": return startsWith(b, [0xff, 0xd8, 0xff])
    case "webp": return ascii(b, "RIFF") && ascii(b, "WEBP", 8)
    case "ogg": return ascii(b, "OggS")
    case "mp3": return ascii(b, "ID3") || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)
    case "mp4":
    case "3gp": return ascii(b, "ftyp", 4)
    case "pdf": return Buffer.from(b.slice(0, 1024)).includes("%PDF-")
    case "zip":
    case "docx":
    case "xlsx":
    case "pptx": return startsWith(b, [0x50, 0x4b])
    case "doc":
    case "xls":
    case "ppt": return startsWith(b, [0xd0, 0xcf, 0x11, 0xe0])
    default: return true
  }
}

/** Valida um arquivo enviado para um tipo de resposta. Só devolve ok se tudo bater. */
export async function checkUpload(kind: MediaKind, file: unknown): Promise<CheckResult> {
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, status: 400, error: "Escolha um arquivo." }
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, status: 413, error: `Arquivo grande demais (${formatBytes(file.size)}). O limite é ${formatBytes(MAX_FILE_BYTES)}.` }
  }

  const name = sanitizeFileName(file.name)
  const ext = fileExt(name)
  const rule = MEDIA_RULES[kind]

  if (BLOCKED_EXTS.includes(ext)) {
    return { ok: false, status: 400, error: `Arquivos .${ext} não são aceitos.` }
  }
  if (rule.exts) {
    if (!rule.exts.includes(ext)) {
      return { ok: false, status: 400, error: `Formato não aceito. Use: ${rule.formats}.` }
    }
  } else if (!ext) {
    return { ok: false, status: 400, error: "O arquivo precisa ter extensão (ex.: .pdf)." }
  }

  const buf = Buffer.from(await file.arrayBuffer())
  if (!contentMatchesExt(ext, buf)) {
    return { ok: false, status: 400, error: `O conteúdo não é um arquivo .${ext} de verdade.` }
  }

  return { ok: true, file: { name, mime: MIME_BY_EXT[ext] ?? "application/octet-stream", size: buf.length, data: buf } }
}

/** Quanto a conta já usa de arquivos (opcionalmente sem contar uma resposta, ao trocar o arquivo dela). */
export async function usedBytes(userId: string, exceptReplyId?: string) {
  const r = await prisma.quickReply.aggregate({
    where: { userId, ...(exceptReplyId ? { id: { not: exceptReplyId } } : {}) },
    _sum: { mediaSize: true },
  })
  return r._sum.mediaSize ?? 0
}

/** Mensagem de erro se somar `extra` bytes estoura o limite da conta; null se cabe. */
export async function accountQuotaError(userId: string, extra: number, exceptReplyId?: string): Promise<string | null> {
  const used = await usedBytes(userId, exceptReplyId)
  if (used + extra <= MAX_ACCOUNT_BYTES) return null
  return `Sem espaço: você usa ${formatBytes(used)} de ${formatBytes(MAX_ACCOUNT_BYTES)} e este arquivo tem ${formatBytes(extra)}. Apague algum arquivo antes.`
}
