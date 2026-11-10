"use client"

import { useEffect, useRef, type ReactNode } from "react"

const backgrounds = [1, 2, 3].map(number => `/brand/bg-visionsync-${number}.jpg`)

export function AuthBackground({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const layers = root.current?.querySelectorAll<HTMLDivElement>(".vs-auth-background-layer")
    if (!layers || layers.length !== 2) return
    let current = Math.floor(Math.random() * backgrounds.length)
    let visible = 0
    let cancelled = false
    let pending: HTMLImageElement | null = null
    layers[0].style.backgroundImage = `url("${backgrounds[current]}")`
    const timer = window.setInterval(() => {
      if (document.hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
      const next = (current + 1 + Math.floor(Math.random() * (backgrounds.length - 1))) % backgrounds.length
      pending = new window.Image()
      pending.onload = () => {
        if (cancelled) return
        const hidden = 1 - visible
        layers[hidden].style.backgroundImage = `url("${backgrounds[next]}")`
        layers[hidden].style.opacity = "1"
        layers[visible].style.opacity = "0"
        current = next
        visible = hidden
      }
      pending.src = backgrounds[next]
    }, 15000)
    return () => { cancelled = true; window.clearInterval(timer); if (pending) pending.onload = null }
  }, [])

  return <div ref={root} className="auth-bg vs-auth-background">
    <div aria-hidden="true" className="vs-auth-background-layer" style={{ backgroundImage: `url("${backgrounds[0]}")`, opacity: 1 }} />
    <div aria-hidden="true" className="vs-auth-background-layer" style={{ opacity: 0 }} />
    {children}
  </div>
}
