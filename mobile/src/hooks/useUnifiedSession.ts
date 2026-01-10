/**
 * useUnifiedSession Hook
 *
 * Composite hook that combines all stage-specific logic for the unified session interface.
 * Manages state across all stages while keeping the chat interface as the primary view.
 */

import { useMemo, useCallback, useReducer, useEffect, useRef, useState } from 'react';
import { Stage, MessageRole, StrategyPhase, MemorySuggestion } from '@meet-without-fear/shared';
import { useToast } from '../contexts/ToastContext';
import { ApiClientError } from '../lib/api';

import {
  useSessionState,
  useConfirmInvitationMessage,
  useMarkSessionViewed,
} from './useSessions';
import {
  useInfiniteMessages,
  useSendMessage,
  useOptimisticMessage,
  useRecordEmotion,
  useFetchInitialMessage,
} from './useMessages';
import {
  useSignCompact,
  useAdvanceStage,
  useConfirmFeelHeard,
  useEmpathyDraft,
  usePartnerEmpathy,
  useSaveEmpathyDraft,
  useConsentToShareEmpathy,
  useValidateEmpathy,
  useNeeds,
  useConfirmNeeds,
  useConsentShareNeeds,
  useCommonGround,
  useConfirmCommonGround,
  useStrategies,
  useRequestStrategySuggestions,
  useProposeStrategy,
  useMarkReadyToRank,
  useSubmitRankings,
  useStrategiesReveal,
  useAgreements,
  useConfirmAgreement,
  useCreateAgreement,
  useResolveSession,
  useEmpathyStatus,
  useShareOffer,
  useRespondToShareOffer,
} from './useStages';

// ============================================================================
// Types
// ============================================================================

export type OverlayType =
  | 'breathing-exercise'
  | 'grounding-exercise'
  | 'body-scan-exercise'
  | 'support-options'
  | 'strategy-pool'
  | 'strategy-ranking'
  | 'overlap-reveal'
  | 'agreement-confirmation'
  | 'needs-side-by-side'
  | 'curiosity-compact'
  | 'waiting-room'
  | null;

export type InlineCardType =
  // Cross-stage: Waiting status
  | 'waiting-status'
  // Stage 1: Witness
  | 'emotional-barometer'
  | 'feel-heard-confirmation'
  | 'cooling-suggestion'
  // Stage 2: Perspective Stretch
  | 'mirror-intervention'
  | 'consent-prompt'
  | 'ready-to-share-confirmation'
  | 'accuracy-feedback'
  // Stage 3: Need Mapping
  | 'need-card'
  | 'needs-summary'
  | 'common-ground-preview'
  // Stage 4: Strategic Repair
  | 'strategy-suggestion'
  | 'strategy-pool-preview'
  | 'overlap-preview'
  | 'agreement-preview';

export interface InlineChatCard {
  id: string;
  type: InlineCardType;
  position: string | 'end';
  props: Record<string, unknown>;
  dismissible?: boolean;
}

interface MirrorIntervention {
  detected: boolean;
  message: string;
  patterns: string[];
}

// Re-export WaitingStatusType from the component for external use
export type { WaitingStatusType } from '../components/WaitingStatusMessage';

// Re-export WaitingStatusState from the new pure derivation module
// This maintains backward compatibility while centralizing the type definition
export type { WaitingStatusState } from '../utils/getWaitingStatus';
import type { WaitingStatusState } from '../utils/getWaitingStatus';

interface UnifiedSessionState {
  activeOverlay: OverlayType;
  dismissedCards: Set<string>;
  barometerValue: number;
  lastBarometerMessageCount: number;
  mirrorIntervention: MirrorIntervention | null;
  pendingMessage: string | null;
  showCoolingSuggestion: boolean;
  showFinalCheck: boolean;
  pendingConfirmation: boolean;
  hasConfirmedHeard: boolean; // Tracks if user confirmed they feel heard
  followUpDate: Date | null;
  waitingStatus: WaitingStatusState;
  previousWaitingStatus: WaitingStatusState; // Track previous to detect changes
}

// ============================================================================
// Constants
// ============================================================================

const BAROMETER_MESSAGE_INTERVAL = 5;
const HIGH_INTENSITY_THRESHOLD = 8;

const HARMFUL_PATTERNS = {
  judgmental: [
    /\byou always\b/i,
    /\byou never\b/i,
    /\byou're (so|being|just)\b/i,
    /\btypical(ly)?\b/i,
    /\bof course you\b/i,
  ],
  accusatory: [
    /\byou made me\b/i,
    /\bit's your fault\b/i,
    /\byou did this\b/i,
    /\bbecause of you\b/i,
    /\byou don't care\b/i,
    /\byou're wrong\b/i,
  ],
  dismissive: [
    /\bwhatever\b/i,
    /\bI don't care\b/i,
    /\bdoesn't matter\b/i,
    /\bget over it\b/i,
    /\byou're overreacting\b/i,
    /\bthat's ridiculous\b/i,
  ],
};

// ============================================================================
// Helper Functions
// ============================================================================

function detectHarmfulLanguage(text: string): MirrorIntervention {
  const detectedPatterns: string[] = [];

  for (const pattern of HARMFUL_PATTERNS.judgmental) {
    if (pattern.test(text)) {
      detectedPatterns.push('judgmental language');
      break;
    }
  }

  for (const pattern of HARMFUL_PATTERNS.accusatory) {
    if (pattern.test(text)) {
      detectedPatterns.push('accusatory language');
      break;
    }
  }

  for (const pattern of HARMFUL_PATTERNS.dismissive) {
    if (pattern.test(text)) {
      detectedPatterns.push('dismissive language');
      break;
    }
  }

  if (detectedPatterns.length > 0) {
    return {
      detected: true,
      message:
        'I notice some strong language. Would you like to rephrase this to focus on understanding?',
      patterns: detectedPatterns,
    };
  }

  return { detected: false, message: '', patterns: [] };
}

// ============================================================================
// State Reducer
// ============================================================================

