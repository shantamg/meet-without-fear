-- AlterEnum
ALTER TYPE "BrainActivityCallType" ADD VALUE 'CROSS_SESSION_THEME';

-- CreateTable
CREATE TABLE "RecurringTheme" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "sessionCount" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "summaryAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringTheme_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecurringTheme_userId_tag_key" ON "RecurringTheme"("userId", "tag");

-- CreateIndex
CREATE INDEX "RecurringTheme_userId_sessionCount_idx" ON "RecurringTheme"("userId", "sessionCount");

-- AddForeignKey
ALTER TABLE "RecurringTheme" ADD CONSTRAINT "RecurringTheme_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
