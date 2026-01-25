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
import { useRouter } from 'expo-router';
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
// EmpathyAttemptCard removed - now shown in AccuracyFeedbackDrawer
import { AccuracyFeedbackDrawer } from '../components/AccuracyFeedbackDrawer';
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
import { MemorySuggestionCard } from '../components/MemorySuggestionCard';
// SegmentedControl removed - tabs are now integrated in SessionChatHeader
// PartnerChatTab moved to separate Share screen route
import { PartnerEventModal, PartnerEventType } from '../components/PartnerEventModal';

import { useUnifiedSession, InlineChatCard } from '../hooks/useUnifiedSession';
import { useChatUIState } from '../hooks/useChatUIState';
import { createInvitationLink } from '../hooks/useInvitation';
import { useAuth, useUpdateMood } from '../hooks/useAuth';
import { useRealtime, useUserSessionUpdates } from '../hooks/useRealtime';
import { stageKeys, messageKeys } from '../hooks/queryKeys';
import { useAIMessageHandler } from '../hooks/useMessages';
import { useSharingStatus } from '../hooks/useSharingStatus';
import { deriveIndicators, SessionIndicatorData } from '../utils/chatListSelector';
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
  onStageComplete,
}: UnifiedSessionScreenProps) {
  const styles = useStyles();
  const router = useRouter();
  const { user, updateUser } = useAuth();
  const { mutate: updateMood } = useUpdateMood();
  const queryClient = useQueryClient();

  // Sharing status for header button
  const sharingStatus = useSharingStatus(sessionId);

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
    isConfirmingInvitation,
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
    setStreamTriggeredFeelHeard,

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
    handleResubmitEmpathy,
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
    partnerEmpathyData,

    // Utility actions
    showCooling,
    setPendingConfirmation,

    // Session viewed tracking
    markSessionViewed,
  } = useUnifiedSession(sessionId);

  // AI message handler for fire-and-forget pattern
  const { addAIMessage, handleAIMessageError } = useAIMessageHandler();

  // User-level events (memory suggestions are now sent to specific user, not session)
  useUserSessionUpdates({
    disableRefetch: true,
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

      // Handle reconciler events - use refetchQueries for immediate update (not just invalidate)
      // invalidateQueries only marks as stale; refetchQueries triggers immediate fetch
      if (event === 'empathy.share_suggestion') {
        // Subject received a share suggestion - immediately refetch share offer data
        console.log('[UnifiedSessionScreen] Share suggestion received, refetching shareOffer cache');
        queryClient.refetchQueries({ queryKey: stageKeys.shareOffer(sessionId) });
        queryClient.refetchQueries({ queryKey: stageKeys.empathyStatus(sessionId) });
      }

      if (event === 'empathy.context_shared') {
        // Guesser received shared context - immediately refetch empathy status and messages
        console.log('[UnifiedSessionScreen] Context shared, refetching empathy and message caches');
        queryClient.refetchQueries({ queryKey: stageKeys.empathyStatus(sessionId) });
        queryClient.refetchQueries({ queryKey: stageKeys.shareOffer(sessionId) });
        // Refetch infinite messages query so new SHARED_CONTEXT message appears
        queryClient.refetchQueries({ queryKey: messageKeys.infinite(sessionId) });
        // Mark session as viewed since user is actively viewing - this updates lastViewedAt
        // so the partner (subject) sees "seen" status in real-time
        markSessionViewed({});
      }

      if (event === 'partner.session_viewed') {
        // Partner viewed the session - update delivery status (pending → seen)
        console.log('[UnifiedSessionScreen] Partner viewed session, refetching empathy status cache');
        queryClient.refetchQueries({ queryKey: stageKeys.empathyStatus(sessionId) });
      }

      if (event === 'partner.share_tab_viewed') {
        // Partner viewed the Share tab - update delivery status (pending → seen) for shared content
        console.log('[UnifiedSessionScreen] Partner viewed Share tab, refetching empathy status cache');
        queryClient.refetchQueries({ queryKey: stageKeys.empathyStatus(sessionId) });
      }

      if (event === 'partner.stage_completed') {
        // Partner completed a stage - immediately refetch status
        console.log('[UnifiedSessionScreen] Partner completed stage, refetching status caches');
        queryClient.refetchQueries({ queryKey: stageKeys.empathyStatus(sessionId) });
        queryClient.refetchQueries({ queryKey: stageKeys.progress(sessionId) });
      }

      if (event === 'empathy.revealed') {
        // Empathy was revealed directly (OFFER_OPTIONAL with good alignment)
        // Both users receive this event, but only the SUBJECT (non-guesser) should see validation_needed modal
        console.log('[UnifiedSessionScreen] Empathy revealed, refetching empathy status cache');
        queryClient.refetchQueries({ queryKey: stageKeys.empathyStatus(sessionId) });
        queryClient.refetchQueries({ queryKey: stageKeys.partnerEmpathy(sessionId) });
        // Show validation_needed modal only if we're the SUBJECT (not the guesser)
        // The guesser's empathy was revealed to us, so we need to validate it
        if (data.guesserUserId && data.guesserUserId !== user?.id) {
          showPartnerEventModal('validation_needed');
        } else {
          console.log('[UnifiedSessionScreen] We are the guesser, skipping validation_needed modal');
        }
      }

      if (event === 'empathy.status_updated') {
        // Status changed - refetch cache
        console.log('[UnifiedSessionScreen] Empathy status updated, refetching status');
        queryClient.refetchQueries({ queryKey: stageKeys.empathyStatus(sessionId) });
        // Only show empathy_validated modal if our empathy was validated
        // (status is VALIDATED and forUserId matches current user)
        if (data.status === 'VALIDATED' && data.forUserId === user?.id) {
          showPartnerEventModal('empathy_validated');
        } else {
          console.log('[UnifiedSessionScreen] Status update not for validation or not for us, skipping modal');
        }
      }

      if (event === 'empathy.context_shared') {
        // Partner shared context - refetch and notify
        console.log('[UnifiedSessionScreen] Partner shared context, refetching status');
        queryClient.refetchQueries({ queryKey: stageKeys.empathyStatus(sessionId) });
        // Only show modal to the intended recipient (the guesser who should see the context)
        if (data.forUserId === user?.id) {
          showPartnerEventModal('context_shared');
        } else {
          console.log('[UnifiedSessionScreen] Context shared not for us, skipping modal');
        }
      }

      if (event === 'empathy.share_suggestion') {
        // New share suggestion from reconciler - refetch and notify
        // Only show modal if the event is for the current user (the subject who should share)
        console.log('[UnifiedSessionScreen] Share suggestion received, refetching status');
        queryClient.refetchQueries({ queryKey: stageKeys.shareOffer(sessionId) });
        // Check if this event is for us - only show modal to the subject
        if (data.forUserId === user?.id) {
          showPartnerEventModal('share_suggestion');
        } else {
          console.log('[UnifiedSessionScreen] Share suggestion not for us, skipping modal');
        }
      }
    },
    // Fire-and-forget pattern: AI responses arrive via Ably
    // Cache-First: Ghost dots are now derived from last message role in ChatInterface
    // When AI message is added to cache, last message becomes AI → dots disappear automatically
    onAIResponse: (payload) => {
      console.log('[UnifiedSessionScreen] AI response received via Ably:', payload.message?.id);
      // Add AI message to the cache - this automatically hides ghost dots
      // because ChatInterface derives showTypingIndicator from last message role
      addAIMessage(sessionId, payload.message);
      // Handle additional metadata from payload (same as HTTP onSuccess handler)
      // NOTE: We set state immediately here, but UI elements check !isTypewriterAnimating
      // before showing, so they will slide up AFTER the message finishes typewriter animating
      // Update feel-heard check recommendation from AI
      // Only set to true - once AI recommends feel-heard check, keep it sticky
      // until user confirms or dismisses (prevents flashing card on/off)
      if (payload.offerFeelHeardCheck === true) {
        setStreamTriggeredFeelHeard(true);
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
      // Note: Ghost dots hide automatically because optimistic message is rolled back on error
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
  // Cache-First Architecture: Ghost dots are now derived from last message role
  // When user sends a message, it's added to cache optimistically → last message is USER → dots show
  // When AI response arrives (via Ably), it's added to cache → last message is AI → dots hide
  const sendMessageWithTracking = useCallback((message: string) => {
    trackMessageSent(sessionId, message.length);
    sendMessage(message);
  }, [sessionId, sendMessage]);

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
  // Cache-First: invitationConfirmed is derived from cache (set optimistically in onMutate)
  useEffect(() => {
    if (session?.status === SessionStatus.INVITED && invitationMessage && !invitationConfirmed && !isConfirmingInvitation) {
      setIsRefiningInvitation(true);
    }
  }, [session?.status, invitationMessage, invitationConfirmed, isConfirmingInvitation]);

  // -------------------------------------------------------------------------
  // Local State for View Empathy Statement Drawer (Stage 2)
  // -------------------------------------------------------------------------
  const [showEmpathyDrawer, setShowEmpathyDrawer] = useState(false);
  const [showShareConfirm, setShowShareConfirm] = useState(false);
  const [showAccuracyFeedbackDrawer, setShowAccuracyFeedbackDrawer] = useState(false);

  // -------------------------------------------------------------------------
  // Navigation to Share screen
  // -------------------------------------------------------------------------
  const navigateToShare = useCallback((highlightTimestamp?: string) => {
    if (highlightTimestamp) {
      router.push(`/session/${sessionId}/share?highlight=${encodeURIComponent(highlightTimestamp)}`);
    } else {
      router.push(`/session/${sessionId}/share`);
    }
  }, [router, sessionId]);

  // Partner event modal state - shows when new Partner tab events occur
  const [partnerEventModalVisible, setPartnerEventModalVisible] = useState(false);
  const [partnerEventType, setPartnerEventType] = useState<PartnerEventType | null>(null);
  const [partnerEventPreview, setPartnerEventPreview] = useState<string | undefined>();

  // Handler for showing partner event modal
  const showPartnerEventModal = useCallback((eventType: PartnerEventType, preview?: string) => {
    setPartnerEventType(eventType);
    setPartnerEventPreview(preview);
    setPartnerEventModalVisible(true);
  }, []);

  const handleViewPartnerTab = useCallback(() => {
    setPartnerEventModalVisible(false);
    navigateToShare();
  }, [navigateToShare]);

  // Local latch to prevent panel flashing during server refetches
  // Once user clicks Share, this stays true even if server data temporarily reverts
  const [hasSharedEmpathyLocal, setHasSharedEmpathyLocal] = useState(false);

  // Local latch for invitation confirmation - once user confirms, hide panel immediately
  // This prevents the invitation panel from flashing when AI response triggers a cache refetch
  // that returns stale data (before the confirm mutation completed on server)
  const [hasConfirmedInvitationLocal, setHasConfirmedInvitationLocal] = useState(false);

  // -------------------------------------------------------------------------
  // Local State for Session Entry Mood Check
  // -------------------------------------------------------------------------
  // Tracks if user has completed the mood check for this session entry
  // Resets each time the component mounts (i.e., each time user navigates to session)
  const [hasCompletedMoodCheck, setHasCompletedMoodCheck] = useState(false);

  // -------------------------------------------------------------------------
  // Track Indicator Timestamps
  // -------------------------------------------------------------------------
  // Cache-First Architecture: All optimistic timestamps are now handled by React Query cache
  // via onMutate in the mutation hooks (useConfirmInvitationMessage, useSignCompact,
  // useConfirmFeelHeard). The indicators are derived purely from cache data:
  // - invitation.messageConfirmedAt (set by useConfirmInvitationMessage.onMutate)
  // - compact.mySignedAt (set by useSignCompact.onMutate)
  // - milestones.feelHeardConfirmedAt (set by useConfirmFeelHeard.onMutate)

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
  //
  // Cache-First Architecture: Panel visibility is derived purely from cache data.
  // The optimistic updates in mutation hooks (onMutate) ensure panels hide immediately.
  // No latch refs needed - if API fails, onError rolls back the cache and panel reappears.
  const isInviter = invitation?.isInviter ?? true;
  const {
    shouldShowWaitingBanner,
    shouldHideInput: derivedShouldHideInput,
    isInOnboardingUnsigned,
    panels: {
      showInvitationPanel: shouldShowInvitationPanel,
      showEmpathyPanel: shouldShowEmpathyPanel,
      showFeelHeardPanel: shouldShowFeelHeard,
      showShareSuggestionPanel: shouldShowShareSuggestion,
      showAccuracyFeedbackPanel: shouldShowAccuracyFeedback,
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
    // Cache-First: invitationConfirmed is derived from cache (invitation.messageConfirmed)
    // The optimistic update in useConfirmInvitationMessage.onMutate sets this immediately.
    // Local latch (hasConfirmedInvitationLocal) prevents panel flash when background refetch
    // returns stale data during race conditions with AI response events.
    invitationConfirmed: invitationConfirmed || isConfirmingInvitation || hasConfirmedInvitationLocal,
    // isConfirmingInvitation: mutation is in flight (panel hides during API call)
    isConfirmingInvitation,
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
    // Share suggestions are now handled via the Sharing Status screen (header button)
    // Always true to hide the inline panel
    hasRespondedToShareOfferLocal: true,
    partnerEmpathyValidated: partnerEmpathyData?.validated ?? false,
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
  // Cache-First: milestones.feelHeardConfirmedAt is set optimistically by useConfirmFeelHeard.onMutate
  const hasEverConfirmedFeelHeard = useRef(false);

  // Latch if we have cache data (optimistic or server-confirmed)
  if (milestones?.feelHeardConfirmedAt && !hasEverConfirmedFeelHeard.current) {
    hasEverConfirmedFeelHeard.current = true;
  }

  // Latch if mutation is in flight (backup for immediate feedback)
  if (isConfirmingFeelHeard && !hasEverConfirmedFeelHeard.current) {
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

  // Animation for the accuracy feedback panel slide-up
  const accuracyFeedbackAnim = useRef(new Animated.Value(0)).current;

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

  // -------------------------------------------------------------------------
  // Animation Target Flags - Used ONLY for animation target values
  // -------------------------------------------------------------------------
  // Stable Mounting Pattern:
  // - Panels are MOUNTED based on data readiness (shouldShow* flags)
  // - Panels ANIMATE based on data + typewriter guard (readyToShow* flags)
  // - This decouples mount lifecycle from visibility, preventing flicker
  //
  // When typewriter is animating:
  //   - Panel is mounted (opacity: 0, maxHeight: 0, pointerEvents: none)
  //   - User can't see or interact with it
  // When data becomes available:
  //   - Animation target becomes 1, panel smoothly animates in
  //   - Panel was already mounted, so no mount/unmount cycle = no flicker
  // Note: Panels show as soon as data is available, not waiting for typewriter/streaming
  const readyToShowInvitation = shouldShowInvitationPanel;
  const readyToShowEmpathy = shouldShowEmpathyPanel;
  const readyToShowFeelHeard = shouldShowFeelHeard;
  const readyToShowShareSuggestion = shouldShowShareSuggestion;
  const readyToShowAccuracyFeedback = shouldShowAccuracyFeedback;
  const readyToShowWaitingBanner = shouldShowWaitingBanner;

  // Debug logging for invitation panel timing
  useEffect(() => {
    console.log(`[UnifiedSessionScreen] [TIMING] invitationMessage changed at ${Date.now()}:`,
      invitationMessage ? `"${invitationMessage.substring(0, 30)}..."` : 'null');
  }, [invitationMessage]);

  useEffect(() => {
    console.log(`[UnifiedSessionScreen] [TIMING] shouldShowInvitationPanel changed at ${Date.now()}:`, shouldShowInvitationPanel);
  }, [shouldShowInvitationPanel]);

  // Animate invitation panel - synced with mount condition
  useEffect(() => {
    console.log(`[UnifiedSessionScreen] [TIMING] readyToShowInvitation changed at ${Date.now()}:`, readyToShowInvitation);
    Animated.spring(invitationPanelAnim, {
      toValue: readyToShowInvitation ? 1 : 0,
      useNativeDriver: false,
      tension: 40,
      friction: 9,
    }).start();
  }, [readyToShowInvitation, invitationPanelAnim]);

  // Animate empathy panel - close when sharing, otherwise follow readyToShowEmpathy
  // This prevents layout jumps by animating closed instead of unmounting
  useEffect(() => {
    // If we are sharing, force it to close (0). Otherwise follow the logic (1 or 0).
    const targetValue = isSharingEmpathy ? 0 : (readyToShowEmpathy ? 1 : 0);

    Animated.spring(empathyPanelAnim, {
      toValue: targetValue,
      useNativeDriver: false, // Required for layout animations like maxHeight
      tension: 40,
      friction: 9,
    }).start();
  }, [readyToShowEmpathy, isSharingEmpathy, empathyPanelAnim]);

  // Reset empathy latch when entering refining mode (received shared context from partner)
  // This allows the panel to show again so user can share their revised empathy
  useEffect(() => {
    if (isRefiningEmpathy) {
      setHasSharedEmpathyLocal(false);
    }
  }, [isRefiningEmpathy]);

  // Animate feel heard panel - synced with mount condition
  useEffect(() => {
    Animated.spring(feelHeardAnim, {
      toValue: readyToShowFeelHeard ? 1 : 0,
      useNativeDriver: false,
      tension: 40,
      friction: 9,
    }).start();
  }, [readyToShowFeelHeard, feelHeardAnim]);

  // Animate share suggestion panel - synced with mount condition
  useEffect(() => {
    Animated.spring(shareSuggestionAnim, {
      toValue: readyToShowShareSuggestion ? 1 : 0,
      useNativeDriver: false,
      tension: 40,
      friction: 9,
    }).start();
  }, [readyToShowShareSuggestion, shareSuggestionAnim]);

  // Share topic analytics tracking has moved to the Sharing Status screen

  // -------------------------------------------------------------------------
  // Phase 5: Share Suggestion Flow (Moved to dedicated Sharing Status screen)
  // -------------------------------------------------------------------------
  // Share suggestions are now accessed via the header button and displayed
  // in the Sharing Status screen at /session/[id]/sharing-status

  // Animate accuracy feedback panel - synced with mount condition
  useEffect(() => {
    Animated.spring(accuracyFeedbackAnim, {
      toValue: readyToShowAccuracyFeedback ? 1 : 0,
      useNativeDriver: false,
      tension: 40,
      friction: 9,
    }).start();
  }, [readyToShowAccuracyFeedback, accuracyFeedbackAnim]);

  // Animate waiting banner - uses readyToShowWaitingBanner (Stable Mounting pattern)
  useEffect(() => {
    Animated.spring(waitingBannerAnim, {
      toValue: readyToShowWaitingBanner ? 1 : 0,
      useNativeDriver: false,
      tension: 40,
      friction: 9,
    }).start();
  }, [readyToShowWaitingBanner, waitingBannerAnim]);

  // Cache-First: All optimistic states are now handled by mutation hooks' onMutate:
  // - useConfirmInvitationMessage.onMutate updates invitation.messageConfirmedAt
  // - useSignCompact.onMutate updates compact.mySignedAt
  // - useConfirmFeelHeard.onMutate updates milestones.feelHeardConfirmedAt
  // No local state cleanup needed - the cache is the single source of truth.

  // Build indicators array using centralized deriveIndicators function
  // This moves indicator logic to the utils layer, making it testable and reusable
  const indicators = useMemo((): ChatIndicatorItem[] => {
    // Prepare session data for the selector
    const sessionData: SessionIndicatorData = {
      isInviter,
      sessionStatus: session?.status,
      currentUserId: user?.id,
      partnerName: partnerName || 'Partner',
      invitation: invitation ? {
        messageConfirmedAt: invitation.messageConfirmedAt,
        acceptedAt: invitation.acceptedAt,
      } : undefined,
      compact: compactData ? {
        // Use refs as backup to prevent flickering during mutation
        mySigned: hasEverSignedCompact.current || compactData.mySigned || isSigningCompact,
        mySignedAt: compactData.mySignedAt ?? (hasEverSignedCompact.current || compactData.mySigned || isSigningCompact ? session?.createdAt : null),
      } : undefined,
      milestones: {
        // Use ref as backup to prevent flickering during mutation
        feelHeardConfirmedAt: milestones?.feelHeardConfirmedAt ??
          (hasEverConfirmedFeelHeard.current || isConfirmingFeelHeard ? new Date().toISOString() : null),
      },
      sessionCreatedAt: session?.createdAt,
    };

    // Derive indicators from session data
    const derivedIndicators = deriveIndicators(sessionData);

    // Convert to ChatIndicatorItem format (add 'type' field)
    const baseIndicators = derivedIndicators.map((indicator) => ({
      type: 'indicator' as const,
      indicatorType: indicator.indicatorType,
      id: indicator.id,
      timestamp: indicator.timestamp,
      metadata: indicator.metadata,
    }));

    // Add indicators for SHARED_CONTEXT and EMPATHY_STATEMENT messages
    // Both types link to the Partner tab where full content is shown
    const sharedContentIndicators = messages
      .filter((m) => m.role === MessageRole.SHARED_CONTEXT || m.role === MessageRole.EMPATHY_STATEMENT)
      .map((m) => {
        // Determine if this is from the current user or partner
        const isFromMe = user?.id ? m.senderId === user.id : true;
        return {
          type: 'indicator' as const,
          indicatorType: m.role === MessageRole.EMPATHY_STATEMENT ? 'empathy-shared' as const : 'context-shared' as const,
          id: `shared-${m.id}`,
          timestamp: m.timestamp,
          metadata: {
            isFromMe,
            partnerName: partnerName || 'Partner',
          },
        };
      });

    return [...baseIndicators, ...sharedContentIndicators];
  }, [isInviter, session?.status, session?.createdAt, invitation?.messageConfirmedAt, invitation?.acceptedAt, compactData?.mySigned, compactData?.mySignedAt, isSigningCompact, milestones?.feelHeardConfirmedAt, isConfirmingFeelHeard, messages, user?.id, partnerName]);

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
  // Prepare Messages for Display
  // -------------------------------------------------------------------------
  const displayMessages = useMemo((): ChatMessage[] => {
    // Find all EMPATHY_STATEMENT messages to detect superseded ones
    // User may have multiple empathy statements if they revised their understanding
    const empathyStatements = messages.filter(
      (m) => m.role === MessageRole.EMPATHY_STATEMENT
    );

    // Sort by timestamp to find the latest one
    const sortedStatements = [...empathyStatements].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // The latest empathy statement ID (if any)
    const latestEmpathyId = sortedStatements[0]?.id;

    // Enrich messages with delivery status for shared content
    return messages.map((message) => {
      // For EMPATHY_STATEMENT messages, determine which delivery status to use:
      // - If this is NOT the latest empathy statement, mark as superseded
      // - If content matches myAttempt (guesser's empathy statement), use myAttempt.deliveryStatus
      // - Otherwise, if sharedContentDeliveryStatus exists (subject shared via reconciler), use that
      if (message.role === MessageRole.EMPATHY_STATEMENT) {
        // Check if this is a superseded (older) empathy statement
        if (empathyStatements.length > 1 && message.id !== latestEmpathyId) {
          return {
            ...message,
            sharedContentDeliveryStatus: 'superseded' as const,
          };
        }

        // Check if this is the guesser's empathy attempt (content matches myAttempt)
        if (
          empathyStatusData?.myAttempt?.content &&
          empathyStatusData?.myAttempt?.deliveryStatus &&
          message.content === empathyStatusData.myAttempt.content
        ) {
          return {
            ...message,
            sharedContentDeliveryStatus: empathyStatusData.myAttempt.deliveryStatus,
          };
        }
        // Otherwise, this is shared context from the subject (via reconciler)
        if (empathyStatusData?.sharedContentDeliveryStatus) {
          return {
            ...message,
            sharedContentDeliveryStatus: empathyStatusData.sharedContentDeliveryStatus,
          };
        }
        // Fallback: If message already has a status (from optimistic update), preserve it
        // This handles the race condition where empathyStatusData hasn't refetched yet
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const existingStatus = (message as any).sharedContentDeliveryStatus;
        if (existingStatus) {
          return { ...message, sharedContentDeliveryStatus: existingStatus };
        }
        // Default to 'pending' for empathy statements without a status
        // (e.g., when empathyStatusData is still loading)
        return {
          ...message,
          sharedContentDeliveryStatus: 'pending' as const,
        };
      }
      return message;
    })
    // Filter out SHARED_CONTEXT and EMPATHY_STATEMENT messages - they'll be shown as tappable indicators
    // that navigate to the Partner tab when tapped
    .filter((message) =>
      message.role !== MessageRole.SHARED_CONTEXT &&
      message.role !== MessageRole.EMPATHY_STATEMENT
    );
  }, [messages, empathyStatusData?.myAttempt?.content, empathyStatusData?.myAttempt?.deliveryStatus, empathyStatusData?.sharedContentDeliveryStatus]);

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

        // Note: ready-to-share-confirmation case removed - now shown as panel above chat input
        // Note: empathy-draft-preview case removed - users access empathy statement via the overlay drawer

        // Note: accuracy-feedback case removed - now rendered as panel above chat input
        // See shouldShowAccuracyFeedback and accuracyFeedbackContainer

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

        // Note: empathy-share-suggestion is now handled via the two-phase flow:
        // Phase 1: ShareTopicPanel shows topic → opens ShareTopicDrawer
        // Phase 2: If user accepts → ShareSuggestionDrawer shows draft to share/edit/decline

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
        onBriefStatusPress={
          session?.status === SessionStatus.INVITED && invitation?.isInviter
            ? () => setShowRefineDrawer(true)
            : undefined
        }
        tabs={!isInOnboardingUnsigned ? {
          activeTab: 'ai', // Always 'ai' on this screen since Share is a separate route
          onTabChange: (tab) => {
            if (tab === 'partner') {
              navigateToShare();
            }
          },
          showPartnerBadge: sharingStatus.pendingActionsCount > 0,
        } : undefined}
        testID="session-chat-header"
      />
      {/* Chat content - Share is now a separate route */}
      {(
      <View style={styles.content}>
        <ChatInterface
          sessionId={sessionId}
          messages={displayMessages}
          indicators={indicators}
          onSendMessage={sendMessageWithTracking}
          // Cache-First: Ghost dots are derived from last message role in ChatInterface
          // isSending is still needed for brief moment during API call before optimistic message appears
          // isFetchingInitialMessage shows dots while fetching first AI message
          // isConfirmingFeelHeard, isSharingEmpathy, and isConfirmingInvitation show dots during those API calls
          isLoading={isFetchingInitialMessage || isConfirmingFeelHeard || isSharingEmpathy || isConfirmingInvitation}
          // isInputDisabled prevents sending while API call is in progress
          isInputDisabled={isSending}
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
          // Navigate to Share screen when "Context shared" or "Empathy shared" indicator is tapped
          onContextSharedPress={(timestamp) => {
            navigateToShare(timestamp ?? undefined);
          }}
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
                    // Cache-First: useSignCompact.onMutate sets compact.mySignedAt optimistically
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
              // Stable Mounting: Mount based on data (shouldShowFeelHeard), animate visibility with typewriter guard
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
                    pointerEvents={!isTypewriterAnimating ? 'auto' : 'none'}
                  >
                    <View style={styles.feelHeardContainer}>
                      <FeelHeardConfirmation
                        onConfirm={() => {
                          // Track felt heard response
                          trackFeltHeardResponse(sessionId, 'yes');
                          // Cache-First: useConfirmFeelHeard.onMutate sets milestones.feelHeardConfirmedAt optimistically
                          handleConfirmFeelHeard(() => onStageComplete?.(Stage.WITNESS));
                        }}
                        isPending={isConfirmingFeelHeard}
                      />
                    </View>
                  </Animated.View>
                )
                // Show empathy review panel when empathy statement is ready
                // Stable Mounting: Mount based on data (shouldShowEmpathyPanel), animate visibility with typewriter guard
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
                      pointerEvents={!isTypewriterAnimating && !isSharingEmpathy ? 'auto' : 'none'}
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
                  // Share topic panel has been moved to the Sharing Status screen (header button)
                  // Show accuracy feedback trigger when partner's empathy is ready for validation
                  // Stable Mounting: Mount based on data (shouldShowAccuracyFeedback), animate visibility with typewriter guard
                  : shouldShowAccuracyFeedback
                    ? () => (
                      <Animated.View
                        style={{
                          opacity: accuracyFeedbackAnim,
                          maxHeight: accuracyFeedbackAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, 80],
                          }),
                          transform: [{
                            translateY: accuracyFeedbackAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [20, 0],
                            }),
                          }],
                          overflow: 'hidden',
                        }}
                        pointerEvents={!isTypewriterAnimating ? 'auto' : 'none'}
                      >
                        <View style={styles.accuracyFeedbackContainer}>
                          <TouchableOpacity
                            style={styles.accuracyFeedbackButton}
                            onPress={() => setShowAccuracyFeedbackDrawer(true)}
                            activeOpacity={0.7}
                            testID="accuracy-feedback-trigger"
                          >
                            <Text style={styles.accuracyFeedbackButtonText}>
                              Review {partnerName}'s understanding
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </Animated.View>
                    )
                  // Only render if inviter has a draft message (not confirmed yet)
                  // Stable Mounting: Mount based on data (shouldShowInvitationPanel), animate visibility with typewriter guard
                  // This prevents flickering by keeping panel mounted during AI response typewriter animation
                  : shouldShowInvitationPanel
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
                        // Disable touches while invisible (during typewriter animation)
                        pointerEvents={!isTypewriterAnimating ? 'auto' : 'none'}
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
                            invitationMessage={invitationMessage!}
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
                              setIsRefiningInvitation(false); // Exit refinement mode
                              // Local latch: Immediately hide panel, survives cache race conditions
                              setHasConfirmedInvitationLocal(true);
                              // Cache-First: useConfirmInvitationMessage.onMutate sets invitation.messageConfirmed optimistically
                              // The indicator will appear immediately because the cache is updated
                              handleConfirmInvitationMessage(invitationMessage!);
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
      )}

      {/* Partner Event Modal - notifies when new content arrives on Partner tab */}
      <PartnerEventModal
        visible={partnerEventModalVisible}
        eventType={partnerEventType}
        partnerName={partnerName}
        contentPreview={partnerEventPreview}
        onViewPartnerTab={handleViewPartnerTab}
        onDismiss={() => setPartnerEventModalVisible(false)}
        testID="partner-event-modal"
      />

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
            setShowRefineDrawer(false);
            // Local latch: Immediately hide panel, survives cache race conditions
            setHasConfirmedInvitationLocal(true);
            // Cache-First: useConfirmInvitationMessage.onMutate sets invitation.messageConfirmed optimistically
            handleConfirmInvitationMessage(invitationMessage);
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

            if (isRefiningEmpathy) {
              // Resubmit - user has already shared once and is revising their understanding
              console.log('[ViewEmpathyStatementDrawer] Calling handleResubmitEmpathy (refining mode)');
              handleResubmitEmpathy(statementToShare);
            } else {
              // First time sharing - mark draft as ready and consent
              handleConfirmReadyToShare();
              // Share empathy - pass statement directly to ensure it's used
              // This will:
              // 1. Add optimistic empathy message to chat (ghost dots will show)
              // 2. Hide the review panel (via animation + local latch)
              // 3. When API responds, replace optimistic with real message + AI response
              handleShareEmpathy(statementToShare);
            }
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

      {/* Share functionality is now shown in the Partner tab */}

      {/* Accuracy Feedback Drawer - for validating partner's empathy statement */}
      {partnerEmpathyData?.attempt?.content && (
        <AccuracyFeedbackDrawer
          visible={showAccuracyFeedbackDrawer}
          statement={partnerEmpathyData.attempt.content}
          partnerName={partnerName}
          onAccurate={() => handleValidatePartnerEmpathy(true)}
          onPartiallyAccurate={() => handleValidatePartnerEmpathy(false, 'Some parts are accurate')}
          onInaccurate={() => handleValidatePartnerEmpathy(false, 'This does not capture my perspective')}
          onClose={() => setShowAccuracyFeedbackDrawer(false)}
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

    // Accuracy Feedback Panel (trigger button to open drawer)
    accuracyFeedbackContainer: {
      paddingHorizontal: t.spacing.lg,
      paddingVertical: t.spacing.md,
      backgroundColor: t.colors.bgSecondary,
      borderTopWidth: 1,
      borderTopColor: t.colors.border,
    },
    accuracyFeedbackButton: {
      paddingVertical: t.spacing.sm,
      paddingHorizontal: t.spacing.md,
      backgroundColor: t.colors.bgPrimary,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    accuracyFeedbackButtonText: {
      fontSize: t.typography.fontSize.md,
      fontWeight: '500',
      color: t.colors.brandBlue,
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
