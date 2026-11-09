import type { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

export async function seedPreview(prisma: PrismaClient) {
  const password = await bcrypt.hash("VisionSync-demo-2026", 12)
  const companies = [
    { name: "Empresa Aurora", email: "aurora@visionsync.local", contact: "Contato Aurora", phone: "5511000000001", amount: 150 },
    { name: "Empresa Horizonte", email: "horizonte@visionsync.local", contact: "Contato Horizonte", phone: "5511000000002", amount: 240 },
    { name: "Empresa Estrela", email: "estrela@visionsync.local", contact: "Contato Estrela", phone: "5511000000003", amount: 90 },
  ]

  for (const company of companies) {
    const owner = await prisma.user.create({ data: { name: company.name, email: company.email, password } })
    const lists = await Promise.all(["Novos contatos", "Em atendimento", "Clientes"].map((name, order) =>
      prisma.crmList.create({ data: { userId: owner.id, name, order, color: ["#22d3ee", "#e0245e", "#34d399"][order] } }),
    ))
    const contact = await prisma.contact.create({
      data: { userId: owner.id, name: company.contact, phone: company.phone, source: "outro", nextStep: "Retomar conversa de demonstração", nextStepAt: new Date() },
    })
    await prisma.crmListMember.create({ data: { contactId: contact.id, listId: lists[2].id } })
    await prisma.purchase.create({
      data: { userId: owner.id, contactId: contact.id, amount: company.amount, amountMinor: company.amount * 100, productName: "Demonstração" },
    })
  }
}
