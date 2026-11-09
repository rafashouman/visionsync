"use client"
export default function DashboardError({ reset }: { reset: () => void }) {
  return <div className="v-card" role="alert" style={{ padding: 24 }}><h2>Não foi possível carregar esta tela.</h2><p>Tente novamente. Seus dados salvos permanecem disponíveis.</p><button className="auth-btn" onClick={reset}>Tentar novamente</button></div>
}
