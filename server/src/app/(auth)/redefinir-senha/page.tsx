import { PasswordRecovery } from "@/components/password-recovery"
export const metadata = { referrer: "no-referrer" as const }

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const query = await searchParams
  return <PasswordRecovery reset initialToken={query.token || ""} />
}
