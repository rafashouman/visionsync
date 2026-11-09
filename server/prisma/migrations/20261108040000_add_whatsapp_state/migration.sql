-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "waArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "waLastAt" TIMESTAMP(3),
ADD COLUMN     "waLastFromMe" BOOLEAN,
ADD COLUMN     "waSyncedAt" TIMESTAMP(3),
ADD COLUMN     "waUnread" INTEGER NOT NULL DEFAULT 0;
