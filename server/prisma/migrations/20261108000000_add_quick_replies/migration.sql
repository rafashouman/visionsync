-- CreateEnum
CREATE TYPE "QuickReplyType" AS ENUM ('TEXT', 'AUDIO', 'IMAGE', 'VIDEO', 'DOCUMENT', 'CONTACT', 'SEQUENCE');

-- CreateTable
CREATE TABLE "quick_replies" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "QuickReplyType" NOT NULL DEFAULT 'TEXT',
    "name" TEXT NOT NULL,
    "category" TEXT,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "shortcut" TEXT,
    "text" TEXT,
    "mediaPath" TEXT,
    "mediaName" TEXT,
    "mediaMime" TEXT,
    "mediaSize" INTEGER,
    "viewOnce" BOOLEAN NOT NULL DEFAULT false,
    "asVoiceNote" BOOLEAN NOT NULL DEFAULT false,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quick_replies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quick_replies_userId_category_idx" ON "quick_replies"("userId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "quick_replies_userId_shortcut_key" ON "quick_replies"("userId", "shortcut");

-- AddForeignKey
ALTER TABLE "quick_replies" ADD CONSTRAINT "quick_replies_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

