-- CreateEnum
CREATE TYPE "InsightType" AS ENUM ('PATTERN', 'CONTRADICTION', 'SUGGESTION');

-- CreateTable
CREATE TABLE "Insight" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "InsightType" NOT NULL,
    "summary" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Insight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Insight_userId_dismissed_priority_idx" ON "Insight"("userId", "dismissed", "priority");

-- CreateIndex
CREATE INDEX "Insight_userId_expiresAt_idx" ON "Insight"("userId", "expiresAt");

-- AddForeignKey
ALTER TABLE "Insight" ADD CONSTRAINT "Insight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
