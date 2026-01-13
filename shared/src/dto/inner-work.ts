/**
 * Inner Work Session DTOs
 *
 * Data Transfer Objects for inner work (solo self-reflection) sessions.
 */

import type { MemorySuggestion } from './memory';

// ============================================================================
// Inner Work Status
// ============================================================================

export enum InnerWorkStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  ARCHIVED = 'ARCHIVED',
}

// ============================================================================
// Inner Work Session Summary (for lists)
// ============================================================================

export interface InnerWorkSessionSummaryDTO {
  id: string;
  title: string | null;
  summary: string | null;
  theme: string | null;
  status: InnerWorkStatus;
  createdAt: string; // ISO 8601
  updatedAt: string;
  messageCount: number;
  /** If linked to a partner session, the session ID */
  linkedPartnerSessionId: string | null;
}

// ============================================================================
// Inner Work Session Detail
// ============================================================================

export interface InnerWorkSessionDetailDTO extends InnerWorkSessionSummaryDTO {
  messages: InnerWorkMessageDTO[];
}

export interface InnerWorkMessageDTO {
  id: string;
  role: 'USER' | 'AI';
  content: string;
  timestamp: string; // ISO 8601
}

// ============================================================================
// Create Inner Work Session
// ============================================================================

export interface CreateInnerWorkSessionRequest {
  title?: string; // Optional user-provided title
  /** Optional initial message - if provided, creates session with user message first (no AI greeting) */
  initialMessage?: string;
}

export interface CreateInnerWorkSessionResponse {
  session: InnerWorkSessionSummaryDTO;
  /** The first AI message (always present) */
  initialMessage: InnerWorkMessageDTO;
  /** If initialMessage was provided, this contains the saved user message */
  userMessage?: InnerWorkMessageDTO;
  /** Suggested actions the user can take (only when initialMessage provided) */
  suggestedActions?: SuggestedAction[];
}

// ============================================================================
// Suggested Actions (AI can suggest next steps during Inner Thoughts)
// ============================================================================

export type SuggestedActionType =
  | 'start_partner_session'
  | 'start_meditation'
  | 'add_gratitude'
  | 'check_need';

export interface SuggestedAction {
  /** Type of action being suggested */
  type: SuggestedActionType;
  /** Display label for the action button */
  label: string;
  /** Person's name if action involves a person */
  personName?: string;
  /** Person's ID if they're already tracked */
  personId?: string;
  /** Context/reason for the suggestion (for logging/analytics) */
  context: string;
}

// ============================================================================
// Send Inner Work Message
// ============================================================================

export interface SendInnerWorkMessageRequest {
  content: string;
}

export interface SendInnerWorkMessageResponse {
  userMessage: InnerWorkMessageDTO;
  aiMessage: InnerWorkMessageDTO;
  /** Memory suggestion if detected in user message */
  memorySuggestion?: MemorySuggestion | null;
  /** Suggested actions the user can take (e.g., start partner session, meditation) */
  suggestedActions?: SuggestedAction[];
}

// ============================================================================
// List Inner Work Sessions
// ============================================================================

export interface ListInnerWorkSessionsResponse {
  sessions: InnerWorkSessionSummaryDTO[];
  /** Total count of sessions (for pagination) */
  total: number;
  /** Whether there are more sessions to load */
  hasMore: boolean;
}

// ============================================================================
// Get Inner Work Session
// ============================================================================

export interface GetInnerWorkSessionResponse {
  session: InnerWorkSessionDetailDTO;
}

// ============================================================================
// Update Inner Work Session
// ============================================================================

export interface UpdateInnerWorkSessionRequest {
  title?: string;
  status?: InnerWorkStatus;
}

export interface UpdateInnerWorkSessionResponse {
  session: InnerWorkSessionSummaryDTO;
}

// ============================================================================
// Archive Inner Work Session
// ============================================================================

export interface ArchiveInnerWorkSessionResponse {
  archived: boolean;
  archivedAt: string;
}

// ============================================================================
// Generate Context for Partner Session (US-3)
// ============================================================================

export interface GenerateContextResponse {
  /** AI-generated context summary from the Inner Thoughts session */
  contextSummary: string;
  /** Person's name if mentioned in the Inner Thoughts session */
  personName?: string;
  /** Key themes or topics from the session */
  themes: string[];
  /** The Inner Thoughts session ID for reference */
  innerThoughtsSessionId: string;
}
