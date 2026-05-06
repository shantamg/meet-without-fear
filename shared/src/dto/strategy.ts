/**
 * Strategy & Agreement DTOs (Stage 4)
 *
 * Data Transfer Objects for collaborative strategy generation and agreements.
 */

import {
  AgreementStatus,
  AgreementType,
  Stage4ClosureKind,
  Stage4ClosureReason,
  Stage4ProposalKind,
  Stage4ProposalStatus,
  Stage4SelectionDecision,
  TendingEntryStatus,
  TendingEntryType,
} from '../enums';

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
  myReadyToRank?: boolean;
  partnerReadyToRank?: boolean;
  canMarkReadyToRank?: boolean;
  canRank?: boolean;
  rankableStrategyCount?: number;
}

export interface ProposeStrategyRequest {
  description: string;
  needsAddressed?: string[];
  duration?: string;
  measureOfSuccess?: string;
}

export interface ProposeStrategyResponse {
  strategy: {
    id: string;
    description: string;
    duration: string | null;
    measureOfSuccess: string | null;
  };
  createdAt: string;
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
  readyAt?: string;
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
  strategyId?: string | null;
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

// ============================================================================
// Redesigned Stage 4
// ============================================================================

export enum Stage4Phase {
  INVENTORY_BUILDING = 'INVENTORY_BUILDING',
  COVERAGE_REVIEW = 'COVERAGE_REVIEW',
  SELECTION = 'SELECTION',
  OUTCOME_REVIEW = 'OUTCOME_REVIEW',
  CLOSING = 'CLOSING',
  CLOSED_SHARED_AGREEMENT = 'CLOSED_SHARED_AGREEMENT',
  CLOSED_NO_SHARED_AGREEMENT = 'CLOSED_NO_SHARED_AGREEMENT',
}

export type Stage4CoverageStatus = 'COVERED' | 'PARTIAL' | 'OPEN';

export interface ProposalNeedCoverageDTO {
  id?: string;
  label: string;
  coverage: Exclude<Stage4CoverageStatus, 'OPEN'>;
}

export interface ProposalCardDTO {
  id: string;
  kind: Stage4ProposalKind;
  description: string;
  ownerLabel?: 'You' | 'Partner';
  needsAddressed: ProposalNeedCoverageDTO[];
  duration: string | null;
  measureOfSuccess: string | null;
  status: Stage4ProposalStatus;
  myDecision?: Stage4SelectionDecision;
  partnerDecisionVisible?: Stage4SelectionDecision;
}

export interface UnaddressedNeedDTO {
  id?: string;
  label: string;
  source: 'YOU' | 'PARTNER' | 'BOTH' | 'UNKNOWN';
  note: string;
}

export interface ProposalInventoryDTO {
  sharedProposals: ProposalCardDTO[];
  individualCommitments: ProposalCardDTO[];
  unaddressedNeeds: UnaddressedNeedDTO[];
  removedProposalCount: number;
  updatedAt: string;
}

export interface CoverageRowDTO {
  id?: string;
  label: string;
  source: 'YOU' | 'PARTNER' | 'BOTH' | 'UNKNOWN';
  coveringProposalIds: string[];
  note: string | null;
}

export interface Stage4CoverageAuditDTO {
  covered: CoverageRowDTO[];
  partial: CoverageRowDTO[];
  open: CoverageRowDTO[];
  updatedAt: string | null;
}

export interface Stage4SelectionDTO {
  proposalId: string;
  decision: Stage4SelectionDecision;
  note: string | null;
  selectedAt: string;
  updatedAt: string;
}

export interface Stage4OutcomeDTO {
  kind: Stage4ClosureKind;
  reason: Stage4ClosureReason;
  summary: string;
  agreements: AgreementDTO[];
  individualCommitments: ProposalCardDTO[];
  openNeeds: UnaddressedNeedDTO[];
  closedAt: string;
}

export interface TendingPreviewDTO {
  nextEntry: {
    id: string;
    type: TendingEntryType;
    status: TendingEntryStatus;
    agreementId: string | null;
    scheduledFor: string | null;
    openedAt: string | null;
    completedAt: string | null;
    summary: string | null;
  } | null;
  scheduledCount: number;
  openCount: number;
  passiveReentryAvailable: boolean;
}

export interface GetStage4StateResponse {
  phase: Stage4Phase;
  inventory: ProposalInventoryDTO;
  coverageAudit: Stage4CoverageAuditDTO;
  mySelections: Stage4SelectionDTO[];
  partnerSelectionStatus: 'NOT_STARTED' | 'SUBMITTED';
  outcome: Stage4OutcomeDTO | null;
  tendingPreview: TendingPreviewDTO | null;
}
