/**
 * Context Assembler Service
 *
 * Builds stage-scoped context bundles for the AI.
 * The AI receives pre-assembled context - it does NOT decide what to retrieve.
 *
 * From architecture docs:
 * "The large model receives a pre-assembled context bundle. It does not decide what to retrieve."
 */

import { prisma } from '../lib/prisma';
import {
  type MemoryIntentResult,
  type RetrievalDepth,
  getTurnBufferSize,
} from './memory-intent';
import { findSimilarInnerThoughtsWithBoost } from './embedding';
import { getSessionSummary } from './conversation-summarizer';

// ============================================================================
// Types
// ============================================================================

/**
 * A message in the conversation context
 */
export interface ContextMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

/**
 * Emotional thread tracking for continuity
 */
export interface EmotionalThread {
  initialIntensity: number | null;
  currentIntensity: number | null;
  trend: 'escalating' | 'stable' | 'de-escalating' | 'unknown';
  notableShifts: Array<{
    turn: number;
    from: number;
    to: number;
    triggerSummary?: string;
  }>;
}

/**
 * Session summary for long sessions (>30 min)
 */
export interface SessionSummary {
  keyThemes: string[];
  emotionalJourney: string;
  currentFocus: string;
  userStatedGoals: string[];
}

/**
 * Prior themes from previous sessions in this relationship
 */
export interface PriorThemes {
  themes: string[];
  lastSessionDate: string | null;
  sessionCount: number;
}

/**
 * Inner Thoughts context - private reflections linked to this session
 */
export interface InnerThoughtsContext {
  /** Relevant messages from user's Inner Thoughts (with boost for linked sessions) */
  relevantReflections: Array<{
    content: string;
    similarity: number;
    isFromLinkedSession: boolean;
  }>;
  /** Whether a linked Inner Thoughts session exists */
  hasLinkedSession: boolean;
}

/**
 * User memories to honor in responses
 */
export interface UserMemoriesContext {
  global: Array<{ content: string; category: string }>;
  session: Array<{ content: string; category: string }>;
}

/**
 * The assembled context bundle provided to the AI
 */
export interface ContextBundle {
  // Conversation context
  conversationContext: {
    recentTurns: ContextMessage[];
    turnCount: number;
    sessionDurationMinutes: number;
  };

  // Emotional state
  emotionalThread: EmotionalThread;

  // Prior session context (if depth allows)
  priorThemes?: PriorThemes;

  // Session summary (for long sessions)
  sessionSummary?: SessionSummary;

  // Inner Thoughts reflections (if depth allows)
  innerThoughtsContext?: InnerThoughtsContext;

  // User memories ("Things to Always Remember")
  userMemories?: UserMemoriesContext;

  // Stage-specific data
  stageContext: {
    stage: number;
    gatesSatisfied: Record<string, unknown>;
  };

  // User info
  userName: string;
  partnerName?: string;

  // Metadata
  intent: MemoryIntentResult;
  assembledAt: string;
}

// ============================================================================
// Context Assembly
// ============================================================================

/**
 * Assemble a context bundle for the AI based on the memory intent.
 */
