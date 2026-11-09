/** Tipos de resposta rápida e regras de arquivo. Sem imports de servidor: a tela também usa este arquivo. */
export const QUICK_REPLY_TYPES = ["TEXT", "AUDIO", "IMAGE", "VIDEO", "DOCUMENT", "CONTACT", "SEQUENCE"] as const
export type QuickReplyKind = (typeof QUICK_REPLY_TYPES)[number]

/** O ícone de cada tipo fica em components/type-icon.tsx. */
export const TYPE_INFO: Record<QuickReplyKind, { label: string; hint: string; available: boolean }> = {
  TEXT: { label: "Texto", hint: "Uma mensagem de texto pronta", available: true },
  AUDIO: { label: "Áudio", hint: "Um áudio pronto (.ogg ou .mp3)", available: true },
  IMAGE: { label: "Imagem", hint: "Uma imagem com legenda opcional", available: true },
  VIDEO: { label: "Vídeo", hint: "Um vídeo curto com legenda opcional", available: true },
  DOCUMENT: { label: "Documento", hint: "PDF, planilha, zip e outros", available: true },
  CONTACT: { label: "Contato", hint: "Cartão de contato: quem recebe toca e salva", available: true },
  SEQUENCE: { label: "Sequência", hint: "Falta ver como é o formulário", available: false },
}

/* ───────────── Arquivos (guardados no banco) ───────────── */

/** Limite por arquivo. Vem do limite de 4,5 MB por envio da Vercel, com folga. */
export const MAX_FILE_BYTES = 4 * 1024 * 1024
/** Limite de arquivos por conta. O banco grátis tem 500 MB no total. */
export const MAX_ACCOUNT_BYTES = 40 * 1024 * 1024
/** Limite de legenda do WhatsApp. */
export const MAX_CAPTION = 1024

export const MEDIA_KINDS = ["AUDIO", "IMAGE", "VIDEO", "DOCUMENT"] as const
export type MediaKind = (typeof MEDIA_KINDS)[number]
export const isMediaKind = (k: string): k is MediaKind => (MEDIA_KINDS as readonly string[]).includes(k)

export const MEDIA_RULES: Record<
  MediaKind,
  { exts: string[] | null; accept: string; formats: string; hasCaption: boolean }
> = {
  AUDIO: { exts: ["ogg", "mp3"], accept: ".ogg,.mp3,audio/ogg,audio/mpeg", formats: ".ogg, .mp3", hasCaption: false },
  IMAGE: { exts: ["png", "jpg", "jpeg", "webp"], accept: ".png,.jpg,.jpeg,.webp", formats: ".png, .jpg, .webp", hasCaption: true },
  VIDEO: { exts: ["mp4", "3gp"], accept: ".mp4,.3gp,video/mp4,video/3gpp", formats: ".mp4, .3gp", hasCaption: true },
  // null = qualquer extensão que não esteja na lista de bloqueadas
  DOCUMENT: { exts: null, accept: "", formats: ".pdf, .doc, .xls, .csv, .zip e outros", hasCaption: true },
}

/** Tipo (MIME) por extensão. É o que vale: nunca confiamos no que o navegador diz. */
export const MIME_BY_EXT: Record<string, string> = {
  ogg: "audio/ogg",
  mp3: "audio/mpeg",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  mp4: "video/mp4",
  "3gp": "video/3gpp",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  csv: "text/csv",
  txt: "text/plain",
  zip: "application/zip",
}

/** Programas e scripts: nunca aceitos, nem como "documento". */
export const BLOCKED_EXTS = [
  "exe", "bat", "cmd", "com", "scr", "msi", "ps1", "vbs", "vbe", "js", "jse", "jar", "dll", "apk",
  "sh", "lnk", "reg", "hta", "cpl", "html", "htm", "svg", "xhtml",
]

export const fileExt = (name: string) => {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name.trim())
  return m ? m[1].toLowerCase() : ""
}

export const formatBytes = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} KB`
