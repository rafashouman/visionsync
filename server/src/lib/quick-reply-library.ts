import { z } from "zod"

export const libraryCategoryName = z.string().max(60).transform(value => value.replace(/\s+/g, " ").trim().toUpperCase()).pipe(z.string().min(1).max(40).refine(value => value !== "SEM CATEGORIA", "Este nome é reservado."))
export const libraryAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reorder"), ids: z.array(z.string().min(1).max(100)).max(500) }).strict(),
  z.object({ action: z.literal("category"), previous: libraryCategoryName, name: libraryCategoryName, color: z.string().regex(/^#[a-fA-F0-9]{6}$/) }).strict(),
  z.object({ action: z.literal("categories"), names: z.array(libraryCategoryName).max(500) }).strict(),
])
export type LibraryCategory = { name: string; color: string; position: number; count: number }
export const CATEGORY_COLORS = ["#dc5278", "#4288d4", "#28a78e", "#a07ac9", "#bf873d", "#608a9b"]
export function categoryColor(name: string) { return CATEGORY_COLORS[[...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % CATEGORY_COLORS.length] }
export function categoryViews(replies: { category: string | null }[], saved: { name: string; color: string; position: number }[]): LibraryCategory[] {
  const counts = new Map<string, number>()
  for (const reply of replies) if (reply.category) counts.set(reply.category, (counts.get(reply.category) || 0) + 1)
  return [...counts].map(([name, count], index) => {
    const metadata = saved.find(category => category.name === name)
    return { name, count, color: metadata?.color || categoryColor(name), position: metadata?.position ?? Math.max(-1, ...saved.map(category => category.position)) + 1 + index }
  }).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "pt-BR"))
}
export function sameMembers(current: string[], next: string[]) { return current.length === next.length && new Set(next).size === next.length && next.every(id => current.includes(id)) }
export function moveBefore<T>(items: T[], from: number, to: number) {
  const result = [...items]
  if (from < 0 || to < 0 || from >= items.length || to >= items.length) return result
  const [item] = result.splice(from, 1); result.splice(to, 0, item)
  return result
}
