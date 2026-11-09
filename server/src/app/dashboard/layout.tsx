import { DashNav } from "@/components/dash-nav"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="v-shell">
      <DashNav />
      <main className="v-main">{children}</main>
    </div>
  )
}
