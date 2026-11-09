-- AlterTable: campos do funil no contato
ALTER TABLE "contacts" ADD COLUMN "nextStep" TEXT;
ALTER TABLE "contacts" ADD COLUMN "nextStepAt" TIMESTAMP(3);
ALTER TABLE "contacts" ADD COLUMN "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "contacts_userId_lastActivityAt_idx" ON "contacts"("userId", "lastActivityAt");
