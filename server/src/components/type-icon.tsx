import { AlignLeft, FileText, Film, Image as ImageIcon, ListOrdered, Mic, UserRound, type LucideIcon } from "lucide-react"
import type { QuickReplyKind } from "@/lib/quick-reply-types"

const ICONS: Record<QuickReplyKind, LucideIcon> = {
  TEXT: AlignLeft,
  AUDIO: Mic,
  IMAGE: ImageIcon,
  VIDEO: Film,
  DOCUMENT: FileText,
  CONTACT: UserRound,
  SEQUENCE: ListOrdered,
}

/** Ícone de cada tipo de resposta rápida. */
export function TypeIcon({ kind, size = 16 }: { kind: QuickReplyKind; size?: number }) {
  const Icon = ICONS[kind]
  return <Icon size={size} aria-hidden="true" />
}
