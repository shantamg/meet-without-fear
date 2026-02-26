/**
 * Strategy & Agreement DTOs (Stage 4)
 *
 * Data Transfer Objects for collaborative strategy generation and agreements.
 */

import { AgreementStatus, AgreementType } from '../enums';

/** Maximum number of agreements allowed per session */
export const MAX_AGREEMENTS = 2;

// ============================================================================
// Strategy Phase
// ============================================================================

export enum StrategyPhase {
  COLLECTING = 'COLLECTING', // Users still adding
  RANKING = 'RANKING', // Both ready to rank
  REVEALING = 'REVEALING', // Revealing overlap
  NEGOTIATING = 'NEGOTIATING', // Working toward agreement
  AGREED = 'AGREED', // Agreement reached
}

// ============================================================================
// Strategies
// ============================================================================

export interface StrategyDTO {
  id: string;
  description: string;
  needsAddressed: string[];
  duration: string | null;
  measureOfSuccess: string | null;
  // Note: NO source attribution - strategies are unlabeled
}

export interface GetStrategiesResponse {
  strategies: StrategyDTO[];
  aiSuggestionsAvailable: boolean;
  phase: StrategyPhase;
}

export interface ProposeStrategyRequest {
  description: string;
  needsAddressed?: string[];
  duration?: string;
  measureOfSuccess?: string;
}

export interface ProposeStrategyResponse {
  strategy: StrategyDTO;
  totalStrategies: number;
}

// ============================================================================
// AI Suggestions
// ============================================================================

export interface RequestSuggestionsRequest {
  count?: number; // Default: 3
  focusNeeds?: string[];
}

export interface RequestSuggestionsResponse {
  suggestions: StrategyDTO[];
  source: 'AI_GENERATED';
}

// ============================================================================
// Ranking
// ============================================================================

export interface MarkReadyResponse {
  ready: boolean;
  partnerReady: boolean;
  canStartRanking: boolean;
}

export interface StrategyRanking {
  strategyId: string;
  rank: number; // 1 = top choice
}

export interface SubmitRankingRequest {
  rankedIds: string[];
}

export interface SubmitRankingResponse {
  submitted: boolean;
  submittedAt: string;
  partnerSubmitted: boolean;
  awaitingReveal: boolean;
}

export type RevealOverlapResponse = {
  overlap: StrategyDTO[];
  phase: StrategyPhase;
};

// ============================================================================
// Agreements
// ============================================================================

export interface AgreementDTO {
  id: string;
  description: string;
  type?: AgreementType;
  duration: string | null;
  measureOfSuccess: string | null;
  status: AgreementStatus;
  agreedByMe: boolean;
  agreedByPartner: boolean;
  agreedAt: string | null;
  followUpDate: string | null;
}

export interface CreateAgreementRequest {
  strategyId?: string;
  description: string;
  type: AgreementType;
  duration?: string;
  measureOfSuccess?: string;
  followUpDate?: string;
}

export interface CreateAgreementResponse {
  agreement: AgreementDTO;
  awaitingPartnerConfirmation: boolean;
}

export interface ConfirmAgreementRequest {
  confirmed: boolean;
  modification?: string;
}

export interface ConfirmAgreementResponse {
  agreement: AgreementDTO;
  sessionCanResolve: boolean;
}

// ============================================================================
// Session Resolution
// ============================================================================

export interface ResolveSessionResponse {
  resolved: boolean;
  resolvedAt: string;
  agreements: AgreementDTO[];
  followUpScheduled: boolean;
}
