import { prisma } from "@/lib/prisma"
import { avatarUrl } from "@/lib/contact-avatar"
import type { Prisma } from "@prisma/client"
export async function listContacts(userId: string, q = "", cursor = "") {
  q = q.trim().slice(0, 100)
  const digits = q.replace(/\D/g, "")
  const words = q.split(/\s+/).filter(Boolean)
  const search: Prisma.ContactWhereInput = { userId, ...(q ? { OR: [
    { AND: words.map(word => ({ name: { contains: word, mode: "insensitive" } })) },
    ...(!/[^\d\s()+.\-]/.test(q) && digits ? [{ phone: { contains: digits } }] : []),
  ] } : {}) }
  // A foreign/invalid cursor cannot reveal or select another account's data.
  const anchor = cursor ? await prisma.contact.findFirst({ where: { id: cursor, ...search }, select: { id: true, lastActivityAt: true } }) : null
  const where: Prisma.ContactWhereInput = anchor ? { AND: [search, { OR: [
    { lastActivityAt: { lt: anchor.lastActivityAt } }, { lastActivityAt: anchor.lastActivityAt, id: { lt: anchor.id } },
  ] }] } : search
  const rows = await prisma.contact.findMany({ where, orderBy: [{ lastActivityAt: "desc" }, { id: "desc" }], take: 21, select: { id: true, name: true, phone: true, avatarKey: true, avatarUpdatedAt: true } })
  const items = rows.slice(0, 20).map(c => ({ id: c.id, name: c.name, phone: c.phone, avatarUrl: avatarUrl(c) }))
  return { items, nextCursor: rows.length > 20 ? items[items.length - 1].id : null }
}
