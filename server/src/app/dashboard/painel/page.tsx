import { DayBoard } from "@/components/day-board"
import { FirstAccessGuide } from "@/components/first-access-guide"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export default async function PainelDoDiaPage() {
  const session = await auth()
  const user = session?.user?.id ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { onboardingCompletedAt: true } }) : null
  return <><FirstAccessGuide completed={!!user?.onboardingCompletedAt} /><DayBoard /></>
}
