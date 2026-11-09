import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/crm-auth"
import { MAX_FILE_BYTES, isMediaKind } from "@/lib/quick-reply-types"
import { accountQuotaError, checkUpload } from "@/lib/quick-reply-files"
import { toView } from "@/lib/quick-replies"

/** Cabeçalho Content-Disposition com nome seguro (ASCII + versão UTF-8). */
function disposition(kind: "inline" | "attachment", name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_")
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

/**
 * GET /api/crm/quick-replies/[id]/file -> o conteúdo do arquivo.
 * Só a dona (login do painel ou token da extensão). O tipo (MIME) é o da lista
 * permitida, nunca o que veio do navegador; documentos sempre baixam, e os
 * cabeçalhos impedem que o navegador trate o arquivo como página.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await ctx.params
  const row = await prisma.quickReplyFile.findFirst({
    where: { quickReplyId: id, quickReply: { userId: user.id } },
    select: { data: true, quickReply: { select: { type: true, mediaName: true, mediaMime: true } } },
  })
  if (!row) return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 })

  const bytes = row.data
  const total = bytes.length
  const { type, mediaName, mediaMime } = row.quickReply

  const headers: Record<string, string> = {
    "Content-Type": mediaMime ?? "application/octet-stream",
    "Content-Disposition": disposition(type === "DOCUMENT" ? "attachment" : "inline", mediaName ?? "arquivo"),
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'",
    "Cache-Control": "private, max-age=300",
    "Accept-Ranges": "bytes",
  }

  // Pedido de trecho (o player de áudio e vídeo usa pra pular)
  const range = req.headers.get("range")
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
    let start = m && m[1] !== "" ? Number(m[1]) : NaN
    let end = m && m[2] !== "" ? Number(m[2]) : NaN
    if (m && Number.isNaN(start) && !Number.isNaN(end)) {
      start = Math.max(0, total - end) // "últimos N bytes"
      end = total - 1
    } else if (m && !Number.isNaN(start) && Number.isNaN(end)) {
      end = total - 1
    }
    if (!m || Number.isNaN(start) || Number.isNaN(end) || start > end || start >= total) {
      return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${total}` } })
    }
    end = Math.min(end, total - 1)
    return new Response(bytes.subarray(start, end + 1), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${total}`, "Content-Length": String(end - start + 1) },
    })
  }

  return new Response(bytes, { headers: { ...headers, "Content-Length": String(total) } })
}

/** PUT /api/crm/quick-replies/[id]/file (multipart, campo "file") -> troca o arquivo. */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await ctx.params
  const current = await prisma.quickReply.findFirst({ where: { id, userId: user.id } })
  if (!current) return NextResponse.json({ error: "Resposta não encontrada" }, { status: 404 })
  if (!isMediaKind(current.type)) {
    return NextResponse.json({ error: "Esta resposta não tem arquivo." }, { status: 400 })
  }

  const declared = Number(req.headers.get("content-length") ?? 0)
  if (declared > MAX_FILE_BYTES + 256 * 1024) {
    return NextResponse.json({ error: "Arquivo grande demais." }, { status: 413 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "Envio inválido." }, { status: 400 })
  }

  const checked = await checkUpload(current.type, form.get("file"))
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.status })

  // O arquivo antigo sai, então não conta no limite.
  const quota = await accountQuotaError(user.id, checked.file.size, current.id)
  if (quota) return NextResponse.json({ error: quota }, { status: 400 })

  const updated = await prisma.quickReply.update({
    where: { id },
    data: {
      mediaName: checked.file.name,
      mediaMime: checked.file.mime,
      mediaSize: checked.file.size,
      file: {
        upsert: { create: { data: checked.file.data }, update: { data: checked.file.data } },
      },
    },
  })
  return NextResponse.json(toView(updated))
}
