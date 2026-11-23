export type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
export type ApiMessage = { type: "api"; method: Method; path: string; body?: unknown; requestKey?: string }
export type FileMessage = { type: "file"; path: string }
export type Config = { apiUrl: string; token: string }
export type UploadMessage = { type: "upload-reply"; name: string; filename?: string; mediaType: "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT"; mime: string; base64: string; caption?: string; asVoiceNote?: boolean; category?: string; shortcut?: string }
const UPLOAD_MIMES: Record<UploadMessage["mediaType"], readonly string[]> = {
  AUDIO: ["audio/ogg", "audio/ogg; codecs=opus", "audio/mpeg"],
  IMAGE: ["image/jpeg", "image/png", "image/webp"],
  VIDEO: ["video/mp4", "video/3gpp"],
  DOCUMENT: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "text/csv", "text/plain", "application/zip"],
}
export function allowedUpload(value: unknown): value is UploadMessage {
  if (!value || typeof value !== "object") return false
  const m = value as Record<string, unknown>
  return m.type === "upload-reply" && typeof m.name === "string" && m.name.length > 0 && m.name.length <= 80 &&
    Object.hasOwn(UPLOAD_MIMES, String(m.mediaType)) && UPLOAD_MIMES[m.mediaType as UploadMessage["mediaType"]].includes(String(m.mime)) &&
    (m.filename === undefined || (typeof m.filename === "string" && m.filename.length > 0 && m.filename.length <= 180 && !/[\\/\x00]/.test(m.filename))) &&
    typeof m.base64 === "string" && m.base64.length <= 5592408 && /^[A-Za-z0-9+/]+={0,2}$/.test(m.base64) &&
    (m.caption === undefined || (typeof m.caption === "string" && m.caption.length <= 1024)) && (m.asVoiceNote === undefined || typeof m.asVoiceNote === "boolean") &&
    (m.category === undefined || (typeof m.category === "string" && m.category.length <= 40)) && (m.shortcut === undefined || (typeof m.shortcut === "string" && m.shortcut.length <= 30))
}

export function allowedAvatarUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 4096) return false
  try {
    const url = new URL(value)
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      (url.hostname === "web.whatsapp.com" || url.hostname.endsWith(".whatsapp.net") || url.hostname.endsWith(".fbcdn.net"))
  } catch { return false }
}

export function normalizeApiUrl(value: string): string {
  const url = new URL(value)
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("Informe somente o endereço principal do CRM.")
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) throw new Error("Use HTTPS ou localhost no desenvolvimento.")
  return url.origin
}

export function allowedMessage(value: unknown): value is ApiMessage | FileMessage {
  if (!value || typeof value !== "object") return false
  const msg = value as Record<string, unknown>
  if (typeof msg.path !== "string" || msg.path.length > 1500 || !/^\/api\/crm\/[a-zA-Z0-9_/?=&%.,:-]+$/.test(msg.path)) return false
  if (/%(?:2e|2f|5c)|\.\.|\\/i.test(msg.path)) return false
  if (msg.type === "file") return /^\/api\/crm\/(quick-replies\/[a-zA-Z0-9_-]+\/file|contacts\/[a-zA-Z0-9_-]+\/avatar(?:\?v=\d+)?)$/.test(msg.path)
  if (msg.type !== "api" || !["GET", "POST", "PATCH", "PUT", "DELETE"].includes(String(msg.method))) return false
  // A content script cannot read or rotate the credential that authenticates it.
  if (/^\/api\/crm\/token(?:\?|\/|$)/.test(msg.path)) return false
  if (msg.requestKey !== undefined && (typeof msg.requestKey !== "string" || msg.requestKey.length > 128)) return false
  return JSON.stringify(msg.body ?? null).length <= 2_000_000
}
