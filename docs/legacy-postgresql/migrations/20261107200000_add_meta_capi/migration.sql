-- AlterTable: configuração do Meta por conta
ALTER TABLE "users" ADD COLUMN "metaDatasetId" TEXT;
ALTER TABLE "users" ADD COLUMN "metaAccessToken" TEXT;
ALTER TABLE "users" ADD COLUMN "metaTestEventCode" TEXT;

-- AlterTable: status de envio do evento por compra
ALTER TABLE "purchases" ADD COLUMN "metaSentAt" TIMESTAMP(3);
ALTER TABLE "purchases" ADD COLUMN "metaError" TEXT;

-- CreateIndex
CREATE INDEX "purchases_userId_metaEventSent_idx" ON "purchases"("userId", "metaEventSent");
