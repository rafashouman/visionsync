import { Binary, type Db } from "mongodb"
import { createHash } from "node:crypto"
import { readStoredFile } from "../local-storage"
import type { Job } from "./store"

export type Attachment = { replyId: string; type: "IMAGE" | "AUDIO"; mime: string; asVoiceNote: boolean; sha256: string }
export class PreparationError extends Error {}
type Reply = { _id: string; userId: string; type: string; mediaMime?: string; asVoiceNote?: boolean; viewOnce?: boolean; text?: string }
export async function readReplyMedia(db: Db, userId: string, replyId: string) {
  const reply = await db.collection<Reply>("quick_replies").findOne({ _id: replyId, userId })
  if (!reply || !["IMAGE", "AUDIO"].includes(reply.type) || reply.viewOnce) throw new PreparationError("Escolha áudio ou imagem da sua biblioteca, sem visualização única.")
  const file = await db.collection<{ _id: string; storageKey?: string; data?: Binary | Uint8Array }>("quick_reply_files").findOne({ _id: replyId })
  let bytes: Buffer
  try { bytes = file?.storageKey ? await readStoredFile(file.storageKey) : file?.data ? Buffer.from(file.data instanceof Binary ? file.data.value() : file.data) : Buffer.alloc(0) }
  catch { throw new PreparationError("O arquivo não está mais disponível. Prepare outra mensagem.") }
  if (!bytes.length || bytes.length > 4 * 1024 * 1024) throw new PreparationError("Anexo ausente ou acima de 4 MB.")
  if (reply.type === "AUDIO" && reply.asVoiceNote && (!bytes.subarray(0, 4).equals(Buffer.from("OggS")) || !bytes.subarray(0, 4096).includes(Buffer.from("OpusHead")))) {
    throw new PreparationError("Nota de voz exige OGG com codec Opus. Converta o áudio ou desmarque a opção de nota de voz para enviar MP3 como áudio.")
  }
  const attachment: Attachment = { replyId, type: reply.type as Attachment["type"], mime: reply.mediaMime || (reply.type === "IMAGE" ? "image/jpeg" : "audio/mpeg"), asVoiceNote: !!reply.asVoiceNote, sha256: createHash("sha256").update(bytes).digest("hex") }
  return { attachment, bytes, caption: reply.text || "" }
}
export async function prepareMedia(db: Db, userId: string, attachment: Attachment) {
  const current = await readReplyMedia(db, userId, attachment.replyId)
  if (current.attachment.sha256 !== attachment.sha256 || current.attachment.type !== attachment.type || current.attachment.asVoiceNote !== attachment.asVoiceNote) throw new PreparationError("O anexo foi alterado depois do agendamento. Confira e prepare outro envio.")
  return current.bytes
}
export async function outgoingContent(db: Db, userId: string, job: Pick<Job, "attachment" | "text">) {
  if (!job.attachment) return { text: job.text }
  const bytes = await prepareMedia(db, userId, job.attachment)
  return job.attachment.type === "IMAGE"
    ? { image: bytes, caption: job.text, mimetype: job.attachment.mime }
    : { audio: bytes, mimetype: job.attachment.asVoiceNote ? "audio/ogg; codecs=opus" : job.attachment.mime, ptt: job.attachment.asVoiceNote }
}
