import { z } from "zod"
import { withCountryCode } from "@/lib/phone"
import { MAX_CAPTION, QUICK_REPLY_TYPES, TYPE_INFO, type QuickReplyKind } from "@/lib/quick-reply-types"

export const MAX_QUICK_REPLIES = 500
export const MAX_TEXT = 4096

/** O que a tela e a extensão recebem. Nunca inclui o conteúdo do arquivo (ele vem de /file). */
export type QuickReplyView = {
  id: string
  type: QuickReplyKind
  name: string
  category: string | null
  favorite: boolean
  usageCount: number
  shortcut: string | null
  text: string | null // mensagem (Texto) ou legenda (Imagem, Vídeo, Documento)
  contactName: string | null
  contactPhone: string | null
  mediaName: string | null
  mediaMime: string | null
  mediaSize: number | null
  viewOnce: boolean
  asVoiceNote: boolean
}

type Row = {
  id: string
  type: QuickReplyKind
  name: string
  category: string | null
  favorite: boolean
  usageCount: number
  shortcut: string | null
  text: string | null
  contactName: string | null
  contactPhone: string | null
  mediaName: string | null
  mediaMime: string | null
  mediaSize: number | null
  viewOnce: boolean
  asVoiceNote: boolean
}

export const toView = (r: Row): QuickReplyView => ({
  id: r.id,
  type: r.type,
  name: r.name,
  category: r.category,
  favorite: r.favorite,
  usageCount: r.usageCount,
  shortcut: r.shortcut,
  text: r.text,
  contactName: r.contactName,
  contactPhone: r.contactPhone,
  mediaName: r.mediaName,
  mediaMime: r.mediaMime,
  mediaSize: r.mediaSize,
  viewOnce: r.viewOnce,
  asVoiceNote: r.asVoiceNote,
})

/** Categoria sempre em maiúsculas, espaços arrumados. Vazio vira null. */
export const normalizeCategory = (v: string | null | undefined) => {
  const c = (v ?? "").replace(/\s+/g, " ").trim().toUpperCase()
  return c ? c : null
}

/** Atalho (a palavra depois do ";"): minúsculas, sem o ";" na frente. Vazio vira null. */
export const normalizeShortcut = (v: string | null | undefined) => {
  const s = (v ?? "").trim().replace(/^;+/, "").trim().toLowerCase()
  return s ? s : null
}

const SHORTCUT_RE = /^[a-z0-9_-]{1,30}$/

export const shortcutField = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v === undefined ? undefined : normalizeShortcut(v)))
  .refine((v) => v === undefined || v === null || SHORTCUT_RE.test(v), {
    message: "Atalho inválido: use letras sem acento, números, - ou _ (até 30 caracteres)",
  })

export const categoryField = z
  .string()
  .max(60)
  .nullable()
  .optional()
  .transform((v) => (v === undefined ? undefined : normalizeCategory(v)))
  .refine((v) => v === undefined || v === null || v.length <= 40, { message: "Categoria com até 40 caracteres" })

export const nameField = z.string().trim().min(1, "Dê um nome pra mensagem").max(80, "Nome com até 80 caracteres")
export const textField = z.string().trim().min(1, "Escreva a mensagem").max(MAX_TEXT, `A mensagem passou de ${MAX_TEXT} caracteres`)
export const contactNameField = z.string().trim().min(1, "Informe o nome do contato").max(100)

/** Telefone do contato: 8 a 15 dígitos, guardado com o código do país. */
export const contactPhoneField = z
  .string()
  .trim()
  .min(1, "Informe o telefone do contato")
  .refine((v) => {
    const d = v.replace(/\D/g, "")
    return d.length >= 8 && d.length <= 15
  }, { message: "Telefone inválido. Use DDD + número (com 55 se quiser)." })
  .transform((v) => withCountryCode(v))

/** Legenda de imagem, vídeo e documento: opcional, até 1024 caracteres. Vazia vira null. */
export const captionField = z
  .string()
  .trim()
  .max(MAX_CAPTION, `A legenda passou de ${MAX_CAPTION} caracteres`)
  .transform((v) => (v ? v : null))

export const kindField = z.enum(QUICK_REPLY_TYPES)

/** Mensagem pra um tipo que ainda não dá pra criar, ou null se pode. */
export function unavailableTypeMessage(kind: QuickReplyKind): string | null {
  return TYPE_INFO[kind].available ? null : `O tipo "${TYPE_INFO[kind].label}" ainda não está disponível.`
}

/** Erro "valor duplicado" do Prisma (P2002): aqui só pode ser o atalho. */
export const isUniqueViolation = (e: unknown) =>
  typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002"

export const SHORTCUT_TAKEN = "Esse atalho já está em uso por outra resposta."