export async function assembleContextBundle(
  sessionId: string,
  userId: string,
  stage: number,
  intent: MemoryIntentResult
): Promise<ContextBundle> {
  const now = new Date();
  const depth = intent.depth;

  // Get session and user info
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      relationship: {
        include: {
          members: {
            include: { user: true },
          },
        },
      },
      stageProgress: {
        where: { userId },
        orderBy: { stage: 'desc' },
        take: 1,
      },
    },
  });

  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  // Get user and partner names
  const currentMember = session.relationship.members.find((m) => m.userId === userId);
  const partnerMember = session.relationship.members.find((m) => m.userId !== userId);
  const userName = currentMember?.user.name || 'there';
  const partnerName = partnerMember?.user.name || 'your partner';

  // Get stage progress
  const progress = session.stageProgress[0];
  const gatesSatisfied = (progress?.gatesSatisfied as Record<string, unknown>) || {};

  // PARALLEL EXECUTION of context assembly steps
  // All these operations are independent and can run simultaneously to reduce latency.
  // Note: buildInnerThoughtsContext depends on conversationContext, so it runs after.
  const turnBufferSize = getTurnBufferSize(stage, intent.intent);
  
  const [conversationContext, emotionalThread, priorThemes, sessionSummary, userMemories] = await Promise.all([
    buildConversationContext(sessionId, userId, turnBufferSize, depth),
    buildEmotionalThread(sessionId, userId, depth),
    (depth === 'full' || depth === 'light') 
      ? buildPriorThemes(sessionId, userId, session.relationshipId) 
      : Promise.resolve(undefined),
    (depth !== 'none') 
      ? buildSessionSummary(sessionId, userId) 
      : Promise.resolve(undefined),
    buildUserMemoriesContext(userId, sessionId)
  ]);

  // Build Inner Thoughts context after we have conversation context (it needs the last user message)
  const finalInnerThoughts = (depth === 'full' || depth === 'light')
    ? await buildInnerThoughtsContext(sessionId, userId, conversationContext)
    : undefined;

  const sessionDurationMinutes = Math.floor(
    (now.getTime() - session.createdAt.getTime()) / 60000
  );

  return {
    conversationContext: {
      recentTurns: conversationContext,
      turnCount: conversationContext.length,
      sessionDurationMinutes,
    },
    emotionalThread,
    priorThemes,
    sessionSummary,
    innerThoughtsContext: finalInnerThoughts,
    userMemories,
    stageContext: {
      stage,
      gatesSatisfied,
    },
    userName,
    partnerName,
    intent,
    assembledAt: now.toISOString(),
  };
}

/**
 * Build conversation context with recent messages
 */
async function buildConversationContext(
  sessionId: string,
  userId: string,
  bufferSize: number,
  depth: RetrievalDepth
): Promise<ContextMessage[]> {
  if (depth === 'none' || bufferSize === 0) {
    return [];
  }

  const messages = await prisma.message.findMany({
    where: {
      sessionId,
      // Only get messages from this user's conversation (not partner's Stage 1)
      // Fixed: AI messages must also be filtered by forUserId to prevent partner leakage
      OR: [
        { senderId: userId }, // User's own messages
        { senderId: null, forUserId: userId }, // AI messages directed to this user
      ],
    },
    orderBy: { timestamp: 'desc' },
    take: bufferSize * 2, // Get more to account for both user and assistant
    select: {
      content: true,
      role: true,
      timestamp: true,
    },
  });

  // Reverse to chronological order
  const chronological = messages.reverse();

  // Take last N turns (user + assistant pairs)
  const recentTurns = chronological.slice(-bufferSize * 2);

  return recentTurns.map((m) => ({
    role: m.role === 'USER' ? 'user' as const : 'assistant' as const,
    content: m.content,
    timestamp: m.timestamp.toISOString(),
  }));
}

/**
 * Build emotional thread tracking
 */
async function buildEmotionalThread(
  sessionId: string,
  userId: string,
  depth: RetrievalDepth
): Promise<EmotionalThread> {
  if (depth === 'none') {
    return {
      initialIntensity: null,
      currentIntensity: null,
      trend: 'unknown',
      notableShifts: [],
    };
  }

  // Get the user's vessel for this session
  const vessel = await prisma.userVessel.findUnique({
    where: {
      userId_sessionId: {
        userId,
        sessionId,
      },
    },
    select: { id: true },
  });

  if (!vessel) {
    return {
      initialIntensity: null,
      currentIntensity: null,
      trend: 'unknown',
      notableShifts: [],
    };
  }

  // Get emotional readings from the vessel
  const readings = await prisma.emotionalReading.findMany({
    where: {
      vesselId: vessel.id,
    },
    orderBy: { timestamp: 'asc' },
    select: {
      intensity: true,
      timestamp: true,
    },
  });

  if (readings.length === 0) {
    return {
      initialIntensity: null,
      currentIntensity: null,
      trend: 'unknown',
      notableShifts: [],
    };
  }

  const initialIntensity = readings[0].intensity;
  const currentIntensity = readings[readings.length - 1].intensity;

  // Calculate trend
  let trend: EmotionalThread['trend'] = 'stable';
  if (readings.length >= 2) {
    const recent = readings.slice(-3);
    const avgRecent = recent.reduce((sum, r) => sum + r.intensity, 0) / recent.length;
    const earlier = readings.slice(0, Math.min(3, readings.length));
    const avgEarlier = earlier.reduce((sum, r) => sum + r.intensity, 0) / earlier.length;

    if (avgRecent - avgEarlier >= 2) {
      trend = 'escalating';
    } else if (avgEarlier - avgRecent >= 2) {
      trend = 'de-escalating';
    }
  }

  // Find notable shifts (changes of 3+ points)
  const notableShifts: EmotionalThread['notableShifts'] = [];
  for (let i = 1; i < readings.length && notableShifts.length < 3; i++) {
    const diff = Math.abs(readings[i].intensity - readings[i - 1].intensity);
    if (diff >= 3) {
      notableShifts.push({
        turn: i,
        from: readings[i - 1].intensity,
        to: readings[i].intensity,
      });
    }
  }

  return {
    initialIntensity,
    currentIntensity,
    trend,
    notableShifts,
  };
}

