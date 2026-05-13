-- CreateTable
CREATE TABLE "Stage4NeedDeclination" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "needId" TEXT NOT NULL,
    "declinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Stage4NeedDeclination_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Stage4NeedDeclination_sessionId_idx" ON "Stage4NeedDeclination"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Stage4NeedDeclination_sessionId_userId_needId_key" ON "Stage4NeedDeclination"("sessionId", "userId", "needId");

-- AddForeignKey
ALTER TABLE "Stage4NeedDeclination" ADD CONSTRAINT "Stage4NeedDeclination_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
