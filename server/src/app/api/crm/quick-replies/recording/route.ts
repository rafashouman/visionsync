import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { hasTrustedOrigin } from "@/lib/request-origin"
import { allowAuthAttempt } from "@/lib/auth-rate-limit"
import { limitedFormData } from "@/lib/local-storage"
import { convertRecording, recordingFormat } from "@/lib/recorded-audio"
import { MAX_FILE_BYTES } from "@/lib/quick-reply-types"

export const runtime = "nodejs"
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  if (!hasTrustedOrigin(req)) return NextResponse.json({ error: "Origem inválida" }, { status: 403 })
  try {
    if (!await allowAuthAttempt(`recording:${session.user.id}`, 6, 60_000) || !await allowAuthAttempt("recording:global", 12, 60_000)) return NextResponse.json({ error: "Aguarde um minuto antes de converter outra gravação." }, { status: 429 })
    const form = await limitedFormData(req, MAX_FILE_BYTES + 64 * 1024)
    const file = form.get("file")
    if (!(file instanceof File) || !file.size || file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "Grave um áudio de até 3 minutos e 4 MB." }, { status: 400 })
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (!recordingFormat(bytes)) return NextResponse.json({ error: "Este formato de gravação não é compatível." }, { status: 400 })
    const audio = await convertRecording(bytes, req.signal)
    return new Response(new Uint8Array(audio), { headers: { "Content-Type": "audio/ogg", "Content-Disposition": 'attachment; filename="gravacao.ogg"', "Cache-Control": "private, no-store" } })
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "BUSY") return NextResponse.json({ error: "Outra gravação está sendo preparada. Aguarde alguns segundos e tente novamente." }, { status: 503 })
    const missing = !!error && typeof error === "object" && "code" in error && error.code === "ENOENT"
    return NextResponse.json({ error: missing ? "A conversão de áudio ainda não está disponível no servidor. Configure o FFmpeg; você pode manter a gravação aberta e tentar novamente." : "Não foi possível converter o áudio. Sua gravação foi mantida para tentar novamente." }, { status: 503 })
  }
}
