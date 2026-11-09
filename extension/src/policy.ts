export type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
export type ApiMessage = { type: "api"; method: Method; path: string; body?: unknown; requestKey?: string }
export type FileMessage = { type: "file"; path: string }
export type Config = { apiUrl: string; token: string }

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
  if (msg.type === "file") return /^\/api\/crm\/quick-replies\/[a-zA-Z0-9_-]+\/file$/.test(msg.path)
  if (msg.type !== "api" || !["GET", "POST", "PATCH", "PUT", "DELETE"].includes(String(msg.method))) return false
  // A content script cannot read or rotate the credential that authenticates it.
  if (/^\/api\/crm\/token(?:\?|\/|$)/.test(msg.path)) return false
  if (msg.requestKey !== undefined && (typeof msg.requestKey !== "string" || msg.requestKey.length > 128)) return false
  return JSON.stringify(msg.body ?? null).length <= 2_000_000
}
