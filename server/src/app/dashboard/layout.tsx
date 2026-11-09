import { DashNav } from "@/components/dash-nav"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")
  return (
    <div className="v-shell">
      <DashNav />
      <main className="v-main">{children}</main>
    </div>
  )
}
