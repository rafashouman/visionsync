import type { Contact } from "@prisma/client"
import { sumMoney } from "@/lib/money"
import { prisma } from "@/lib/prisma"
import { withCountryCode } from "@/lib/phone"
import { normalizePhone } from "@/lib/crm-auth"
import { dayKey } from "@/lib/dates"

export type CrmListTag = { id: string; name: string; color: string }

export type CrmPurchase = {
  id: string
  amount: number
  productName: string | null
  purchasedAt: string
  source: string
}

export type CrmContact = {
  found: boolean
  contactId: string | null
  name: string | null
  phone: string | null
  email?: string | null
  source?: string | null
  birthDate?: string | null
  lifecycleStage?: string | null
  leadStatus?: string | null
  dealTitle?: string | null
  dealValue?: number | null
  dealStage?: string | null
  nextStep?: string | null
  nextStepAt?: string | null
  lists: CrmListTag[]
  stats: {
    count: number
    totalSpent: number
    firstPurchase: string | null
    lastPurchase: string | null
    daysSinceLast: number | null
    avgIntervalDays: number | null
    tier: "novo" | "primeira" | "recorrente" | "fiel" | "vip"
    tierLabel: string
    cadenceLabel: string | null
  }
  purchasePage: number
  purchaseHasMore: boolean
  purchases: CrmPurchase[]
}

/** Match the complete international phone, scoped to the account. */
export async function findContactByPhone(userId: string, phone: string) {
  const digits = withCountryCode(normalizePhone(phone))
  if (!/^[1-9]\d{9,14}$/.test(digits)) return null
  return prisma.contact.findUnique({ where: { userId_phone: { userId, phone: digits } } })
}

function tierFor(count: number): { tier: CrmContact["stats"]["tier"]; label: string } {
  if (count <= 0) return { tier: "novo", label: "Novo contato" }
  if (count === 1) return { tier: "primeira", label: "Primeira compra" }
  if (count <= 4) return { tier: "recorrente", label: "Cliente recorrente" }
  if (count <= 9) return { tier: "fiel", label: "Cliente fiel" }
  return { tier: "vip", label: "Cliente VIP" }
}

function cadenceLabel(avg: number | null): string | null {
  if (avg == null) return null
  if (avg <= 2) return "Compra quase todo dia"
  if (avg <= 10) return "Compra toda semana"
  if (avg <= 20) return "Compra a cada 15 dias"
  if (avg <= 45) return "Compra todo mês"
  return `Compra a cada ~${Math.round(avg)} dias`
}

export async function buildContact(userId: string, contactId: string, purchasePage = 1, existingContact?: Contact): Promise<CrmContact> {
  const contact = existingContact ?? await prisma.contact.findFirst({ where: { id: contactId, userId } })
  if (!contact) return emptyContact()

  purchasePage = Math.max(1, Math.min(100_000, Math.floor(purchasePage) || 1))
  const [purchases, summary] = await Promise.all([
    prisma.purchase.findMany({ where: { userId, contactId }, orderBy: [{ purchasedAt: "desc" }, { id: "desc" }], skip: (purchasePage - 1) * 50, take: 50 }),
    prisma.purchase.aggregate({ where: { userId, contactId }, _count: { _all: true }, _sum: { amount: true }, _min: { purchasedAt: true }, _max: { purchasedAt: true } }),
  ])

  const memberships = await prisma.crmListMember.findMany({
    where: { contactId, list: { userId } },
    include: { list: true },
    orderBy: { list: { order: "asc" } },
  })
  const lists: CrmListTag[] = memberships.map((m) => ({
    id: m.list.id,
    name: m.list.name,
    color: m.list.color,
  }))

  const count = summary._count._all
  const totalSpent = sumMoney([summary._sum.amount ?? 0])
  const first = summary._min.purchasedAt
  const last = summary._max.purchasedAt
  const daysSinceLast = last ? Math.floor((Date.now() - last.getTime()) / 86_400_000) : null
  const avgIntervalDays = count >= 2 && first && last ? (last.getTime() - first.getTime()) / 86_400_000 / (count - 1) : null

  const { tier, label } = tierFor(count)

  return {
    found: true,
    contactId: contact.id,
    name: contact.name,
    phone: contact.phone,
    email: contact.email,
    source: contact.source,
    birthDate: contact.birthDate ? dayKey(contact.birthDate) : null,
    lifecycleStage: contact.lifecycleStage ?? (count > 0 ? "cliente" : "lead"),
    leadStatus: contact.leadStatus ?? "novo",
    dealTitle: contact.dealTitle ?? null,
    dealValue: contact.dealValue ?? null,
    dealStage: contact.dealStage ?? (contact.dealValue ? "aberto" : null),
    nextStep: contact.nextStep ?? null,
    nextStepAt: contact.nextStepAt?.toISOString() ?? null,
    lists,
    stats: {
      count,
      totalSpent,
      firstPurchase: first?.toISOString() ?? null,
      lastPurchase: last?.toISOString() ?? null,
      daysSinceLast,
      avgIntervalDays,
      tier,
      tierLabel: label,
      cadenceLabel: cadenceLabel(avgIntervalDays),
    },
    purchasePage,
    purchaseHasMore: purchasePage * 50 < count,
    purchases: purchases.map((p) => ({
      id: p.id,
      amount: p.amount,
      productName: p.productName,
      purchasedAt: p.purchasedAt.toISOString(),
      source: p.source,
    })),
  }
}

export function emptyContact(name: string | null = null, phone: string | null = null): CrmContact {
  return {
    found: false,
    contactId: null,
    name,
    phone,
    lists: [],
    stats: {
      count: 0,
      totalSpent: 0,
      firstPurchase: null,
      lastPurchase: null,
      daysSinceLast: null,
      avgIntervalDays: null,
      tier: "novo",
      tierLabel: "Novo contato",
      cadenceLabel: null,
    },
    purchasePage: 1, purchaseHasMore: false,
    purchases: [],
  }
}
