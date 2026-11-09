import type { CSSProperties } from "react"

/**
 * Estilos compartilhados do tema Vision. Só usam as variáveis de cor do
 * globals.css, nunca cores fixas. Campos (input, select, textarea) já vêm
 * escuros do CSS global: aqui só entra o tamanho.
 */

export const card: CSSProperties = {
  background: "linear-gradient(180deg, var(--card-top), var(--card-bottom))",
  border: "1px solid var(--line)",
  borderRadius: 18,
  boxShadow: "var(--card-shadow)",
}

/** Cartão dentro de cartão (cliente no funil, nota, linha de lista). */
export const inner: CSSProperties = {
  background: "var(--inner)",
  border: "1px solid var(--soft)",
  borderRadius: 12,
}

export const field: CSSProperties = { padding: "8px 10px", fontSize: 13, width: "100%" }

export const btn: CSSProperties = {
  background: "var(--accent)",
  color: "var(--on-accent)",
  border: "none",
  borderRadius: 10,
  padding: "9px 16px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  boxShadow: "0 0 16px var(--glow)",
}
export const ghost: CSSProperties = {
  background: "transparent",
  color: "var(--accent-text)",
  border: "1px solid var(--line)",
  borderRadius: 10,
  padding: "9px 16px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
}
export const btnSm: CSSProperties = { ...btn, padding: "5px 11px", fontSize: 12, boxShadow: "0 0 12px var(--glow)" }
export const ghostSm: CSSProperties = { ...ghost, padding: "5px 11px", fontSize: 12 }

/** Texto clicável (sem caixa). */
export const link: CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--accent-text)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  padding: 0,
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
}
export const iconBtn: CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--muted)",
  cursor: "pointer",
  padding: "3px 5px",
  display: "inline-grid",
  placeItems: "center",
  lineHeight: 1,
}

export const label: CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, margin: "12px 0 4px", color: "var(--text-2)" }
export const req: CSSProperties = { color: "var(--accent-text)" }
export const opt: CSSProperties = { color: "var(--faint)", fontWeight: 400 }
export const helper: CSSProperties = { fontSize: 12, color: "var(--muted)", margin: "6px 0 0" }
export const errorText: CSSProperties = { fontSize: 13, color: "var(--danger)", margin: "8px 0 0" }
export const empty: CSSProperties = { padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 14, ...card }

export const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "var(--overlay)",
  backdropFilter: "blur(3px)",
  zIndex: 50,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
}
export const modal: CSSProperties = {
  ...card,
  padding: 24,
  width: 520,
  maxWidth: "100%",
  maxHeight: "92vh",
  overflowY: "auto",
  background: "linear-gradient(180deg, var(--panel-1), var(--panel-2))",
}
export const modalTitle: CSSProperties = { margin: "0 0 14px", textAlign: "center", fontSize: 18, color: "var(--strong)" }

/** Selos coloridos (estado e categoria). */
export const chipTone = {
  ok: { color: "var(--ok-text)", background: "var(--ok-bg)", border: "1px solid var(--ok-line)" },
  late: { color: "var(--late-text)", background: "var(--late-bg)", border: "1px solid var(--late-line)" },
  wait: { color: "var(--wait-text)", background: "var(--wait-bg)", border: "1px solid var(--wait-line)" },
  vio: { color: "var(--vio-text)", background: "var(--vio-bg)", border: "1px solid var(--vio-line)" },
  wine: { color: "var(--accent-text)", background: "var(--accent-soft)", border: "1px solid var(--accent-line)" },
  mute: { color: "var(--muted)", background: "var(--field)", border: "1px solid var(--soft)" },
} satisfies Record<string, CSSProperties>

export const chip = (tone: keyof typeof chipTone): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  fontSize: 11,
  fontWeight: 700,
  padding: "3px 9px",
  borderRadius: 999,
  whiteSpace: "nowrap",
  ...chipTone[tone],
})
