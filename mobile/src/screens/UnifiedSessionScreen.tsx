/**
 * UnifiedSessionScreen Component
 *
 * A unified chat-centric session interface that handles all stages.
 * The chat is always the primary view, with stage-specific content
 * appearing as inline cards or overlays.
 */

import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, Animated, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Stage, MessageRole, StrategyPhase, SessionStatus, MemorySuggestion } from '@meet-without-fear/shared';

import { ChatInterface, ChatMessage, ChatIndicatorItem } from '../components/ChatInterface';
import { SessionChatHeader } from '../components/SessionChatHeader';
import { FeelHeardConfirmation } from '../components/FeelHeardConfirmation';
import { BreathingExercise } from '../components/BreathingExercise';
import { GroundingExercise } from '../components/GroundingExercise';
import { BodyScanExercise } from '../components/BodyScanExercise';
import { SupportOptionsModal, SupportOption } from '../components/SupportOptionsModal';
import { SessionEntryMoodCheck } from '../components/SessionEntryMoodCheck';
// WaitingStatusMessage removed - we no longer show "waiting for partner" messages
import { EmpathyAttemptCard } from '../components/EmpathyAttemptCard';
import { AccuracyFeedback } from '../components/AccuracyFeedback';
import { NeedsSection } from '../components/NeedsSection';
import { CommonGroundCard } from '../components/CommonGroundCard';
import { StrategyPool } from '../components/StrategyPool';
import { StrategyRanking } from '../components/StrategyRanking';
import { OverlapReveal } from '../components/OverlapReveal';
import { AgreementCard } from '../components/AgreementCard';
// CuriosityCompactOverlay removed - now using inline approach
import { CompactChatItem } from '../components/CompactChatItem';
import { CompactAgreementBar } from '../components/CompactAgreementBar';
import { InvitationShareButton } from '../components/InvitationShareButton';
import { RefineInvitationDrawer } from '../components/RefineInvitationDrawer';
import { ViewEmpathyStatementDrawer } from '../components/ViewEmpathyStatementDrawer';
import { ShareSuggestionDrawer } from '../components/ShareSuggestionDrawer';
import { MemorySuggestionCard } from '../components/MemorySuggestionCard';

import { useUnifiedSession, InlineChatCard } from '../hooks/useUnifiedSession';
import { useChatUIState } from '../hooks/useChatUIState';
import { createInvitationLink } from '../hooks/useInvitation';
import { useAuth, useUpdateMood } from '../hooks/useAuth';
import { useRealtime, useUserSessionUpdates } from '../hooks/useRealtime';
import { stageKeys } from '../hooks/useStages';
import { messageKeys, useAIMessageHandler } from '../hooks/useMessages';
import { createStyles } from '../theme/styled';
import { WaitingBanner } from '../components/WaitingBanner';
import {
  trackInvitationSent,
  trackCompactSigned,
  trackMessageSent,
  trackFeltHeardResponse,
  trackSessionResolved,
  trackStageStarted,
  trackStageCompleted,
  trackCommonGroundFound,
} from '../services/analytics';

// ============================================================================
// Types
// ============================================================================

interface UnifiedSessionScreenProps {
  sessionId: string;
  onNavigateBack?: () => void;
  onNavigateToInnerThoughts?: (linkedSessionId?: string) => void;
  onStageComplete?: (stage: Stage) => void;
}

/**
 * Get brief status text for the header based on session status
 * @param status - The session status
 * @param isInviter - Whether the current user is the inviter (only inviter sees "invited" badge)
 */
function getBriefStatus(status?: SessionStatus, isInviter?: boolean): string | undefined {
  switch (status) {
    case SessionStatus.CREATED:
      return undefined; // No badge during invitation crafting phase
    case SessionStatus.INVITED:
      // Only show "invited" badge to the inviter, not the invitee
      return isInviter ? 'invited' : undefined;
    case SessionStatus.ACTIVE:
      return undefined; // No badge needed when active
    case SessionStatus.PAUSED:
      return 'paused';
    case SessionStatus.RESOLVED:
      return 'resolved';
    default:
      return undefined;
  }
}

// ============================================================================
// Component
// ============================================================================

