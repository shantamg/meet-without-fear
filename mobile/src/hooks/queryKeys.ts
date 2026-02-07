/**
 * Query Keys for React Query
 *
 * Centralized query key definitions to avoid circular dependencies between hooks.
 * All hooks should import keys from here instead of from each other.
 */

import { SessionStatus, Stage } from '@meet-without-fear/shared';

// ============================================================================
// Session Query Keys
// ============================================================================

export const sessionKeys = {
  all: ['sessions'] as const,
  lists: () => [...sessionKeys.all, 'list'] as const,
  list: (filters: { status?: SessionStatus }) =>
    [...sessionKeys.lists(), filters] as const,
  details: () => [...sessionKeys.all, 'detail'] as const,
  detail: (id: string) => [...sessionKeys.details(), id] as const,
  state: (id: string) => [...sessionKeys.all, id, 'state'] as const,
  unreadCount: () => [...sessionKeys.all, 'unread-count'] as const,
  invitations: () => ['invitations'] as const,
  invitation: (id: string) => [...sessionKeys.invitations(), id] as const,
  sessionInvitation: (sessionId: string) =>
    [...sessionKeys.all, sessionId, 'invitation'] as const,
};

// ============================================================================
// Stage Query Keys
// ============================================================================

export const stageKeys = {
  all: ['stages'] as const,
  progress: (sessionId: string) => [...stageKeys.all, 'progress', sessionId] as const,

  // Stage 0: Compact
  compact: (sessionId: string) => [...stageKeys.all, 'compact', sessionId] as const,

  // Gate status
  gates: (sessionId: string, stage: number) =>
    [...stageKeys.all, 'gates', sessionId, stage] as const,

  // Stage 2: Empathy
  empathyDraft: (sessionId: string) =>
    [...stageKeys.all, 'empathy', 'draft', sessionId] as const,
  partnerEmpathy: (sessionId: string) =>
    [...stageKeys.all, 'empathy', 'partner', sessionId] as const,
  empathyStatus: (sessionId: string) =>
    [...stageKeys.all, 'empathy', 'status', sessionId] as const,
  shareOffer: (sessionId: string) =>
    [...stageKeys.all, 'empathy', 'share-offer', sessionId] as const,

  // Stage 3: Needs
  needs: (sessionId: string) => [...stageKeys.all, 'needs', sessionId] as const,
  commonGround: (sessionId: string) =>
    [...stageKeys.all, 'commonGround', sessionId] as const,

  // Stage 4: Strategies
  strategies: (sessionId: string) =>
    [...stageKeys.all, 'strategies', sessionId] as const,
  strategiesReveal: (sessionId: string) =>
    [...stageKeys.all, 'strategies', 'reveal', sessionId] as const,
  agreements: (sessionId: string) =>
    [...stageKeys.all, 'agreements', sessionId] as const,
};

// ============================================================================
// Message Query Keys
// ============================================================================

export const messageKeys = {
  all: ['messages'] as const,
  lists: () => [...messageKeys.all, 'list'] as const,
  list: (sessionId: string, stage?: Stage) =>
    [...messageKeys.lists(), sessionId, stage] as const,
  // Separate key for infinite queries to avoid cache structure conflicts
  infinite: (sessionId: string, stage?: Stage) =>
    [...messageKeys.all, 'infinite', sessionId, stage] as const,
  emotions: () => [...messageKeys.all, 'emotions'] as const,
  emotionHistory: (sessionId: string, stage?: Stage) =>
    [...messageKeys.emotions(), sessionId, stage] as const,
};

// ============================================================================
// Timeline Query Keys
// ============================================================================

export const timelineKeys = {
  all: ['timeline'] as const,
  session: (sessionId: string) => [...timelineKeys.all, sessionId] as const,
  infinite: (sessionId: string) => [...timelineKeys.all, 'infinite', sessionId] as const,
};

