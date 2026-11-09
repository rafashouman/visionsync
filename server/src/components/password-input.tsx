"use client"

import { useState } from "react"

type Props = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  minLength?: number
  autoComplete?: string
  /** "dark" é o campo das telas de entrar e cadastrar (classe .auth-input). Sem isso, é o campo do painel. */
  variant?: "app" | "dark"
}

/** Campo de senha com botão "mostrar / ocultar" pra ver o que está digitando. */
export function PasswordInput({ value, onChange, placeholder, minLength, autoComplete, variant = "app" }: Props) {
  const [visible, setVisible] = useState(false)
  const dark = variant === "dark"

  return (
    <div style={{ position: "relative" }}>
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        minLength={minLength}
        autoComplete={autoComplete}
        required
        className={dark ? "auth-input" : undefined}
        // cores e moldura vêm do CSS global; aqui só o tamanho e o espaço do botão
        style={dark ? { paddingRight: 70 } : { width: "100%", padding: "9px 72px 9px 12px", fontSize: 13 }}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        style={{
          position: "absolute",
          right: 8,
          top: "50%",
          transform: "translateY(-50%)",
          background: "transparent",
          border: "none",
          color: dark ? "#ff5c8a" : "var(--accent-text)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {visible ? "Ocultar" : "Mostrar"}
      </button>
    </div>
  )
}
