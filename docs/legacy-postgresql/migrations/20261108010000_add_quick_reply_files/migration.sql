-- AlterTable
ALTER TABLE "quick_replies" DROP COLUMN "mediaPath";

-- CreateTable
CREATE TABLE "quick_reply_files" (
    "quickReplyId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "quick_reply_files_pkey" PRIMARY KEY ("quickReplyId")
);

-- AddForeignKey
ALTER TABLE "quick_reply_files" ADD CONSTRAINT "quick_reply_files_quickReplyId_fkey" FOREIGN KEY ("quickReplyId") REFERENCES "quick_replies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

