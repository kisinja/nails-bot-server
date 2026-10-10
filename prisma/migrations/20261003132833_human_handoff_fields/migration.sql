-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "ownerPhone" TEXT;

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "needsHuman" BOOLEAN NOT NULL DEFAULT false;