export function UnifiedSessionScreen({
  sessionId,
  onNavigateBack,
  onNavigateToInnerThoughts,
  onStageComplete,
}: UnifiedSessionScreenProps) {
  const styles = useStyles();
  const { user, updateUser } = useAuth();
  const { mutate: updateMood } = useUpdateMood();
  const queryClient = useQueryClient();

  // Real-time presence tracking


  const {
    // Loading
    isLoading,
    isFetchingInitialMessage,

    // Session context
    session,
    currentStage,
    partnerName,
    partnerProgress,
    myProgress,
    milestones,

    // Messages
    messages,
    inlineCards,
    isSending,
    isSigningCompact,
    isConfirmingFeelHeard,
    fetchMoreMessages,
    hasMoreMessages,
    isFetchingMoreMessages,

    // Unread tracking
    lastSeenChatItemIdForSeparator,

    // Overlay state
    activeOverlay,

    // Local state
    barometerValue,
    pendingConfirmation,

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
    liveProposedEmpathyStatement,
    setLiveProposedEmpathyStatement,
    aiRecommendsReadyToShare,
    setAiRecommendsReadyToShare,
    allNeedsConfirmed,
    commonGround,
    strategyPhase,
    strategies,
    overlappingStrategies,
    agreements,
    isGenerating,
    isSharingEmpathy,
    waitingStatus,

    // Memory suggestion
    memorySuggestion,
    setMemorySuggestion,
    clearMemorySuggestion,

    // Feel heard confirmation
    showFeelHeardConfirmation,
    setAiRecommendsFeelHeardCheck,

    // Actions
    sendMessage,
    openOverlay,
    closeOverlay,
    dismissCard,

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
    handleRequestMoreStrategies,
    handleMarkReadyToRank,
    handleSubmitRankings,
    handleConfirmAgreement,
    handleResolveSession,
    handleRespondToShareOffer,

    // Reconciler
    empathyStatusData,
    shareOfferData,

    // Utility actions
    clearMirrorIntervention,
    showCooling,
    setPendingConfirmation,
  } = useUnifiedSession(sessionId);

  // AI message handler for fire-and-forget pattern
  const { addAIMessage, handleAIMessageError } = useAIMessageHandler();

  // User-level events (memory suggestions are now sent to specific user, not session)
  useUserSessionUpdates({
    onMemorySuggestion: (suggestion) => {
      // Only show memory suggestions for the current session
      if (suggestion.sessionId === sessionId) {
        console.log('[UnifiedSessionScreen] Received memory suggestion:', suggestion);
        setMemorySuggestion(suggestion as MemorySuggestion);
      }
    },
  });

  // Real-time presence and event tracking
  const { partnerOnline, connectionStatus, reconnect: reconnectRealtime } = useRealtime({
    sessionId,
    enablePresence: true,
    onSessionEvent: (event, data) => {
      console.log('[UnifiedSessionScreen] Received realtime event:', event);

      // Handle reconciler events - invalidate caches to trigger refetch
      if (event === 'empathy.share_suggestion') {
        // Subject received a share suggestion - refetch share offer data
        console.log('[UnifiedSessionScreen] Share suggestion received, invalidating shareOffer cache');
        queryClient.invalidateQueries({ queryKey: stageKeys.shareOffer(sessionId) });
        queryClient.invalidateQueries({ queryKey: stageKeys.empathyStatus(sessionId) });
      }

      if (event === 'empathy.context_shared') {
        // Guesser received shared context - refetch empathy status and messages
        console.log('[UnifiedSessionScreen] Context shared, invalidating empathy and message caches');
        queryClient.invalidateQueries({ queryKey: stageKeys.empathyStatus(sessionId) });
        queryClient.invalidateQueries({ queryKey: stageKeys.shareOffer(sessionId) });
        // Invalidate infinite messages query so new SHARED_CONTEXT message appears
        queryClient.invalidateQueries({ queryKey: messageKeys.infinite(sessionId) });
      }

      if (event === 'partner.stage_completed') {
        // Partner completed a stage - refetch status
        console.log('[UnifiedSessionScreen] Partner completed stage, invalidating status caches');
        queryClient.invalidateQueries({ queryKey: stageKeys.empathyStatus(sessionId) });
        queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
      }
    },
    // Fire-and-forget pattern: AI responses arrive via Ably
    onAIResponse: (payload) => {
      console.log('[UnifiedSessionScreen] AI response received via Ably:', payload.message?.id);
      // Clear waiting state - AI response has arrived, hide ghost dots
      setWaitingForAIResponse(false);
      // Add AI message to the cache
      addAIMessage(sessionId, payload.message);
      // Handle additional metadata from payload (same as HTTP onSuccess handler)
      // NOTE: We set state immediately here, but UI elements check !isTypewriterAnimating
      // before showing, so they will slide up AFTER the message finishes typewriter animating
      // Update feel-heard check recommendation from AI
      // Only set to true - once AI recommends feel-heard check, keep it sticky
      // until user confirms or dismisses (prevents flashing card on/off)
      if (payload.offerFeelHeardCheck === true) {
        setAiRecommendsFeelHeardCheck(true);
      }
      // Update ready-to-share recommendation from AI (Stage 2)
      // Only set to true - once AI recommends ready-to-share, keep it sticky
      if (payload.offerReadyToShare === true) {
        setAiRecommendsReadyToShare(true);
      }
      // Capture live invitation message from AI (for refinement flow)
      if (payload.invitationMessage !== undefined) {
        setLiveInvitationMessage(payload.invitationMessage);
      }
      // Capture AI-proposed empathy statement (Stage 2)
      // Save to database immediately so it persists across reloads
      if (payload.proposedEmpathyStatement !== undefined && payload.proposedEmpathyStatement !== null) {
        setLiveProposedEmpathyStatement(payload.proposedEmpathyStatement);
        // Save to database with readyToShare: false (user hasn't confirmed yet)
        handleSaveEmpathyDraft(payload.proposedEmpathyStatement, false);
      }
      // Note: memorySuggestion is handled via onSessionEvent('memory.suggested'), not here
    },
    onAIError: (payload) => {
      console.error('[UnifiedSessionScreen] AI error received via Ably:', payload.error);
      // Clear waiting state - even on error, stop showing ghost dots
      setWaitingForAIResponse(false);
      handleAIMessageError(sessionId, payload.userMessageId, payload.error, payload.canRetry);
      // TODO: Show error toast or UI indicator
    },
  });

  // -------------------------------------------------------------------------
  // Analytics-wrapped action handlers
  // -------------------------------------------------------------------------
  const stageStartTimeRef = useRef<number | null>(null);
  const lastTrackedStageRef = useRef<Stage | null>(null);

  // Track stage changes
  useEffect(() => {
    if (!currentStage || currentStage === lastTrackedStageRef.current) return;

    // Track stage completion for previous stage
    if (lastTrackedStageRef.current !== null && stageStartTimeRef.current) {
      const duration = Math.floor((Date.now() - stageStartTimeRef.current) / 1000);
      trackStageCompleted(sessionId, Stage[lastTrackedStageRef.current], duration);
    }

    // Track new stage start
    trackStageStarted(sessionId, Stage[currentStage], lastTrackedStageRef.current !== null ? Stage[lastTrackedStageRef.current] : undefined);
    stageStartTimeRef.current = Date.now();
    lastTrackedStageRef.current = currentStage;
  }, [currentStage, sessionId]);

  // Track common ground when found (commonGround is an array of shared needs)
  useEffect(() => {
    if (commonGround && commonGround.length > 0) {
      trackCommonGroundFound(sessionId, commonGround.length);
    }
  }, [commonGround?.length, sessionId]);

  // Wrapped sendMessage with tracking
  const sendMessageWithTracking = useCallback((message: string) => {
    trackMessageSent(sessionId, message.length);
    // Fire-and-forget: Set waiting state for ghost dots until AI response arrives via Ably
    setWaitingForAIResponse(true);
    sendMessage(message);
  }, [sessionId, sendMessage]);

  // -------------------------------------------------------------------------
  // Fire-and-Forget: Track waiting for AI response via Ably
  // -------------------------------------------------------------------------
  // This keeps the ghost dots showing until AI response arrives
  const [waitingForAIResponse, setWaitingForAIResponse] = useState(false);
  const waitingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-clear waiting state after 30 seconds as a fallback
  // This prevents dots from getting stuck if Ably message never arrives
  useEffect(() => {
    if (waitingForAIResponse) {
      // Clear any existing timeout
      if (waitingTimeoutRef.current) {
        clearTimeout(waitingTimeoutRef.current);
      }
      // Set timeout to auto-clear waiting state and attempt reconnect
      waitingTimeoutRef.current = setTimeout(() => {
        console.warn('[UnifiedSessionScreen] AI response timeout - clearing waiting state after 30s');
        setWaitingForAIResponse(false);
        // Trigger reconnect in case Ably connection is broken (common during live reload)
        console.log('[UnifiedSessionScreen] Attempting realtime reconnect after timeout');
        reconnectRealtime();
      }, 30000);
    } else {
      // Clear timeout when not waiting
      if (waitingTimeoutRef.current) {
        clearTimeout(waitingTimeoutRef.current);
        waitingTimeoutRef.current = null;
      }
    }

    return () => {
      if (waitingTimeoutRef.current) {
        clearTimeout(waitingTimeoutRef.current);
      }
    };
  }, [waitingForAIResponse, reconnectRealtime]);

  // Watch messages - if we're waiting and last message is AI, clear waiting state
  // This handles cases where AI response arrived but Ably callback didn't fire
  // (e.g., app was in background and data was fetched via React Query)
  useEffect(() => {
    if (!waitingForAIResponse || messages.length === 0) return;

    const lastMessage = messages[messages.length - 1];
    // If the last message is from AI (not USER or SYSTEM), the response has arrived
    if (lastMessage && lastMessage.role !== MessageRole.USER && lastMessage.role !== MessageRole.SYSTEM) {
      console.log('[UnifiedSessionScreen] AI response detected in messages - clearing waiting state');
      setWaitingForAIResponse(false);
    }
  }, [waitingForAIResponse, messages]);

  // -------------------------------------------------------------------------
  // Local State for Refine Invitation Drawer
  // -------------------------------------------------------------------------
  const [showRefineDrawer, setShowRefineDrawer] = useState(false);

  // Track when user is refining the invitation (after initial send, from Stage 1)
  // FIX: Initialize based on data so it persists on reload/navigation
  // If we have a message but it's not confirmed, and we are already in INVITED state, we are refining.
  const [isRefiningInvitation, setIsRefiningInvitation] = useState(() => {
    return session?.status === SessionStatus.INVITED && invitationMessage && !invitationConfirmed;
  });

  // Update local state if data changes (e.g. after fetch completes)
  useEffect(() => {
    if (session?.status === SessionStatus.INVITED && invitationMessage && !invitationConfirmed) {
      setIsRefiningInvitation(true);
    }
  }, [session?.status, invitationMessage, invitationConfirmed]);

  // -------------------------------------------------------------------------
  // Local State for View Empathy Statement Drawer (Stage 2)
  // -------------------------------------------------------------------------
  const [showEmpathyDrawer, setShowEmpathyDrawer] = useState(false);
  const [showShareConfirm, setShowShareConfirm] = useState(false);
  const [showShareSuggestionDrawer, setShowShareSuggestionDrawer] = useState(false);

  // Local latch to prevent panel flashing during server refetches
  // Once user clicks Share, this stays true even if server data temporarily reverts
  const [hasSharedEmpathyLocal, setHasSharedEmpathyLocal] = useState(false);

  // Local latch for share suggestion - once user responds, hide panel immediately
  // This prevents the "Help X understand" button from flashing during API call
  const [hasRespondedToShareOfferLocal, setHasRespondedToShareOfferLocal] = useState(false);

  // -------------------------------------------------------------------------
  // Local State for Session Entry Mood Check
  // -------------------------------------------------------------------------
  // Tracks if user has completed the mood check for this session entry
  // Resets each time the component mounts (i.e., each time user navigates to session)
  const [hasCompletedMoodCheck, setHasCompletedMoodCheck] = useState(false);

  // -------------------------------------------------------------------------
  // Track Invitation Confirmation for Indicator
  // -------------------------------------------------------------------------

  // Track when the user taps "I've sent it" - for optimistic UI during API call
  const [isConfirmingInvitation, setIsConfirmingInvitation] = useState(false);
  // Store optimistic timestamp for when confirmation is in progress
  const [optimisticConfirmTimestamp, setOptimisticConfirmTimestamp] = useState<string | null>(null);

  // Store optimistic timestamp for feel-heard confirmation
  const [optimisticFeelHeardTimestamp, setOptimisticFeelHeardTimestamp] = useState<string | null>(null);

  // Store optimistic timestamp for compact signing (for "Compact Signed" indicator)
  const [optimisticCompactSignedTimestamp, setOptimisticCompactSignedTimestamp] = useState<string | null>(null);

  // Track if compact was just signed in this session (for typewriter animation)
  // This is set when user signs compact and reset after first message animates
  const [justSignedCompact, setJustSignedCompact] = useState(false);

  // -------------------------------------------------------------------------
  // Track Typewriter Animation State
  // -------------------------------------------------------------------------
  // Used to delay showing inline cards until typewriter completes
  const [isTypewriterAnimating, setIsTypewriterAnimating] = useState(false);

  // -------------------------------------------------------------------------
  // Derived Chat UI State
  // -------------------------------------------------------------------------
  // Pure derivation of all UI visibility flags from session state.
  // This replaces scattered useMemo computations with a centralized,
  // testable pure function.
  const isInviter = invitation?.isInviter ?? true;
  const {
    shouldShowWaitingBanner,
    shouldHideInput: derivedShouldHideInput,
    shouldShowInnerThoughts: derivedShouldShowInnerThoughts,
    isInOnboardingUnsigned,
    panels: {
      showInvitationPanel: shouldShowInvitationPanel,
      showEmpathyPanel: shouldShowEmpathyPanel,
      showFeelHeardPanel: shouldShowFeelHeard,
      showShareSuggestionPanel: shouldShowShareSuggestion,
    },
  } = useChatUIState({
    partnerName: partnerName || 'Partner',
    sessionStatus: session?.status,
    isInviter,
    isLoading,
    loadingCompact,
    isTypewriterAnimating,
    myProgress,
    partnerProgress,
    compactMySigned: compactData?.mySigned,
    hasInvitationMessage: !!invitationMessage,
    invitationConfirmed: invitationConfirmed || localInvitationConfirmed,
    isConfirmingInvitation,
    localInvitationConfirmed,
    showFeelHeardConfirmation,
    feelHeardConfirmedAt: milestones?.feelHeardConfirmedAt,
    isConfirmingFeelHeard,
    empathyStatusData: empathyStatusData ? {
      analyzing: empathyStatusData.analyzing,
      awaitingSharing: empathyStatusData.awaitingSharing,
      hasNewSharedContext: empathyStatusData.hasNewSharedContext,
      myAttempt: empathyStatusData.myAttempt ? {
        status: empathyStatusData.myAttempt.status,
        content: empathyStatusData.myAttempt.content,
      } : undefined,
      messageCountSinceSharedContext: empathyStatusData.messageCountSinceSharedContext,
    } : undefined,
    empathyDraftData: empathyDraftData ? {
      alreadyConsented: empathyDraftData.alreadyConsented,
      draft: empathyDraftData.draft ? {
        content: empathyDraftData.draft.content,
      } : undefined,
    } : undefined,
    hasPartnerEmpathy: !!empathyStatusData?.partnerAttempt,
    hasLiveProposedEmpathyStatement: !!liveProposedEmpathyStatement,
    hasSharedEmpathyLocal,
    shareOfferData: shareOfferData ?? undefined,
    hasRespondedToShareOfferLocal,
    allNeedsConfirmed,
    commonGroundCount: commonGround?.length ?? 0,
    strategyPhase,
    overlappingStrategiesCount: overlappingStrategies?.length ?? 0,
  });

  // -------------------------------------------------------------------------
  // Preserve Feel Heard State Across Re-renders
  // -------------------------------------------------------------------------
  // Once feel-heard is confirmed, keep showing the indicator even during re-renders
  // This prevents the indicator from flashing away when new messages arrive
  // FIX: Initialize the ref based on optimistic state too, not just milestones.
  // This ensures that the moment we click the button, this ref becomes true.
  const hasEverConfirmedFeelHeard = useRef(false);

  // 1. Latch if we have server data
  if (milestones?.feelHeardConfirmedAt && !hasEverConfirmedFeelHeard.current) {
    hasEverConfirmedFeelHeard.current = true;
  }

  // 2. Latch if we are currently confirming (optimistic start)
  if (isConfirmingFeelHeard && !hasEverConfirmedFeelHeard.current) {
    hasEverConfirmedFeelHeard.current = true;
  }

  // 3. Latch if we have an optimistic timestamp set
  if (optimisticFeelHeardTimestamp && !hasEverConfirmedFeelHeard.current) {
    hasEverConfirmedFeelHeard.current = true;
  }

  // Once compact is signed, keep showing the indicator even during re-renders
  const hasEverSignedCompact = useRef(false);

  // Update ref when compact is signed
  if (compactData?.mySigned && !hasEverSignedCompact.current) {
    hasEverSignedCompact.current = true;
  }

  // Animation for the invitation panel slide-up
  const invitationPanelAnim = useRef(new Animated.Value(0)).current;

  // Animation for the empathy statement review panel slide-up
  const empathyPanelAnim = useRef(new Animated.Value(0)).current;

  // Animation for the feel heard confirmation panel slide-up
  const feelHeardAnim = useRef(new Animated.Value(0)).current;

  // Animation for the share suggestion panel slide-up
  const shareSuggestionAnim = useRef(new Animated.Value(0)).current;

  // Animation for the waiting banner slide-up
  const waitingBannerAnim = useRef(new Animated.Value(0)).current;

  // -------------------------------------------------------------------------
  // Panel Visibility (derived from useChatUIState above)
  // -------------------------------------------------------------------------
  // Note: The actual visibility booleans are now computed in useChatUIState.
  // The variables shouldShowInvitationPanel, shouldShowEmpathyPanel,
  // shouldShowFeelHeard, shouldShowShareSuggestion, and shouldShowWaitingBanner
  // are destructured from the hook at the top of this component.

  // Whether user is in "refining" mode (received shared context from partner)
  const isRefiningEmpathy = !!empathyStatusData?.hasNewSharedContext;

  // Animate invitation panel when shouldShowInvitationPanel changes
  useEffect(() => {
    Animated.spring(invitationPanelAnim, {
      toValue: shouldShowInvitationPanel ? 1 : 0,
      useNativeDriver: false,
      tension: 40,
      friction: 9,
    }).start();
  }, [shouldShowInvitationPanel, invitationPanelAnim]);

  // Animate empathy panel - close when sharing, otherwise follow shouldShowEmpathyPanel
  // This prevents layout jumps by animating closed instead of unmounting
  useEffect(() => {
    // If we are sharing, force it to close (0). Otherwise follow the logic (1 or 0).
    const targetValue = isSharingEmpathy ? 0 : (shouldShowEmpathyPanel ? 1 : 0);

    Animated.spring(empathyPanelAnim, {
      toValue: targetValue,
      useNativeDriver: false, // Required for layout animations like maxHeight
      tension: 40,
      friction: 9,
    }).start();
  }, [shouldShowEmpathyPanel, isSharingEmpathy, empathyPanelAnim]);

  // Animate feel heard panel
  useEffect(() => {
    Animated.spring(feelHeardAnim, {
      toValue: shouldShowFeelHeard ? 1 : 0,
      useNativeDriver: false,
      tension: 40,
      friction: 9,
    }).start();
  }, [shouldShowFeelHeard, feelHeardAnim]);

  // Animate share suggestion panel
  useEffect(() => {
    Animated.spring(shareSuggestionAnim, {
      toValue: shouldShowShareSuggestion ? 1 : 0,
      useNativeDriver: false,
      tension: 40,
      friction: 9,
    }).start();
  }, [shouldShowShareSuggestion, shareSuggestionAnim]);

  // Animate waiting banner
  useEffect(() => {
    Animated.spring(waitingBannerAnim, {
      toValue: shouldShowWaitingBanner ? 1 : 0,
      useNativeDriver: false,
      tension: 40,
      friction: 9,
    }).start();
  }, [shouldShowWaitingBanner, waitingBannerAnim]);

  // Clear optimistic state when API confirms
  useEffect(() => {
    if (invitationConfirmed) {
      if (isConfirmingInvitation) {
        setIsConfirmingInvitation(false);
      }
      if (optimisticConfirmTimestamp) {
        setOptimisticConfirmTimestamp(null);
      }
    }
  }, [invitationConfirmed, isConfirmingInvitation, optimisticConfirmTimestamp]);

  // If we've left the invitation phase (stage advanced) but optimistic loading
  // is still set, clear it so the typing indicator/input re-enable correctly.
  useEffect(() => {
    if (!isInvitationPhase && isConfirmingInvitation) {
      setIsConfirmingInvitation(false);
      setOptimisticConfirmTimestamp(null);
    }
  }, [isInvitationPhase, isConfirmingInvitation]);

  // Clear feel-heard optimistic state when API confirms
  // FIX: Do NOT clear the optimistic timestamp if the server data hasn't arrived yet.
  // Only clear it if milestones.feelHeardConfirmedAt is TRUTHY.
  useEffect(() => {
    if (milestones?.feelHeardConfirmedAt && optimisticFeelHeardTimestamp) {
      setOptimisticFeelHeardTimestamp(null);
    }
  }, [milestones?.feelHeardConfirmedAt, optimisticFeelHeardTimestamp]);

  // Clear compact-signed optimistic state when API confirms
  useEffect(() => {
    if (compactData?.mySigned && optimisticCompactSignedTimestamp) {
      setOptimisticCompactSignedTimestamp(null);
    }
  }, [compactData?.mySigned, optimisticCompactSignedTimestamp]);

  // Build indicators array
  // Use messageConfirmedAt from API for reliable positioning across reloads
  const indicators = useMemo((): ChatIndicatorItem[] => {
    const items: ChatIndicatorItem[] = [];

    // For inviters: Show "Invitation Sent" when they confirmed the invitation message
    // Use the API timestamp for reliable positioning, or optimistic timestamp during confirmation
    const confirmedAt = invitation?.messageConfirmedAt ?? optimisticConfirmTimestamp;
    // Note: isInviter is already calculated above at component level

    if (isInviter && (invitationConfirmed || isConfirmingInvitation || localInvitationConfirmed) && confirmedAt) {
      items.push({
        type: 'indicator',
        indicatorType: 'invitation-sent',
        id: 'invitation-sent',
        timestamp: confirmedAt,
      });
    }

    // For invitees: Show "Accepted Invitation" when they joined the session
    // Use acceptedAt timestamp from the invitation for positioning
    if (!isInviter && invitation?.acceptedAt) {
      items.push({
        type: 'indicator',
        indicatorType: 'invitation-accepted',
        id: 'invitation-accepted',
        timestamp: invitation.acceptedAt,
      });
    }

    // Show "Compact Signed" indicator when user signs the compact
    // Use optimistic timestamp during signing, API signedAt timestamp, or session creation as fallback
    // Fallback ensures indicator shows even for older sessions without signedAt stored
    const shouldShowCompactSigned = hasEverSignedCompact.current || compactData?.mySigned || isSigningCompact;
    const compactSignedAt = compactData?.mySignedAt
      ?? optimisticCompactSignedTimestamp
      ?? (shouldShowCompactSigned ? session?.createdAt : null);
    if (shouldShowCompactSigned && compactSignedAt) {
      items.push({
        type: 'indicator',
        indicatorType: 'compact-signed',
        id: 'compact-signed',
        timestamp: compactSignedAt,
      });
    }

    // Show "Felt Heard" indicator when user confirms they feel heard
    // FIX: Simplified logic. If the REF is true, we show it. 
    // We prioritize the Server Date, fallback to Optimistic Date, fallback to Now.

    // Check if we should show it based on Ref OR Server Data OR Optimistic State
    const shouldShowFeelHeard =
      hasEverConfirmedFeelHeard.current ||
      milestones?.feelHeardConfirmedAt ||
      optimisticFeelHeardTimestamp ||
      isConfirmingFeelHeard;

    // Determine the timestamp to display
    const feelHeardAt =
      milestones?.feelHeardConfirmedAt ??
      optimisticFeelHeardTimestamp ??
      (shouldShowFeelHeard ? new Date().toISOString() : null);

    if (shouldShowFeelHeard && feelHeardAt) {
      items.push({
        type: 'indicator',
        indicatorType: 'feel-heard',
        id: 'feel-heard',
        timestamp: feelHeardAt,
      });
    }
    return items;
  }, [invitationConfirmed, isConfirmingInvitation, localInvitationConfirmed, invitation?.messageConfirmedAt, invitation?.acceptedAt, isInviter, optimisticConfirmTimestamp, compactData?.mySigned, compactData?.mySignedAt, isSigningCompact, optimisticCompactSignedTimestamp, session?.createdAt, milestones?.feelHeardConfirmedAt, isConfirmingFeelHeard, optimisticFeelHeardTimestamp]);

  // -------------------------------------------------------------------------
  // Effective Stage (accounts for compact signed but stage not yet updated)
  // -------------------------------------------------------------------------
  const effectiveStage = useMemo(() => {
    if (currentStage === Stage.ONBOARDING && compactData?.mySigned) {
      return Stage.WITNESS;
    }
    return currentStage;
  }, [currentStage, compactData?.mySigned]);

  // -------------------------------------------------------------------------
  // Inner Thoughts Button Visibility (derived from useChatUIState above)
  // -------------------------------------------------------------------------
  // The base visibility is derived from useChatUIState (derivedShouldShowInnerThoughts).
  // We combine it with whether the navigation callback is available.
  const shouldShowInnerThoughts = !!onNavigateToInnerThoughts && derivedShouldShowInnerThoughts;

  // -------------------------------------------------------------------------
  // Prepare Messages for Display
  // -------------------------------------------------------------------------
  const displayMessages = useMemo((): ChatMessage[] => {
    // Enrich messages with delivery status for shared content
    return messages.map((message) => {
      // For EMPATHY_STATEMENT messages (user's empathy statement to partner),
      // attach delivery status from empathyStatusData
      if (
        message.role === MessageRole.EMPATHY_STATEMENT &&
        empathyStatusData?.myAttempt?.deliveryStatus
      ) {
        return {
          ...message,
          sharedContentDeliveryStatus: empathyStatusData.myAttempt.deliveryStatus,
        };
      }
      // For SHARED_CONTEXT messages (shared context from subject),
      // attach delivery status from empathyStatusData
      if (
        message.role === MessageRole.SHARED_CONTEXT &&
        empathyStatusData?.sharedContentDeliveryStatus
      ) {
        return {
          ...message,
          sharedContentDeliveryStatus: empathyStatusData.sharedContentDeliveryStatus,
        };
      }
      return message;
    });
  }, [messages, empathyStatusData?.myAttempt?.deliveryStatus, empathyStatusData?.sharedContentDeliveryStatus]);

  // -------------------------------------------------------------------------
  // Render Inline Card
  // -------------------------------------------------------------------------
  const renderInlineCard = useCallback(
    (card: InlineChatCard) => {
      switch (card.type) {
        // Note: 'waiting-status' case removed - we no longer show "waiting for partner" messages

        // Note: feel-heard-confirmation case removed - now shown as panel above chat input

        case 'cooling-suggestion':
          // Show the support options modal instead of inline card
          // This is handled by the overlay system - just render nothing here
          // The modal is triggered via openOverlay('support-options')
          return null;

        case 'mirror-intervention':
          return (
            <View style={styles.interventionCard} key={card.id}>
              <Text style={styles.interventionTitle}>Pause for a moment</Text>
              <Text style={styles.interventionMessage}>{card.props.message as string}</Text>
              <Text style={styles.interventionPatterns}>
                Detected: {(card.props.patterns as string[]).join(', ')}
              </Text>
              <View style={styles.interventionButtons}>
                <TouchableOpacity
                  style={styles.rephraseButton}
                  onPress={clearMirrorIntervention}
                >
                  <Text style={styles.rephraseButtonText}>Rephrase</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.interventionContinueButton}
                  onPress={() => {
                    clearMirrorIntervention();
                    // Send pending message anyway
                  }}
                >
                  <Text style={styles.interventionContinueButtonText}>Continue anyway</Text>
                </TouchableOpacity>
              </View>
            </View>
          );

        // Note: ready-to-share-confirmation case removed - now shown as panel above chat input
        // Note: empathy-draft-preview case removed - users access empathy statement via the overlay drawer

        case 'accuracy-feedback':
          return (
            <View style={styles.inlineCard} key={card.id}>
              <Text style={styles.cardTitle}>
                {partnerName}'s Understanding of You
              </Text>
              <EmpathyAttemptCard
                attempt={card.props.content as string}
                isPartner
                testID="partner-empathy-attempt"
              />
              <AccuracyFeedback
                onAccurate={() => handleValidatePartnerEmpathy(true)}
                onPartiallyAccurate={() =>
                  handleValidatePartnerEmpathy(false, 'Some parts are accurate')
                }
                onInaccurate={() =>
                  handleValidatePartnerEmpathy(false, 'This does not capture my perspective')
                }
                testID="accuracy-feedback"
              />
            </View>
          );

        case 'needs-summary':
          return (
            <View style={styles.inlineCard} key={card.id}>
              <Text style={styles.cardTitle}>Your Identified Needs</Text>
              <NeedsSection
                title="What you need most"
                needs={card.props.needs as { id: string; category: string; description: string }[]}
                sharedNeeds={card.props.confirmedIds as string[]}
              />
              <View style={styles.confirmationButtons}>
                <TouchableOpacity
                  style={styles.adjustButton}
                  onPress={() => sendMessage('I would like to adjust my identified needs')}
                >
                  <Text style={styles.adjustText}>Adjust these</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.confirmButton}
                  onPress={() => handleConfirmAllNeeds(() => onStageComplete?.(Stage.NEED_MAPPING))}
                >
                  <Text style={styles.confirmText}>Confirm my needs</Text>
                </TouchableOpacity>
              </View>
            </View>
          );

        case 'common-ground-preview':
          return (
            <View style={styles.inlineCard} key={card.id}>
              <CommonGroundCard
                sharedNeeds={card.props.sharedNeeds as { category: string; description: string }[]}
                insight="When we see our shared needs, we remember we're on the same team."
              />
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={() => {
                  openOverlay('needs-side-by-side');
                }}
              >
                <Text style={styles.confirmText}>View Full Comparison</Text>
              </TouchableOpacity>
            </View>
          );

        case 'strategy-pool-preview':
          return (
            <View style={styles.inlineCard} key={card.id}>
              <Text style={styles.cardTitle}>Strategy Pool</Text>
              <Text style={styles.cardSubtitle}>
                {card.props.strategyCount as number} strategies available
              </Text>
              <View style={styles.strategyPreviewButtons}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => openOverlay('strategy-pool')}
                >
                  <Text style={styles.secondaryButtonText}>View All</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={handleMarkReadyToRank}
                >
                  <Text style={styles.primaryButtonText}>Ready to Rank</Text>
                </TouchableOpacity>
              </View>
            </View>
          );

        case 'overlap-preview':
          return (
            <View style={styles.inlineCard} key={card.id}>
              <Text style={styles.cardTitle}>You Both Chose</Text>
              <Text style={styles.overlapDescription}>
                {(card.props.topOverlap as { description: string })?.description}
              </Text>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => openOverlay('overlap-reveal')}
              >
                <Text style={styles.primaryButtonText}>
                  See All {card.props.overlappingCount as number} Matches
                </Text>
              </TouchableOpacity>
            </View>
          );

        case 'agreement-preview':
          return (
            <View style={styles.inlineCard} key={card.id}>
              <Text style={styles.cardTitle}>Your Agreement</Text>
              <Text style={styles.agreementExperiment}>
                {card.props.experiment as string}
              </Text>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => openOverlay('agreement-confirmation')}
              >
                <Text style={styles.primaryButtonText}>Review & Confirm</Text>
              </TouchableOpacity>
            </View>
          );

        // Note: empathy-share-suggestion is now handled via the low-profile panel + drawer pattern
        // instead of an inline card. See shareSuggestionContainer and ShareSuggestionDrawer.

        default:
          return null;
      }
    },
    [
      styles,
      partnerName,
      pendingConfirmation,
      showCooling,
      openOverlay,
      dismissCard,
      handleConfirmFeelHeard,
      handleConfirmReadyToShare,
      handleDismissReadyToShare,
      handleShareEmpathy,
      handleSaveEmpathyDraft,
      handleValidatePartnerEmpathy,
      handleConfirmAllNeeds,
      handleMarkReadyToRank,
      handleRespondToShareOffer,
      clearMirrorIntervention,
      sendMessage,
      onStageComplete,
      onNavigateBack,
    ]
  );

  // -------------------------------------------------------------------------
  // Invitation URL for sharing (must be before early returns)
  // -------------------------------------------------------------------------
  const invitationUrl = useMemo(() => {
    if (invitation?.id) {
      return createInvitationLink(invitation.id);
    }
    return '';
  }, [invitation?.id]);

  // -------------------------------------------------------------------------
  // Onboarding State (derived from useChatUIState above)
  // -------------------------------------------------------------------------
  // isInOnboardingUnsigned is now derived from useChatUIState hook.

  // -------------------------------------------------------------------------
  // Session Entry Mood Check - shown on session entry
  // -------------------------------------------------------------------------
  // Asks user "How are you feeling right now?" to set accurate barometer value.
  // Only shows once per session entry (resets when navigating away and back).
  // Skipped if user is currently in an exercise overlay (will set intensity after).
  // Skipped while viewing the unsigned compact (would disrupt the signing flow).
  // NOTE: This must be before early returns to maintain hook order
  const shouldShowMoodCheck = useMemo(() => {
    // Don't show if still loading
    if (isLoading) return false;
    // Don't show if still loading compact data
    if (loadingCompact) return false;
    // Don't show while viewing the unsigned compact (would disrupt the flow)
    // This allows mood check during invitation phase and after compact is signed
    if (isInOnboardingUnsigned) return false;
    // Don't show if already completed mood check this session entry
    if (hasCompletedMoodCheck) return false;
    // Don't show if currently in an exercise overlay (user will set intensity after)
    if (activeOverlay) return false;

    // Show mood check for all other cases
    return true;
  }, [isLoading, loadingCompact, isInOnboardingUnsigned, hasCompletedMoodCheck, activeOverlay]);

  // -------------------------------------------------------------------------
  // Memoized Empty State Element (prevents typewriter restart on re-render)
  // -------------------------------------------------------------------------
  // Use useMemo to create a stable element reference, not a render function
  // Adapt intro text for invitees who accepted the invitation
  const isInvitee = invitation && !invitation.isInviter;
  const compactEmptyStateElement = useMemo(() => {
    return <CompactChatItem testID="inline-compact" isAfterInvitationAcceptance={isInvitee} />;
  }, [isInvitee]);

  // -------------------------------------------------------------------------
  // Render Overlays
  // -------------------------------------------------------------------------
  const renderOverlay = useCallback(() => {
    switch (activeOverlay) {
      case 'support-options':
        return (
          <SupportOptionsModal
            visible={true}
            onSelectOption={(option: SupportOption) => {
              switch (option) {
                case 'keep-sharing':
                  closeOverlay();
                  showCooling(false);
                  break;
                case 'breathing':
                  openOverlay('breathing-exercise');
                  break;
                case 'grounding':
                  openOverlay('grounding-exercise');
                  break;
                case 'body-scan':
                  openOverlay('body-scan-exercise');
                  break;
                case 'break':
                  closeOverlay();
                  showCooling(false);
                  onNavigateBack?.();
                  break;
              }
            }}
            onClose={() => {
              closeOverlay();
              showCooling(false);
            }}
          />
        );

      case 'breathing-exercise':
        return (
          <BreathingExercise
            visible={true}
            intensityBefore={barometerValue}
            onComplete={(intensityAfter) => {
              handleBarometerChange(intensityAfter);
              closeOverlay();
              showCooling(false);
            }}
            onClose={closeOverlay}
          />
        );

      case 'grounding-exercise':
        return (
          <GroundingExercise
            visible={true}
            intensityBefore={barometerValue}
            onComplete={(intensityAfter) => {
              handleBarometerChange(intensityAfter);
              closeOverlay();
              showCooling(false);
            }}
            onClose={closeOverlay}
          />
        );

      case 'body-scan-exercise':
        return (
          <BodyScanExercise
            visible={true}
            intensityBefore={barometerValue}
            onComplete={(intensityAfter) => {
              handleBarometerChange(intensityAfter);
              closeOverlay();
              showCooling(false);
            }}
            onClose={closeOverlay}
          />
        );

      case 'strategy-pool':
        return (
          <View style={styles.overlayContainer}>
            <StrategyPool
              strategies={strategies.map((s) => ({
                id: s.id,
                description: s.description,
                duration: s.duration || undefined,
              }))}
              onRequestMore={handleRequestMoreStrategies}
              onReady={() => {
                handleMarkReadyToRank();
                closeOverlay();
              }}
              isGenerating={isGenerating}
            />
            <TouchableOpacity style={styles.closeOverlay} onPress={closeOverlay}>
              <Text style={styles.closeOverlayText}>Close</Text>
            </TouchableOpacity>
          </View>
        );

      case 'strategy-ranking':
        return (
          <View style={styles.overlayContainer}>
            <StrategyRanking
              strategies={strategies.map((s) => ({
                id: s.id,
                description: s.description,
                duration: s.duration || undefined,
              }))}
              onSubmit={(rankedIds) => {
                handleSubmitRankings(rankedIds);
                closeOverlay();
              }}
            />
          </View>
        );

      case 'overlap-reveal':
        return (
          <View style={styles.overlayContainer}>
            <OverlapReveal
              overlapping={overlappingStrategies.map((s) => ({
                id: s.id,
                description: s.description,
                duration: s.duration || undefined,
              }))}
              uniqueToMe={[]}
              uniqueToPartner={[]}
            />
            <TouchableOpacity style={styles.closeOverlay} onPress={closeOverlay}>
              <Text style={styles.closeOverlayText}>Continue</Text>
            </TouchableOpacity>
          </View>
        );

      case 'agreement-confirmation':
        if (agreements.length === 0) return null;
        return (
          <View style={styles.overlayContainer}>
            <AgreementCard
              agreement={{
                experiment: agreements[0].description,
                duration: agreements[0].duration || 'To be determined',
                successMeasure: agreements[0].measureOfSuccess || 'To be defined together',
                checkInDate: agreements[0].followUpDate || undefined,
              }}
              onConfirm={() => {
                handleConfirmAgreement(agreements[0].id, () => {
                  // Track session resolved
                  trackSessionResolved(sessionId, 'agreement');
                  handleResolveSession(() => onStageComplete?.(Stage.STRATEGIC_REPAIR));
                });
                closeOverlay();
              }}
            />
          </View>
        );

      // curiosity-compact is now handled as a separate overlay using CuriosityCompactOverlay

      default:
        return null;
    }
  }, [
    activeOverlay,
    barometerValue,
    strategies,
    overlappingStrategies,
    agreements,
    sessionId,
    isGenerating,
    styles,
    handleBarometerChange,
    handleRequestMoreStrategies,
    handleMarkReadyToRank,
    handleSubmitRankings,
    handleConfirmAgreement,
    handleResolveSession,
    handleSignCompact,
    closeOverlay,
    openOverlay,
    showCooling,
    onNavigateBack,
    onStageComplete,
  ]);

  // -------------------------------------------------------------------------
  // Loading State
  // -------------------------------------------------------------------------
  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={styles.accentColor.color} />
        <Text style={styles.loadingText}>Loading session...</Text>
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // Session Entry Mood Check - Full Screen (before session content renders)
  // -------------------------------------------------------------------------
  // Shown as a full-screen view (not modal overlay) to prevent flash of
  // session content behind it. Checks how user is feeling before they
  // see any chat content.
  if (shouldShowMoodCheck) {
    return (
      <SessionEntryMoodCheck
        visible={true}
        fullScreen={true}
        initialValue={user?.lastMoodIntensity ?? 4}
        onComplete={(intensity) => {
          // Save to user profile (persists across sessions)
          updateMood({ intensity });
          // Update local user state immediately so next session uses it
          updateUser({ lastMoodIntensity: intensity });
          // Also update session-specific barometer
          handleBarometerChange(intensity);
          setHasCompletedMoodCheck(true);
        }}
      />
    );
  }

  // -------------------------------------------------------------------------
  // Strategy Ranking Phase - Full Screen Overlay
  // -------------------------------------------------------------------------
  if (currentStage === Stage.STRATEGIC_REPAIR && strategyPhase === StrategyPhase.RANKING) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <SessionChatHeader
          partnerName={partnerName}
          partnerOnline={partnerOnline}
          connectionStatus={connectionStatus}
          briefStatus={getBriefStatus(session?.status, invitation?.isInviter)}
          onBackPress={onNavigateBack}
          onInnerThoughtsPress={onNavigateToInnerThoughts ? () => onNavigateToInnerThoughts() : undefined}
          showInnerThoughtsButton={shouldShowInnerThoughts}
          testID="session-chat-header"
        />
        <StrategyRanking
          strategies={strategies.map((s) => ({
            id: s.id,
            description: s.description,
            duration: s.duration || undefined,
          }))}
          onSubmit={handleSubmitRankings}
        />
      </SafeAreaView>
    );
  }

  // -------------------------------------------------------------------------
  // Main Chat Interface
  // -------------------------------------------------------------------------
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <SessionChatHeader
        partnerName={partnerName}
        partnerOnline={partnerOnline}
        connectionStatus={connectionStatus}
        briefStatus={getBriefStatus(session?.status, invitation?.isInviter)}
        hideOnlineStatus={isInvitationPhase}
        onBackPress={onNavigateBack}
        onInnerThoughtsPress={onNavigateToInnerThoughts ? () => onNavigateToInnerThoughts() : undefined}
        showInnerThoughtsButton={shouldShowInnerThoughts}
        onBriefStatusPress={
          session?.status === SessionStatus.INVITED && invitation?.isInviter
            ? () => setShowRefineDrawer(true)
            : undefined
        }
        testID="session-chat-header"
      />
      <View style={styles.content}>
        <ChatInterface
          messages={displayMessages}
          indicators={indicators}
          onSendMessage={sendMessageWithTracking}
          isLoading={isSending || waitingForAIResponse || isFetchingInitialMessage || isConfirmingInvitation || isConfirmingFeelHeard || isSharingEmpathy}
          showEmotionSlider={!isInOnboardingUnsigned}
          partnerName={partnerName}
          emotionValue={barometerValue}
          onEmotionChange={handleBarometerChange}
          onHighEmotion={(value) => {
            if (value >= 9) {
              openOverlay('support-options');
            }
          }}
          compactEmotionSlider
          onLoadMore={fetchMoreMessages}
          hasMore={hasMoreMessages}
          isLoadingMore={isFetchingMoreMessages}
          onTypewriterStateChange={setIsTypewriterAnimating}
          onTypewriterComplete={() => {
            // Reset justSignedCompact after first message animates
            if (justSignedCompact) {
              setJustSignedCompact(false);
            }
          }}
          // Skip initial history detection if compact was just signed and mood check completed
          // This ensures the first AI message after compact signing gets typewriter animation
          skipInitialHistory={justSignedCompact && hasCompletedMoodCheck}
          // ID of last seen chat item for "new messages" separator
          // Uses captured value from before session was marked viewed, so new messages
          // arriving while viewing don't trigger a separator
          lastSeenChatItemId={lastSeenChatItemIdForSeparator}
          // Show compact as custom empty state during onboarding when not signed
          customEmptyState={
            isInOnboardingUnsigned ? compactEmptyStateElement : undefined
          }
          renderAboveInput={
            // Show compact agreement bar during onboarding when compact not signed
            isInOnboardingUnsigned
              ? () => (
                <CompactAgreementBar
                  onSign={() => {
                    // Set optimistic timestamp for immediate indicator display
                    setOptimisticCompactSignedTimestamp(new Date().toISOString());
                    // Mark that compact was just signed (for typewriter animation after mood check)
                    setJustSignedCompact(true);
                    trackCompactSigned(sessionId, invitation?.isInviter ?? true);
                    handleSignCompact(() => onStageComplete?.(Stage.ONBOARDING));
                  }}
                  isPending={isSigningCompact}
                  testID="compact-agreement-bar"
                />
              )
              // Show feel-heard confirmation panel when AI recommends it
              : shouldShowFeelHeard
                ? () => (
                  <Animated.View
                    style={{
                      opacity: feelHeardAnim,
                      maxHeight: feelHeardAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, 100],
                      }),
                      transform: [{
                        translateY: feelHeardAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [20, 0],
                        }),
                      }],
                      overflow: 'hidden',
                    }}
                    pointerEvents={shouldShowFeelHeard ? 'auto' : 'none'}
                  >
                    <View style={styles.feelHeardContainer}>
                      <FeelHeardConfirmation
                        onConfirm={() => {
                          // Track felt heard response
                          trackFeltHeardResponse(sessionId, 'yes');
                          // Set optimistic timestamp immediately for instant indicator display
                          setOptimisticFeelHeardTimestamp(new Date().toISOString());
                          handleConfirmFeelHeard(() => onStageComplete?.(Stage.WITNESS));
                        }}
                        isPending={isConfirmingFeelHeard}
                      />
                    </View>
                  </Animated.View>
                )
                // Show empathy review panel when empathy statement is ready
                : shouldShowEmpathyPanel
                  ? () => (
                    <Animated.View
                      style={{
                        opacity: empathyPanelAnim,
                        maxHeight: empathyPanelAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, 100],
                        }),
                        transform: [{
                          translateY: empathyPanelAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [20, 0],
                          }),
                        }],
                        overflow: 'hidden',
                      }}
                      pointerEvents={shouldShowEmpathyPanel ? 'auto' : 'none'}
                    >
                      <View style={styles.empathyReviewContainer}>
                        <TouchableOpacity
                          style={styles.empathyReviewButton}
                          onPress={() => setShowEmpathyDrawer(true)}
                          activeOpacity={0.7}
                          testID="empathy-review-button"
                        >
                          <Text style={styles.empathyReviewButtonText}>
                            {isRefiningEmpathy ? 'Revisit what you\'ll share' : 'Review what you\'ll share'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </Animated.View>
                  )
                  // Show share suggestion panel when reconciler generated a suggestion
                  // Hide immediately via local latch when user responds (before API completes)
                  : shouldShowShareSuggestion
                    ? () => (
                      <Animated.View
                        style={{
                          opacity: shareSuggestionAnim,
                          maxHeight: shareSuggestionAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, 100],
                          }),
                          transform: [{
                            translateY: shareSuggestionAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [20, 0],
                            }),
                          }],
                          overflow: 'hidden',
                        }}
                        pointerEvents={shouldShowShareSuggestion ? 'auto' : 'none'}
                      >
                        <View style={styles.shareSuggestionContainer}>
                          <TouchableOpacity
                            style={styles.shareSuggestionButton}
                            onPress={() => setShowShareSuggestionDrawer(true)}
                            activeOpacity={0.7}
                            testID="share-suggestion-button"
                          >
                            <Text style={styles.shareSuggestionButtonText}>
                              Help {shareOfferData?.suggestion?.guesserName} understand
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </Animated.View>
                    )
                  // Only render if inviter has a draft message (not confirmed yet)
                  // Never render for invitees - they already accepted the invitation
                  : (isInviter && invitationMessage && invitationUrl && !invitationConfirmed && !localInvitationConfirmed)
                    ? () => (
                      <Animated.View
                        style={{
                          // 1. Animate Opacity
                          opacity: invitationPanelAnim,

                          // 2. Animate Height (Slide in effect)
                          // We use maxHeight to safely animate from 0 to a value large enough to fit content
                          maxHeight: invitationPanelAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, 400], // 400 is arbitrary but large enough for your message + buttons
                          }),

                          // 3. Optional: Add a slight slide-up transform for visual flair
                          transform: [{
                            translateY: invitationPanelAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [20, 0],
                            }),
                          }],

                          // 4. Clip content while closed so padding doesn't leak space
                          overflow: 'hidden',
                        }}
                        // Disable touches when hidden
                        pointerEvents={shouldShowInvitationPanel ? 'auto' : 'none'}
                      >
                        {/* 5. INNER CONTAINER 
                       Move the styles that contain padding/bg/borders HERE. 
                       This ensures they don't take up space when the parent height is 0.
                    */}
                        <View style={styles.invitationDraftContainer}>
                          <Text style={styles.invitationDraftMessage}>
                            "{invitationMessage}"
                          </Text>

                          <InvitationShareButton
                            invitationMessage={invitationMessage}
                            invitationUrl={invitationUrl}
                            partnerName={partnerName}
                            senderName={user?.name || user?.firstName || undefined}
                            testID="invitation-share-button"
                          />

                          <TouchableOpacity
                            style={styles.continueButton}
                            onPress={() => {
                              // Track invitation sent
                              trackInvitationSent(sessionId, 'share_sheet');
                              // Mark as confirmed permanently in hook state (survives remounts)
                              setLocalInvitationConfirmed(true);
                              // Optimistic UI: immediately show loading state and indicator
                              setIsConfirmingInvitation(true);
                              setOptimisticConfirmTimestamp(new Date().toISOString());
                              setIsRefiningInvitation(false); // Exit refinement mode
                              handleConfirmInvitationMessage(invitationMessage, () => {
                                // Clear loading state when mutation completes
                                setIsConfirmingInvitation(false);
                              });
                            }}
                            testID="invitation-continue-button"
                          >
                            <Text style={styles.continueButtonText}>
                              {isRefiningInvitation ? "I've sent it - Back to conversation" : "I've sent it - Continue"}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </Animated.View>
                    )
                    // Show waiting banners with animation
                    : shouldShowWaitingBanner
                      ? () => (
                        <WaitingBanner
                          status={waitingStatus}
                          partnerName={partnerName || 'your partner'}
                          animationValue={waitingBannerAnim}
                          onKeepChatting={onNavigateToInnerThoughts ? () => onNavigateToInnerThoughts(sessionId) : undefined}
                          onInnerThoughts={onNavigateToInnerThoughts ? () => onNavigateToInnerThoughts(sessionId) : undefined}
                          testID="waiting-banner"
                        />
                      )
                      : undefined
          }
          hideInput={
            // Use derived hideInput logic from useChatUIState
            // Never hide when empathy review panel is showing (user still needs to interact)
            !shouldShowEmpathyPanel && derivedShouldHideInput
          }
        />

        {/* Waiting banner removed - now handled in renderAboveInput */}

        {/* Note: Compact is now rendered via renderCustomEmptyState in ChatInterface */}

        {/* Render inline cards - always render to maintain layout stability */}
        {/* Removing the isTypewriterAnimating check prevents layout jumps when cards unmount/remount */}
        {inlineCards.map((card) => renderInlineCard(card))}

        {/* Memory suggestion card - shown when AI detects a "remember this" intent */}
        {/* Always render to maintain layout stability */}
        {memorySuggestion && (
          <MemorySuggestionCard
            suggestion={memorySuggestion}
            onDismiss={clearMemorySuggestion}
            onApproved={() => {
              // Optional: could show a toast here for feedback
            }}
            testID="memory-suggestion-card"
          />
        )}
      </View>

      {/* Overlays */}
      {renderOverlay()}

      {/* Share Empathy Confirmation */}
      <Modal
        visible={showShareConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowShareConfirm(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Send empathy statement?</Text>
            <Text style={styles.modalSubtitle}>
              {partnerName
                ? `We'll share this with ${partnerName} now.`
                : 'We will share your understanding now.'}
            </Text>
            <View style={styles.modalPreview}>
              <Text style={styles.modalPreviewLabel}>What you'll share</Text>
              <Text style={styles.modalPreviewText}>
                {empathyDraftData?.draft?.content || liveProposedEmpathyStatement || 'Draft is empty'}
              </Text>
            </View>
            <View style={styles.shareActions}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => setShowShareConfirm(false)}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => {
                  // Set local latch immediately to prevent panel from flashing back
                  setHasSharedEmpathyLocal(true);
                  handleConfirmReadyToShare();
                  handleShareEmpathy();
                  setShowShareConfirm(false);
                }}
              >
                <Text style={styles.primaryButtonText}>Send now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Refine Invitation Drawer */}
      {invitationMessage && invitationUrl && (
        <RefineInvitationDrawer
          visible={showRefineDrawer}
          invitationMessage={invitationMessage}
          invitationUrl={invitationUrl}
          partnerName={partnerName}
          senderName={user?.name || user?.firstName || undefined}
          onRefine={() => {
            // Close the drawer and enter refinement mode
            setShowRefineDrawer(false);
            setIsRefiningInvitation(true);
            // Send auto-message to refine
            sendMessage("I'd like to refine the invitation message.");
          }}
          onShareSuccess={() => {
            // Mark as confirmed permanently in hook state (survives remounts)
            setLocalInvitationConfirmed(true);
            // Optimistic UI: immediately show loading state and indicator
            setIsConfirmingInvitation(true);
            setOptimisticConfirmTimestamp(new Date().toISOString());
            setShowRefineDrawer(false);
            // Confirm the invitation after sharing
            handleConfirmInvitationMessage(invitationMessage, () => {
              // Clear loading state when mutation completes
              setIsConfirmingInvitation(false);
            });
          }}
          onClose={() => setShowRefineDrawer(false)}
        />
      )}

      {/* View Empathy Statement Drawer - for viewing full statement */}
      {(liveProposedEmpathyStatement || empathyDraftData?.draft?.content || empathyStatusData?.myAttempt?.content) && (
        <ViewEmpathyStatementDrawer
          visible={showEmpathyDrawer}
          statement={liveProposedEmpathyStatement || empathyDraftData?.draft?.content || empathyStatusData?.myAttempt?.content || ''}
          partnerName={partnerName}
          isRevising={isRefiningEmpathy}
          onShare={() => {
            // Capture statement at click time to avoid stale closure
            // In refining mode, use myAttempt content as fallback
            const statementToShare = liveProposedEmpathyStatement || empathyDraftData?.draft?.content || empathyStatusData?.myAttempt?.content;
            console.log('[ViewEmpathyStatementDrawer] Share clicked', {
              hasStatement: !!statementToShare,
              statementLength: statementToShare?.length,
              hasLiveProposed: !!liveProposedEmpathyStatement,
              hasDraft: !!empathyDraftData?.draft?.content,
              hasMyAttempt: !!empathyStatusData?.myAttempt?.content,
              isRefining: isRefiningEmpathy
            });
            if (!statementToShare) {
              console.error('[ViewEmpathyStatementDrawer] No statement to share!');
              return;
            }
            // Set local latch immediately to prevent panel from flashing back during refetch
            setHasSharedEmpathyLocal(true);
            // Close drawer immediately
            setShowEmpathyDrawer(false);
            // Mark draft as ready to share (if not already)
            handleConfirmReadyToShare();
            // Share empathy - pass statement directly to ensure it's used
            // This will:
            // 1. Add optimistic empathy message to chat (ghost dots will show)
            // 2. Hide the review panel (via animation + local latch)
            // 3. When API responds, replace optimistic with real message + AI response
            handleShareEmpathy(statementToShare);
          }}
          onSendRefinement={(message) => {
            const refined =
              message.trim().toLowerCase().startsWith('refine empathy draft')
                ? message
                : `Refine empathy draft: ${message}`;
            // Prefix to make intent clear to the AI/prompt that this is a draft update
            sendMessage(refined);
            setShowEmpathyDrawer(false);
          }}
          onClose={() => setShowEmpathyDrawer(false)}
        />
      )}

      {/* Share Suggestion Drawer - for viewing/editing share suggestion */}
      {shareOfferData?.hasSuggestion && shareOfferData.suggestion && !hasRespondedToShareOfferLocal && (
        <ShareSuggestionDrawer
          visible={showShareSuggestionDrawer}
          suggestedContent={shareOfferData.suggestion.suggestedContent}
          partnerName={shareOfferData.suggestion.guesserName}
          onShare={() => {
            // Set local latch immediately to hide panel during API call
            setHasRespondedToShareOfferLocal(true);
            handleRespondToShareOffer('accept');
            setShowShareSuggestionDrawer(false);
          }}
          onDecline={() => {
            // Set local latch immediately to hide panel during API call
            setHasRespondedToShareOfferLocal(true);
            handleRespondToShareOffer('decline');
            setShowShareSuggestionDrawer(false);
          }}
          onSendRefinement={(message) => {
            // Send as a chat message to refine the suggestion
            sendMessage(message);
            setShowShareSuggestionDrawer(false);
          }}
          onClose={() => setShowShareSuggestionDrawer(false)}
        />
      )}

      {/* Note: CuriosityCompactOverlay removed - now using inline CompactChatItem + CompactAgreementBar */}

      {/* Note: SessionEntryMoodCheck is now handled via early return above
          to prevent flash of session content behind it */}
    </SafeAreaView>
  );
}

