import { ContactsBoard } from "@/components/contacts-board"
import { listContacts } from "@/lib/contacts"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")
  const q = String((await searchParams).q ?? "").slice(0, 100)
  return <ContactsBoard initial={await listContacts(session.user.id, q)} initialQuery={q} />
}
