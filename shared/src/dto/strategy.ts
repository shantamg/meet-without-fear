/**
 * Strategy & Agreement DTOs (Stage 4)
 *
 * Data Transfer Objects for collaborative strategy generation and agreements.
 */

import {
  AgreementStatus,
  AgreementType,
  MessageRole,
  Stage4ClosureKind,
  Stage4ClosureReason,
  Stage4ProposalKind,
  Stage4ProposalStatus,
  Stage4SelectionDecision,
  Stage4SubChatAnchor,
  Stage4SubChatStatus,
  TendingEntryScope,
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
export type Stage4ProposalSourceLabel = 'YOU' | 'PARTNER' | 'AI' | 'UNKNOWN';
export type Stage4WalkthroughPhase = 'MY_NEEDS' | 'PARTNER_NEEDS' | 'QUALITY_REVIEW' | 'SUMMARY';
export type Stage4NeedWalkthroughStatus =
  | 'not_started'
  | 'in_progress'
  | 'covered'
  | 'skipped'
  | 'needs_options';

export interface ProposalNeedCoverageDTO {
  id?: string;
  label: string;
  coverage: Exclude<Stage4CoverageStatus, 'OPEN'>;
}

export interface ProposalCardDTO {
  id: string;
  kind: Stage4ProposalKind;
  description: string;
  sourceLabel?: Stage4ProposalSourceLabel;
  ownerLabel?: 'You' | 'Partner';
  needsAddressed: ProposalNeedCoverageDTO[];
  duration: string | null;
  measureOfSuccess: string | null;
  status: Stage4ProposalStatus;
  myDecision?: Stage4SelectionDecision;
  partnerDecisionVisible?: Stage4SelectionDecision;
}

export interface Stage4WalkthroughNeedDTO {
  id: string;
  label: string;
  source: 'YOU' | 'PARTNER' | 'UNKNOWN';
  status: Stage4NeedWalkthroughStatus;
}

export interface Stage4WalkthroughProposalGroupDTO {
  key:
    | 'you_suggested'
    | 'partner_suggested'
    | 'ai_suggested'
    | 'partner_may_do'
    | 'shared_options'
    | 'your_prior_suggestions';
  title: string;
  readOnly?: boolean;
  proposals: ProposalCardDTO[];
}

export interface Stage4QualityWarningDTO {
  proposalId: string;
  description: string;
  warning: string;
  suggestedRevision?: string;
}

export interface Stage4WalkthroughDTO {
  phase: Stage4WalkthroughPhase;
  currentNeed: Stage4WalkthroughNeedDTO | null;
  currentIndex: number;
  totalInPhase: number;
  ownNeeds: Stage4WalkthroughNeedDTO[];
  partnerNeeds: Stage4WalkthroughNeedDTO[];
  proposalGroups: Stage4WalkthroughProposalGroupDTO[];
  qualityWarnings: Stage4QualityWarningDTO[];
  defaultCheckInDate: string;
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
  userDeclinedToAddress?: boolean;
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
  checkInAt: string | null;
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

export interface TendingEntryDTO {
  id: string;
  sessionId: string;
  agreementId: string | null;
  type: TendingEntryType;
  scope: TendingEntryScope;
  ownerUserId: string | null;
  optedInShared: boolean;
  status: TendingEntryStatus;
  scheduledFor: string | null;
  openedAt: string | null;
  completedAt: string | null;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
  myResponse: TendingResponseDTO | null;
  responseCount: number;
}

export interface TendingResponseDTO {
  id: string;
  tendingEntryId: string;
  userId: string;
  status: string;
  reflection: string | null;
  continueChoice: string | null;
  submittedAt: string;
}

export interface GetTendingEntriesResponse {
  entries: TendingEntryDTO[];
}

export interface SubmitTendingResponseRequest {
  status: string;
  reflection?: string;
  continueChoice?: string;
}

export interface SubmitTendingResponseResponse {
  entry: TendingEntryDTO;
}

// Stage 4 Phase 5: the five forward paths surfaced at a Tending check-in.
export enum ContinueChoice {
  ANOTHER_ROUND = 'ANOTHER_ROUND',
  EXTEND = 'EXTEND',
  NEW_PROCESS = 'NEW_PROCESS',
  PARTIAL_CLOSURE = 'PARTIAL_CLOSURE',
  FULL_CLOSURE = 'FULL_CLOSURE',
}

export enum PartialClosureResolution {
  RESOLVED = 'RESOLVED',
  CONTINUING = 'CONTINUING',
}

export interface TendingCheckinOrientationReflection {
  reflection: string;
  perEntryNotes?: Record<string, string>;
}

export interface TendingCheckinWhatComesNext {
  continueChoice: ContinueChoice;
  partialClosure?: Record<string, PartialClosureResolution>;
}

export interface TendingCheckinOrientations {
  whatWorked: TendingCheckinOrientationReflection;
  whereMoreSupport: TendingCheckinOrientationReflection;
  whatComesNext: TendingCheckinWhatComesNext;
}

export interface SubmitTendingCheckinRequest {
  orientations: TendingCheckinOrientations;
}

export interface SubmitTendingCheckinResponse {
  entries: TendingEntryDTO[];
  newSessionId?: string;
  continueChoice: ContinueChoice;
  nextScheduledFor?: string | null;
}

export interface CreateTendingReentryRequest {
  intent?: string;
}

export interface CreateTendingReentryResponse {
  entry: TendingEntryDTO;
}

export interface GetStage4StateResponse {
  phase: Stage4Phase;
  walkthrough: Stage4WalkthroughDTO;
  inventory: ProposalInventoryDTO;
  coverageAudit: Stage4CoverageAuditDTO;
  mySelections: Stage4SelectionDTO[];
  partnerSelections: Stage4SelectionDTO[];
  mySelectionStatus: 'NOT_STARTED' | 'SUBMITTED';
  partnerSelectionStatus: 'NOT_STARTED' | 'SUBMITTED';
  outcome: Stage4OutcomeDTO | null;
  tendingPreview: TendingPreviewDTO | null;
}

export interface UpdateStage4WalkthroughNeedResponse {
  state: GetStage4StateResponse;
}

export interface SubmitStage4SelectionRequest {
  decision: Stage4SelectionDecision;
  note?: string;
}

export interface SubmitStage4SelectionsRequest {
  selections: Array<{
    proposalId: string;
    decision: Stage4SelectionDecision;
    note?: string;
  }>;
}

export interface SubmitStage4SelectionsResponse {
  submitted: boolean;
  submittedAt: string;
  partnerSubmitted: boolean;
  state: GetStage4StateResponse;
}

export interface CloseStage4Request {
  kind?: Stage4ClosureKind;
  reason?: Stage4ClosureReason;
  summary?: string;
  /** ISO date string. Used as the followUpDate for any generated Agreement rows. */
  checkInDate: string;
  /** @deprecated Phase 4 removes this — checkInDate is the single source. */
  followUpDatesByProposalId?: Record<string, string>;
}

export interface CloseStage4Response {
  closed: boolean;
  closedAt: string;
  outcome: Stage4OutcomeDTO;
  state: GetStage4StateResponse;
}

// ============================================================================
// Stage 4 Sub-chat (Phase 3)
// ============================================================================

export interface Stage4SubChatMessageDTO {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  /**
   * Structured candidate proposal extracted from the AI's message (when it
   * has one to offer). The UI surfaces a "Use this version" affordance on
   * this message. The candidate's `description` is the proposal text;
   * `proposalId` (when present on a PROPOSAL_REFINEMENT sub-chat) tells the
   * client to update that proposal in place rather than create a new one.
   */
  candidate?: Stage4ProposalDraft | null;
}

export interface Stage4SubChatDTO {
  id: string;
  sessionId: string;
  userId: string;
  anchorKind: Stage4SubChatAnchor;
  anchorId: string | null;
  status: Stage4SubChatStatus;
  createdAt: string;
  resolvedAt: string | null;
  messages: Stage4SubChatMessageDTO[];
}

export interface OpenStage4SubChatRequest {
  anchorKind: Stage4SubChatAnchor;
  anchorId?: string | null;
}

export interface OpenStage4SubChatResponse {
  subChat: Stage4SubChatDTO;
}

export interface SendStage4SubChatMessageRequest {
  content: string;
}

export interface SendStage4SubChatMessageResponse {
  subChat: Stage4SubChatDTO;
}

export interface Stage4ProposalDraft {
  /** When set, refers to an existing StrategyProposal (refinement case). */
  proposalId?: string;
  description: string;
  needsAddressed?: string[];
  duration?: string | null;
  measureOfSuccess?: string | null;
}

export interface ResolveStage4SubChatRequest {
  /** Proposals to create new (NEEDS_BRAINSTORM, NO_OVERLAP). */
  acceptedProposals?: Stage4ProposalDraft[];
  /** Existing proposals to update in place (PROPOSAL_REFINEMENT, NO_OVERLAP). */
  updatedProposals?: Stage4ProposalDraft[];
}

export interface ResolveStage4SubChatResponse {
  subChat: Stage4SubChatDTO;
  createdProposalIds: string[];
  updatedProposalIds: string[];
}

export interface GetStage4SubChatResponse {
  subChat: Stage4SubChatDTO;
}