// ============================================================================
// Styles
// ============================================================================

const useStyles = () =>
  createStyles((t) => ({
    container: {
      flex: 1,
      backgroundColor: t.colors.bgPrimary,
    },
    content: {
      flex: 1,
    },
    centerContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: t.colors.bgPrimary,
      padding: 20,
    },
    loadingText: {
      marginTop: 12,
      fontSize: 16,
      color: t.colors.textSecondary,
    },
    accentColor: {
      color: t.colors.accent,
    },

    // Invitation Draft
    invitationDraftContainer: {
      paddingHorizontal: t.spacing.lg,
      paddingVertical: t.spacing.md,
      backgroundColor: t.colors.bgSecondary,
      borderTopWidth: 1,
      borderTopColor: t.colors.border,
    },
    invitationDraftMessage: {
      fontSize: t.typography.fontSize.md,
      fontStyle: 'italic',
      color: t.colors.textPrimary,
      textAlign: 'center',
      marginBottom: t.spacing.sm,
      paddingHorizontal: t.spacing.md,
      lineHeight: 22,
    },
    continueButton: {
      marginTop: t.spacing.sm,
      marginHorizontal: t.spacing.lg,
      paddingVertical: t.spacing.sm,
      alignItems: 'center',
    },
    continueButtonText: {
      fontSize: t.typography.fontSize.md,
      color: t.colors.textSecondary,
      textDecorationLine: 'underline',
    },

    // Feel Heard Panel
    feelHeardContainer: {
      backgroundColor: t.colors.bgSecondary,
      borderTopWidth: 1,
      borderTopColor: t.colors.border,
    },
    // Empathy Review Panel
    empathyReviewContainer: {
      paddingHorizontal: t.spacing.lg,
      paddingVertical: t.spacing.md,
      backgroundColor: t.colors.bgSecondary,
      borderTopWidth: 1,
      borderTopColor: t.colors.border,
    },
    empathyReviewButton: {
      paddingVertical: t.spacing.sm,
      paddingHorizontal: t.spacing.md,
      backgroundColor: t.colors.bgPrimary,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    empathyReviewButtonText: {
      fontSize: t.typography.fontSize.md,
      fontWeight: '500',
      color: t.colors.brandBlue,
    },

    // Share Suggestion Panel
    shareSuggestionContainer: {
      paddingHorizontal: t.spacing.lg,
      paddingVertical: t.spacing.md,
      backgroundColor: t.colors.bgSecondary,
      borderTopWidth: 1,
      borderTopColor: t.colors.border,
    },
    shareSuggestionButton: {
      paddingVertical: t.spacing.sm,
      paddingHorizontal: t.spacing.md,
      backgroundColor: '#005AC1',
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    shareSuggestionButtonText: {
      fontSize: t.typography.fontSize.md,
      fontWeight: '500',
      color: 'white',
    },

    // Inline Cards
    inlineCard: {
      margin: 16,
      padding: 16,
      backgroundColor: t.colors.bgSecondary,
      borderRadius: 12,
    },
    shareActions: {
      flexDirection: 'row',
      gap: t.spacing.sm,
      marginTop: t.spacing.sm,
    },
    primaryButton: {
      flex: 1,
      backgroundColor: t.colors.brandBlue,
      paddingVertical: t.spacing.sm,
      borderRadius: t.radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonText: {
      color: 'white',
      fontWeight: '700',
      fontSize: t.typography.fontSize.md,
    },
    secondaryButton: {
      flex: 1,
      backgroundColor: t.colors.bgSecondary,
      paddingVertical: t.spacing.sm,
      borderRadius: t.radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    secondaryButtonText: {
      color: t.colors.textPrimary,
      fontWeight: '600',
      fontSize: t.typography.fontSize.md,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      padding: t.spacing.lg,
    },
    modalCard: {
      backgroundColor: t.colors.bgPrimary,
      borderRadius: t.radius.xl,
      padding: t.spacing.lg,
      gap: t.spacing.md,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: t.colors.textPrimary,
    },
    modalSubtitle: {
      fontSize: 14,
      color: t.colors.textSecondary,
      lineHeight: 20,
    },
    modalPreview: {
      backgroundColor: t.colors.bgSecondary,
      borderRadius: t.radius.lg,
      padding: t.spacing.md,
    },
    modalPreviewLabel: {
      fontSize: 12,
      color: t.colors.textSecondary,
      marginBottom: t.spacing.xs,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    modalPreviewText: {
      fontSize: 15,
      lineHeight: 22,
      color: t.colors.textPrimary,
    },
    cardTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: t.colors.textPrimary,
      marginBottom: 8,
    },
    cardSubtitle: {
      fontSize: 14,
      color: t.colors.textSecondary,
      marginBottom: 16,
    },

    // Cooling Suggestion
    coolingSuggestion: {
      margin: 16,
      padding: 16,
      backgroundColor: t.colors.bgSecondary,
      borderRadius: 12,
      borderLeftWidth: 4,
      borderLeftColor: t.colors.warning,
    },
    coolingSuggestionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: t.colors.textPrimary,
      marginBottom: 4,
    },
    coolingSuggestionText: {
      fontSize: 14,
      color: t.colors.textSecondary,
      marginBottom: 16,
    },
    coolingOptions: {
      gap: 8,
    },
    coolingOptionButton: {
      padding: 12,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: 8,
      alignItems: 'center',
      backgroundColor: t.colors.bgSecondary,
    },
    coolingOptionAccent: {
      backgroundColor: t.colors.accent,
      borderColor: t.colors.accent,
    },
    coolingOptionText: {
      fontSize: 14,
      color: t.colors.textSecondary,
    },
    coolingOptionTextAccent: {
      fontSize: 14,
      color: t.colors.textOnAccent,
      fontWeight: '600',
    },

    // Mirror Intervention
    interventionCard: {
      margin: 16,
      padding: 16,
      backgroundColor: 'rgba(245, 158, 11, 0.15)',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.colors.warning,
    },
    interventionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: t.colors.warning,
      marginBottom: 8,
    },
    interventionMessage: {
      fontSize: 14,
      color: t.colors.textPrimary,
      lineHeight: 20,
      marginBottom: 8,
    },
    interventionPatterns: {
      fontSize: 12,
      color: t.colors.textSecondary,
      marginBottom: 16,
      fontStyle: 'italic',
    },
    interventionButtons: {
      flexDirection: 'row',
      gap: 12,
    },
    rephraseButton: {
      flex: 1,
      padding: 12,
      backgroundColor: t.colors.accent,
      borderRadius: 8,
      alignItems: 'center',
    },
    rephraseButtonText: {
      color: t.colors.textOnAccent,
      fontSize: 14,
      fontWeight: '600',
    },
    interventionContinueButton: {
      flex: 1,
      padding: 12,
      backgroundColor: t.colors.bgTertiary,
      borderRadius: 8,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    interventionContinueButtonText: {
      color: t.colors.textSecondary,
      fontSize: 14,
      fontWeight: '500',
    },

    // Confirmation Buttons
    confirmationButtons: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 16,
    },
    adjustButton: {
      flex: 1,
      padding: 14,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: 8,
      alignItems: 'center',
      backgroundColor: t.colors.bgSecondary,
    },
    adjustText: {
      color: t.colors.textPrimary,
      fontSize: 14,
    },
    confirmButton: {
      flex: 1,
      padding: 14,
      backgroundColor: t.colors.accent,
      borderRadius: 8,
      alignItems: 'center',
    },
    confirmText: {
      color: t.colors.textOnAccent,
      fontSize: 14,
      fontWeight: '600',
    },

    // Strategy Preview (uses primaryButton/secondaryButton styles defined above)
    strategyPreviewButtons: {
      flexDirection: 'row',
      gap: 12,
    },

    // Overlap & Agreement
    overlapDescription: {
      fontSize: 16,
      color: t.colors.textPrimary,
      marginBottom: 16,
      fontStyle: 'italic',
    },
    agreementExperiment: {
      fontSize: 16,
      color: t.colors.textPrimary,
      marginBottom: 16,
      lineHeight: 24,
    },

    // Overlay
    overlayContainer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: t.colors.bgPrimary,
    },
    closeOverlay: {
      position: 'absolute',
      bottom: 40,
      left: 20,
      right: 20,
      padding: 16,
      backgroundColor: t.colors.accent,
      borderRadius: 12,
      alignItems: 'center',
    },
    closeOverlayText: {
      color: t.colors.textOnAccent,
      fontSize: 16,
      fontWeight: '600',
    },
  }));

export default UnifiedSessionScreen;
