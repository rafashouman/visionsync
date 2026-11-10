export type ReplyStep = { text: string; delaySec: number; quickReplyId?: string }
export function previewSteps(raw: string | null | undefined): ReplyStep[] {
  if (!raw) return [{ text: "", delaySec: 2 }, { text: "", delaySec: 3 }]
  try {
    const value: unknown = JSON.parse(raw)
    if (Array.isArray(value) && value.length) return value.slice(0, 20).map(step => ({
      text: typeof step?.text === "string" ? step.text : "",
      delaySec: Number.isFinite(Number(step?.delaySec)) ? Math.max(0, Math.min(60, Number(step.delaySec))) : 2,
      ...(typeof step?.quickReplyId === "string" ? { quickReplyId: step.quickReplyId } : {}),
    }))
  } catch { /* Legacy separator format. */ }
  return raw.split(/\n---\n/).filter(text => text.trim()).map(text => ({ text: text.trim(), delaySec: 2 }))
}
