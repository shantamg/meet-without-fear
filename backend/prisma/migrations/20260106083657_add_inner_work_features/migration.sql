-- CreateEnum
CREATE TYPE "NeedsCategory" AS ENUM ('FOUNDATION', 'EMOTIONAL', 'RELATIONAL', 'INTEGRATION', 'TRANSCENDENCE');

-- CreateEnum
CREATE TYPE "MentionSourceType" AS ENUM ('INNER_THOUGHTS', 'GRATITUDE', 'NEEDS_CHECKIN', 'PARTNER_SESSION');

-- CreateEnum
CREATE TYPE "MeditationType" AS ENUM ('GUIDED', 'UNGUIDED');

-- CreateEnum
CREATE TYPE "FavoriteType" AS ENUM ('EXACT', 'THEME');

-- CreateTable
CREATE TABLE "Need" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "NeedsCategory" NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "Need_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NeedScore" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "needId" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "clarification" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NeedScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NeedsAssessmentState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "baselineCompleted" BOOLEAN NOT NULL DEFAULT false,
    "baselineCompletedAt" TIMESTAMP(3),
    "checkInFrequencyDays" INTEGER NOT NULL DEFAULT 7,
    "lastCheckInNeedId" INTEGER,
    "lastCheckInAt" TIMESTAMP(3),
    "nextCheckInAt" TIMESTAMP(3),

    CONSTRAINT "NeedsAssessmentState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "relationship" TEXT,
    "firstMentioned" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMentioned" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mentionCountInnerThoughts" INTEGER NOT NULL DEFAULT 0,
    "mentionCountGratitude" INTEGER NOT NULL DEFAULT 0,
    "mentionCountNeeds" INTEGER NOT NULL DEFAULT 0,
    "mentionCountConflict" INTEGER NOT NULL DEFAULT 0,
    "needsConnections" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonMention" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceType" "MentionSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "context" TEXT,
    "sentiment" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GratitudeEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "voiceRecorded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "extractedPeople" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "extractedPlaces" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "extractedActivities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "extractedEmotions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "extractedThemes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "linkedNeedIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "linkedConflictId" TEXT,
    "sentimentScore" DOUBLE PRECISION,
    "aiResponse" TEXT,

    CONSTRAINT "GratitudeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GratitudePreferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "frequency" INTEGER NOT NULL DEFAULT 1,
    "preferredTimes" TEXT[] DEFAULT ARRAY['20:00']::TEXT[],
    "weekdayOnly" BOOLEAN NOT NULL DEFAULT false,
    "quietHoursStart" TEXT,
    "quietHoursEnd" TEXT,

    CONSTRAINT "GratitudePreferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeditationSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "MeditationType" NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "focusArea" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "scriptGenerated" TEXT,
    "voiceId" TEXT,
    "backgroundSound" TEXT,
    "savedAsFavorite" BOOLEAN NOT NULL DEFAULT false,
    "favoriteType" "FavoriteType",
    "postNotes" TEXT,
    "linkedNeedIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "linkedConflictId" TEXT,

    CONSTRAINT "MeditationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeditationStats" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalSessions" INTEGER NOT NULL DEFAULT 0,
    "guidedCount" INTEGER NOT NULL DEFAULT 0,
    "unguidedCount" INTEGER NOT NULL DEFAULT 0,
    "totalMinutes" INTEGER NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "streakStartDate" TIMESTAMP(3),
    "lastSessionDate" TIMESTAMP(3),
    "favoriteFocusAreas" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "MeditationStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeditationFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "focusArea" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "favoriteType" "FavoriteType" NOT NULL,
    "script" TEXT,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeditationFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeditationPreferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "preferredVoice" TEXT NOT NULL DEFAULT 'default',
    "voiceSpeed" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "defaultDuration" INTEGER NOT NULL DEFAULT 10,
    "backgroundSound" TEXT NOT NULL DEFAULT 'silence',
    "reminderEnabled" BOOLEAN NOT NULL DEFAULT false,
    "reminderTime" TEXT,

    CONSTRAINT "MeditationPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Need_slug_key" ON "Need"("slug");

-- CreateIndex
CREATE INDEX "NeedScore_userId_needId_idx" ON "NeedScore"("userId", "needId");

-- CreateIndex
CREATE INDEX "NeedScore_userId_createdAt_idx" ON "NeedScore"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NeedsAssessmentState_userId_key" ON "NeedsAssessmentState"("userId");

-- CreateIndex
CREATE INDEX "Person_userId_lastMentioned_idx" ON "Person"("userId", "lastMentioned");

