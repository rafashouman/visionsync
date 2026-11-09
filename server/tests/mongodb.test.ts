import { test } from "node:test"
import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"
import { MongoMemoryReplSet } from "mongodb-memory-server"
import { ensureIndexes } from "../scripts/indexes"

test("MongoDB: existing CRM relations, identities, transactions and idempotent sales", { timeout: 240_000 }, async t => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, instanceOpts: [{ launchTimeout: 60_000 }] })
  process.env.DATABASE_URL = mongo.getUri("visionsync_test")
  process.env.NEXTAUTH_SECRET = "test-only-secret-for-isolated-integration-test"
  const { prisma } = await import("../src/lib/prisma")
  try {
    await promisify(execFile)(process.execPath, [path.resolve("../node_modules/prisma/build/index.js"), "db", "push", "--skip-generate"], { cwd: process.cwd(), env: process.env, timeout: 60_000 })
    await ensureIndexes(process.env.DATABASE_URL)
    const user = await prisma.user.create({ data: { email: "owner@example.test", name: "Owner" } })
    const other = await prisma.user.create({ data: { email: "other@example.test" } })
    const contact = await prisma.contact.create({ data: { userId: user.id, name: "Pessoa", phone: "5511999999999" } })
    await prisma.contact.create({ data: { userId: user.id, name: "Outro DDD", phone: "5521999999999" } })
    await prisma.contact.create({ data: { userId: other.id, name: "Outra conta", phone: contact.phone } })
    const { findContactByPhone } = await import("../src/lib/crm")
    await t.test("full international identity and account isolation", async () => {
      assert.equal((await findContactByPhone(user.id, "+55 (11) 99999-9999"))?.id, contact.id)
      assert.notEqual((await findContactByPhone(user.id, "21999999999"))?.id, contact.id)
      assert.notEqual((await findContactByPhone(other.id, contact.phone))?.id, contact.id)
      await assert.rejects(prisma.contact.create({ data: { userId: user.id, name: "Duplicate", phone: contact.phone } }))
    })
    await t.test("nullable unique values do not block unrelated rows", async () => {
      await prisma.quickReply.create({ data: { userId: user.id, name: "Uma", shortcut: null } })
      await prisma.quickReply.create({ data: { userId: user.id, name: "Outra", shortcut: null } })
      await prisma.quickReply.create({ data: { userId: user.id, name: "Com atalho", shortcut: "oi" } })
      await assert.rejects(prisma.quickReply.create({ data: { userId: user.id, name: "Duplicada", shortcut: "oi" } }))
      for (let i=0;i<2;i++) await prisma.charge.create({ data: { userId:user.id,contactId:contact.id,amount:10,dueDate:new Date(),purchaseId:null } })
    })
    const { createPurchase } = await import("../src/lib/purchases")
    await t.test("retry returns same sale, repurchase has a new identity", async () => {
      const input = { amount: 19.90, productName: "Produto", requestKey: "first-sale" }
      const a = await createPurchase(user.id,contact.id,input)
      const b = await createPurchase(user.id,contact.id,input)
      assert.equal(a.id,b.id); assert.equal(a.amountMinor,1990)
      const c = await createPurchase(user.id,contact.id,{...input,requestKey:"second-sale"})
      assert.notEqual(a.id,c.id)
      await assert.rejects(createPurchase(user.id,contact.id,{...input,amount:25}))
      await assert.rejects(createPurchase(other.id,contact.id,{...input,requestKey:"wrong-owner"}))
      assert.equal(await prisma.purchase.count({where:{userId:user.id}}),2)
    })
    await t.test("concurrent request is recorded at most once", async () => {
      const attempts = await Promise.allSettled(Array.from({length:4},()=>createPurchase(user.id,contact.id,{amount:5,requestKey:"parallel"})))
      assert.ok(attempts.some(r=>r.status==="fulfilled"))
      assert.equal(attempts.filter(r=>r.status==="rejected").length,0)
      const retry = await createPurchase(user.id,contact.id,{amount:5,requestKey:"parallel"})
      assert.ok(retry.id)
      assert.equal(await prisma.purchase.count({where:{userId:user.id,requestKey:"parallel"}}),1)
    })
    await t.test("transaction rollback and existing relation/groupBy queries", async () => {
      await assert.rejects(prisma.$transaction(async tx => { await tx.note.create({data:{userId:user.id,contactId:contact.id,text:"rollback"}}); throw new Error("abort") }))
      assert.equal(await prisma.note.count({where:{contactId:contact.id}}),0)
      const list = await prisma.crmList.create({data:{userId:user.id,name:"Cliente"}})
      await prisma.crmListMember.create({data:{listId:list.id,contactId:contact.id}})
      assert.equal((await prisma.crmListMember.findMany({where:{list:{userId:user.id}},include:{list:true}})).length,1)
      const grouped = await prisma.purchase.groupBy({by:["contactId"],where:{userId:user.id},_sum:{amount:true},_count:{_all:true}})
      assert.equal(grouped[0]._count._all,3)
    })
    await t.test("extension credential is hashed, expires and revokes", async () => {
      const {generateApiToken,hashApiToken,getUserFromToken}=await import("../src/lib/crm-auth")
      const {NextRequest}=await import("next/server")
      const token=generateApiToken(); assert.notEqual(hashApiToken(token),token)
      const req=new NextRequest("http://localhost/api/crm/me",{headers:{Authorization:`Bearer ${token}`}})
      await prisma.user.update({where:{id:user.id},data:{apiTokenHash:hashApiToken(token),apiTokenExpiresAt:new Date(Date.now()+60000)}})
      assert.equal((await getUserFromToken(req))?.id,user.id)
      await prisma.user.update({where:{id:user.id},data:{apiTokenHash:null,apiTokenExpiresAt:null}})
      assert.equal(await getUserFromToken(req),null)
    })
  } finally { await prisma.$disconnect(); await mongo.stop() }
})
