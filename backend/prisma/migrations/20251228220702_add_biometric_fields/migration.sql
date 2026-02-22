-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('CREATED', 'INVITED', 'ACTIVE', 'PAUSED', 'WAITING', 'RESOLVED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "StageStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'GATE_PENDING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "Attribution" AS ENUM ('SELF', 'OTHER', 'MUTUAL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "NeedCategory" AS ENUM ('SAFETY', 'CONNECTION', 'AUTONOMY', 'RECOGNITION', 'MEANING', 'FAIRNESS');

-- CreateEnum
CREATE TYPE "AgreementType" AS ENUM ('MICRO_EXPERIMENT', 'COMMITMENT', 'CHECK_IN', 'HYBRID');

-- CreateEnum
CREATE TYPE "AgreementStatus" AS ENUM ('PROPOSED', 'AGREED', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "ConsentContentType" AS ENUM ('IDENTIFIED_NEED', 'EVENT_SUMMARY', 'EMOTIONAL_PATTERN', 'BOUNDARY', 'EMPATHY_DRAFT', 'EMPATHY_ATTEMPT', 'STRATEGY_PROPOSAL');

-- CreateEnum
CREATE TYPE "ConsentDecision" AS ENUM ('GRANTED', 'DENIED', 'REVOKED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'AI', 'SYSTEM');

-- CreateEnum
CREATE TYPE "StrategySource" AS ENUM ('USER_SUBMITTED', 'AI_SUGGESTED', 'CURATED');

-- CreateEnum
CREATE TYPE "ExerciseType" AS ENUM ('BREATHING_EXERCISE', 'BODY_SCAN', 'GROUNDING', 'PAUSE_SESSION');

-- CreateEnum
CREATE TYPE "GlobalLibrarySource" AS ENUM ('CURATED', 'CONTRIBUTED');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "clerkId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "pushToken" TEXT,
    "biometricEnabled" BOOLEAN NOT NULL DEFAULT false,
    "biometricEnrolledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Relationship" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Relationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RelationshipMember" (
    "id" TEXT NOT NULL,
    "relationshipId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role" TEXT NOT NULL DEFAULT 'member',
    "nickname" TEXT,

    CONSTRAINT "RelationshipMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "relationshipId" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'CREATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageProgress" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stage" INTEGER NOT NULL,
    "status" "StageStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "gatesSatisfied" JSONB,
    "isSynthesisDirty" BOOLEAN NOT NULL DEFAULT true,
    "synthesisLastUpdated" TIMESTAMP(3),

    CONSTRAINT "StageProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserVessel" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserVessel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserEvent" (
    "id" TEXT NOT NULL,
    "vesselId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "attributedTo" "Attribution" NOT NULL,
    "emotions" TEXT[],
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmotionalReading" (
    "id" TEXT NOT NULL,
    "vesselId" TEXT NOT NULL,
    "intensity" INTEGER NOT NULL,
    "context" TEXT,
    "stage" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmotionalReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdentifiedNeed" (
    "id" TEXT NOT NULL,
    "vesselId" TEXT NOT NULL,
    "need" TEXT NOT NULL,
    "category" "NeedCategory" NOT NULL,
    "evidence" TEXT[],
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "aiConfidence" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdentifiedNeed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Boundary" (
    "id" TEXT NOT NULL,
    "vesselId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "nonNegotiable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Boundary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserDocument" (
    "id" TEXT NOT NULL,
    "vesselId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedVessel" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SharedVessel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentedContent" (
    "id" TEXT NOT NULL,
    "sharedVesselId" TEXT NOT NULL,
    "sourceUserId" TEXT NOT NULL,
    "originalNeedId" TEXT,
    "transformedContent" TEXT NOT NULL,
    "consentedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consentActive" BOOLEAN NOT NULL DEFAULT true,
    "revokedAt" TIMESTAMP(3),
    "consentRecordId" TEXT NOT NULL,

    CONSTRAINT "ConsentedContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommonGround" (
    "id" TEXT NOT NULL,
    "sharedVesselId" TEXT NOT NULL,
    "need" TEXT NOT NULL,
    "category" "NeedCategory" NOT NULL,
    "confirmedByA" BOOLEAN NOT NULL DEFAULT false,
    "confirmedByB" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "CommonGround_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agreement" (
    "id" TEXT NOT NULL,
    "sharedVesselId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "AgreementType" NOT NULL,
    "status" "AgreementStatus" NOT NULL DEFAULT 'PROPOSED',
    "agreedByA" BOOLEAN NOT NULL DEFAULT false,
    "agreedByB" BOOLEAN NOT NULL DEFAULT false,
    "agreedAt" TIMESTAMP(3),
    "followUpDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "proposalId" TEXT,

    CONSTRAINT "Agreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "targetType" "ConsentContentType" NOT NULL,
    "targetId" TEXT,
    "requestedByUserId" TEXT NOT NULL,
    "decision" "ConsentDecision",
    "decidedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "senderId" TEXT,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "stage" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "extractedNeeds" TEXT[],
    "extractedEmotions" TEXT[],

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmpathyDraft" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "readyToShare" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmpathyDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmpathyAttempt" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sourceUserId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sharedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consentRecordId" TEXT,

    CONSTRAINT "EmpathyAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmpathyValidation" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "validated" BOOLEAN NOT NULL,
    "feedback" TEXT,
    "feedbackShared" BOOLEAN NOT NULL DEFAULT false,
    "validatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmpathyValidation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyProposal" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "description" TEXT NOT NULL,
    "needsAddressed" TEXT[],
    "duration" TEXT,
    "measureOfSuccess" TEXT,
    "source" "StrategySource" NOT NULL DEFAULT 'USER_SUBMITTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "consentRecordId" TEXT,

    CONSTRAINT "StrategyProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyRanking" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rankedIds" TEXT[],
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyRanking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmotionalExerciseCompletion" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ExerciseType" NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "intensityBefore" INTEGER,
    "intensityAfter" INTEGER,

    CONSTRAINT "EmotionalExerciseCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalLibraryItem" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "source" "GlobalLibrarySource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "contributedBy" TEXT,
    "contributionConsent" TIMESTAMP(3),

    CONSTRAINT "GlobalLibraryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "name" TEXT,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "declineReason" TEXT,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkId_key" ON "User"("clerkId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "RelationshipMember_userId_idx" ON "RelationshipMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RelationshipMember_relationshipId_userId_key" ON "RelationshipMember"("relationshipId", "userId");

-- CreateIndex
CREATE INDEX "Session_relationshipId_idx" ON "Session"("relationshipId");

-- CreateIndex
CREATE INDEX "Session_status_idx" ON "Session"("status");

-- CreateIndex
CREATE INDEX "StageProgress_sessionId_idx" ON "StageProgress"("sessionId");

-- CreateIndex
CREATE INDEX "StageProgress_userId_idx" ON "StageProgress"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StageProgress_sessionId_userId_stage_key" ON "StageProgress"("sessionId", "userId", "stage");

-- CreateIndex
CREATE INDEX "UserVessel_userId_idx" ON "UserVessel"("userId");

-- CreateIndex
CREATE INDEX "UserVessel_sessionId_idx" ON "UserVessel"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "UserVessel_userId_sessionId_key" ON "UserVessel"("userId", "sessionId");

-- CreateIndex
CREATE INDEX "UserEvent_vesselId_timestamp_idx" ON "UserEvent"("vesselId", "timestamp");

-- CreateIndex
CREATE INDEX "EmotionalReading_vesselId_timestamp_idx" ON "EmotionalReading"("vesselId", "timestamp");

-- CreateIndex
CREATE INDEX "IdentifiedNeed_vesselId_idx" ON "IdentifiedNeed"("vesselId");

-- CreateIndex
CREATE INDEX "Boundary_vesselId_idx" ON "Boundary"("vesselId");

-- CreateIndex
CREATE INDEX "UserDocument_vesselId_idx" ON "UserDocument"("vesselId");

-- CreateIndex
CREATE UNIQUE INDEX "SharedVessel_sessionId_key" ON "SharedVessel"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentedContent_originalNeedId_key" ON "ConsentedContent"("originalNeedId");

-- CreateIndex
CREATE INDEX "ConsentedContent_sharedVesselId_idx" ON "ConsentedContent"("sharedVesselId");

-- CreateIndex
CREATE INDEX "ConsentedContent_sourceUserId_idx" ON "ConsentedContent"("sourceUserId");

-- CreateIndex
CREATE INDEX "CommonGround_sharedVesselId_idx" ON "CommonGround"("sharedVesselId");

-- CreateIndex
CREATE INDEX "Agreement_sharedVesselId_idx" ON "Agreement"("sharedVesselId");

-- CreateIndex
CREATE INDEX "ConsentRecord_userId_sessionId_targetType_decidedAt_idx" ON "ConsentRecord"("userId", "sessionId", "targetType", "decidedAt");

-- CreateIndex
CREATE INDEX "Message_sessionId_timestamp_idx" ON "Message"("sessionId", "timestamp");

-- CreateIndex
CREATE INDEX "Message_senderId_idx" ON "Message"("senderId");

-- CreateIndex
CREATE UNIQUE INDEX "EmpathyDraft_sessionId_userId_key" ON "EmpathyDraft"("sessionId", "userId");

-- CreateIndex
CREATE INDEX "EmpathyAttempt_sessionId_sourceUserId_idx" ON "EmpathyAttempt"("sessionId", "sourceUserId");

-- CreateIndex
CREATE UNIQUE INDEX "EmpathyValidation_attemptId_userId_key" ON "EmpathyValidation"("attemptId", "userId");

-- CreateIndex
CREATE INDEX "StrategyProposal_sessionId_idx" ON "StrategyProposal"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyRanking_sessionId_userId_key" ON "StrategyRanking"("sessionId", "userId");

-- CreateIndex
CREATE INDEX "EmotionalExerciseCompletion_sessionId_userId_completedAt_idx" ON "EmotionalExerciseCompletion"("sessionId", "userId", "completedAt");

-- CreateIndex
CREATE INDEX "GlobalLibraryItem_category_idx" ON "GlobalLibraryItem"("category");

-- CreateIndex
CREATE INDEX "GlobalLibraryItem_source_idx" ON "GlobalLibraryItem"("source");

-- CreateIndex
CREATE INDEX "Invitation_sessionId_idx" ON "Invitation"("sessionId");

-- CreateIndex
CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");

-- CreateIndex
CREATE INDEX "Invitation_status_idx" ON "Invitation"("status");

-- AddForeignKey
ALTER TABLE "RelationshipMember" ADD CONSTRAINT "RelationshipMember_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "Relationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelationshipMember" ADD CONSTRAINT "RelationshipMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "Relationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageProgress" ADD CONSTRAINT "StageProgress_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageProgress" ADD CONSTRAINT "StageProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserVessel" ADD CONSTRAINT "UserVessel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserVessel" ADD CONSTRAINT "UserVessel_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEvent" ADD CONSTRAINT "UserEvent_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "UserVessel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmotionalReading" ADD CONSTRAINT "EmotionalReading_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "UserVessel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentifiedNeed" ADD CONSTRAINT "IdentifiedNeed_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "UserVessel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Boundary" ADD CONSTRAINT "Boundary_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "UserVessel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDocument" ADD CONSTRAINT "UserDocument_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "UserVessel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedVessel" ADD CONSTRAINT "SharedVessel_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentedContent" ADD CONSTRAINT "ConsentedContent_sharedVesselId_fkey" FOREIGN KEY ("sharedVesselId") REFERENCES "SharedVessel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentedContent" ADD CONSTRAINT "ConsentedContent_sourceUserId_fkey" FOREIGN KEY ("sourceUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentedContent" ADD CONSTRAINT "ConsentedContent_originalNeedId_fkey" FOREIGN KEY ("originalNeedId") REFERENCES "IdentifiedNeed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentedContent" ADD CONSTRAINT "ConsentedContent_consentRecordId_fkey" FOREIGN KEY ("consentRecordId") REFERENCES "ConsentRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommonGround" ADD CONSTRAINT "CommonGround_sharedVesselId_fkey" FOREIGN KEY ("sharedVesselId") REFERENCES "SharedVessel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_sharedVesselId_fkey" FOREIGN KEY ("sharedVesselId") REFERENCES "SharedVessel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "StrategyProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmpathyDraft" ADD CONSTRAINT "EmpathyDraft_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmpathyDraft" ADD CONSTRAINT "EmpathyDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmpathyAttempt" ADD CONSTRAINT "EmpathyAttempt_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "EmpathyDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmpathyAttempt" ADD CONSTRAINT "EmpathyAttempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmpathyAttempt" ADD CONSTRAINT "EmpathyAttempt_sourceUserId_fkey" FOREIGN KEY ("sourceUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmpathyAttempt" ADD CONSTRAINT "EmpathyAttempt_consentRecordId_fkey" FOREIGN KEY ("consentRecordId") REFERENCES "ConsentRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmpathyValidation" ADD CONSTRAINT "EmpathyValidation_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "EmpathyAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmpathyValidation" ADD CONSTRAINT "EmpathyValidation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmpathyValidation" ADD CONSTRAINT "EmpathyValidation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyProposal" ADD CONSTRAINT "StrategyProposal_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyProposal" ADD CONSTRAINT "StrategyProposal_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyProposal" ADD CONSTRAINT "StrategyProposal_consentRecordId_fkey" FOREIGN KEY ("consentRecordId") REFERENCES "ConsentRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyRanking" ADD CONSTRAINT "StrategyRanking_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyRanking" ADD CONSTRAINT "StrategyRanking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmotionalExerciseCompletion" ADD CONSTRAINT "EmotionalExerciseCompletion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmotionalExerciseCompletion" ADD CONSTRAINT "EmotionalExerciseCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