type SessionAction =
  | { type: 'OPEN_OVERLAY'; payload: OverlayType }
  | { type: 'CLOSE_OVERLAY' }
  | { type: 'DISMISS_CARD'; payload: string }
  | { type: 'SET_BAROMETER'; payload: number }
  | {
    type: 'SET_MIRROR_INTERVENTION';
    payload: { intervention: MirrorIntervention; pendingMessage: string };
  }
  | { type: 'CLEAR_MIRROR_INTERVENTION' }
  | { type: 'SET_FOLLOW_UP_DATE'; payload: Date | null }
  | { type: 'SET_LAST_BAROMETER_COUNT'; payload: number }
  | { type: 'SHOW_COOLING_SUGGESTION'; payload: boolean }
  | { type: 'SHOW_FINAL_CHECK'; payload: boolean }
  | { type: 'SET_PENDING_CONFIRMATION'; payload: boolean }
  | { type: 'SET_HAS_CONFIRMED_HEARD'; payload: boolean }
  | { type: 'SET_WAITING_STATUS'; payload: WaitingStatusState }
  | { type: 'RESET_STATE' };

function sessionReducer(
  state: UnifiedSessionState,
  action: SessionAction
): UnifiedSessionState {
  switch (action.type) {
    case 'OPEN_OVERLAY':
      return { ...state, activeOverlay: action.payload };
    case 'CLOSE_OVERLAY':
      return { ...state, activeOverlay: null };
    case 'DISMISS_CARD':
      return {
        ...state,
        dismissedCards: new Set([...state.dismissedCards, action.payload]),
      };
    case 'SET_BAROMETER':
      return { ...state, barometerValue: action.payload };
    case 'SET_MIRROR_INTERVENTION':
      return {
        ...state,
        mirrorIntervention: action.payload.intervention,
        pendingMessage: action.payload.pendingMessage,
      };
    case 'CLEAR_MIRROR_INTERVENTION':
      return { ...state, mirrorIntervention: null, pendingMessage: null };
    case 'SET_FOLLOW_UP_DATE':
      return { ...state, followUpDate: action.payload };
    case 'SET_LAST_BAROMETER_COUNT':
      return { ...state, lastBarometerMessageCount: action.payload };
    case 'SHOW_COOLING_SUGGESTION':
      return { ...state, showCoolingSuggestion: action.payload };
    case 'SHOW_FINAL_CHECK':
      return { ...state, showFinalCheck: action.payload };
    case 'SET_PENDING_CONFIRMATION':
      return { ...state, pendingConfirmation: action.payload };
    case 'SET_HAS_CONFIRMED_HEARD':
      return { ...state, hasConfirmedHeard: action.payload };
    case 'SET_WAITING_STATUS':
      return {
        ...state,
        previousWaitingStatus: state.waitingStatus,
        waitingStatus: action.payload,
      };
    case 'RESET_STATE':
      return initialState;
    default:
      return state;
  }
}

const initialState: UnifiedSessionState = {
  activeOverlay: null,
  dismissedCards: new Set(),
  barometerValue: 5,
  lastBarometerMessageCount: 0,
  mirrorIntervention: null,
  pendingMessage: null,
  showCoolingSuggestion: false,
  showFinalCheck: false,
  pendingConfirmation: false,
  hasConfirmedHeard: false,
  followUpDate: null,
  waitingStatus: null,
  previousWaitingStatus: null,
};

// ============================================================================
// Main Hook
// ============================================================================

