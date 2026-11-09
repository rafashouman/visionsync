import { FunnelBoard } from "@/components/funnel-board"
import { buildFunnel } from "@/lib/funnel"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
export default async function FunilPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")
  return <FunnelBoard initial={await buildFunnel(session.user.id)} />
}