-- CreateIndex
CREATE UNIQUE INDEX "Person_userId_name_key" ON "Person"("userId", "name");

-- CreateIndex
CREATE INDEX "PersonMention_personId_createdAt_idx" ON "PersonMention"("personId", "createdAt");

-- CreateIndex
CREATE INDEX "PersonMention_userId_sourceType_idx" ON "PersonMention"("userId", "sourceType");

-- CreateIndex
CREATE INDEX "GratitudeEntry_userId_createdAt_idx" ON "GratitudeEntry"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GratitudePreferences_userId_key" ON "GratitudePreferences"("userId");

-- CreateIndex
CREATE INDEX "MeditationSession_userId_startedAt_idx" ON "MeditationSession"("userId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MeditationStats_userId_key" ON "MeditationStats"("userId");

-- CreateIndex
CREATE INDEX "MeditationFavorite_userId_idx" ON "MeditationFavorite"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MeditationPreferences_userId_key" ON "MeditationPreferences"("userId");

-- AddForeignKey
ALTER TABLE "NeedScore" ADD CONSTRAINT "NeedScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeedScore" ADD CONSTRAINT "NeedScore_needId_fkey" FOREIGN KEY ("needId") REFERENCES "Need"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeedsAssessmentState" ADD CONSTRAINT "NeedsAssessmentState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonMention" ADD CONSTRAINT "PersonMention_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GratitudeEntry" ADD CONSTRAINT "GratitudeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GratitudePreferences" ADD CONSTRAINT "GratitudePreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeditationSession" ADD CONSTRAINT "MeditationSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeditationStats" ADD CONSTRAINT "MeditationStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeditationFavorite" ADD CONSTRAINT "MeditationFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeditationPreferences" ADD CONSTRAINT "MeditationPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the 19 core human needs
INSERT INTO "Need" (id, name, slug, description, category, "order") VALUES
-- Foundation & Survival (4 needs)
(1, 'Physical Safety', 'physical-safety', 'Do you feel physically safe in your body and environment?', 'FOUNDATION', 1),
(2, 'Health & Physical Care', 'health-physical-care', 'Are your basic health needs reasonably supported?', 'FOUNDATION', 2),
(3, 'Rest & Restoration', 'rest-restoration', 'Are you getting sufficient rest and recovery?', 'FOUNDATION', 3),
(4, 'Material Security', 'material-security', 'Are your basic material needs stable?', 'FOUNDATION', 4),

-- Emotional & Psychological (4 needs)
(5, 'Emotional Safety', 'emotional-safety', 'Can you feel emotions without fear of punishment or judgment?', 'EMOTIONAL', 1),
(6, 'Self-Compassion', 'self-compassion', 'Are you treating yourself with kindness?', 'EMOTIONAL', 2),
(7, 'Regulation & Calm', 'regulation-calm', 'Are you experiencing emotional steadiness?', 'EMOTIONAL', 3),
(8, 'Agency / Autonomy', 'agency-autonomy', 'Do you have meaningful choice in your life?', 'EMOTIONAL', 4),

-- Relational (4 needs)
(9, 'Being Seen & Understood', 'being-seen-understood', 'Do you feel genuinely understood by others?', 'RELATIONAL', 1),
(10, 'Belonging', 'belonging', 'Do you feel you fit somewhere?', 'RELATIONAL', 2),
(11, 'Trust', 'trust', 'Do you have relationships where you can rely on others?', 'RELATIONAL', 3),
(12, 'Contribution', 'contribution', 'Are you meaningfully contributing to others?', 'RELATIONAL', 4),

-- Integration & Meaning (4 needs)
(13, 'Purpose / Meaning', 'purpose-meaning', 'Does your life have direction or significance?', 'INTEGRATION', 1),
(14, 'Learning & Growth', 'learning-growth', 'Are you growing in ways that matter to you?', 'INTEGRATION', 2),
(15, 'Integrity / Alignment', 'integrity-alignment', 'Are you living aligned with your values?', 'INTEGRATION', 3),
(16, 'Hope', 'hope', 'Do you have a sense of possibility about the future?', 'INTEGRATION', 4),

-- Transcendence (3 needs)
(17, 'Presence', 'presence', 'Do you experience being fully here?', 'TRANSCENDENCE', 1),
(18, 'Gratitude / Sufficiency', 'gratitude-sufficiency', 'Do you feel "I have enough"?', 'TRANSCENDENCE', 2),
(19, 'Connection to Something Larger', 'connection-larger', 'Do you feel connected to nature, spirit, humanity, or a larger whole?', 'TRANSCENDENCE', 3);
