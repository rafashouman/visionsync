import { ThemePicker } from "@/components/theme-picker"
import { MetaCard } from "@/components/meta-card"
import { PageHeader } from "@/components/page-header"
import { card } from "@/lib/ui"
import { AnalyticsSettings } from "@/components/analytics-consent"

export default function ConfiguracoesPage() {
  return (
    <div style={{ maxWidth: 960, display: "flex", flexDirection: "column", gap: 24 }}>
      <PageHeader title="Configurações" subtitle="Personalize seu ambiente e gerencie suas conexões." />

      <section style={{ ...card, padding: 24 }} aria-label="Preferências de aparência"><ThemePicker /></section>

      <AnalyticsSettings />
      <MetaCard />
    </div>
  )
}
