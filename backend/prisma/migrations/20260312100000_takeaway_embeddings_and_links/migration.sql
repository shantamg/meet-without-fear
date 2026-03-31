-- CreateEnum
CREATE TYPE "TakeawayType" AS ENUM ('INSIGHT', 'ACTION_ITEM', 'INTENTION');

-- CreateEnum
CREATE TYPE "TakeawayLinkType" AS ENUM ('AI_SEMANTIC', 'USER_MANUAL');

-- AlterTable: Add embedding, type, and resolved fields to SessionTakeaway
ALTER TABLE "SessionTakeaway" ADD COLUMN "embedding" vector(1024);
ALTER TABLE "SessionTakeaway" ADD COLUMN "type" "TakeawayType" NOT NULL DEFAULT 'INSIGHT';
ALTER TABLE "SessionTakeaway" ADD COLUMN "resolved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SessionTakeaway" ADD COLUMN "resolvedAt" TIMESTAMP(3);

-- CreateTable: TakeawayLink
CREATE TABLE "TakeawayLink" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "linkType" "TakeawayLinkType" NOT NULL,
    "similarity" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TakeawayLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: for querying links by source or target takeaway
CREATE INDEX "TakeawayLink_sourceId_idx" ON "TakeawayLink"("sourceId");
CREATE INDEX "TakeawayLink_targetId_idx" ON "TakeawayLink"("targetId");

-- CreateIndex: prevent duplicate links in the same direction
CREATE UNIQUE INDEX "TakeawayLink_sourceId_targetId_key" ON "TakeawayLink"("sourceId", "targetId");

-- CreateIndex: for vector search on takeaway embeddings (IVFFlat for performance)
-- Using cosine distance operator class
CREATE INDEX "SessionTakeaway_embedding_idx" ON "SessionTakeaway" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 50);

-- AddForeignKey
ALTER TABLE "TakeawayLink" ADD CONSTRAINT "TakeawayLink_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "SessionTakeaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TakeawayLink" ADD CONSTRAINT "TakeawayLink_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "SessionTakeaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;
