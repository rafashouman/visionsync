"use client"
import { useId, useState, type CSSProperties } from "react"
import { Check, Moon, Sun } from "lucide-react"
import { THEMES } from "@/lib/themes"
import { useTheme } from "./theme-provider"

export function ThemePicker({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme()
  const id = useId()
  const [message, setMessage] = useState("")
  return <fieldset className={`vs-themes${compact ? " vs-themes-compact" : ""}`}>
    <legend>Aparência</legend>
    <p className="vs-theme-intro">Escolha o ambiente que combina com seu dia. Sua preferência fica salva neste navegador.</p>
    <div className="vs-theme-grid">
      {THEMES.map(option => <label key={option.id} className={`vs-theme-choice${theme === option.id ? " is-selected" : ""}`}>
        <input type="radio" name={`${id}-theme`} value={option.id} checked={theme === option.id} onChange={() => {
          setTheme(option.id); setMessage(`Tema ${option.name} aplicado.`)
        }} aria-describedby={`${id}-${option.id}`} />
        <span className="vs-theme-preview" aria-hidden="true" style={{ "--preview-bg": option.bg, "--preview-surface": option.surface, "--preview-accent": option.accent, "--preview-text": option.text } as CSSProperties}>
          <span className="vs-theme-preview-side"><i /><i /><i /></span>
          <span className="vs-theme-preview-main"><i /><span><i /><i /><i /></span><b /></span>
        </span>
        <span className="vs-theme-choice-title">{option.id.startsWith("dark") ? <Moon size={15} aria-hidden="true" /> : <Sun size={15} aria-hidden="true" />}{option.name}{theme === option.id && <Check size={16} aria-hidden="true" />}</span>
        <span id={`${id}-${option.id}`} className="vs-theme-description">{option.description}</span>
      </label>)}
    </div>
    <p className="vs-theme-status" role="status" aria-live="polite">{message}</p>
  </fieldset>
}
