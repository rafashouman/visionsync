import sharp from "sharp"

export const MAX_AVATAR_BYTES = 512 * 1024

export function avatarUrl(contact: { id: string; avatarKey?: string | null; avatarUpdatedAt?: Date | null }) {
  return contact.avatarKey ? `/api/crm/contacts/${contact.id}/avatar?v=${contact.avatarUpdatedAt?.getTime() ?? 0}` : null
}

export async function normalizeAvatar(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > MAX_AVATAR_BYTES) throw new Error("Foto deve ter até 512 KB.")
  const image = sharp(bytes, { limitInputPixels: 16_000_000, animated: false })
  const metadata = await image.metadata()
  if (!["jpeg", "png", "webp"].includes(metadata.format ?? "")) throw new Error("Use uma imagem JPEG, PNG ou WebP.")
  return image.rotate().resize(256, 256, { fit: "cover" }).webp({ quality: 80 }).toBuffer()
}
