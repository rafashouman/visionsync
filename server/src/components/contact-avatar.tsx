"use client"

import { useState } from "react"

export function ContactAvatar({ name, src, size = 36 }: { name: string; src?: string | null; size?: number }) {
  const [failed, setFailed] = useState<string | null>(null)
  return <span className="vs-avatar" style={{ width: size, height: size, flexShrink: 0, overflow: "hidden" }}>
    {src && failed !== src
      // Authenticated endpoint: keep the browser session instead of the image optimizer.
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={src} alt="" width={size} height={size} loading="lazy" style={{ objectFit: "cover", display: "block" }} onError={() => setFailed(src)} />
      : name.slice(0, 1).toUpperCase()}
  </span>
}
