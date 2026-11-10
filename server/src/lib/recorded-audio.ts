import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const run = promisify(execFile)
export function recordingFormat(bytes: Uint8Array): "webm" | "ogg" | "mp4" | null {
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "webm"
  if (Buffer.from(bytes.subarray(0, 4)).toString() === "OggS") return "ogg"
  if (Buffer.from(bytes.subarray(4, 8)).toString() === "ftyp") return "mp4"
  return null
}
/** No shell, URLs or client-supplied command arguments. Local bounded input, audio only. */
let active = false
export async function convertRecording(bytes: Uint8Array, signal?: AbortSignal) {
  if (active) throw Object.assign(new Error("Conversão ocupada"), { code: "BUSY" })
  active = true
  try { return await runConversion(bytes, signal) } finally { active = false }
}
async function runConversion(bytes: Uint8Array, signal?: AbortSignal) {
  const format = recordingFormat(bytes)
  if (!format) throw new Error("Formato de gravação inválido.")
  const tempRoot = path.resolve(os.tmpdir())
  const dir = await mkdtemp(path.join(tempRoot, "visionsync-audio-"))
  try {
    const input = path.join(dir, `input.${format}`), output = path.join(dir, "recording.ogg")
    await writeFile(input, bytes)
    await run(process.env.FFMPEG_PATH || "ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "error", "-protocol_whitelist", "file,pipe", "-threads", "1", "-f", format === "webm" ? "matroska" : format === "mp4" ? "mov" : "ogg", "-i", input, "-map", "0:a:0", "-vn", "-t", "180", "-ac", "1", "-ar", "48000", "-c:a", "libopus", "-b:a", "32k", "-f", "ogg", output], { timeout: 30_000, maxBuffer: 128 * 1024, windowsHide: true, signal })
    const result = await readFile(output)
    if (result.length > 4 * 1024 * 1024 || !result.subarray(0, 4).equals(Buffer.from("OggS")) || !result.subarray(0, 4096).includes(Buffer.from("OpusHead"))) throw new Error("Conversão inválida.")
    return result
  } finally {
    const target = path.resolve(dir)
    if (target.startsWith(tempRoot + path.sep) && path.basename(target).startsWith("visionsync-audio-")) await rm(target, { recursive: true, force: true })
  }
}
