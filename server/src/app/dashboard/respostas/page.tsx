import { QuickRepliesBoard } from "@/components/quick-replies-board"

export default async function RespostasPage({ searchParams }: { searchParams: Promise<{ nova?: string }> }) {
  const params = await searchParams
  return <QuickRepliesBoard openNew={params.nova === "1"} />
}