/**
 * Build prior themes from previous sessions in this relationship
 */
async function buildPriorThemes(
  sessionId: string,
  userId: string,
  relationshipId: string
): Promise<PriorThemes> {
  // Get previous completed sessions in this relationship
  const previousSessions = await prisma.session.findMany({
    where: {
      relationshipId,
      id: { not: sessionId },
      status: 'RESOLVED',
    },
    orderBy: { updatedAt: 'desc' },
    take: 3,
    select: {
      id: true,
      updatedAt: true,
    },
  });

  if (previousSessions.length === 0) {
    return {
      themes: [],
      lastSessionDate: null,
      sessionCount: 0,
    };
  }

  // For now, return placeholder - will be populated by need extraction later
  // This would come from UserVessel needs/themes in full implementation
  return {
    themes: [], // TODO: Extract from UserVessel
    lastSessionDate: previousSessions[0].updatedAt.toISOString(),
    sessionCount: previousSessions.length,
  };
}

/**
 * Build session summary for long sessions
 */
async function buildSessionSummary(
  sessionId: string,
  userId: string
): Promise<SessionSummary | undefined> {
  // NOTE: Summaries are generated asynchronously by ConversationSummarizer and stored
  // in UserVessel.conversationSummary. This function just loads and formats them.
  const summaryData = await getSessionSummary(sessionId, userId);
  if (!summaryData) return undefined;

  return {
    keyThemes: summaryData.keyThemes ?? [],
    emotionalJourney: summaryData.emotionalJourney ?? '',
    // The summarizer's narrative summary becomes our "currentFocus" block.
    currentFocus: summaryData.summary.text ?? '',
    // These are "unresolved topics" (follow-ups) rather than literal goals, but they serve
    // the same purpose for continuity and future prompt grounding.
    userStatedGoals: summaryData.unresolvedTopics ?? [],
  };
}

/**
 * Build Inner Thoughts context - private reflections that may inform the partner session.
 * Messages from linked Inner Thoughts sessions get a similarity boost.
 */
async function buildInnerThoughtsContext(
  sessionId: string,
  userId: string,
  conversationContext: ContextMessage[]
): Promise<InnerThoughtsContext | undefined> {
  // Check if user has a linked Inner Thoughts session
  const linkedSession = await prisma.innerWorkSession.findFirst({
    where: {
      userId,
      linkedPartnerSessionId: sessionId,
      status: 'ACTIVE',
    },
  });

  // If no recent conversation to search with, skip retrieval
  if (conversationContext.length === 0) {
    return {
      relevantReflections: [],
      hasLinkedSession: !!linkedSession,
    };
  }

  // Use the last user message as search query
  const lastUserMessage = [...conversationContext]
    .reverse()
    .find((m) => m.role === 'user');

  if (!lastUserMessage) {
    return {
      relevantReflections: [],
      hasLinkedSession: !!linkedSession,
    };
  }

  try {
    // Search Inner Thoughts with boost for linked sessions
    const results = await findSimilarInnerThoughtsWithBoost(
      userId,
      lastUserMessage.content,
      sessionId, // Partner session ID - messages from linked sessions get boost
      1.3, // 30% boost
      3, // Top 3 results
      0.5 // Threshold
    );

    return {
      relevantReflections: results.map((r) => ({
        content: r.content,
        similarity: r.similarity,
        isFromLinkedSession: r.isLinked,
      })),
      hasLinkedSession: !!linkedSession,
    };
  } catch (error) {
    console.warn('[Context Assembler] Failed to retrieve Inner Thoughts:', error);
    return {
      relevantReflections: [],
      hasLinkedSession: !!linkedSession,
    };
  }
}

