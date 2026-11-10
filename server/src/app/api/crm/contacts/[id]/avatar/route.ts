import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/crm-auth"
import { avatarUrl, MAX_AVATAR_BYTES, normalizeAvatar } from "@/lib/contact-avatar"
import { isMissingFile, limitedBody, readStoredFile, removeStoredFile, storeFile } from "@/lib/local-storage"

export const runtime = "nodejs"
type Context = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Context) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const { id } = await ctx.params
  const contact = await prisma.contact.findFirst({ where: { id, userId: user.id } })
  if (!contact?.avatarKey) return new Response(null, { status: 404 })
  try {
    const bytes = await readStoredFile(contact.avatarKey)
    return new Response(bytes, { headers: {
      "Content-Type": "image/webp", "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    } })
  } catch (error) { if (isMissingFile(error)) return new Response(null, { status: 404 }); throw error }
}

// Extension sends a bounded base64 payload; no server-side fetching of external URLs.
export async function PUT(req: NextRequest, ctx: Context) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const { id } = await ctx.params
  const contact = await prisma.contact.findFirst({ where: { id, userId: user.id } })
  if (!contact) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 })
  let bytes: Buffer
  try {
    const body = JSON.parse(Buffer.from(await limitedBody(req, 710_000)).toString("utf8"))
    if (typeof body.base64 !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.base64)) throw new Error("Imagem inválida.")
    bytes = await normalizeAvatar(Buffer.from(body.base64, "base64"))
  } catch (error) {
    const large = error instanceof Error && error.message === "body_too_large"
    return NextResponse.json({ error: large ? `Foto excede ${MAX_AVATAR_BYTES / 1024} KB.` : "Imagem inválida. Use JPEG, PNG ou WebP até 512 KB." }, { status: large ? 413 : 400 })
  }
  const key = await storeFile(user.id, "avatars", bytes)
  try {
    const updated = await prisma.contact.update({ where: { id }, data: { avatarKey: key, avatarUpdatedAt: new Date() } })
    // Only remove after MongoDB points to the new file. Concurrent requests never delete the winner.
    await removeStoredFile(contact.avatarKey).catch(() => console.error("Could not remove replaced avatar"))
    return NextResponse.json({ avatarUrl: avatarUrl(updated) })
  } catch (error) { await removeStoredFile(key); throw error }
}

export async function DELETE(req: NextRequest, ctx: Context) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const { id } = await ctx.params
  const contact = await prisma.contact.findFirst({ where: { id, userId: user.id } })
  if (!contact) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 })
  await prisma.contact.update({ where: { id }, data: { avatarKey: null, avatarUpdatedAt: null } })
  await removeStoredFile(contact.avatarKey)
  return NextResponse.json({ avatarUrl: null })
}