export function useUnifiedSession(sessionId: string | undefined) {
  // Local state management
  const [state, dispatch] = useReducer(sessionReducer, initialState);
  const lastActivityTime = useRef<number>(Date.now());
  const prevMessageCountRef = useRef(0);

  // Toast for error feedback
  const { showError } = useToast();

  // Track live invitation message from AI responses (for refinement flow)
  // This captures the proposed message before it's saved to database
  const [liveInvitationMessage, setLiveInvitationMessage] = useState<string | null>(null);

  // Track AI-proposed empathy statement (Stage 2)
  // This captures the proposed statement when AI determines user is ready to share
  const [liveProposedEmpathyStatement, setLiveProposedEmpathyStatement] = useState<string | null>(null);

  // Track AI recommendation for feel-heard check
  const [aiRecommendsFeelHeardCheck, setAiRecommendsFeelHeardCheck] = useState(false);

  // Track AI recommendation for ready-to-share empathy (Stage 2)
  const [aiRecommendsReadyToShare, setAiRecommendsReadyToShare] = useState(false);

  // Track AI-detected memory suggestion
  const [memorySuggestion, setMemorySuggestion] = useState<MemorySuggestion | null>(null);

  // Track local invitation confirmation (survives component remounts)
  // This is set when user clicks "I've sent it" and prevents panel from reappearing
  const [localInvitationConfirmed, setLocalInvitationConfirmed] = useState(false);

  // -------------------------------------------------------------------------
  // Consolidated Session State (reduces initial requests from ~5 to 1)
  // Returns session, progress, messages, invitation, and compact in one request
  // -------------------------------------------------------------------------
  const { data: stateData, isLoading: loadingState } = useSessionState(sessionId);

  // Extract core data from consolidated state
  const sessionData = stateData ? { session: stateData.session } : undefined;
  const progressData = stateData?.progress;
  const compactData = stateData?.compact;
  const invitationData = stateData?.invitation ? { invitation: stateData.invitation } : undefined;

  // Loading states - use consolidated loading for core data
  const loadingSession = loadingState;
  const loadingProgress = loadingState;
  const loadingCompact = loadingState;

  const currentStage = progressData?.myProgress?.stage ?? Stage.ONBOARDING;

  // Messages - use infinite scroll for pagination
  // The useSessionState hook hydrates the messages cache, so this will get a cache hit
  const {
    data: messagesData,
    isLoading: loadingMessages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteMessages(
    { sessionId: sessionId!, limit: 25 },
    { enabled: !!sessionId }
  );

  // Stage 2: Empathy - always fetch to avoid waterfall
  // API returns null/empty when not in stage 2+, and React Query caches efficiently
  const { data: empathyDraftData } = useEmpathyDraft(sessionId);
  const { data: partnerEmpathyData } = usePartnerEmpathy(sessionId);
  const partnerEmpathy = partnerEmpathyData?.attempt ?? null;

  // Stage 3: Needs - always fetch to avoid waterfall
  const { data: needsData } = useNeeds(sessionId);
  const { data: commonGroundData } = useCommonGround(sessionId);

  // Stage 4: Strategies - always fetch to avoid waterfall
  const { data: strategyData } = useStrategies(sessionId);
  const { data: revealData } = useStrategiesReveal(sessionId);
  const { data: agreementsData } = useAgreements(sessionId);

  // Empathy Reconciler Data
  const { data: empathyStatusData } = useEmpathyStatus(sessionId);
  const { data: shareOfferData } = useShareOffer(sessionId);
  const { mutate: respondToShareOffer } = useRespondToShareOffer();

  // -------------------------------------------------------------------------
  // Mutation Hooks
  // -------------------------------------------------------------------------
  const { mutate: sendMessage, isPending: isSending } = useSendMessage();
  const { mutate: recordEmotion } = useRecordEmotion();
  const { mutate: confirmHeard, isPending: isConfirmingFeelHeard } = useConfirmFeelHeard();
  const { mutate: signCompact, isPending: isSigningCompact } = useSignCompact();
  const { mutate: confirmInvitationMessage } = useConfirmInvitationMessage();
  const { mutate: advanceStage } = useAdvanceStage();
  const { mutate: saveDraft, mutateAsync: saveDraftAsync } = useSaveEmpathyDraft();
  const { mutate: consentToShare, isPending: isSharingEmpathy } = useConsentToShareEmpathy({
    onError: (error) => {
      console.error('[useConsentToShareEmpathy] Mutation error', error);
    },
    onSuccess: (data) => {
      console.log('[useConsentToShareEmpathy] Mutation success', data);
    },
  });
  const { mutate: validateEmpathy } = useValidateEmpathy();
  const { mutate: confirmNeeds } = useConfirmNeeds();
  const { mutate: consentShareNeeds } = useConsentShareNeeds();
  const { mutate: confirmCommonGroundMutation } = useConfirmCommonGround();
  const { mutate: proposeStrategy, isPending: isProposing } = useProposeStrategy();
  const { mutate: requestSuggestions, isPending: isGenerating } =
    useRequestStrategySuggestions();
  const { mutate: markReady } = useMarkReadyToRank();
  const { mutate: submitRankings } = useSubmitRankings();
  const { mutate: confirmAgreement } = useConfirmAgreement();
  useCreateAgreement(); // Available if needed for hybrid strategies
  const { mutate: resolveSession } = useResolveSession();
  const { addOptimisticMessage, removeOptimisticMessage } = useOptimisticMessage();

  const handleRespondToShareOffer = useCallback(
    (action: 'accept' | 'decline' | 'refine', refinedContent?: string) => {
      if (!sessionId) return;
      // Pass sharedContent for optimistic UI when accepting
      const sharedContent = action === 'accept'
        ? (refinedContent || shareOfferData?.suggestion?.suggestedContent)
        : undefined;
      respondToShareOffer({ sessionId, action, refinedContent, sharedContent });
    },
    [sessionId, respondToShareOffer, shareOfferData?.suggestion?.suggestedContent]
  );

  // Initial message - fetch AI-generated first message when session has no messages
  const { mutate: fetchInitialMessage, isPending: isFetchingInitialMessage } = useFetchInitialMessage();
  const hasFetchedInitialMessage = useRef(false);

  // -------------------------------------------------------------------------
  // Derived Values
  // -------------------------------------------------------------------------
  const session = sessionData?.session;
  // Flatten paginated messages - pages are in reverse chronological order (newest first)
  // but each page's messages are in chronological order, so we need to flatten
  // with older pages first: [page2, page1, page0].flatMap(p => p.messages)
  const messages = useMemo(() => {
    // messagesData is InfiniteData<GetMessagesResponse> with pages array
    // Pages are in reverse chronological order (newest first)
    // but each page's messages are in chronological order, so we flatten
    // with older pages first: [page2, page1, page0].flatMap(p => p.messages)
    const pages = messagesData?.pages;
    if (!pages || pages.length === 0) return [];
    return [...pages].reverse().flatMap(page => page.messages);
  }, [messagesData]);

  // -------------------------------------------------------------------------
  // Mark Session as Viewed
  // -------------------------------------------------------------------------
  // Mark the session as viewed when user opens it, which clears unread indicators
  const { mutate: markViewed } = useMarkSessionViewed(sessionId);
  const hasMarkedViewed = useRef(false);

  // Capture the initial lastSeenChatItemId when session first loads
  // This is used for the "New messages" separator and should NOT update
  // while the user is actively viewing the session
  const initialLastSeenChatItemIdRef = useRef<string | null | undefined>(undefined);
  const [lastSeenChatItemIdForSeparator, setLastSeenChatItemIdForSeparator] = useState<string | null>(null);

  // Capture initial value when session loads (before marking viewed)
  useEffect(() => {
    if (
      session?.lastSeenChatItemId !== undefined &&
      initialLastSeenChatItemIdRef.current === undefined &&
      !hasMarkedViewed.current
    ) {
      initialLastSeenChatItemIdRef.current = session.lastSeenChatItemId;
      setLastSeenChatItemIdForSeparator(session.lastSeenChatItemId);
    }
  }, [session?.lastSeenChatItemId]);

  useEffect(() => {
    // Only mark viewed once per session load, when we have messages
    if (!sessionId || hasMarkedViewed.current || messages.length === 0) return;

    // Get the newest message ID (last in the chronologically sorted array)
    const newestMessageId = messages[messages.length - 1]?.id;

    markViewed({ lastSeenChatItemId: newestMessageId });
    hasMarkedViewed.current = true;

    // Clear the separator after marking viewed - user has now "seen" all messages
    setLastSeenChatItemIdForSeparator(null);
  }, [sessionId, messages, markViewed]);

  // Reset the flags when sessionId changes (user navigates to a different session)
  useEffect(() => {
    hasMarkedViewed.current = false;
    initialLastSeenChatItemIdRef.current = undefined;
    setLastSeenChatItemIdForSeparator(null);
  }, [sessionId]);

  // Only show 'Partner' fallback after data has loaded, otherwise show empty string
  const partnerName = loadingSession
    ? ''
    : (session?.partner?.nickname ?? session?.partner?.name ?? 'Partner');

  // Invitation phase detection
  // We're in invitation phase when:
  // - Session status is CREATED
  // - Invitation message hasn't been confirmed yet
  const invitation = invitationData?.invitation;
  const isInvitationPhase =
    session?.status === 'CREATED' && !invitation?.messageConfirmed;
  // Use live invitation message from AI response if available, fallback to database record
  const invitationMessage = liveInvitationMessage ?? invitation?.invitationMessage ?? null;
  const invitationConfirmed = invitation?.messageConfirmed ?? false;
  const myProgress = progressData?.myProgress;
  const partnerProgress = progressData?.partnerProgress;
  const canAdvance = progressData?.canAdvance ?? false;

  // Count user messages for barometer trigger
  const userMessageCount = messages.filter((m) => m.role === MessageRole.USER).length;

  // Show feel-heard UI when AI sets offerFeelHeardCheck: true in JSON response
  // Once true, stays true until user confirms or dismisses (sticky state)
  const showFeelHeardConfirmation = aiRecommendsFeelHeardCheck;

  // Needs confirmation state
  const needs = useMemo(() => needsData?.needs ?? [], [needsData?.needs]);
  const allNeedsConfirmed = needs.length > 0 && needs.every((n) => n.confirmed);
  const commonGround = useMemo(() => commonGroundData?.commonGround ?? [], [commonGroundData?.commonGround]);
  const commonGroundComplete = commonGroundData?.bothConfirmed ?? false;

  // Strategy phase
  const strategyPhase = strategyData?.phase ?? StrategyPhase.COLLECTING;
  const strategies = useMemo(() => strategyData?.strategies ?? [], [strategyData?.strategies]);
  const overlappingStrategies = useMemo(() => revealData?.overlap ?? [], [revealData?.overlap]);
  const agreements = useMemo(() => agreementsData?.agreements ?? [], [agreementsData?.agreements]);

  // -------------------------------------------------------------------------
  // Barometer Trigger Effect
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (currentStage !== Stage.WITNESS) return;

    if (userMessageCount > prevMessageCountRef.current) {
      prevMessageCountRef.current = userMessageCount;

      const messagesSinceLastBarometer =
        userMessageCount - state.lastBarometerMessageCount;
      if (messagesSinceLastBarometer >= BAROMETER_MESSAGE_INTERVAL) {
        dispatch({ type: 'SET_LAST_BAROMETER_COUNT', payload: userMessageCount });
        // Show barometer via inline card
      }
    }
  }, [userMessageCount, state.lastBarometerMessageCount, currentStage]);

  // -------------------------------------------------------------------------
  // Waiting Status Effect
  // -------------------------------------------------------------------------
  // Compute and update waiting status based on session state
  useEffect(() => {
    let newWaitingStatus: WaitingStatusState = null;

    // Note: We intentionally don't show compact-pending status during Stage 0.
    // The user should focus on the invitation phase after signing the compact,
    // not on waiting for their partner.

    // Stage 1: Waiting for partner to complete witness
    if (
      myProgress?.stage === Stage.PERSPECTIVE_STRETCH &&
      partnerProgress?.stage === Stage.WITNESS
    ) {
      newWaitingStatus = 'witness-pending';
    }
    // Stage 1: Partner just completed witness (transition)
    else if (
      myProgress?.stage === Stage.PERSPECTIVE_STRETCH &&
      partnerProgress?.stage === Stage.PERSPECTIVE_STRETCH &&
      state.previousWaitingStatus === 'witness-pending'
    ) {
      newWaitingStatus = 'partner-completed-witness';
    }
    // Stage 2: Guesser's empathy has gaps, waiting for subject to decide whether to share
    // This happens when: reconciler found gaps, created a share suggestion for subject,
    // and we're waiting for subject to respond (share or skip).
    // Guesser should see waiting banner and not be able to chat until subject responds.
    else if (empathyStatusData?.awaitingSharing && !empathyStatusData?.hasNewSharedContext) {
      newWaitingStatus = 'empathy-pending';
    }
    // Stage 2: Guesser received new shared context from subject
    // CHECK THIS FIRST - when user has new shared context, they should be able to chat
    // immediately (no waiting banner). The "Revisit what you'll share" button will appear
    // after they've sent at least one message.
    // Note: We intentionally do NOT set a waiting status here - user can chat freely.
    else if (empathyStatusData?.hasNewSharedContext) {
      // No waiting status - user should be able to chat immediately
      newWaitingStatus = null;
    }
    // Stage 2: Partner is now considering your perspective (good alignment found)
    // This happens when: reconciler ran, found good alignment, so my empathy was REVEALED,
    // and partner (the subject who felt heard) is now working on their empathy for me
    else if (
      empathyStatusData?.myAttempt?.status === 'REVEALED' &&
      !partnerEmpathy &&
      !empathyStatusData?.analyzing
    ) {
      newWaitingStatus = 'partner-considering-perspective';
    }
    // Stage 2: Waiting for partner to share empathy (still waiting for partner to feel heard)
    else if (empathyDraftData?.alreadyConsented && !partnerEmpathy && !empathyStatusData?.analyzing && !empathyStatusData?.awaitingSharing) {
      newWaitingStatus = 'empathy-pending';
    }
    // Stage 2: Reconciler is analyzing
    else if (empathyStatusData?.analyzing) {
      newWaitingStatus = 'reconciler-analyzing';
    }
    // Stage 2: Waiting for user to respond to share suggestion (Subject)
    else if (shareOfferData?.hasSuggestion) {
      newWaitingStatus = 'awaiting-context-share';
    }
    // Stage 2: Partner just shared empathy (transition)
    else if (
      partnerEmpathy &&
      state.previousWaitingStatus === 'empathy-pending'
    ) {
      newWaitingStatus = 'partner-shared-empathy';
    }
    // Stage 3: Waiting for partner to confirm needs
    else if (allNeedsConfirmed && !commonGround.length) {
      newWaitingStatus = 'needs-pending';
    }
    // Stage 3: Partner confirmed needs (transition)
    else if (
      commonGround.length > 0 &&
      state.previousWaitingStatus === 'needs-pending'
    ) {
      newWaitingStatus = 'partner-confirmed-needs';
    }
    // Stage 4: Waiting for partner to rank
    else if (strategyPhase === StrategyPhase.REVEALING && !overlappingStrategies.length) {
      newWaitingStatus = 'ranking-pending';
    }

    // Only update if status changed
    if (newWaitingStatus !== state.waitingStatus) {
      dispatch({ type: 'SET_WAITING_STATUS', payload: newWaitingStatus });
    }
  }, [
    currentStage,
    compactData?.mySigned,
    compactData?.partnerSigned,
    myProgress?.stage,
    partnerProgress?.stage,
    empathyDraftData?.alreadyConsented,
    partnerEmpathy,
    allNeedsConfirmed,
    commonGround.length,
    strategyPhase,
    overlappingStrategies.length,
    state.waitingStatus,
    state.previousWaitingStatus,
    empathyStatusData?.analyzing,
    empathyStatusData?.awaitingSharing,
    empathyStatusData?.hasNewSharedContext,
    empathyStatusData?.myAttempt?.status,
    shareOfferData?.hasSuggestion,
  ]);

  // -------------------------------------------------------------------------
  // Initialize Empathy State from Database Effect
  // -------------------------------------------------------------------------
  // When loading a session with an existing draft (not yet marked ready),
  // restore the local state so the "View your understanding" button appears
  useEffect(() => {
    if (
      empathyDraftData?.draft?.content &&
      !empathyDraftData.draft.readyToShare &&
      !empathyDraftData.alreadyConsented
    ) {
      // Restore the proposed statement from database
      setLiveProposedEmpathyStatement(empathyDraftData.draft.content);
      // Show the ready-to-share card
      setAiRecommendsReadyToShare(true);
    }
  }, [empathyDraftData?.draft?.content, empathyDraftData?.draft?.readyToShare, empathyDraftData?.alreadyConsented]);

  // -------------------------------------------------------------------------
  // Initialize Feel-Heard Check State from Backend
  // -------------------------------------------------------------------------
  // When loading a session where AI has already recommended feel-heard check,
  // restore the local state so the confirmation prompt appears
  useEffect(() => {
    if (currentStage === Stage.WITNESS && progressData?.myProgress?.gatesSatisfied) {
      const gates = progressData.myProgress.gatesSatisfied as Record<string, unknown>;
      // Check if feelHeardCheckOffered is set (Stage 1 specific gate)
      if (gates.feelHeardCheckOffered === true && !gates.feelHeardConfirmed) {
        setAiRecommendsFeelHeardCheck(true);
      }
    }
  }, [currentStage, progressData?.myProgress?.gatesSatisfied]);

  // -------------------------------------------------------------------------
  // Initial Message Effect
  // -------------------------------------------------------------------------
  // Fetch AI-generated initial message when session loads with no messages
  // IMPORTANT: Skip during onboarding when compact is not signed - the compact
  // should be the only content shown until user signs it
  useEffect(() => {
    // Skip if:
    // - No session ID
    // - Still loading session or messages or compact
    // - Already fetched or fetching
    // - Messages already exist
    // - In onboarding with unsigned compact (compact must be signed first)

    // Skip if still loading or during onboarding with unsigned compact
    const isOnboardingUnsigned = currentStage === Stage.ONBOARDING && !compactData?.mySigned;

    if (
      !sessionId ||
      loadingSession ||
      loadingMessages ||
      loadingCompact ||
      hasFetchedInitialMessage.current ||
      isFetchingInitialMessage ||
      isOnboardingUnsigned
    ) {
      return;
    }

    // Check if messages are empty after loading completes
    const messagesPages = messagesData?.pages;
    const hasMessages = messagesPages && messagesPages.some(page => page.messages.length > 0);

    if (!hasMessages) {
      hasFetchedInitialMessage.current = true;
      fetchInitialMessage({ sessionId });
    }
  }, [
    sessionId,
    loadingSession,
    loadingMessages,
    loadingCompact,
    messagesData?.pages,
    isFetchingInitialMessage,
    fetchInitialMessage,
    currentStage,
    compactData?.mySigned,
  ]);

  // -------------------------------------------------------------------------
  // Generate Inline Cards
  // -------------------------------------------------------------------------
  const inlineCards = useMemo((): InlineChatCard[] => {
    const cards: InlineChatCard[] = [];

    // Note: Waiting status cards have been removed.
    // We don't show "waiting for partner" messages anymore.

    // Stage 1: Witness cards
    if (currentStage === Stage.WITNESS) {
      // Cooling suggestion
      if (state.showCoolingSuggestion) {
        cards.push({
          id: 'cooling-suggestion',
          type: 'cooling-suggestion',
          position: 'end',
          props: {
            intensity: state.barometerValue,
            pendingConfirmation: state.pendingConfirmation,
          },
        });
      }

      // Note: Feel heard confirmation is now rendered above chat input, not as inline card
    }

    // Stage 2: Perspective Stretch cards
    if (currentStage === Stage.PERSPECTIVE_STRETCH) {
      // Mirror intervention
      if (state.mirrorIntervention) {
        cards.push({
          id: 'mirror-intervention',
          type: 'mirror-intervention',
          position: 'end',
          props: {
            message: state.mirrorIntervention.message,
            patterns: state.mirrorIntervention.patterns,
          },
        });
      }

      // Note: ready-to-share-confirmation card removed - now shown as panel above chat input
      // The panel slides up when empathy statement is ready to review

      // Note: empathy-draft-preview card removed - users access empathy statement via the overlay drawer
      // The ready-to-share-confirmation card opens the overlay, and after sending it appears as a message in chat

      // Partner's empathy for validation
      if (partnerEmpathy) {
        cards.push({
          id: 'accuracy-feedback',
          type: 'accuracy-feedback',
          position: 'end',
          props: {
            partnerName,
            content: partnerEmpathy.content,
          },
        });
      }

      // Note: Share suggestion from reconciler is now handled via the low-profile panel
      // + ShareSuggestionDrawer pattern instead of an inline card.
    }

    // Stage 3: Need Mapping cards
    if (currentStage === Stage.NEED_MAPPING) {
      // Needs summary for review
      if (needs.length > 0 && !allNeedsConfirmed) {
        cards.push({
          id: 'needs-summary',
          type: 'needs-summary',
          position: 'end',
          props: {
            needs: needs.map((n) => ({
              id: n.id,
              category: n.need,
              description: n.description,
            })),
            confirmedIds: needs.filter((n) => n.confirmed).map((n) => n.id),
          },
        });
      }

      // Common ground preview
      if (commonGround.length > 0 && !commonGroundComplete) {
        cards.push({
          id: 'common-ground-preview',
          type: 'common-ground-preview',
          position: 'end',
          props: {
            sharedNeeds: commonGround.map((cg) => ({
              category: cg.need,
              description: cg.description,
            })),
            partnerName,
          },
        });
      }
    }

    // Stage 4: Strategic Repair cards
    if (currentStage === Stage.STRATEGIC_REPAIR) {
      // Strategy pool preview
      if (strategyPhase === StrategyPhase.COLLECTING) {
        cards.push({
          id: 'strategy-pool-preview',
          type: 'strategy-pool-preview',
          position: 'end',
          props: {
            strategyCount: strategies.length,
            // Note: StrategyDTO doesn't expose source to keep strategies unlabeled
            userContributedCount: 0,
          },
        });
      }

      // Overlap preview after ranking
      if (strategyPhase === StrategyPhase.REVEALING && overlappingStrategies.length > 0) {
        cards.push({
          id: 'overlap-preview',
          type: 'overlap-preview',
          position: 'end',
          props: {
            overlappingCount: overlappingStrategies.length,
            topOverlap: overlappingStrategies[0],
          },
        });
      }

      // Agreement preview
      if (agreements.length > 0) {
        cards.push({
          id: 'agreement-preview',
          type: 'agreement-preview',
          position: 'end',
          props: {
            experiment: agreements[0].description,
            duration: agreements[0].duration,
          },
        });
      }
    }

    // Filter out dismissed cards
    return cards.filter((card) => !state.dismissedCards.has(card.id));
  }, [
    currentStage,
    state,
    showFeelHeardConfirmation,
    aiRecommendsReadyToShare,
    liveProposedEmpathyStatement,
    empathyDraftData,
    partnerEmpathyData,
    needs,
    allNeedsConfirmed,
    commonGround,
    commonGroundComplete,
    strategyPhase,
    strategies,
    overlappingStrategies,
    agreements,
    partnerName,
  ]);

  // -------------------------------------------------------------------------
  // Action Handlers
  // -------------------------------------------------------------------------

  const handleSendMessage = useCallback(
    (content: string) => {
      if (!sessionId) return;

      // Prevent duplicate submissions
      if (isSending) {
        console.warn('[handleSendMessage] Already sending a message, ignoring duplicate call');
        return;
      }

      // Reset activity timer
      lastActivityTime.current = Date.now();

      // Check for mirror intervention (Stage 2)
      if (currentStage === Stage.PERSPECTIVE_STRETCH) {
        const intervention = detectHarmfulLanguage(content);
        if (intervention.detected) {
          dispatch({
            type: 'SET_MIRROR_INTERVENTION',
            payload: { intervention, pendingMessage: content },
          });
          return;
        }
      }

      // Add optimistic message
      const optimisticId = addOptimisticMessage(sessionId, {
        content,
        role: MessageRole.USER,
        stage: currentStage,
      });

      sendMessage(
        { sessionId, content },
        {
          onSuccess: (data) => {
            // Update feel-heard check recommendation from AI
            // Only set to true - once AI recommends feel-heard check, keep it sticky
            // until user confirms or dismisses (prevents flashing card on/off)
            if (data.offerFeelHeardCheck === true) {
              setAiRecommendsFeelHeardCheck(true);
            }
            // Update ready-to-share recommendation from AI (Stage 2)
            // Only set to true - once AI recommends ready-to-share, keep it sticky
            if (data.offerReadyToShare === true) {
              setAiRecommendsReadyToShare(true);
            }
            // Capture live invitation message from AI (for refinement flow)
            if (data.invitationMessage !== undefined) {
              setLiveInvitationMessage(data.invitationMessage);
            }
            // Capture AI-proposed empathy statement (Stage 2)
            // Save to database immediately so it persists across reloads
            if (data.proposedEmpathyStatement !== undefined && data.proposedEmpathyStatement !== null) {
              setLiveProposedEmpathyStatement(data.proposedEmpathyStatement);
              // Save to database with readyToShare: false (user hasn't confirmed yet)
              saveDraft({ sessionId, content: data.proposedEmpathyStatement, readyToShare: false });
            }
            // Capture AI-detected memory suggestion
            // Only shows one suggestion at a time - replaces previous if any
            if (data.memorySuggestion !== undefined) {
              setMemorySuggestion(data.memorySuggestion);
            }
          },
          onError: (error) => {
            removeOptimisticMessage(sessionId, optimisticId);
            // Show error message to user
            const message = error instanceof ApiClientError
              ? error.message
              : 'Failed to send message. Please try again.';
            showError('Message not sent', message);
          },
        }
      );
    },
    [
      sessionId,
      currentStage,
      sendMessage,
      isSending,
      addOptimisticMessage,
      removeOptimisticMessage,
      showError,
    ]
  );

  const handleBarometerChange = useCallback(
    (value: number) => {
      dispatch({ type: 'SET_BAROMETER', payload: value });
      if (sessionId) {
        recordEmotion({ sessionId, intensity: value });
      }

      if (value >= HIGH_INTENSITY_THRESHOLD) {
        dispatch({ type: 'SHOW_COOLING_SUGGESTION', payload: true });
      }
    },
    [sessionId, recordEmotion]
  );

  const handleConfirmFeelHeard = useCallback(
    (onSuccess?: () => void) => {
      if (!sessionId) return;
      // Prevent duplicate submissions
      if (isConfirmingFeelHeard) {
        console.warn('[handleConfirmFeelHeard] Already confirming, ignoring duplicate call');
        return;
      }
      // Mark as confirmed to prevent looping
      dispatch({ type: 'SET_HAS_CONFIRMED_HEARD', payload: true });
      // Reset the AI recommendation state (cleanup)
      setAiRecommendsFeelHeardCheck(false);
      confirmHeard(
        { sessionId, confirmed: true },
        {
          onSuccess,
          onError: (error) => {
            console.error('[handleConfirmFeelHeard] Error confirming feel-heard:', error);
          },
        }
      );
    },
    [sessionId, confirmHeard, isConfirmingFeelHeard]
  );

  // Dismiss feel-heard card without confirming (user clicks "Not yet")
  // Resets the AI recommendation so it can be offered again later
  const handleDismissFeelHeard = useCallback(() => {
    setAiRecommendsFeelHeardCheck(false);
  }, []);

  // Dismiss ready-to-share prompt (user clicks "Not yet")
  // Resets the AI recommendation so it can be offered again later
  const handleDismissReadyToShare = useCallback(() => {
    setAiRecommendsReadyToShare(false);
  }, []);

  // Mark empathy draft as ready to share (user confirms from AI prompt)
  // This saves the draft with readyToShare: true
  const handleConfirmReadyToShare = useCallback(() => {
    if (!sessionId) return;
    // Reset the AI recommendation
    setAiRecommendsReadyToShare(false);

    if (empathyDraftData?.draft?.content) {
      // If draft exists, mark it ready to share
      saveDraft({ sessionId, content: empathyDraftData.draft.content, readyToShare: true });
    } else if (liveProposedEmpathyStatement) {
      // Use AI-proposed empathy statement - mark as ready so preview card appears
      saveDraft({
        sessionId,
        content: liveProposedEmpathyStatement,
        readyToShare: true
      });
    } else {
      // If no draft or proposal exists, create a placeholder and mark ready
      // This will show the preview card so user can edit before sharing
      saveDraft({
        sessionId,
        content: 'Based on our conversation, I understand that you might be feeling...',
        readyToShare: true
      });
    }
  }, [sessionId, empathyDraftData?.draft?.content, liveProposedEmpathyStatement, saveDraft]);

  const handleSignCompact = useCallback(
    (onSuccess?: () => void) => {
      if (!sessionId) return;
      signCompact(
        { sessionId },
        {
          onSuccess: () => {
            // Fetch initial message if none exist
            const messagesPages = messagesData?.pages;
            const hasMessages = messagesPages && messagesPages.some(page => page.messages.length > 0);
            if (!hasMessages && !hasFetchedInitialMessage.current) {
              hasFetchedInitialMessage.current = true;
              fetchInitialMessage({ sessionId });
            }
            // Call success callback (which triggers stage completion)
            onSuccess?.();
          },
        }
      );
    },
    [sessionId, signCompact, messagesData?.pages, fetchInitialMessage]
  );

  const handleConfirmInvitationMessage = useCallback(
    (message?: string, onSuccess?: () => void) => {
      if (!sessionId) return;
      confirmInvitationMessage(
        { sessionId, message },
        { onSuccess }
      );
    },
    [sessionId, confirmInvitationMessage]
  );

  const handleSaveEmpathyDraft = useCallback(
    (content: string, readyToShare?: boolean) => {
      if (!sessionId) return;
      saveDraft({ sessionId, content, readyToShare });
    },
    [sessionId, saveDraft]
  );

  const handleShareEmpathy = useCallback((content?: string) => {
    if (!sessionId) {
      console.warn('[handleShareEmpathy] No sessionId, aborting');
      return;
    }
    if (!consentToShare) {
      console.error('[handleShareEmpathy] consentToShare mutation is not available');
      return;
    }
    // Pass draft content for optimistic UI update
    // Use provided content, or fall back to draft/proposed statement
    const draftContent = content || empathyDraftData?.draft?.content || liveProposedEmpathyStatement || undefined;
    console.log('[handleShareEmpathy] Calling consentToShare', {
      sessionId,
      hasDraftContent: !!draftContent,
      draftContentLength: draftContent?.length,
      contentProvided: !!content,
      hasEmpathyDraft: !!empathyDraftData?.draft?.content,
      hasLiveProposed: !!liveProposedEmpathyStatement
    });
    (async () => {
      try {
        // Ensure the draft is marked ready BEFORE consenting (prevents backend 400 + retry race)
        if (draftContent) {
          await saveDraftAsync({ sessionId, content: draftContent, readyToShare: true });
        }

        console.log('[handleShareEmpathy] About to call consentToShare mutation');
        consentToShare(
          { sessionId, consent: true, draftContent },
          {
            onError: (error) => {
              console.error('[handleShareEmpathy] Mutation onError callback', error);
            },
            onSuccess: (data) => {
              console.log('[handleShareEmpathy] Mutation onSuccess callback', data);
            },
          }
        );
        console.log('[handleShareEmpathy] consentToShare mutation called (async)');
      } catch (error) {
        console.error('[handleShareEmpathy] Failed during ready-to-share + consent flow', error);
      }
    })();
  }, [sessionId, consentToShare, empathyDraftData?.draft?.content, liveProposedEmpathyStatement, saveDraftAsync]);

  const handleValidatePartnerEmpathy = useCallback(
    (validated: boolean, feedback?: string) => {
      if (!sessionId) return;
      validateEmpathy({ sessionId, validated, feedback });
    },
    [sessionId, validateEmpathy]
  );

  const handleConfirmAllNeeds = useCallback(
    (onSuccess?: () => void) => {
      if (!sessionId || needs.length === 0) return;

      const confirmations = needs.map((need) => ({
        needId: need.id,
        confirmed: true,
      }));

      confirmNeeds(
        { sessionId, confirmations },
        {
          onSuccess: () => {
            consentShareNeeds({
              sessionId,
              needIds: needs.map((n) => n.id),
            });
            onSuccess?.();
          },
        }
      );
    },
    [sessionId, needs, confirmNeeds, consentShareNeeds]
  );

  const handleConfirmCommonGround = useCallback(
    (onSuccess?: () => void) => {
      if (!sessionId || commonGround.length === 0) return;

      const confirmations = commonGround.map((cg) => ({
        commonGroundId: cg.id,
        confirmed: true,
      }));

      confirmCommonGroundMutation({ sessionId, confirmations }, { onSuccess });
    },
    [sessionId, commonGround, confirmCommonGroundMutation]
  );

  const handleAddStrategy = useCallback(
    (description: string) => {
      if (!sessionId) return;
      proposeStrategy({ sessionId, description });
    },
    [sessionId, proposeStrategy]
  );

  const handleRequestMoreStrategies = useCallback(
    (count?: number) => {
      if (!sessionId) return;
      requestSuggestions({ sessionId, count });
    },
    [sessionId, requestSuggestions]
  );

  const handleMarkReadyToRank = useCallback(() => {
    if (!sessionId) return;
    markReady({ sessionId });
  }, [sessionId, markReady]);

  const handleSubmitRankings = useCallback(
    (rankedIds: string[]) => {
      if (!sessionId) return;
      submitRankings({ sessionId, rankedIds });
    },
    [sessionId, submitRankings]
  );

  const handleConfirmAgreement = useCallback(
    (agreementId: string, onSuccess?: () => void) => {
      if (!sessionId) return;
      confirmAgreement({ sessionId, agreementId, confirmed: true }, { onSuccess });
    },
    [sessionId, confirmAgreement]
  );

  const handleResolveSession = useCallback(
    (onSuccess?: () => void) => {
      if (!sessionId) return;
      resolveSession({ sessionId }, { onSuccess });
    },
    [sessionId, resolveSession]
  );

  const openOverlay = useCallback((overlay: OverlayType) => {
    dispatch({ type: 'OPEN_OVERLAY', payload: overlay });
  }, []);

  const closeOverlay = useCallback(() => {
    dispatch({ type: 'CLOSE_OVERLAY' });
  }, []);

  const dismissCard = useCallback((cardId: string) => {
    dispatch({ type: 'DISMISS_CARD', payload: cardId });
  }, []);

  // -------------------------------------------------------------------------
  // Return Value
  // -------------------------------------------------------------------------
  return {
    // Loading state
    isLoading: loadingSession || loadingProgress || loadingMessages,
    isFetchingInitialMessage,

    // Session context
    session,
    sessionId,
    currentStage,
    stageStatus: myProgress?.status,
    partnerName,
    partnerProgress,
    myProgress,
    canAdvance,
    gates: myProgress?.gatesSatisfied,
    milestones: progressData?.milestones,

    // Messages and cards
    messages,
    inlineCards,
    isSending,
    isSigningCompact,
    isConfirmingFeelHeard,
    showFeelHeardConfirmation,

    // Unread tracking - for "New messages" separator in chat
    // This is the lastSeenChatItemId from BEFORE the user opened the session
    // It's cleared after markViewed is called so new messages don't show a separator
    lastSeenChatItemIdForSeparator,

    // Pagination for loading older messages
    fetchMoreMessages: fetchNextPage,
    hasMoreMessages: hasNextPage ?? false,
    isFetchingMoreMessages: isFetchingNextPage,

    // Overlay state
    activeOverlay: state.activeOverlay,

    // Local state
    barometerValue: state.barometerValue,
    mirrorIntervention: state.mirrorIntervention,
    pendingMessage: state.pendingMessage,
    showCoolingSuggestion: state.showCoolingSuggestion,
    showFinalCheck: state.showFinalCheck,
    pendingConfirmation: state.pendingConfirmation,
    followUpDate: state.followUpDate,
    waitingStatus: state.waitingStatus,

    // Memory suggestion
    memorySuggestion,
    setMemorySuggestion,
    clearMemorySuggestion: () => setMemorySuggestion(null),

    // Invitation phase
    isInvitationPhase,
    invitationMessage,
    invitationConfirmed,
    invitation,
    localInvitationConfirmed,
    setLocalInvitationConfirmed,
    setLiveInvitationMessage,

    // Stage-specific data
    compactData,
    loadingCompact,
    empathyDraftData,
    partnerEmpathyData,
    liveProposedEmpathyStatement,
    setLiveProposedEmpathyStatement,
    aiRecommendsReadyToShare,
    setAiRecommendsReadyToShare,
    setAiRecommendsFeelHeardCheck,
    needsData,
    needs,
    allNeedsConfirmed,
    commonGroundData,
    commonGround,
    commonGroundComplete,
    strategyData,
    strategyPhase,
    strategies,
    revealData,
    overlappingStrategies,
    agreementsData,
    agreements,
    empathyStatusData,
    shareOfferData,
    isGenerating,
    isSharingEmpathy,
    isProposing,

    // Actions
    sendMessage: handleSendMessage,
    openOverlay,
    closeOverlay,
    dismissCard,
    dispatch,

    // Stage-specific actions
    handleBarometerChange,
    handleConfirmFeelHeard,
    handleDismissFeelHeard,
    handleConfirmReadyToShare,
    handleDismissReadyToShare,
    handleSignCompact,
    handleConfirmInvitationMessage,
    handleSaveEmpathyDraft,
    handleShareEmpathy,
    handleValidatePartnerEmpathy,
    handleConfirmAllNeeds,
    handleConfirmCommonGround,
    handleAddStrategy,
    handleRequestMoreStrategies,
    handleMarkReadyToRank,
    handleSubmitRankings,
    handleConfirmAgreement,
    handleResolveSession,
    handleRespondToShareOffer,

    // Utility actions
    clearMirrorIntervention: () => dispatch({ type: 'CLEAR_MIRROR_INTERVENTION' }),
    showCooling: (show: boolean) =>
      dispatch({ type: 'SHOW_COOLING_SUGGESTION', payload: show }),
    showFinal: (show: boolean) =>
      dispatch({ type: 'SHOW_FINAL_CHECK', payload: show }),
    setPendingConfirmation: (pending: boolean) =>
      dispatch({ type: 'SET_PENDING_CONFIRMATION', payload: pending }),
    setFollowUpDate: (date: Date | null) =>
      dispatch({ type: 'SET_FOLLOW_UP_DATE', payload: date }),
  };
}
