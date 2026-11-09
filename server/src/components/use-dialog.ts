"use client"
import { useEffect, useRef } from "react"

/** Focus stays inside the modal and returns to its trigger when it closes. */
export function useDialog(close: () => void) {
  const ref = useRef<HTMLElement>(null)
  const closeRef = useRef(close)
  useEffect(() => { closeRef.current = close })
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const panel = ref.current
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    panel?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); return }
      if (event.key !== "Tab" || !panel) return
      const focusable = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter(el => el.getClientRects().length && !el.closest('[hidden]'))
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (!first) { event.preventDefault(); panel.focus() }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel)) { event.preventDefault(); first.focus() }
    }
    const onFocus = (event: FocusEvent) => { if (panel && event.target instanceof Node && !panel.contains(event.target)) panel.focus() }
    document.addEventListener("keydown", onKey)
    document.addEventListener("focusin", onFocus)
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("focusin", onFocus); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus() }
  }, [])
  return ref
}
