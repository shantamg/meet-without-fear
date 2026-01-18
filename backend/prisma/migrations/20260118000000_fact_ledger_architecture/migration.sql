-- Fact-Ledger Architecture Migration
-- This migration implements the session-level embedding architecture,
-- replacing message-level embeddings with session-level content embeddings.

-- 1. Drop Message.embedding column (dead code - session-level embedding replaces this)
ALTER TABLE "Message" DROP COLUMN IF EXISTS "embedding";

-- 2. Drop InnerWorkMessage.embedding column (dead code - session-level embedding replaces this)
ALTER TABLE "InnerWorkMessage" DROP COLUMN IF EXISTS "embedding";

-- 3. Change UserVessel.notableFacts from String[] to Json
-- First drop the old column, then add the new one
ALTER TABLE "UserVessel" DROP COLUMN IF EXISTS "notableFacts";
ALTER TABLE "UserVessel" ADD COLUMN "notableFacts" JSONB;

-- 4. Add User.globalFacts Json column
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "globalFacts" JSONB;

-- 5. Drop old UserVessel.embedding column and add contentEmbedding
ALTER TABLE "UserVessel" DROP COLUMN IF EXISTS "embedding";
ALTER TABLE "UserVessel" ADD COLUMN IF NOT EXISTS "contentEmbedding" vector(1024);

-- 6. Add InnerWorkSession.contentEmbedding vector column
ALTER TABLE "InnerWorkSession" ADD COLUMN IF NOT EXISTS "contentEmbedding" vector(1024);
