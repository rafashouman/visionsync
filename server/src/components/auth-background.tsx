import type { ReactNode } from "react"

export function AuthBackground({ children }: { children: ReactNode }) {
  return <div className="auth-bg vs-auth-background">
    <div aria-hidden="true" className="vs-auth-background-layer" style={{ backgroundImage: 'url("/brand/bg-visionsync-3.jpg")', opacity: 1 }} />
    {children}
  </div>
}