/**
 * Load active user memories for context
 */
async function buildUserMemoriesContext(
  userId: string,
  sessionId: string
): Promise<UserMemoriesContext> {
  const memories = await prisma.userMemory.findMany({
    where: {
      userId,
      status: 'ACTIVE',
      OR: [
        { sessionId: null }, // Global
        { sessionId },       // This session
      ],
    },
    select: {
      content: true,
      category: true,
      sessionId: true,
    },
  });

  return {
    global: memories
      .filter((m) => m.sessionId === null)
      .map((m) => ({ content: m.content, category: m.category })),
    session: memories
      .filter((m) => m.sessionId === sessionId)
      .map((m) => ({ content: m.content, category: m.category })),
  };
}

/**
 * Format context bundle for prompt injection.
 * Note: Recent conversation is NOT included here because it's already sent
 * as separate messages in the messages array. Including it here would duplicate
 * the conversation and waste tokens.
 */
export function formatContextForPrompt(bundle: ContextBundle): string {
  const parts: string[] = [];

  // Emotional thread
  if (bundle.emotionalThread.currentIntensity !== null) {
    parts.push(`EMOTIONAL STATE:`);
    parts.push(`Current intensity: ${bundle.emotionalThread.currentIntensity}/10`);
    parts.push(`Trend: ${bundle.emotionalThread.trend}`);
    if (bundle.emotionalThread.notableShifts.length > 0) {
      parts.push(`Notable shifts: ${bundle.emotionalThread.notableShifts.map(
        (s) => `${s.from} → ${s.to}`
      ).join(', ')}`);
    }
    parts.push('');
  }

  // Prior themes
  if (bundle.priorThemes && bundle.priorThemes.themes.length > 0) {
    parts.push(`FROM PRIOR SESSIONS (use for continuity only):`);
    parts.push(bundle.priorThemes.themes.join(', '));
    parts.push('');
  }

  // Session summary
  if (bundle.sessionSummary) {
    parts.push(`SESSION SUMMARY:`);
    parts.push(`Key themes: ${bundle.sessionSummary.keyThemes.join(', ')}`);
    parts.push(`Current focus: ${bundle.sessionSummary.currentFocus}`);
    if (bundle.sessionSummary.emotionalJourney) {
      parts.push(`Emotional journey: ${bundle.sessionSummary.emotionalJourney}`);
    }
    if (bundle.sessionSummary.userStatedGoals && bundle.sessionSummary.userStatedGoals.length > 0) {
      parts.push(`Topics that may need follow-up: ${bundle.sessionSummary.userStatedGoals.join(', ')}`);
    }
    parts.push('');
  }

  // Inner Thoughts context (private reflections)
  if (bundle.innerThoughtsContext && bundle.innerThoughtsContext.relevantReflections.length > 0) {
    parts.push(`FROM ${bundle.userName.toUpperCase()}'S PRIVATE REFLECTIONS:`);
    parts.push(`(These are from their Inner Thoughts - private processing they've done.`);
    parts.push(`Reference gently, don't quote directly, and respect their privacy.)`);
    for (const reflection of bundle.innerThoughtsContext.relevantReflections) {
      const marker = reflection.isFromLinkedSession ? '[linked to this session]' : '';
      parts.push(`- "${reflection.content}" ${marker}`);
    }
    parts.push('');
  }

  // User memories (things to always remember)
  if (bundle.userMemories) {
    const allMemories = [...bundle.userMemories.global, ...bundle.userMemories.session];
    if (allMemories.length > 0) {
      parts.push('USER MEMORIES (Always Honor These):');
      for (const memory of allMemories) {
        parts.push(`- [${memory.category}] ${memory.content}`);
      }
      parts.push('');
    }
  }

  return parts.join('\n');
}
