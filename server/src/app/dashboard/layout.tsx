import { DashNav } from "@/components/dash-nav"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")
  return (
    <div className="v-shell">
      <a className="vs-skip" href="#main-content">Pular para o conteúdo</a>
      <DashNav />
      <main id="main-content" tabIndex={-1} className="v-main">{children}</main>
    </div>
  )
}
