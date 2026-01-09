/**
 * Message DTOs
 *
 * Data Transfer Objects for chat messages and emotional barometer.
 */

import { MessageRole, Stage } from '../enums';
import type { MemorySuggestion } from './memory';

// ============================================================================
// Messages
// ============================================================================

export interface MessageDTO {
  id: string;
  sessionId: string;
  senderId: string | null; // null for AI messages
  role: MessageRole;
  content: string;
  stage: Stage;
  timestamp: string;

  // For USER messages: was an emotion check included?
  emotionalReading?: EmotionalReadingDTO;
}

export interface SendMessageRequest {
  sessionId: string;
  content: string;

  // Optional: include emotional reading with message
  emotionalIntensity?: number; // 1-10
  emotionalContext?: string; // Optional description
}

export interface SendMessageResponse {
  userMessage: MessageDTO;
  /**
   * AI response message.
   * - For sync responses: Contains the AI message
   * - For fire-and-forget: null (AI response arrives via Ably)
   */
  aiResponse: MessageDTO | null;

  // If emotional intensity was high, AI might suggest a pause
  suggestPause?: boolean;
  pauseReason?: string;

  /** Stage 1: AI determined user may be ready for feel-heard confirmation */
  offerFeelHeardCheck?: boolean;

  /** Stage 2: AI determined user may be ready to share empathy attempt */
  offerReadyToShare?: boolean;

  /** Stage 0: Proposed invitation message from AI */
  invitationMessage?: string | null;

  /** Stage 2: Proposed empathy statement summarizing user's understanding of partner */
  proposedEmpathyStatement?: string | null;

  /** AI-detected memory suggestion from user's message */
  memorySuggestion?: MemorySuggestion | null;
}

// ============================================================================
// Emotional Barometer
// ============================================================================

export interface EmotionalReadingDTO {
  id: string;
  intensity: number; // 1-10
  context: string | null;
  stage: Stage;
  timestamp: string;
}

export interface RecordEmotionalReadingRequest {
  sessionId: string;
  intensity: number; // 1-10
  context?: string;
}

export interface RecordEmotionalReadingResponse {
  reading: EmotionalReadingDTO;

  // If intensity trending up, offer support
  offerSupport?: boolean;
  supportType?: EmotionalSupportType;
}

export enum EmotionalSupportType {
  BREATHING_EXERCISE = 'BREATHING_EXERCISE',
  BODY_SCAN = 'BODY_SCAN',
  GROUNDING = 'GROUNDING',
  PAUSE_SESSION = 'PAUSE_SESSION',
}

// ============================================================================
// Exercise Completion
// ============================================================================

export interface CompleteExerciseRequest {
  sessionId: string;
  exerciseType: EmotionalSupportType;
  completed: boolean; // false = skipped
  intensityBefore?: number;
  intensityAfter?: number;
}

export interface CompleteExerciseResponse {
  logged: boolean;
  postExerciseCheckIn?: boolean; // Should we ask for new reading?
}

// ============================================================================
// Chat History
// ============================================================================

export interface GetMessagesRequest {
  sessionId: string;
  stage?: Stage; // Filter by stage
  cursor?: string;
  limit?: number;
}

export interface GetMessagesResponse {
  messages: MessageDTO[];
  cursor?: string;
  hasMore: boolean;
}

// ============================================================================
// Emotional History
// ============================================================================

export interface GetEmotionalHistoryRequest {
  sessionId: string;
  stage?: Stage;
  limit?: number;
  cursor?: string;
}

export interface GetEmotionalHistoryResponse {
  readings: EmotionalReadingDTO[];
  trend: EmotionalTrend;
  averageIntensity: number;
  cursor?: string;
  hasMore?: boolean;
}

export interface EmotionalTrend {
  direction: 'INCREASING' | 'STABLE' | 'DECREASING';
  changeFromStart: number;
}
