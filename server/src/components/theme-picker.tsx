"use client"
import { useId, type CSSProperties } from "react"
import { Check, Moon, Sparkles, Sun } from "lucide-react"
import { THEMES } from "@/lib/themes"
import { useTheme } from "./theme-provider"

const themeIcons = { dark: Moon, contrast: Sparkles, light: Sun }

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()
  return <div className="vs-theme-switcher" role="group" aria-label="Aparência">
    {THEMES.map(option => {
      const Icon = themeIcons[option.id]
      return <button key={option.id} type="button" aria-pressed={theme === option.id} onClick={() => setTheme(option.id)} title={`Tema ${option.name}`}>
        <Icon size={14} aria-hidden="true" /><span>{option.name}</span>
      </button>
    })}
  </div>
}

export function ThemePicker({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme()
  const id = useId()
  const selectedTheme = THEMES.find(option => option.id === theme) ?? THEMES[0]
  return <fieldset className={`vs-themes${compact ? " vs-themes-compact" : ""}`}>
    <legend>Aparência</legend>
    <p className="vs-theme-intro">Escolha o ambiente que combina com seu dia. Sua preferência fica salva neste navegador.</p>
    <div className="vs-theme-grid">
      {THEMES.map(option => {
        const Icon = themeIcons[option.id]
        return <label key={option.id} className={`vs-theme-choice${theme === option.id ? " is-selected" : ""}`}>
        <input type="radio" name={`${id}-theme`} value={option.id} checked={theme === option.id} onChange={() => setTheme(option.id)} aria-describedby={`${id}-${option.id}`} />
        <span className="vs-theme-preview" aria-hidden="true" style={{ "--preview-bg": option.bg, "--preview-surface": option.surface, "--preview-accent": option.accent, "--preview-text": option.text, "--preview-secondary": option.secondary, "--preview-highlight": option.highlight } as CSSProperties}>
          <span className="vs-theme-preview-side"><i /><i /><i /></span>
          <span className="vs-theme-preview-main"><i /><span><i /><i /><i /></span><b /></span>
        </span>
        <span className="vs-theme-choice-title"><Icon size={15} aria-hidden="true" />{option.name}{theme === option.id && <Check className="vs-theme-check" size={16} aria-hidden="true" />}</span>
        <span id={`${id}-${option.id}`} className="vs-theme-description">{option.description}</span>
      </label>})}
    </div>
    <p className="vs-theme-status" role="status" aria-live="polite">Tema {selectedTheme.name} ativo.</p>
  </fieldset>
}
