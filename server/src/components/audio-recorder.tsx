"use client"

import { useEffect, useRef, useState } from "react"
import { Mic, Square, RotateCcw, Check } from "lucide-react"
import { btn, ghost, helper, inner } from "@/lib/ui"
import { MAX_FILE_BYTES } from "@/lib/quick-reply-types"

export function AudioRecorder({ onRecorded, onBusy }: { onRecorded: (file: File) => void; onBusy?: (busy: boolean) => void }) {
  const [phase, setPhase] = useState<"idle" | "requesting" | "recording" | "review" | "converting">("idle")
  const [seconds, setSeconds] = useState(0)
  const [preview, setPreview] = useState("")
  const [previewType, setPreviewType] = useState("")
  const [error, setError] = useState("")
  const recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null)
  const blob = useRef<Blob | null>(null), objectUrl = useRef("")
  const alive = useRef(true), generation = useRef(0), pending = useRef(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null), controller = useRef<AbortController | null>(null)
  const callbacks = useRef({ onRecorded, onBusy })
  useEffect(() => { callbacks.current = { onRecorded, onBusy } })
  function release() {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null
  }
  function discard() {
    generation.current++; pending.current = false; controller.current?.abort()
    if (recorder.current?.state === "recording") recorder.current.stop()
    release(); blob.current = null
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    objectUrl.current = ""; setPreview(""); setPreviewType(""); setPhase("idle"); setSeconds(0); setError(""); callbacks.current.onBusy?.(false)
  }
  useEffect(() => {
    alive.current = true
    const lifecycle = generation
    return () => {
      alive.current = false; lifecycle.current++; controller.current?.abort()
      if (recorder.current?.state === "recording") recorder.current.stop()
      if (timer.current) clearInterval(timer.current)
      stream.current?.getTracks().forEach(track => track.stop())
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    }
  }, [])
  async function start() {
    if (pending.current) return
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setError("Gravação exige um navegador compatível em HTTPS ou localhost."); return }
    pending.current = true
    const mine = ++generation.current
    setError(""); setPhase("requesting"); callbacks.current.onBusy?.(true)
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true }, video: false })
      if (!alive.current || mine !== generation.current) { mic.getTracks().forEach(track => track.stop()); return }
      stream.current = mic
      const mimeType = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/mp4"].find(type => MediaRecorder.isTypeSupported(type))
      if (!mimeType) throw new Error("Seu navegador não oferece um formato de gravação compatível.")
      const rec = new MediaRecorder(mic, { mimeType, audioBitsPerSecond: 32000 })
      recorder.current = rec
      const chunks: Blob[] = []; let size = 0
      rec.ondataavailable = event => { if (event.data.size) { chunks.push(event.data); size += event.data.size; if (size > MAX_FILE_BYTES && rec.state === "recording") rec.stop() } }
      rec.onerror = () => { if (alive.current && mine === generation.current) { generation.current++; release(); pending.current = false; setPhase("idle"); setError("A gravação foi interrompida. Confira o microfone e tente novamente."); callbacks.current.onBusy?.(false) } }
      rec.onstop = () => {
        if (!alive.current || mine !== generation.current) return
        release()
        const audio = new Blob(chunks, { type: rec.mimeType })
        if (!audio.size || size > MAX_FILE_BYTES) { pending.current = false; setPhase("idle"); setError("A gravação ficou vazia ou excedeu 4 MB. Tente uma gravação mais curta."); callbacks.current.onBusy?.(false); return }
        blob.current = audio; objectUrl.current = URL.createObjectURL(audio); setPreview(objectUrl.current); setPreviewType(audio.type); setPhase("review")
      }
      rec.start(500); setSeconds(0); setPhase("recording")
      const started = Date.now()
      timer.current = setInterval(() => { const elapsed = Math.floor((Date.now() - started) / 1000); setSeconds(Math.min(180, elapsed)); if (elapsed >= 180 && rec.state === "recording") rec.stop() }, 250)
    } catch (error) {
      if (!alive.current || mine !== generation.current) return
      release()
      pending.current = false; setPhase("idle"); callbacks.current.onBusy?.(false)
      setError(error instanceof DOMException && error.name === "NotAllowedError" ? "Permita o microfone nas configurações do navegador para gravar." : error instanceof Error ? error.message : "Não foi possível acessar o microfone.")
    }
  }
  async function accept() {
    if (!blob.current || phase !== "review") return
    setPhase("converting"); setError("")
    const mine = generation.current
    const abort = new AbortController(); controller.current = abort
    const timeout = setTimeout(() => abort.abort(), 45000)
    try {
      const form = new FormData(); form.set("file", blob.current, "gravacao")
      const response = await fetch("/api/crm/quick-replies/recording", { method: "POST", body: form, signal: abort.signal })
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || "Falha na conversão do áudio.") }
      const audio = await response.blob()
      if (!alive.current || mine !== generation.current) return
      callbacks.current.onRecorded(new File([audio], "gravacao.ogg", { type: "audio/ogg" }))
      discard()
    } catch (error) { if (alive.current && mine === generation.current) { setPhase("review"); setError(error instanceof Error && error.name !== "AbortError" ? error.message : "A conversão demorou demais. Sua gravação continua disponível; tente novamente.") } }
    finally { clearTimeout(timeout) }
  }
  return <div style={{ ...inner, padding: 14 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Mic size={18} style={{ color: "var(--accent-text)" }} /><strong>Grave sua resposta</strong><span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span></div>
    <p style={helper}>Até 3 minutos. Ouça antes de usar; a biblioteca só muda ao salvar a resposta.</p>
    {preview && <audio key={preview} controls preload="metadata" src={preview} aria-label="Ouvir gravação antes de usar" style={{ width: "100%", marginTop: 10 }} />}
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
      {phase === "idle" && <button type="button" onClick={start} style={btn}><Mic size={14} /> Gravar agora</button>}
      {phase === "recording" && <button type="button" onClick={() => { if (recorder.current?.state === "recording") recorder.current.stop() }} style={btn}><Square size={14} /> Parar e ouvir</button>}
      {phase === "requesting" && <span role="status">Aguardando permissão do microfone…</span>}
      {phase === "review" && <><button type="button" onClick={accept} style={btn}><Check size={14} /> Usar gravação</button><button type="button" onClick={() => { discard(); void start() }} style={ghost}><RotateCcw size={14} /> Regravar</button></>}
      {phase === "converting" && <span role="status">Preparando áudio compatível com o WhatsApp…</span>}
      {phase !== "idle" && <button type="button" onClick={discard} style={ghost}>Descartar</button>}
    </div>
    {preview && <a href={preview} download={`gravacao.${previewType.includes("ogg") ? "ogg" : previewType.includes("mp4") ? "m4a" : "webm"}`} style={{ display: "inline-block", marginTop: 10, fontSize: 12, color: "var(--accent-text)" }}>Baixar gravação original</a>}
    {error && <p role="alert" style={{ ...helper, color: "var(--danger)" }}>{error}</p>}
  </div>
}
