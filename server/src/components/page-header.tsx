import type { ReactNode } from "react"

/** Título da página, com subtítulo e botões à direita. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <h1 className="v-title">{title}</h1>
        {subtitle && <p className="v-sub">{subtitle}</p>}
      </div>
      {actions && <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{actions}</div>}
    </div>
  )
}
