-- CreateTable
CREATE TABLE "meta_pixels" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "testEventCode" TEXT,
    "repeatMode" TEXT NOT NULL DEFAULT 'purchase',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meta_pixels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meta_pixels_userId_idx" ON "meta_pixels"("userId");

-- AlterTable
ALTER TABLE "crm_lists" ADD COLUMN     "metaPixelId" TEXT;

-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "metaPixelId" TEXT;

-- Copia o pixel que já estava salvo na conta (se houver) pra nova tabela, como padrão.
INSERT INTO "meta_pixels" ("id", "userId", "name", "datasetId", "accessToken", "testEventCode", "isDefault", "repeatMode")
SELECT 'px' || md5(random()::text || "id"), "id", 'Meu pixel', "metaDatasetId", "metaAccessToken", "metaTestEventCode", true, 'purchase'
FROM "users"
WHERE "metaDatasetId" IS NOT NULL AND "metaAccessToken" IS NOT NULL;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "metaAccessToken",
DROP COLUMN "metaDatasetId",
DROP COLUMN "metaTestEventCode";

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_metaPixelId_fkey" FOREIGN KEY ("metaPixelId") REFERENCES "meta_pixels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_pixels" ADD CONSTRAINT "meta_pixels_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_lists" ADD CONSTRAINT "crm_lists_metaPixelId_fkey" FOREIGN KEY ("metaPixelId") REFERENCES "meta_pixels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
