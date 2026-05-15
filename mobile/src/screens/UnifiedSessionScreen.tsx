/**
 * UnifiedSessionScreen Component
 *
 * A unified chat-centric session interface that handles all stages.
 * The chat is always the primary view, with stage-specific content
 * appearing as inline cards or overlays.
 */

import { ReactNode, useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, Animated, Modal, ScrollView, AppState, Keyboard, Platform, Share, LayoutChangeEvent } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import {
  Stage,
  STAGE_COLORS,
  MessageRole,
  SessionStatus,
  MemorySuggestion,
  ConfirmAgreementResponse,
  EmpathyStatus,
  Stage4ClosureKind,
  Stage4ClosureReason,
  Stage4Phase,
  Stage4SelectionDecision,
} from '@meet-without-fear/shared';

import { ChatInterface, ChatMessage, ChatIndicatorItem, ChatValidationCardItem, ChatCustomCardItem } from '../components/ChatInterface';
import { SessionChatHeader } from '../components/SessionChatHeader';
import { FeelHeardConfirmation } from '../components/FeelHeardConfirmation';
import { BreathingExercise } from '../components/BreathingExercise';
import { GroundingExercise } from '../components/GroundingExercise';
import { BodyScanExercise } from '../components/BodyScanExercise';
import { SupportOptionsModal, SupportOption } from '../components/SupportOptionsModal';
import { SessionEntryMoodCheck } from '../components/SessionEntryMoodCheck';
import { AccuracyFeedbackDrawer } from '../components/AccuracyFeedbackDrawer';
import { ShareTopicDrawer } from '../components/ShareTopicDrawer';
import { ShareTopicPanel } from '../components/ShareTopicPanel';
// NeedsSection removed - needs review/reveal now lives inside NeedsDrawer
// StrategyPool/StrategyRanking/OverlapReveal removed - replaced by Stage4RedesignPanel
import { WaitingRoom } from '../components/WaitingRoom';
import { AgreementCard } from '../components/AgreementCard';
import { SessionCompletionScreen } from '../components/SessionCompletionScreen';
import { Stage4RedesignPanel, Stage4RedesignFooter } from '../components/Stage4RedesignPanel';
import { Stage4SubChatDrawer } from '../components/Stage4SubChatDrawer';
import { TendingPanel } from '../components/TendingPanel';
// CuriosityCompactOverlay removed - now using inline approach
import { CompactChatItem } from '../components/CompactChatItem';
import { CompactAgreementBar } from '../components/CompactAgreementBar';
import { ViewEmpathyStatementDrawer } from '../components/ViewEmpathyStatementDrawer';
import { MemorySuggestionCard } from '../components/MemorySuggestionCard';
// SegmentedControl removed - tabs are now integrated in SessionChatHeader
import { ActivityDrawer } from '../components/ActivityDrawer';
import type { ActivityDrawerFocusTarget } from '../components/ActivityDrawer';
import { PartnerInfoDrawer } from '../components/PartnerInfoDrawer';
import { NeedsDrawer, NeedsDrawerMode } from '../components/NeedsDrawer';
import { RefinementModalScreen } from './RefinementModalScreen';
import { GuidedDraftChatModal } from '../components/GuidedDraftChatModal';
import { TypewriterText } from '../components/TypewriterText';
import { GuidedActionPanel } from '../components/GuidedActionPanel';

import { useUnifiedSession, InlineChatCard } from '../hooks/useUnifiedSession';
import { useConfirmTopicFrame } from '../hooks/useSessions';
import { useValidationFeedbackCoachChat } from '../hooks/useRefinementChat';
import { useChatUIState } from '../hooks/useChatUIState';
import { createInvitationLink } from '../hooks/useInvitation';
import { buildInvitationShareText } from '../utils/invitationShareText';
import { useAuth, useUpdateMood } from '../hooks/useAuth';
import { useRealtime, useUserSessionUpdates } from '../hooks/useRealtime';
import { stageKeys, messageKeys, sessionKeys, notificationKeys } from '../hooks/queryKeys';
import { useAIMessageHandler } from '../hooks/useMessages';
import { useSharingStatus } from '../hooks/useSharingStatus';
import { usePendingActions } from '../hooks/usePendingActions';
import {
  useCloseStage4,
  useShareStage4Selections,
  useUnshareStage4Selections,
  useDeclineStage4Need,
  useUndeclineStage4Need,
  useCreateTendingReentry,
  useSetTendingEntryShare,
  useNeedsComparison,
  useStage4State,
  useSubmitStage4ProposalSelection,
  useSubmitTendingResponse,
  useTendingEntries,
  useOpenStage4SubChat,
  useSendStage4SubChatMessage,
  useResolveStage4SubChat,
} from '../hooks/useStages';
import { deriveEmpathyValidatedIndicator, deriveIndicators, SessionIndicatorData } from '../utils/chatListSelector';
import { canInsertRealtimeMessageForCurrentUser, isRealtimePayloadAddressedToCurrentUser } from '../utils/realtimePrivacy';
import {
  getPersistedMessageRefreshQueryKeys,
  getStage2RealtimeInvalidationQueryKeys,
  getStage3RealtimeInvalidationQueryKeys,
  getStage4RealtimeInvalidationQueryKeys,
} from '../utils/realtimeInvalidation';
import { useToast } from '../contexts/ToastContext';
import { createStyles } from '../theme/styled';
import { appWidthStyle, useAppAppearance } from '../theme';
import { WaitingBanner } from '../components/WaitingBanner';
import {
  trackInvitationSent,
  trackCompactSigned,
  trackMessageSent,
  trackFeltHeardResponse,
  trackSessionResolved,
  trackStageStarted,
  trackStageCompleted,
  trackShareTopicShown,
  trackShareTopicAccepted,
  trackShareTopicDeclined,
  trackShareTopicDismissed,
  trackShareDraftSent,
} from '../services/analytics';
import { shouldShowSessionEntryMoodCheck } from '../utils/sessionEntryMoodCheck';
import { hasNewerDistinctEmpathyStatement, isSameEmpathyAttemptMessage } from '../utils/empathyMessageMatching';

// ============================================================================
// Types
// ============================================================================

interface UnifiedSessionScreenProps {
  sessionId: string;
  initialTendingEntryId?: string | null;
  auditFixture?: string | null;
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
// Chapter Marker Helpers
// ============================================================================

/** Friendly stage names for chapter markers in the chat timeline */
const STAGE_FRIENDLY_NAMES: Record<number, string> = {
  [Stage.ONBOARDING]: 'Getting Started',
  [Stage.WITNESS]: 'Your Story',
  [Stage.PERSPECTIVE_STRETCH]: 'Walking in Their Shoes',
  [Stage.NEED_MAPPING]: 'What Matters Most',
  [Stage.STRATEGIC_REPAIR]: 'What Comes Next',
  [Stage.INFORMED_EMPATHY]: 'Deeper Understanding',
};

function getPartnerStageDescription(
  name: string,
  progress: { stage?: number; status?: string } | null | undefined,
  sessionStatus?: SessionStatus
): string {
  if (sessionStatus === SessionStatus.RESOLVED) {
    return `${name} has completed this session with you.`;
  }

  const stageName = progress?.stage !== undefined
    ? STAGE_FRIENDLY_NAMES[progress.stage]
    : 'this step';

  if (progress?.status === 'COMPLETED' || progress?.status === 'GATE_PENDING') {
    return `${name} has finished ${stageName}.`;
  }

  if (progress?.status === 'NOT_STARTED') {
    return `${name} is ready to begin ${stageName} when they are.`;
  }

  switch (progress?.stage) {
    case Stage.ONBOARDING:
      return `${name} is now getting ready to begin the session.`;
    case Stage.WITNESS:
      return `${name} is now sharing their story.`;
    case Stage.PERSPECTIVE_STRETCH:
      return `${name} is now working to understand your experience more clearly.`;
    case Stage.NEED_MAPPING:
      return `${name} is now exploring what matters most to them.`;
    case Stage.STRATEGIC_REPAIR:
      return `${name} is now considering what could come next.`;
    case Stage.INFORMED_EMPATHY:
      return `${name} is now working through deeper understanding.`;
    default:
      return `${name} is moving through the session with you.`;
  }
}

/** Stages that should NOT generate chapter markers */
const SUPPRESSED_CHAPTER_STAGES = new Set([Stage.ONBOARDING, Stage.INFORMED_EMPATHY]);

/**
 * Derive chapter marker indicators from message stage transitions.
 * Inserts a chapter indicator at the first message of each new stage.
 */
function deriveChapterMarkers(
  messages: ChatMessage[],
  anchors?: Partial<Record<Stage, string | null | undefined>>,
): ChatIndicatorItem[] {
  const markers: ChatIndicatorItem[] = [];
  const seenStages = new Set<number>();
  const markerTimestampForStage = (stage: Stage, fallbackTimestamp: string): string | undefined => {
    const anchorTimestamp = anchors?.[stage];

    switch (stage) {
      case Stage.WITNESS:
      case Stage.PERSPECTIVE_STRETCH:
        return anchorTimestamp || undefined;
      default:
        return anchorTimestamp || fallbackTimestamp;
    }
  };

  for (const msg of messages) {
    const stage = msg.stage as number | undefined;
    if (stage !== undefined && !seenStages.has(stage)) {
      seenStages.add(stage);
      if (SUPPRESSED_CHAPTER_STAGES.has(stage)) continue;

      const friendlyName = STAGE_FRIENDLY_NAMES[stage];
      if (friendlyName) {
        const markerTimestamp = markerTimestampForStage(stage as Stage, msg.timestamp);
        if (!markerTimestamp) continue;

        markers.push({
          type: 'indicator',
          indicatorType: 'stage-chapter',
          id: `stage-chapter-${stage}`,
          timestamp: markerTimestamp,
          metadata: { stageName: friendlyName, stageColor: STAGE_COLORS[stage as Stage] },
        });
      }
    }
  }
  return markers;
}

function timestampBeforeChatStart(timestamp?: string | null): string {
  const fallback = new Date(0).toISOString();
  if (!timestamp) return fallback;

  const time = new Date(timestamp).getTime();
  if (!Number.isFinite(time)) return timestamp;

  return new Date(time - 2000).toISOString();
}

function InviteeTopicIntroCard({
  partnerName,
  topicFrame,
  skipAnimation,
  onAnimationComplete,
}: {
  partnerName: string;
  topicFrame: string;
  skipAnimation: boolean;
  onAnimationComplete?: () => void;
}) {
  const styles = useStyles();
  const { palette } = useAppAppearance();
  const [showTopic, setShowTopic] = useState(skipAnimation);
  const [showOutro, setShowOutro] = useState(skipAnimation);
  const topicOpacity = useRef(new Animated.Value(skipAnimation ? 1 : 0)).current;
  const introCompletedRef = useRef(false);
  const topicCompletedRef = useRef(false);
  const outroCompletedRef = useRef(false);

  const introText = `Before we begin, this is what ${partnerName || 'your partner'} would like to work through with you:`;
  const outroText = "This is how things look from their side right now. You don't need to agree with it, respond to it, or do anything with it yet. Instead, I'd like to know what is happening from your point of view.";

  useEffect(() => {
    if (!skipAnimation) return;
    setShowTopic(true);
    setShowOutro(true);
    topicOpacity.setValue(1);
  }, [skipAnimation, topicOpacity]);

  const handleIntroComplete = useCallback(() => {
    if (introCompletedRef.current) return;
    introCompletedRef.current = true;
    setShowTopic(true);

    Animated.timing(topicOpacity, {
      toValue: 1,
      duration: 350,
      useNativeDriver: true,
    }).start(() => {
      if (topicCompletedRef.current) return;
      topicCompletedRef.current = true;
      setShowOutro(true);
    });
  }, [topicOpacity]);

  const handleOutroComplete = useCallback(() => {
    if (outroCompletedRef.current) return;
    outroCompletedRef.current = true;
    onAnimationComplete?.();
  }, [onAnimationComplete]);

  return (
    <View style={styles.inviteeTopicAckBody} testID="invitee-topic-ack-body">
      <TypewriterText
        text={introText}
        style={[styles.inviteeTopicAckText, { color: palette.text }]}
        wordDelay={45}
        fadeDuration={120}
        skipAnimation={skipAnimation}
        onComplete={handleIntroComplete}
      />

      {showTopic ? (
        <Animated.View
          style={[
            styles.inviteeTopicAckFrameWrap,
            {
              opacity: topicOpacity,
              backgroundColor: palette.bgElev,
              borderColor: palette.border,
            },
          ]}
        >
          <Text style={[styles.inviteeTopicAckFrame, { color: palette.text }]} testID="invitee-topic-text">
            {topicFrame}
          </Text>
        </Animated.View>
      ) : null}

      {showOutro ? (
        <TypewriterText
          text={outroText}
          style={[styles.inviteeTopicAckText, { color: palette.textMuted }]}
          wordDelay={45}
          fadeDuration={120}
          skipAnimation={skipAnimation}
          onComplete={handleOutroComplete}
        />
      ) : null}
    </View>
  );
}

export function NeedsIdentifiedChatCard({
  needs,
  status,
  onReview,
  compact = false,
}: {
  needs: Array<{ id: string; need: string; category: string }>;
  status: 'ready' | 'confirmed' | 'shared';
  onReview: () => void;
  compact?: boolean;
}) {
  const styles = useStyles();
  const visibleNeeds = needs.slice(0, 3);
  const extraCount = Math.max(0, needs.length - visibleNeeds.length);
  const statusLabel = status === 'shared'
    ? 'Shared'
    : status === 'confirmed'
      ? 'Confirmed'
      : 'Ready to review';
  const actionLabel = compact
    ? status === 'confirmed'
      ? 'Share'
      : 'Review'
    : status === 'ready'
      ? 'Review and confirm'
      : 'Open review';
  const accessibilityLabel = status === 'confirmed'
    ? 'Share confirmed needs'
    : status === 'shared'
      ? 'Open shared needs review'
      : 'Review identified needs';
  const countLabel = `${needs.length} ${needs.length === 1 ? 'need' : 'needs'} captured`;

  return (
    <TouchableOpacity
      style={[styles.needsSummaryCard, compact && styles.needsSummaryCardCompact]}
      onPress={onReview}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID="needs-identified-chat-card"
    >
      {!compact ? (
        <View style={styles.needsSummaryHeader}>
          <Text style={styles.needsSummaryEyebrow}>WHAT MATTERS</Text>
          <Text style={styles.needsSummaryStatus}>{statusLabel}</Text>
        </View>
      ) : null}
      <View style={compact ? styles.needsSummaryCompactBody : undefined}>
        <View style={compact ? styles.needsSummaryCompactText : undefined}>
          <Text style={compact ? styles.needsSummaryCompactTitle : styles.needsSummaryTitle}>
            {compact ? 'What Matters' : 'Your needs so far'}
          </Text>
          {compact ? (
            <Text style={styles.needsSummaryCount}>{countLabel}</Text>
          ) : null}
        </View>
        {compact ? (
          <Text style={styles.needsSummaryActionCompact}>{actionLabel}</Text>
        ) : null}
      </View>
      {!compact ? (
        <>
          <View style={styles.needsSummaryList}>
            {visibleNeeds.map((need) => (
              <View key={need.id} style={styles.needsSummaryRow}>
                <Text style={styles.needsSummaryCategory}>{need.category}</Text>
                <Text style={styles.needsSummaryText}>{need.need}</Text>
              </View>
            ))}
            {extraCount > 0 ? (
              <Text style={styles.needsSummaryMore}>+{extraCount} more</Text>
            ) : null}
          </View>
          <Text style={styles.needsSummaryAction}>{actionLabel}</Text>
        </>
      ) : null}
    </TouchableOpacity>
  );
}

export function getNeedsDrawerModeForNeedsStatus(status: 'ready' | 'confirmed' | 'shared'): NeedsDrawerMode {
  return status === 'shared' ? 'reveal' : 'needs';
}

export function getEmpathyValidationCardStatus(params: {
  serverValidated?: boolean;
  locallyAccepted?: boolean;
  locallySentFeedback?: boolean;
}): 'pending' | 'validated' | 'feedback-given' {
  if (params.serverValidated || params.locallyAccepted) {
    return 'validated';
  }
  if (params.locallySentFeedback) {
    return 'feedback-given';
  }
  return 'pending';
}

export function isLocalEmpathyValidationCurrent(
  localAction: {
    attemptId: string;
    revisionCount?: number;
    statusVersion?: number;
  } | null,
  attempt: {
    id: string;
    revisionCount?: number;
    statusVersion?: number;
  } | null | undefined
): boolean {
  if (!localAction || !attempt || localAction.attemptId !== attempt.id) {
    return false;
  }
  if (
    typeof localAction.revisionCount === 'number' &&
    typeof attempt.revisionCount === 'number' &&
    localAction.revisionCount !== attempt.revisionCount
  ) {
    return false;
  }
  if (
    typeof localAction.statusVersion === 'number' &&
    typeof attempt.statusVersion === 'number' &&
    localAction.statusVersion !== attempt.statusVersion
  ) {
    return false;
  }
  return true;
}

function MeasuredAnimatedPanel({
  animationValue,
  children,
}: {
  animationValue: Animated.Value;
  children: ReactNode;
}) {
  const [contentHeight, setContentHeight] = useState(0);
  const fallbackHeight = 240;
  const expandedHeight = contentHeight > 0 ? contentHeight : fallbackHeight;

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height);
    setContentHeight((currentHeight) => (
      Math.abs(currentHeight - nextHeight) > 1 ? nextHeight : currentHeight
    ));
  }, []);

  return (
    <Animated.View
      style={{
        opacity: animationValue,
        maxHeight: animationValue.interpolate({
          inputRange: [0, 1],
          outputRange: [0, expandedHeight],
        }),
        transform: [{
          translateY: animationValue.interpolate({
            inputRange: [0, 1],
            outputRange: [20, 0],
          }),
        }],
        overflow: 'hidden',
      }}
      pointerEvents="auto"
    >
      <View onLayout={handleLayout}>
        {children}
      </View>
    </Animated.View>
  );
}

// ============================================================================
// Component
// ============================================================================

export function UnifiedSessionScreen({
  sessionId,
  initialTendingEntryId = null,
  auditFixture = null,
  onNavigateBack,
  onStageComplete,
}: UnifiedSessionScreenProps) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { user, updateUser } = useAuth();
  const { mutate: updateMood } = useUpdateMood();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { showError, showWarning } = useToast();

  // Real-time presence tracking

  const {
    // Loading
    isLoading,
    isFetchingMessages,
    loadError,
    refetchSession,
    accessDenied,
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
    failedMessageContent,
    isSigningCompact,
    isConfirmingFeelHeard,
    isConfirmingInvitation,
    fetchMoreMessages,
    hasMoreMessages,
    isFetchingMoreMessages,

    // Unread tracking
    lastSeenChatItemIdForSeparator,
    lastViewedAtForAnimation,

    // Overlay state
    activeOverlay,

    // Local state
    barometerValue,
    pendingConfirmation,

    // Invitation phase
    isInvitationPhase,
    invitationConfirmed,
    invitation,

    // Stage-specific data
    compactData,
    loadingCompact,
    empathyDraftData,
    liveProposedEmpathyStatement,
    setLiveProposedEmpathyStatement,
    aiRecommendsReadyToShare: _aiRecommendsReadyToShare,
    setAiRecommendsReadyToShare,
    needs,
    needsData,
    allNeedsConfirmed,
    needsRevealValidationItems,
    needsRevealValidationData,
    needsRevealValidatedByBoth,
    agreements,
    isSavingEmpathyDraft,
    isSharingEmpathy,
    isResubmittingEmpathy,
    isRespondingToShareOffer,
    isConfirmingNeeds,

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
    handleDismissFeelHeard: _handleDismissFeelHeard,
    handleConfirmReadyToShare,
    handleDismissReadyToShare,
    handleSignCompact,
    handleConfirmInvitationMessage,
    handleSaveEmpathyDraft,
    handleShareEmpathy,
    handleResubmitEmpathy,
    handleValidatePartnerEmpathy,
    handleConfirmAllNeeds,
    handleConsentToShareNeeds,
    handleValidateNeedsReveal,
    handleNeedsNotValidYet,
    handleConfirmAgreement,
    handleResolveSession,
    handleRespondToShareOffer,

    // Reconciler
    empathyStatusData,
    shareOfferData,
    partnerEmpathyData,

    // Utility actions
    showCooling,
    setPendingConfirmation: _setPendingConfirmation,

    // Session viewed tracking
    markSessionViewed,

  } = useUnifiedSession(sessionId);
  const sessionQueriesEnabled = !accessDenied && !loadError;

  // Server-side pending actions for badge count (replaces client-side computation)
  // Gate behind a clean session load to prevent polling when session state fails (#428, #522)
  const pendingActionsQuery = usePendingActions(sessionId, { enabled: sessionQueriesEnabled });

  // Sharing status for the header button. Keep these duplicate header queries
  // behind the same stage/access gates as useUnifiedSession so the badge does
  // not reintroduce the Stage 2 share-offer request storm this PR removes.
  const sharingStatus = useSharingStatus(sessionId, {
    enabled: sessionQueriesEnabled && currentStage >= Stage.PERSPECTIVE_STRETCH,
    enableEmpathyStatus: currentStage >= Stage.PERSPECTIVE_STRETCH,
    enablePartnerEmpathy: currentStage >= Stage.PERSPECTIVE_STRETCH,
    enableShareOffer: currentStage === Stage.PERSPECTIVE_STRETCH,
  });

  // AI message handler for fire-and-forget pattern
  const { addAIMessage, handleAIMessageError } = useAIMessageHandler();

  const refetchPersistedMessages = useCallback(() => {
    for (const queryKey of getPersistedMessageRefreshQueryKeys(sessionId)) {
      queryClient.refetchQueries({ queryKey });
    }
  }, [queryClient, sessionId]);

  const refreshStage2RealtimeState = useCallback((options?: { refetchMessages?: boolean }) => {
    for (const queryKey of getStage2RealtimeInvalidationQueryKeys(sessionId)) {
      queryClient.invalidateQueries({ queryKey });
    }
    if (options?.refetchMessages) {
      refetchPersistedMessages();
    }
  }, [queryClient, refetchPersistedMessages, sessionId]);

  const refreshStage3RealtimeState = useCallback((options?: { refetchMessages?: boolean }) => {
    for (const queryKey of getStage3RealtimeInvalidationQueryKeys(sessionId)) {
      queryClient.invalidateQueries({ queryKey });
    }
    if (options?.refetchMessages) {
      refetchPersistedMessages();
    }
  }, [queryClient, refetchPersistedMessages, sessionId]);

  const refreshStage4RealtimeState = useCallback((options?: { refetchMessages?: boolean }) => {
    for (const queryKey of getStage4RealtimeInvalidationQueryKeys(sessionId)) {
      queryClient.invalidateQueries({ queryKey });
    }
    queryClient.refetchQueries({ queryKey: stageKeys.strategies(sessionId) });
    queryClient.refetchQueries({ queryKey: stageKeys.agreements(sessionId) });
    if (options?.refetchMessages) {
      refetchPersistedMessages();
    }
  }, [queryClient, refetchPersistedMessages, sessionId]);

  const updatePartnerLastActiveAt = useCallback((activeAt: unknown, viewedAt?: unknown) => {
    const activeAtString = typeof activeAt === 'string'
      ? activeAt
      : typeof viewedAt === 'string'
        ? viewedAt
        : null;
    if (!activeAtString) return;

    queryClient.setQueryData(sessionKeys.state(sessionId), (old: any) => {
      if (!old?.session) return old;
      return {
        ...old,
        session: {
          ...old.session,
          partnerLastActiveAt: activeAtString,
          ...(typeof viewedAt === 'string' ? { partnerLastViewedAt: viewedAt } : {}),
        },
      };
    });
  }, [queryClient, sessionId]);

  useEffect(() => {
    const latestMessage = messages[messages.length - 1];
    if (
      !latestMessage ||
      latestMessage.role !== MessageRole.USER ||
      isSending ||
      session?.status === SessionStatus.RESOLVED
    ) {
      return;
    }

    const timeout = setTimeout(() => {
      queryClient.refetchQueries({ queryKey: messageKeys.infinite(sessionId) });
      queryClient.refetchQueries({ queryKey: messageKeys.list(sessionId) });
    }, 2500);

    return () => clearTimeout(timeout);
  }, [messages, isSending, queryClient, sessionId, session?.status]);

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
  // Disable when session is invalid or failed to load to prevent cascading errors (#428, #522)
  const { partnerOnline, connectionStatus, reconnect: _reconnectRealtime } = useRealtime({
    sessionId,
    enabled: sessionQueriesEnabled,
    enablePresence: true,
    onSessionEvent: (event, data) => {
      console.log('[UnifiedSessionScreen] Received realtime event:', event);

      if (!isRealtimePayloadAddressedToCurrentUser(data, user?.id)) {
        console.log('[UnifiedSessionScreen] Dropping event addressed to another user:', event);
        return;
      }

      // Skip events triggered by self to prevent race conditions with optimistic updates.
      // Exception: events explicitly addressed TO us (forUserId === user.id) are always
      // processed, since system-generated events like reconciler results may be triggered
      // by the same user who should receive them.
      const triggeredBySelf = data.triggeredByUserId === user?.id;
      if (triggeredBySelf && data.forUserId !== user?.id) {
        console.log('[UnifiedSessionScreen] Skipping event triggered by self:', event);
        return;
      }

      // Handle reconciler events - use setQueryData with data included in events (no extra HTTP round-trips)
      if (event === 'empathy.share_suggestion' && data.forUserId === user?.id) {
        // Subject received a share suggestion - update cache directly
        console.log('[UnifiedSessionScreen] Share suggestion received, updating cache');
        queryClient.setQueryData(stageKeys.empathyStatus(sessionId), data.empathyStatus);
        queryClient.refetchQueries({ queryKey: stageKeys.shareOffer(sessionId) });
        refreshStage2RealtimeState();
      }

      if (event === 'empathy.context_shared' && data.forUserId === user?.id) {
        // Guesser received shared context from partner - update cache directly
        console.log('[UnifiedSessionScreen] Context shared, updating cache');
        queryClient.setQueryData(stageKeys.empathyStatus(sessionId), data.empathyStatus);
        queryClient.refetchQueries({ queryKey: stageKeys.shareOffer(sessionId) });
        refreshStage2RealtimeState({ refetchMessages: true });
        // Mark session as viewed so partner sees "seen" status
        markSessionViewed({});
      }

      if (event === 'empathy.status_updated' && data.forUserId === user?.id) {
        console.log('[UnifiedSessionScreen] Empathy status updated, syncing cache');
        const incomingVersion = data.statusVersion as number | undefined;
        const cached = queryClient.getQueryData<any>(stageKeys.empathyStatus(sessionId));
        const cachedVersion = cached?.statusVersion as number | undefined;
        const shouldUpdate = incomingVersion === undefined ||
          cachedVersion === undefined ||
          incomingVersion > cachedVersion;
        if (shouldUpdate) {
          if (data.empathyStatus) {
            queryClient.setQueryData(stageKeys.empathyStatus(sessionId), data.empathyStatus);
          } else {
            queryClient.invalidateQueries({ queryKey: stageKeys.empathyStatus(sessionId) });
          }
        } else {
          console.log('[UnifiedSessionScreen] Rejecting stale addressed empathy.status_updated event (version:', data.statusVersion, ')');
        }
        refreshStage2RealtimeState();
      }

      if (event === 'partner.session_viewed' && data.empathyStatuses && user?.id) {
        // Partner viewed the session - update delivery status
        console.log('[UnifiedSessionScreen] Partner viewed session, updating cache');
        if (data.presenceVisible !== false) {
          updatePartnerLastActiveAt(data.activeAt, data.viewedAt);
        }
        const statuses = data.empathyStatuses as Record<string, unknown>;
        if (statuses[user.id]) {
          queryClient.setQueryData(stageKeys.empathyStatus(sessionId), statuses[user.id]);
        }
      }

      if (event === 'partner.share_tab_viewed' && data.empathyStatuses && user?.id) {
        // Partner viewed the Share tab - update delivery status
        console.log('[UnifiedSessionScreen] Partner viewed Share tab, updating cache');
        if (data.presenceVisible !== false) {
          updatePartnerLastActiveAt(data.activeAt, data.viewedAt);
        }
        const statuses = data.empathyStatuses as Record<string, unknown>;
        if (statuses[user.id]) {
          queryClient.setQueryData(stageKeys.empathyStatus(sessionId), statuses[user.id]);
        }
      }

      if (event === 'partner.activity') {
        updatePartnerLastActiveAt(data.activeAt);
      }

      // Notification events - invalidate pending actions for activity menu badges
      if (event === 'notification.pending_action' && data.forUserId === user?.id) {
        console.log('[UnifiedSessionScreen] Pending action notification, refreshing badges');
        if (data.actionType === 'context_received') {
          refreshStage2RealtimeState({ refetchMessages: true });
        }
        queryClient.invalidateQueries({ queryKey: stageKeys.pendingActions(sessionId) });
        queryClient.invalidateQueries({ queryKey: notificationKeys.badgeCount() });
      }

      // Empathy resubmitted - partner refined their understanding
      if (event === 'empathy.resubmitted' && data.forUserId === user?.id) {
        console.log('[UnifiedSessionScreen] Partner resubmitted empathy');
        refreshStage2RealtimeState({ refetchMessages: true });
      }

      if (event === 'partner.stage_completed') {
        // Partner completed a stage - update caches
        console.log('[UnifiedSessionScreen] Partner completed stage', data.currentStage);
        if (data.empathyStatus) {
          queryClient.setQueryData(stageKeys.empathyStatus(sessionId), data.empathyStatus);
        }
        // Update sessionKeys.state with new stage from event
        if (data.currentStage !== undefined) {
          queryClient.setQueryData(sessionKeys.state(sessionId), (old: any) => {
            if (!old) return old;
            return {
              ...old,
              progress: old.progress ? {
                ...old.progress,
                partnerProgress: old.progress.partnerProgress ? {
                  ...old.progress.partnerProgress,
                  stage: data.currentStage,
                } : old.progress.partnerProgress,
              } : old.progress,
            };
          });
        }
        // Transition messages are private per user. Only insert if explicitly
        // addressed to us; otherwise refetch the filtered message list.
        const messagesByUserId = data.messagesByUserId as Record<string, { id: string; content: string; timestamp: string; forUserId?: string }> | undefined;
        const addressedMessage = user?.id && messagesByUserId ? messagesByUserId[user.id] : undefined;
        const legacyMessage = data.message as { id: string; content: string; timestamp: string; forUserId?: string } | undefined;
        const message = canInsertRealtimeMessageForCurrentUser(addressedMessage as any, user?.id)
          ? addressedMessage
          : canInsertRealtimeMessageForCurrentUser(legacyMessage as any, user?.id)
            ? legacyMessage
            : undefined;
        if (message) {
          const newMessage = {
            id: message.id,
            content: message.content,
            timestamp: message.timestamp,
            stage: data.currentStage ?? 3,
            role: 'AI' as const,
            sessionId,
            senderId: null,
            forUserId: message.forUserId ?? user?.id,
          };
          queryClient.setQueryData(messageKeys.infinite(sessionId), (old: any) => {
            if (!old || old.pages.length === 0) {
              return { pages: [{ messages: [newMessage], hasMore: false }], pageParams: [undefined] };
            }
            const firstPage = old.pages[0];
            const existingIds = new Set((firstPage.messages || []).map((m: any) => m.id));
            if (existingIds.has(newMessage.id)) return old;
            const updatedPages = [...old.pages];
            updatedPages[0] = { ...firstPage, messages: [...(firstPage.messages || []), newMessage] };
            return { ...old, pages: updatedPages };
          });
        }
        if (data.currentStage === 3 || data.previousStage === 2) {
          refreshStage2RealtimeState({ refetchMessages: true });
          refreshStage3RealtimeState({ refetchMessages: true });
        } else if (data.currentStage === 4 || data.previousStage === 3) {
          refreshStage3RealtimeState({ refetchMessages: true });
        } else {
          queryClient.refetchQueries({ queryKey: stageKeys.progress(sessionId) });
        }
      }

      if (event === 'partner.advanced') {
        console.log('[UnifiedSessionScreen] Partner advanced to stage', data.toStage);
        if (data.toStage !== undefined) {
          // Update partner's stage in sessionKeys.state
          queryClient.setQueryData(sessionKeys.state(sessionId), (old: any) => {
            if (!old) return old;
            return {
              ...old,
              progress: old.progress ? {
                ...old.progress,
                partnerProgress: old.progress.partnerProgress ? {
                  ...old.progress.partnerProgress,
                  stage: data.toStage,
                } : old.progress.partnerProgress,
              } : old.progress,
            };
          });
        }
        // Refetch full session state — if partner advanced,
        // our own stage may have been advanced server-side too
        queryClient.invalidateQueries({ queryKey: sessionKeys.state(sessionId) });
        queryClient.refetchQueries({ queryKey: stageKeys.progress(sessionId) });
      }

      if (event === 'partner.signed_compact') {
        console.log('[UnifiedSessionScreen] Partner signed compact');
        // Update compact status directly — invalidateQueries can race with optimistic updates
        queryClient.setQueryData(sessionKeys.state(sessionId), (old: any) => {
          if (!old) return old;
          return {
            ...old,
            compact: old.compact ? {
              ...old.compact,
              partnerSigned: true,
              partnerSignedAt: data.timestamp || new Date().toISOString(),
            } : old.compact,
          };
        });
      }

      if (event === 'invitation.confirmed') {
        console.log('[UnifiedSessionScreen] Invitation confirmed by partner');
        // Use setQueryData to merge — invalidateQueries can overwrite optimistic updates
        queryClient.setQueryData(sessionKeys.state(sessionId), (old: any) => {
          if (!old) return old;
          return {
            ...old,
            invitation: old.invitation ? {
              ...old.invitation,
              messageConfirmed: true,
              messageConfirmedAt: data.timestamp || new Date().toISOString(),
            } : old.invitation,
          };
        });
        queryClient.setQueryData(sessionKeys.sessionInvitation(sessionId), (old: any) => {
          if (!old?.invitation) return old;
          return {
            ...old,
            invitation: {
              ...old.invitation,
              messageConfirmed: true,
              messageConfirmedAt: data.timestamp || new Date().toISOString(),
            },
          };
        });
      }

      if (event === 'partner.empathy_shared') {
        // Partner shared their empathy statement
        console.log('[UnifiedSessionScreen] Partner shared empathy');
        if (data.empathyStatus) {
          queryClient.setQueryData(stageKeys.empathyStatus(sessionId), data.empathyStatus);
        }
        refreshStage2RealtimeState({ refetchMessages: true });
      }

      if (event === 'empathy.revealed' && data.forUserId === user?.id) {
        // Empathy was revealed - update cache directly
        console.log('[UnifiedSessionScreen] Empathy revealed, updating cache');
        queryClient.setQueryData(stageKeys.empathyStatus(sessionId), data.empathyStatus);
        queryClient.refetchQueries({ queryKey: stageKeys.partnerEmpathy(sessionId) });
        refreshStage2RealtimeState();
        // Optimistic cache write for partner empathy so validation card appears immediately
        if (data.empathyContent && data.attemptId) {
          queryClient.setQueryData(stageKeys.partnerEmpathy(sessionId), (old: any) => ({
            ...old,
            attempt: {
              ...old?.attempt,
              id: data.attemptId,
              content: data.empathyContent,
              revealedAt: data.revealedAt || new Date().toISOString(),
            },
          }));
        }
      }

      if (event === 'empathy.status_updated') {
        // Status changed - update cache directly
        console.log('[UnifiedSessionScreen] Empathy status updated');

        // Version checking: reject stale events when statusVersion is available
        const shouldUpdate = (() => {
          const incomingVersion = data.statusVersion as number | undefined;
          if (incomingVersion === undefined) return true; // No version = always accept (backward compat)
          const cached = queryClient.getQueryData<any>(stageKeys.empathyStatus(sessionId));
          const cachedVersion = cached?.statusVersion as number | undefined;
          if (cachedVersion === undefined) return true; // No cached version = accept
          return incomingVersion > cachedVersion;
        })();

        if (shouldUpdate) {
          // Check for individual status (forUserId + empathyStatus) or broadcast (empathyStatuses)
          if (data.empathyStatus && data.forUserId === user?.id) {
            queryClient.setQueryData(stageKeys.empathyStatus(sessionId), data.empathyStatus);
          } else if (data.empathyStatuses && user?.id) {
            const empathyStatuses = data.empathyStatuses as Record<string, unknown>;
            if (empathyStatuses[user.id]) {
              queryClient.setQueryData(stageKeys.empathyStatus(sessionId), empathyStatuses[user.id]);
            }
          }
        } else {
          console.log('[UnifiedSessionScreen] Rejecting stale empathy.status_updated event (version:', data.statusVersion, ')');
        }

      }

      if (event === 'empathy.refining' && data.forUserId === user?.id) {
        // Guesser received notification that subject shared context - update cache directly
        console.log('[UnifiedSessionScreen] Empathy refining, updating cache');
        queryClient.setQueryData(stageKeys.empathyStatus(sessionId), data.empathyStatus);
        refreshStage2RealtimeState();
      }

      // -----------------------------------------------------------------------
      // Stage 3: What Matters Events
      // -----------------------------------------------------------------------
      // Note: event type cast to string for forward-compat with new event types
      // defined in shared/src/dto/realtime.ts SessionEventType
      const eventName = event as string;

      if (eventName === 'session.needs_extracted') {
        // My own needs have been extracted by the backend
        console.log('[UnifiedSessionScreen] Needs extracted, refreshing cache');
        refreshStage3RealtimeState({ refetchMessages: true });
      }

      if (eventName === 'partner.needs_confirmed') {
        // Partner confirmed their identified needs
        console.log('[UnifiedSessionScreen] Partner confirmed needs');
        refreshStage3RealtimeState({ refetchMessages: true });
      }

      if (eventName === 'partner.needs_shared') {
        // Partner consented to share their needs
        console.log('[UnifiedSessionScreen] Partner shared needs');
        refreshStage3RealtimeState({ refetchMessages: true });
      }

      if (eventName === 'session.needs_reveal_ready' || eventName === 'session.needs_revealed') {
        console.log('[UnifiedSessionScreen] Needs reveal ready');
        refreshStage3RealtimeState({ refetchMessages: true });
      }

      if (eventName === 'session.common_ground_ready') {
        console.log('[UnifiedSessionScreen] Common ground ready');
        refreshStage3RealtimeState({ refetchMessages: true });
      }

      if (eventName === 'partner.needs_validated') {
        console.log('[UnifiedSessionScreen] Partner validated needs');
        refreshStage3RealtimeState({ refetchMessages: true });
      }

      // -----------------------------------------------------------------------
      // Stage 4: Strategic Repair Events
      // -----------------------------------------------------------------------

      if (eventName === 'session.strategies_updated') {
        console.log('[UnifiedSessionScreen] Strategies updated');
        refreshStage4RealtimeState();

        // Partner pulled their stances back to revise → surface it so the
        // partner doesn't wonder why their view "lost" data.
        // Skip when the current user is the one who pulled their own stances back.
        const payload = data as { change?: string; submittedBy?: string };
        if (
          payload.change === 'stage4_selection_revised' &&
          payload.submittedBy !== user?.id
        ) {
          showWarning(
            `${partnerName || 'Your other'} pulled their stances back`,
            'You\'ll see them again when they re-share.',
          );
        }
      }

      if (eventName === 'partner.ranking_submitted') {
        // Partner submitted their strategy rankings
        console.log('[UnifiedSessionScreen] Partner submitted rankings');
        refreshStage4RealtimeState();
      }

      if (eventName === 'partner.ready_to_rank' || eventName === 'partner.marked_ready') {
        // Partner marked ready to rank
        console.log('[UnifiedSessionScreen] Partner marked ready to rank');
        queryClient.setQueryData(stageKeys.strategies(sessionId), (old: any) => old
          ? { ...old, partnerReadyToRank: true }
          : old
        );
        queryClient.setQueryData(stageKeys.progress(sessionId), (old: any) => {
          if (!old?.partnerProgress) return old;
          return {
            ...old,
            partnerProgress: {
              ...old.partnerProgress,
              gatesSatisfied: {
                ...(old.partnerProgress.gatesSatisfied ?? {}),
                readyToRank: true,
              },
            },
          };
        });
        refreshStage4RealtimeState();
      }

      if (eventName === 'agreement.proposed') {
        // Partner proposed an agreement
        console.log('[UnifiedSessionScreen] Agreement proposed');
        refreshStage4RealtimeState();
      }

      if (eventName === 'agreement.confirmed') {
        // Partner confirmed an agreement
        console.log('[UnifiedSessionScreen] Agreement confirmed');
        refreshStage4RealtimeState();
      }

      if (eventName === 'session.resolved') {
        // Session has been resolved
        console.log('[UnifiedSessionScreen] Session resolved');
        refreshStage4RealtimeState();
      }
    },
    // Fire-and-forget pattern: AI responses arrive via Ably
    // Cache-First: Ghost dots are now derived from last message role in ChatInterface
    // When AI message is added to cache, last message becomes AI → dots disappear automatically
    onAIResponse: (payload) => {
      console.log('[UnifiedSessionScreen] AI response received via Ably:', payload.message?.id);
      if (!isRealtimePayloadAddressedToCurrentUser(payload, user?.id)) {
        console.log('[UnifiedSessionScreen] Dropping AI response addressed to another user:', payload.message?.id);
        return;
      }
      setIsAwaitingInvitationFollowUp(false);
      // Add AI message to the cache - this automatically hides ghost dots
      // because ChatInterface derives showTypingIndicator from last message role
      addAIMessage(sessionId, payload.message);
      // During Stage 0 invitation phase, the AI may emit a <draft> inline that
      // the backend extracts and persists to Session.topicFrame. Refresh
      // session state so the new topic flows into the proposal panel.
      if (isInvitationPhase && !topicFrameConfirmed) {
        queryClient.invalidateQueries({ queryKey: sessionKeys.state(sessionId) });
        queryClient.invalidateQueries({ queryKey: sessionKeys.sessionInvitation(sessionId) });
      }
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
      setIsAwaitingInvitationFollowUp(false);
      // Note: Ghost dots hide automatically because optimistic message is rolled back on error
      handleAIMessageError(sessionId, payload.userMessageId, payload.error, payload.canRetry);
      showError('Something went wrong', 'Your message could not be processed. Please try again.');
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


  // Wrapped sendMessage with tracking
  // Cache-First Architecture: Ghost dots are now derived from last message role
  // When user sends a message, it's added to cache optimistically → last message is USER → dots show
  // When AI response arrives (via Ably), it's added to cache → last message is AI → dots hide
  const sendMessageWithTracking = useCallback((message: string) => {
    trackMessageSent(sessionId, message.length);
    sendMessage(message);
  }, [sessionId, sendMessage]);

  // -------------------------------------------------------------------------
  // Local State for View Empathy Statement Drawer (Stage 2)
  // -------------------------------------------------------------------------
  const [showEmpathyDrawer, setShowEmpathyDrawer] = useState(false);
  const [showShareConfirm, setShowShareConfirm] = useState(false);
  const [showAccuracyFeedbackDrawer, setShowAccuracyFeedbackDrawer] = useState(false);
  const [showShareTopicDrawer, setShowShareTopicDrawer] = useState(false);
  const [showFeedbackCoachChat, setShowFeedbackCoachChat] = useState(false);
  const [feedbackCoachRoughFeedback, setFeedbackCoachRoughFeedback] = useState('');
  const feedbackCoachInitializedRef = useRef(false);
  const appliedAuditFixtureRef = useRef<string | null>(null);
  const [isAwaitingInvitationFollowUp, setIsAwaitingInvitationFollowUp] = useState(false);

  const hasInvitationTransitionResponse = useMemo(() => {
    if (!invitation?.messageConfirmedAt) return false;
    const confirmedAt = new Date(invitation.messageConfirmedAt).getTime();

    return messages.some((message) => {
      if (message.role !== MessageRole.AI || message.stage !== Stage.WITNESS) return false;
      const timestamp = new Date(message.timestamp).getTime();
      return Number.isFinite(timestamp) && timestamp >= confirmedAt;
    });
  }, [invitation?.messageConfirmedAt, messages]);

  useEffect(() => {
    if (!invitationConfirmed || hasInvitationTransitionResponse) {
      setIsAwaitingInvitationFollowUp(false);
    }
  }, [invitationConfirmed, hasInvitationTransitionResponse]);

  const confirmInvitationAndAwaitFollowUp = useCallback(() => {
    setIsAwaitingInvitationFollowUp(true);
    handleConfirmInvitationMessage();
  }, [handleConfirmInvitationMessage]);

  // -------------------------------------------------------------------------
  // Activity Menu Modal
  // -------------------------------------------------------------------------
  const [showActivityMenu, setShowActivityMenu] = useState(false);
  const [activityFocusTarget, setActivityFocusTarget] = useState<ActivityDrawerFocusTarget | null>(null);
  const [showPartnerInfo, setShowPartnerInfo] = useState(false);
  const topicFrame = invitation && 'topicFrame' in invitation
    ? (invitation.topicFrame as string | null)
    : null;
  const topicFrameConfirmed = !!(
    invitation &&
    'topicFrameConfirmedAt' in invitation &&
    (invitation.topicFrameConfirmedAt as string | null)
  );

  // "Refine" hint: when the user taps Refine, hide the topic-proposal panel
  // for the current proposed value. As soon as the AI emits a new <draft>
  // (topicFrame changes), the latch resets and the panel reappears.
  const topicProposalDismissed = false;
  const partnerInfoName = partnerName || 'Meet Without Fear';
  const partnerStageDescription = getPartnerStageDescription(
    partnerInfoName,
    partnerProgress,
    session?.status
  );
  const partnerActivitySession = session as
    | { partnerLastActiveAt?: string | null; partnerLastViewedAt?: string | null }
    | undefined;
  const partnerLastSeenAt =
    partnerActivitySession?.partnerLastActiveAt ??
    partnerActivitySession?.partnerLastViewedAt ??
    null;
  const partnerInfoDrawer = (
    <PartnerInfoDrawer
      visible={showPartnerInfo}
      name={partnerInfoName}
      isOnline={partnerOnline}
      lastSeenAt={partnerLastSeenAt}
      stageDescription={partnerStageDescription}
      topic={topicFrame}
      onClose={() => setShowPartnerInfo(false)}
    />
  );

  const { mutate: confirmTopicFrame, isPending: isConfirmingTopicFrame } = useConfirmTopicFrame({
    onError: (error) => {
      console.error('[UnifiedSessionScreen] Failed to confirm topic frame:', error);
      showError('Topic not confirmed', 'Please try confirming the topic again.');
    },
    onSuccess: () => {
      // Topic confirmation only flips topicFrameConfirmedAt. Stage 0→1 advances
      // when the user closes the share modal (X), so the chat doesn't start
      // running while the modal is up.
    },
  });

  const handleConfirmTopicFrame = useCallback(() => {
    if (!sessionId || isConfirmingTopicFrame) return;
    confirmTopicFrame({ sessionId });
  }, [sessionId, isConfirmingTopicFrame, confirmTopicFrame]);

  // -------------------------------------------------------------------------
  // Invitation panel dismissal (allows the user to defer sharing).
  // -------------------------------------------------------------------------
  const [invitationPanelDismissed, setInvitationPanelDismissed] = useState(false);

  // Tooltip shown after "Later" — points at the book icon to teach the user
  // they can share later from the activity drawer. Session-local only.
  const [showShareLaterTooltip, setShowShareLaterTooltip] = useState(false);
  const [shareLaterTooltipShownThisSession, setShareLaterTooltipShownThisSession] =
    useState(false);

  // Refinement Modal
  const [refinementOfferId, setRefinementOfferId] = useState<string | null>(null);
  const [refinementInitialSuggestion, setRefinementInitialSuggestion] = useState('');
  const {
    messages: feedbackCoachMessages,
    isLoading: isFeedbackCoachLoading,
    isFinalizing: isFeedbackCoachFinalizing,
    isFinalized: isFeedbackCoachFinalized,
    sendMessage: sendFeedbackCoachMessage,
    finalizeFeedback,
    resetChat: resetFeedbackCoachChat,
  } = useValidationFeedbackCoachChat(
    sessionId,
    feedbackCoachRoughFeedback,
    partnerEmpathyData?.attempt?.content || ''
  );

  // -------------------------------------------------------------------------
  // Needs Drawer (Stage 3)
  // -------------------------------------------------------------------------
  const [showNeedsDrawer, setShowNeedsDrawer] = useState(false);
  const [needsDrawerMode, setNeedsDrawerMode] = useState<NeedsDrawerMode>('needs');
  const [showStage4Drawer, setShowStage4Drawer] = useState(false);
  const myNeedsSharedForComparison =
    (myProgress?.gatesSatisfied as Record<string, unknown> | undefined)?.needsShared === true;
  const { data: needsComparisonData } = useNeedsComparison(
    sessionId,
    (allNeedsConfirmed || myNeedsSharedForComparison) && (
      showNeedsDrawer ||
      myProgress?.stage === Stage.NEED_MAPPING
    ),
  );
  const shouldUseRevealedNeeds =
    needsDrawerMode !== 'needs' && (needsComparisonData?.myNeeds?.length ?? 0) > 0;

  useEffect(() => {
    if (!auditFixture || appliedAuditFixtureRef.current === auditFixture) return;

    if (
      auditFixture === 'empathy-drawer' &&
      (liveProposedEmpathyStatement || empathyDraftData?.draft?.content || empathyStatusData?.myAttempt?.content)
    ) {
      setShowEmpathyDrawer(true);
      appliedAuditFixtureRef.current = auditFixture;
      return;
    }

    if (auditFixture === 'accuracy-feedback' && partnerEmpathyData?.attempt?.content) {
      setShowAccuracyFeedbackDrawer(true);
      appliedAuditFixtureRef.current = auditFixture;
      return;
    }

    if (auditFixture === 'guided-draft' && partnerEmpathyData?.attempt?.content) {
      setFeedbackCoachRoughFeedback('I want to say what missed the mark without escalating.');
      feedbackCoachInitializedRef.current = false;
      setShowFeedbackCoachChat(true);
      appliedAuditFixtureRef.current = auditFixture;
      return;
    }

    if (auditFixture === 'needs-drawer' && needs && needs.length > 0) {
      setNeedsDrawerMode(allNeedsConfirmed ? 'reveal' : 'needs');
      setShowNeedsDrawer(true);
      appliedAuditFixtureRef.current = auditFixture;
    }
  }, [
    allNeedsConfirmed,
    auditFixture,
    empathyDraftData?.draft?.content,
    empathyStatusData?.myAttempt?.content,
    liveProposedEmpathyStatement,
    needs,
    partnerEmpathyData?.attempt?.content,
  ]);

  const stage4Query = useStage4State(sessionId, {
    enabled:
      !accessDenied &&
      (currentStage === Stage.STRATEGIC_REPAIR || session?.status === SessionStatus.RESOLVED),
  });
  const stage4State = stage4Query.data;
  const hasRedesignedStage4 =
    !!stage4State &&
    (currentStage === Stage.STRATEGIC_REPAIR || session?.status === SessionStatus.RESOLVED);
  const redesignedStage4ProposalCount =
    (stage4State?.inventory.sharedProposals.length ?? 0) +
    (stage4State?.inventory.individualCommitments.length ?? 0);
  const redesignedStage4AllowsInput =
    currentStage === Stage.STRATEGIC_REPAIR &&
    !!stage4State &&
    (
      stage4State.phase === Stage4Phase.INVENTORY_BUILDING ||
      (
        stage4State.phase === Stage4Phase.COVERAGE_REVIEW &&
        redesignedStage4ProposalCount < 2
      )
    );

  const submitStage4Selection = useSubmitStage4ProposalSelection({
    onError: () => {
      showError('Could not save that Stage 4 choice. Please try again.');
    },
  });
  const shareStage4Selections = useShareStage4Selections();
  const unshareStage4Selections = useUnshareStage4Selections();
  const declineStage4Need = useDeclineStage4Need();
  const undeclineStage4Need = useUndeclineStage4Need();
  const closeStage4 = useCloseStage4({
    onSuccess: (response) => {
      if (response.outcome.kind === Stage4ClosureKind.SHARED_AGREEMENT) {
        trackSessionResolved(sessionId, 'agreement');
      } else {
        trackSessionResolved(sessionId, 'no-shared-agreement');
      }
    },
    onError: () => {
      showError('Could not close Stage 4 yet. Please try again.');
    },
  });
  const tendingEntriesQuery = useTendingEntries(sessionId, {
    enabled: !accessDenied && session?.status === SessionStatus.RESOLVED,
  });
  const createTendingReentry = useCreateTendingReentry({
    onError: () => {
      showError('Could not open Tending re-entry. Please try again.');
    },
  });
  const submitTendingResponse = useSubmitTendingResponse({
    onError: () => {
      showError('Could not save that Tending review. Please try again.');
    },
  });
  const setTendingEntryShare = useSetTendingEntryShare({
    onError: () => {
      showError('Could not update sharing on that Tending entry. Please try again.');
    },
  });
  const handleStage4Selection = useCallback(
    (proposalId: string, decision: Stage4SelectionDecision) => {
      submitStage4Selection.mutate({
        sessionId,
        proposalId,
        decision,
      });
    },
    [sessionId, submitStage4Selection]
  );
  const handleShareStage4Selections = useCallback(() => {
    shareStage4Selections.mutate(
      { sessionId },
      {
        onError: (err) => {
          const detail = err?.message || 'Please try again.';
          showError('Could not share your stances', detail);
        },
      }
    );
  }, [shareStage4Selections, sessionId, showError]);
  // Phase 3: brainstorm/no-overlap/refinement happen in a Stage 4 sub-chat
  // (Stage4SubChatDrawer) so they don't pollute the main transcript.
  const [stage4BrainstormPrefill, setStage4BrainstormPrefill] = useState<string | null>(null);
  const [stage4SubChat, setStage4SubChat] = useState<
    import('@meet-without-fear/shared').Stage4SubChatDTO | null
  >(null);
  const [stage4SubChatAnchorLabel, setStage4SubChatAnchorLabel] = useState<string | null>(null);
  const [stage4SubChatInitialProposalText, setStage4SubChatInitialProposalText] = useState<
    string | null
  >(null);
  const openStage4SubChat = useOpenStage4SubChat();
  const sendStage4SubChatMessage = useSendStage4SubChatMessage();
  const resolveStage4SubChatMutation = useResolveStage4SubChat();
  const handleBrainstormStage4Need = useCallback(
    (needLabel: string, needId: string) => {
      void stage4BrainstormPrefill;
      setStage4SubChatAnchorLabel(needLabel);
      setStage4SubChatInitialProposalText(null);
      openStage4SubChat.mutate(
        {
          sessionId,
          anchorKind: (
            require('@meet-without-fear/shared') as typeof import('@meet-without-fear/shared')
          ).Stage4SubChatAnchor.NEEDS_BRAINSTORM,
          anchorId: needId,
        },
        {
          onSuccess: ({ subChat }) => setStage4SubChat(subChat),
          onError: () =>
            showError('Could not open the brainstorm. Please try again.'),
        }
      );
    },
    [openStage4SubChat, sessionId, showError, stage4BrainstormPrefill]
  );
  const handleRefineStage4Proposal = useCallback(
    (proposalId: string, description: string) => {
      setStage4SubChatAnchorLabel(description);
      setStage4SubChatInitialProposalText(description);
      openStage4SubChat.mutate(
        {
          sessionId,
          anchorKind: (
            require('@meet-without-fear/shared') as typeof import('@meet-without-fear/shared')
          ).Stage4SubChatAnchor.PROPOSAL_REFINEMENT,
          anchorId: proposalId,
        },
        {
          onSuccess: ({ subChat }) => setStage4SubChat(subChat),
          onError: () =>
            showError('Could not open the refinement chat. Please try again.'),
        }
      );
    },
    [openStage4SubChat, sessionId, showError]
  );
  const handleKeepRefiningNoOverlap = useCallback(() => {
    setStage4SubChatAnchorLabel(null);
    setStage4SubChatInitialProposalText(null);
    openStage4SubChat.mutate(
      {
        sessionId,
        anchorKind: (
          require('@meet-without-fear/shared') as typeof import('@meet-without-fear/shared')
        ).Stage4SubChatAnchor.NO_OVERLAP,
      },
      {
        onSuccess: ({ subChat }) => setStage4SubChat(subChat),
        onError: () =>
          showError('Could not open the refinement chat. Please try again.'),
      }
    );
  }, [openStage4SubChat, sessionId, showError]);
  const handleSendStage4SubChatMessage = useCallback(
    (content: string) => {
      if (!stage4SubChat) return;
      // Optimistically append the user's message so it appears immediately,
      // before the server roundtrip. The server response replaces this with
      // the canonical thread (which includes the persisted user message + AI
      // reply). Mirrors useRefinementChat's pattern.
      const optimisticUserMessage = {
        id: `stage4-subchat-user-optimistic-${Date.now()}`,
        role: (require('@meet-without-fear/shared') as typeof import('@meet-without-fear/shared'))
          .MessageRole.USER,
        content,
        createdAt: new Date().toISOString(),
        candidate: null,
      };
      const optimisticSubChat = {
        ...stage4SubChat,
        messages: [...stage4SubChat.messages, optimisticUserMessage],
      };
      setStage4SubChat(optimisticSubChat);
      sendStage4SubChatMessage.mutate(
        { sessionId, subChatId: stage4SubChat.id, content },
        {
          onSuccess: ({ subChat }) => setStage4SubChat(subChat),
          onError: () => {
            // Roll back the optimistic append.
            setStage4SubChat(stage4SubChat);
            showError('Could not send the message. Try again.');
          },
        }
      );
    },
    [sendStage4SubChatMessage, sessionId, showError, stage4SubChat]
  );
  const handleResolveStage4SubChat = useCallback(
    (payload: {
      acceptedProposals: import('@meet-without-fear/shared').Stage4ProposalDraft[];
      updatedProposals: import('@meet-without-fear/shared').Stage4ProposalDraft[];
    }) => {
      if (!stage4SubChat) return;
      resolveStage4SubChatMutation.mutate(
        {
          sessionId,
          subChatId: stage4SubChat.id,
          acceptedProposals: payload.acceptedProposals,
          updatedProposals: payload.updatedProposals,
        },
        {
          onSuccess: () => setStage4SubChat(null),
          onError: () => showError('Could not save. Try again.'),
        }
      );
    },
    [resolveStage4SubChatMutation, sessionId, showError, stage4SubChat]
  );
  const handleDeclineStage4Need = useCallback(
    (needId: string) => {
      declineStage4Need.mutate(
        { sessionId, needId },
        {
          onError: () => {
            showError('Could not set that aside. Please try again.');
          },
        }
      );
    },
    [declineStage4Need, sessionId, showError]
  );
  const handleUndeclineStage4Need = useCallback(
    (needId: string) => {
      undeclineStage4Need.mutate(
        { sessionId, needId },
        {
          onError: () => {
            showError('Could not bring that back. Please try again.');
          },
        }
      );
    },
    [undeclineStage4Need, sessionId, showError]
  );
  const handleReviseStage4Selections = useCallback(() => {
    unshareStage4Selections.mutate(
      { sessionId },
      {
        onError: () => {
          showError('Could not unshare your stances. Please try again.');
        },
      }
    );
  }, [unshareStage4Selections, sessionId, showError]);
  const handleCloseRedesignedStage4 = useCallback(
    (kind: Stage4ClosureKind, reason: Stage4ClosureReason, checkInDate: string) => {
      closeStage4.mutate({
        sessionId,
        kind,
        reason,
        checkInDate,
      });
    },
    [closeStage4, sessionId]
  );
  const handleCreateTendingReentry = useCallback(
    (intent?: string) => {
      createTendingReentry.mutate({ sessionId, intent });
    },
    [createTendingReentry, sessionId]
  );
  const handleSubmitTendingResponse = useCallback(
    (
      entryId: string,
      response: {
        status: 'WORKED' | 'PARTLY' | 'DID_NOT_WORK' | 'DID_NOT_TRY' | 'OTHER';
        reflection?: string;
        continueChoice: 'CONTINUE' | 'ADJUST' | 'CLOSE' | 'NEW_PROCESS' | 'OTHER_TRACK';
      }
    ) => {
      submitTendingResponse.mutate({
        sessionId,
        entryId,
        ...response,
      });
    },
    [sessionId, submitTendingResponse]
  );

  // Local latches to prevent panel flashing during server refetches.
  // Once user completes an action, the latch stays true even if server data temporarily reverts.
  type CompletedAction =
    | 'shared-empathy'
    | 'confirmed-invitation'
    | 'responded-to-share-offer'
    | 'confirmed-needs'
    | 'validated-needs';

  type LocalEmpathyValidationAction = {
    attemptId: string;
    revisionCount?: number;
    statusVersion?: number;
    action: 'accepted' | 'feedback';
  };

  const [completedActions, setCompletedActions] = useState<Set<CompletedAction>>(new Set());
  const [localEmpathyValidationAction, setLocalEmpathyValidationAction] =
    useState<LocalEmpathyValidationAction | null>(null);

  const markCompleted = useCallback((action: CompletedAction) => {
    setCompletedActions(prev => {
      const next = new Set(prev);
      next.add(action);
      return next;
    });
  }, []);

  const resetCompleted = useCallback((action: CompletedAction) => {
    setCompletedActions(prev => {
      const next = new Set(prev);
      next.delete(action);
      return next;
    });
  }, []);

  // Extract frequently-read booleans to prevent FlatList re-renders
  const isLocalEmpathyValidationActive = isLocalEmpathyValidationCurrent(
    localEmpathyValidationAction,
    partnerEmpathyData?.attempt
  );
  const isEmpathyValidated =
    isLocalEmpathyValidationActive && localEmpathyValidationAction?.action === 'accepted';
  const isEmpathyShared = completedActions.has('shared-empathy');
  const effectiveMyValidation = isEmpathyValidated
    ? {
        ...sharingStatus.myValidation,
        validated: true,
        awaitingRevision: false,
      }
    : sharingStatus.myValidation;

  useEffect(() => {
    if (showFeedbackCoachChat && !feedbackCoachInitializedRef.current) {
      resetFeedbackCoachChat();
      feedbackCoachInitializedRef.current = true;
    } else if (!showFeedbackCoachChat) {
      feedbackCoachInitializedRef.current = false;
    }
  }, [showFeedbackCoachChat, resetFeedbackCoachChat]);

  useEffect(() => {
    if (isFeedbackCoachFinalized) {
      setShowFeedbackCoachChat(false);
      setFeedbackCoachRoughFeedback('');
    }
  }, [isFeedbackCoachFinalized]);



  // Auto-dismiss stage-specific drawers when stage transitions
  // Prevents stale drawers from stacking when the session advances
  useEffect(() => {
    const currentStage = myProgress?.stage;

    // Stage 2 drawers: empathy statement, accuracy feedback, share topic, validation coach
    if (currentStage !== undefined && currentStage !== Stage.PERSPECTIVE_STRETCH) {
      setShowEmpathyDrawer(false);
      setShowShareConfirm(false);
      setShowAccuracyFeedbackDrawer(false);
      setShowShareTopicDrawer(false);
      setShowFeedbackCoachChat(false);
    }

    // Stage 3 drawers: needs drawer
    if (currentStage !== undefined && currentStage !== Stage.NEED_MAPPING) {
      setShowNeedsDrawer(false);
    }
  }, [myProgress?.stage]);

  // -------------------------------------------------------------------------
  // App State Recovery: refetch critical data when returning from background
  // This ensures the UI shows correct state after Ably events were missed while backgrounded.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        // Invalidate session state — the primary source of truth for the UI.
        // React Query's focusManager also triggers stale refetches, but this
        // ensures immediate refresh even within the 30s staleTime window.
        queryClient.invalidateQueries({ queryKey: sessionKeys.state(sessionId) });
        for (const queryKey of getPersistedMessageRefreshQueryKeys(sessionId)) {
          queryClient.invalidateQueries({ queryKey });
        }
      }
    });
    return () => subscription.remove();
  }, [sessionId, queryClient]);

  // -------------------------------------------------------------------------
  // Local State for Session Entry Mood Check (persisted per session, 2h cooldown)
  // -------------------------------------------------------------------------
  const [hasCompletedMoodCheck, setHasCompletedMoodCheck] = useState(false);
  const [moodCheckLoading, setMoodCheckLoading] = useState(true);

  useEffect(() => {
    const MOOD_CHECK_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours
    const key = `mood_check_${sessionId}`;
    AsyncStorage.getItem(key).then((stored) => {
      if (stored) {
        const { completedAt } = JSON.parse(stored);
        if (Date.now() - completedAt < MOOD_CHECK_COOLDOWN_MS) {
          setHasCompletedMoodCheck(true);
        }
      }
      setMoodCheckLoading(false);
    }).catch(() => {
      setMoodCheckLoading(false);
    });
  }, [sessionId]);
  const [hasReleasedInitialSessionRender, setHasReleasedInitialSessionRender] = useState(false);
  const [hasCompletedInitialChatRender, setHasCompletedInitialChatRender] = useState(false);
  const isInitialSessionRenderReady = !isLoading && !isFetchingMessages && !moodCheckLoading;

  useEffect(() => {
    setHasReleasedInitialSessionRender(false);
    setHasCompletedInitialChatRender(false);
  }, [sessionId]);

  useEffect(() => {
    if (isInitialSessionRenderReady) {
      setHasReleasedInitialSessionRender(true);
    }
  }, [isInitialSessionRenderReady]);

  // When viewing a resolved session, allow toggling to chat history
  const [viewingResolvedHistory, setViewingResolvedHistory] = useState(false);

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
  // Invitee topic context now renders as a chronological chat card. There is
  // no second Ready gate after signing the opening agreement.
  const inviteeTopicAckPending = false;
  const {
    waitingStatus,
    shouldShowWaitingBanner,
    shouldHideInput: derivedShouldHideInput,
    isInOnboardingUnsigned,
    aboveInputPanel,
    panels: {
      showInvitationPanel: shouldShowInvitationPanel,
      showEmpathyPanel: shouldShowEmpathyPanel,
      showFeelHeardPanel: shouldShowFeelHeard,
      showShareSuggestionPanel: shouldShowShareSuggestion,
      showNeedsReviewPanel: shouldShowNeedsReview,
      showNeedsSharePanel: shouldShowNeedsShare,
      showNeedsRevealValidationPanel: shouldShowNeedsRevealValidation,
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
    hasTopicConfirmed: topicFrameConfirmed,
    invitationConfirmed,
    // Local dismissal latch — the panel hides as soon as the user taps
    // "Later" (or after a successful share, if the screen wants to stash it).
    invitationPanelDismissed,
    // isConfirmingInvitation: mutation is in flight
    isConfirmingInvitation,
    topicFrameProposed: topicFrame ?? null,
    topicProposalDismissed,
    isConfirmingTopicFrame,
    inviteeTopicAckPending,
    showFeelHeardConfirmation,
    feelHeardConfirmedAt: milestones?.feelHeardConfirmedAt,
    isConfirmingFeelHeard,
    empathyStatusData: empathyStatusData ? {
      analyzing: empathyStatusData.analyzing,
      awaitingSharing: empathyStatusData.awaitingSharing,
      hasNewSharedContext: empathyStatusData.hasNewSharedContext,
      hasUnviewedSharedContext: empathyStatusData.hasUnviewedSharedContext,
      myAttempt: empathyStatusData.myAttempt ? {
        status: empathyStatusData.myAttempt.status,
        content: empathyStatusData.myAttempt.content,
      } : undefined,
      partnerEmpathyHeldStatus: empathyStatusData.partnerEmpathyHeldStatus,
      myValidation: effectiveMyValidation,
      partnerValidated: sharingStatus.partnerValidated,
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
    hasSharedEmpathyLocal: isEmpathyShared,
    shareOfferData: shareOfferData ?? undefined,
    // Share offer panel shows ShareTopicPanel which opens ShareTopicDrawer
    hasRespondedToShareOfferLocal: completedActions.has('responded-to-share-offer'),
    allNeedsConfirmed,
    needsAvailable: (needs?.length ?? 0) > 0,
    needsShared: (myProgress?.gatesSatisfied as Record<string, unknown> | undefined)?.needsShared === true,
    needsRevealReady: (needsComparisonData?.myNeeds?.length ?? 0) > 0 && (needsComparisonData?.partnerNeeds?.length ?? 0) > 0,
    hasConfirmedNeedsLocal: completedActions.has('confirmed-needs'),
    needsRevealValidationCount: needsRevealValidationItems?.length ?? 0,
    needsRevealAvailable: (needsComparisonData?.myNeeds?.length ?? 0) > 0 && (needsComparisonData?.partnerNeeds?.length ?? 0) > 0,
    needsRevealNoOverlap: false,
    needsRevealValidatedByMe: (myProgress?.gatesSatisfied as Record<string, unknown> | undefined)?.needsValidated === true,
    needsRevealValidatedByBoth: needsRevealValidatedByBoth,
    hasValidatedNeedsRevealLocal: completedActions.has('validated-needs'),
    // Legacy Stage 4 inputs: the strategy-pool-preview / overlap-preview cards
    // are no longer emitted in renderInlineCard, but the hook still types them
    // as required. Pass benign defaults until the hook's prop shape is cleaned
    // up to drop them.
    strategyPhase: 'COLLECTING',
    overlappingStrategiesCount: 0,
    agreements: agreements?.map(a => ({
      agreedByMe: a.agreedByMe,
      agreedByPartner: a.agreedByPartner,
    })),
    stage4Selections: stage4State
      ? {
          mySelectionSubmitted: stage4State.mySelectionStatus === 'SUBMITTED',
          partnerSelectionSubmitted: stage4State.partnerSelectionStatus === 'SUBMITTED',
          hasOutcome: !!stage4State.outcome,
        }
      : undefined,
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

  // Animation for the invitation panel slide-up
  const invitationPanelAnim = useRef(new Animated.Value(0)).current;

  // Animation for collapsing the invitation panel when the keyboard is visible.
  // 1 = full height, 0 = collapsed. Multiplied with invitationPanelAnim's maxHeight.
  const invitationKeyboardCollapseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () => {
      Animated.timing(invitationKeyboardCollapseAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: false,
      }).start();
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      Animated.timing(invitationKeyboardCollapseAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: false,
      }).start();
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [invitationKeyboardCollapseAnim]);

  // Animation for the empathy statement review panel slide-up
  const empathyPanelAnim = useRef(new Animated.Value(0)).current;

  // Animation for the feel heard confirmation panel slide-up
  const feelHeardAnim = useRef(new Animated.Value(0)).current;

  // Animation for the share suggestion panel slide-up
  const shareSuggestionAnim = useRef(new Animated.Value(0)).current;

  // Animation for the needs review panel slide-up
  const needsReviewAnim = useRef(new Animated.Value(0)).current;

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
  const isRefiningEmpathy =
    !!empathyStatusData?.hasNewSharedContext ||
    empathyStatusData?.myAttempt?.status === EmpathyStatus.REFINING;

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
  const readyToShowNeedsReview = shouldShowNeedsReview || shouldShowNeedsShare || shouldShowNeedsRevealValidation;
  const readyToShowNeedsRevealValidation = shouldShowNeedsRevealValidation;
  const readyToShowWaitingBanner = shouldShowWaitingBanner;

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
      resetCompleted('shared-empathy');
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

  // Fire when share prompt first renders on screen (not on press)
  useEffect(() => {
    if (shareOfferData?.suggestion) {
      trackShareTopicShown(sessionId, shareOfferData.suggestion.action as 'OFFER_SHARING' | 'OFFER_OPTIONAL');
    }
  }, [shareOfferData?.suggestion]);

  // Share topic analytics tracking has moved to the Sharing Status screen

  // -------------------------------------------------------------------------
  // Phase 5: Share Suggestion Flow (Moved to dedicated Sharing Status screen)
  // -------------------------------------------------------------------------
  // Share suggestions are now accessed via the header button and displayed
  // in the Sharing Status screen at /session/[id]/sharing-status

  // Animate needs review panel - synced with mount condition
  useEffect(() => {
    Animated.spring(needsReviewAnim, {
      toValue: readyToShowNeedsReview ? 1 : 0,
      useNativeDriver: false,
      tension: 40,
      friction: 9,
    }).start();
  }, [readyToShowNeedsReview, needsReviewAnim]);


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
  const invitationMessageConfirmedAt = invitation?.messageConfirmedAt;
  const invitationAcceptedAt = invitation?.acceptedAt;

  const indicators = useMemo((): ChatIndicatorItem[] => {
    // Prepare session data for the selector
    const sessionData: SessionIndicatorData = {
      isInviter,
      sessionStatus: session?.status,
      currentUserId: user?.id,
      partnerName: partnerName || 'Partner',
      invitation: invitationMessageConfirmedAt || invitationAcceptedAt ? {
        messageConfirmedAt: invitationMessageConfirmedAt,
        acceptedAt: invitationAcceptedAt,
      } : undefined,
      milestones: {
        // Use ref as backup to prevent flickering during mutation
        feelHeardConfirmedAt: milestones?.feelHeardConfirmedAt ??
          (hasEverConfirmedFeelHeard.current || isConfirmingFeelHeard ? new Date().toISOString() : null),
      },
      mySharedAt: empathyStatusData?.mySharedAt,
    };

    // Derive indicators from session data
    // (includes self-shared context indicator derived from mySharedAt)
    const derivedIndicators = deriveIndicators(sessionData);

    // Convert to ChatIndicatorItem format (add 'type' field)
    const baseIndicators: ChatIndicatorItem[] = derivedIndicators.map((indicator) => ({
      type: 'indicator' as const,
      indicatorType: indicator.indicatorType,
      id: indicator.id,
      timestamp: indicator.timestamp,
      metadata: indicator.metadata,
    }));

    // Add indicators for SHARED_CONTEXT and EMPATHY_STATEMENT messages.
    // Self-authored SHARED_CONTEXT indicator is derived from mySharedAt in deriveIndicators().
    // Self-authored EMPATHY_STATEMENT indicators are included here so users see "Empathy shared" in their timeline.
    // Partner-authored SHARED_CONTEXT is hidden until user completes Stage 1 (PERSPECTIVE_STRETCH)
    // to avoid premature "shared something new" notifications.
    const hasCompletedStage1 = myProgress?.stage !== undefined && myProgress.stage >= Stage.PERSPECTIVE_STRETCH;
    const sharedContentIndicators: ChatIndicatorItem[] = messages
      .filter((m) => {
        if (m.role !== MessageRole.SHARED_CONTEXT && m.role !== MessageRole.EMPATHY_STATEMENT) return false;
        const isFromMe = user?.id ? m.senderId === user.id : false;
        // Self-authored SHARED_CONTEXT is already handled by deriveIndicators (via mySharedAt)
        if (isFromMe && m.role === MessageRole.SHARED_CONTEXT) return false;
        // Suppress partner SHARED_CONTEXT until user has completed Stage 1
        if (!isFromMe && m.role === MessageRole.SHARED_CONTEXT && !hasCompletedStage1) return false;
        return true;
      })
      .map((m) => {
        const isFromMe = user?.id ? m.senderId === user.id : false;
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

    const allIndicators: ChatIndicatorItem[] = [...baseIndicators, ...sharedContentIndicators];

    // --- Empathy validated indicator ---
    // Pin to the attempt's revealedAt timestamp (stable, set once when partner saw it).
    // If revealedAt is missing we intentionally skip the indicator rather than fall back
    // to `new Date()`, which would re-anchor the divider on every render and cause it to
    // visually slide just above the most-recent AI message on every turn.
    const empathyValidatedIndicator = deriveEmpathyValidatedIndicator(
      empathyStatusData?.myAttempt?.status ?? null,
      empathyStatusData?.myAttempt?.revealedAt ?? null,
      partnerName || 'Partner'
    );
    if (empathyValidatedIndicator) {
      allIndicators.push(empathyValidatedIndicator);
    }

    // --- Stage chapter markers ---
    // Chapter bars should appear at the milestone that opens the chapter, not
    // wherever the first message in that stage happens to sort.
    const chapterIndicators = deriveChapterMarkers(messages, {
      [Stage.WITNESS]: isInviter
        ? invitationMessageConfirmedAt
        : invitationAcceptedAt,
      [Stage.PERSPECTIVE_STRETCH]: milestones?.feelHeardConfirmedAt,
    });
    allIndicators.push(...chapterIndicators);

    return allIndicators;
  }, [isInviter, session?.status, invitationMessageConfirmedAt, invitationAcceptedAt, milestones?.feelHeardConfirmedAt, isConfirmingFeelHeard, messages, user?.id, partnerName, empathyStatusData?.mySharedAt, empathyStatusData?.myAttempt?.status, empathyStatusData?.myAttempt?.revealedAt, shareOfferData?.hasSuggestion, shareOfferData?.suggestion, myProgress?.stage]);




  // -------------------------------------------------------------------------
  // Prepare Messages for Display
  // -------------------------------------------------------------------------
  const displayMessages = useMemo((): ChatMessage[] => {
    const baseMessages: ChatMessage[] = [...messages];
    const myAttempt = empathyStatusData?.myAttempt;
    const partnerAttempt = empathyStatusData?.partnerAttempt;
    const mySharedContext = empathyStatusData?.mySharedContext;

    if (myAttempt?.content && myAttempt.sharedAt) {
      const hasMyAttemptMessage = baseMessages.some(
        (message) => isSameEmpathyAttemptMessage(message, user?.id, myAttempt),
      );

      if (!hasMyAttemptMessage) {
        baseMessages.push({
          id: `my-empathy-${myAttempt.id}`,
          sessionId,
          senderId: user?.id ?? null,
          role: MessageRole.EMPATHY_STATEMENT,
          content: myAttempt.content,
          stage: Stage.PERSPECTIVE_STRETCH,
          timestamp: myAttempt.sharedAt,
          sharedContentDeliveryStatus: myAttempt.deliveryStatus,
          sharedContentDirection: 'sent',
        });
      }
    }

    if (partnerAttempt?.content && (partnerAttempt.revealedAt || partnerAttempt.sharedAt)) {
      const partnerTimestamp = partnerAttempt.revealedAt || partnerAttempt.sharedAt;
      const hasPartnerAttemptMessage = baseMessages.some(
        (message) =>
          isSameEmpathyAttemptMessage(message, partnerAttempt.sourceUserId, {
            content: partnerAttempt.content,
            sharedAt: partnerTimestamp,
          }),
      );

      if (!hasPartnerAttemptMessage) {
        baseMessages.push({
          id: `partner-empathy-${partnerAttempt.id}`,
          sessionId,
          senderId: partnerAttempt.sourceUserId,
          role: MessageRole.EMPATHY_STATEMENT,
          content: partnerAttempt.content,
          stage: Stage.PERSPECTIVE_STRETCH,
          timestamp: partnerTimestamp,
          sharedContentDeliveryStatus: 'delivered',
          sharedContentDirection: 'received',
        });
      }
    }

    // The subject's accepted/refined share is stored on the empathy status
    // response, but the backend only creates a SHARED_CONTEXT chat message for
    // the recipient. Synthesize a local chat item so the sender's chat shows
    // the same shared artifact inline too.
    if (mySharedContext?.content && mySharedContext.sharedAt) {
      const hasSelfSharedContextMessage = baseMessages.some(
        (message) =>
          message.role === MessageRole.SHARED_CONTEXT &&
          message.senderId === user?.id &&
          message.timestamp === mySharedContext.sharedAt,
      );

      if (!hasSelfSharedContextMessage) {
        baseMessages.push({
          id: `my-shared-context-${mySharedContext.sharedAt}`,
          sessionId,
          senderId: user?.id ?? null,
          role: MessageRole.SHARED_CONTEXT,
          content: mySharedContext.content,
          stage: Stage.PERSPECTIVE_STRETCH,
          timestamp: mySharedContext.sharedAt,
          sharedContentDeliveryStatus: mySharedContext.deliveryStatus ?? undefined,
          sharedContentDirection: 'sent',
        });
      }
    }

    // Find self-authored EMPATHY_STATEMENT messages to detect superseded revisions.
    const myEmpathyStatements = baseMessages.filter(
      (m) => m.role === MessageRole.EMPATHY_STATEMENT && m.senderId === user?.id
    );

    // Sort by timestamp to find the latest one
    const sortedStatements = [...myEmpathyStatements].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // The latest empathy statement ID (if any)
    const latestEmpathyId = sortedStatements[0]?.id;

    // Enrich messages with delivery status for shared content
    return baseMessages.map((message) => {
      const sharedContentDirection =
        message.role === MessageRole.EMPATHY_STATEMENT ||
        message.role === MessageRole.SHARED_CONTEXT
          ? (message.senderId === user?.id ? 'sent' as const : 'received' as const)
          : undefined;

      if (message.role === MessageRole.SHARED_CONTEXT) {
        const deliveryStatus =
          message.senderId === user?.id
            ? (mySharedContext?.deliveryStatus ?? undefined)
            : undefined;

        return {
          ...message,
          sharedContentDeliveryStatus:
            message.sharedContentDeliveryStatus ?? deliveryStatus,
          sharedContentDirection,
        };
      }

      // For EMPATHY_STATEMENT messages, determine which delivery status to use:
      // - If this is NOT the latest empathy statement, mark as superseded
      // - If content matches myAttempt (guesser's empathy statement), use myAttempt.deliveryStatus
      if (message.role === MessageRole.EMPATHY_STATEMENT) {
        // Check if this is a superseded (older) empathy statement
        if (
          message.senderId === user?.id &&
          myEmpathyStatements.length > 1 &&
          message.id !== latestEmpathyId &&
          hasNewerDistinctEmpathyStatement(message, myEmpathyStatements)
        ) {
          return {
            ...message,
            sharedContentDeliveryStatus: 'superseded' as const,
            sharedContentDirection,
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
            sharedContentDirection,
          };
        }
        // Fallback: If message already has a status (from optimistic update), preserve it
        // This handles the race condition where empathyStatusData hasn't refetched yet
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const existingStatus = (message as any).sharedContentDeliveryStatus;
        if (existingStatus) {
          return { ...message, sharedContentDeliveryStatus: existingStatus, sharedContentDirection };
        }
        // Default to 'pending' for empathy statements without a status
        // (e.g., when empathyStatusData is still loading)
        return {
          ...message,
          sharedContentDeliveryStatus: 'pending' as const,
          sharedContentDirection,
        };
      }
      return message;
    });
  }, [
    messages,
    empathyStatusData?.myAttempt,
    empathyStatusData?.mySharedContext,
    empathyStatusData?.partnerAttempt,
    sessionId,
    user?.id,
  ]);

  // -------------------------------------------------------------------------
  // Validation Cards (Inline in Chat FlatList)
  // -------------------------------------------------------------------------
  const validationCards = useMemo((): ChatValidationCardItem[] => {
    if (
      !partnerEmpathyData?.attempt?.content ||
      !partnerEmpathyData.attempt.revealedAt ||
      myProgress?.stage !== Stage.PERSPECTIVE_STRETCH
    ) {
      return [];
    }

    const attemptId = partnerEmpathyData.attempt.id;
    const isValidated = partnerEmpathyData.validated || isEmpathyValidated;

    let cardStatus: 'pending' | 'validated' | 'feedback-given' | 'superseded';
    cardStatus = getEmpathyValidationCardStatus({
      serverValidated: isValidated,
      locallySentFeedback:
        isLocalEmpathyValidationActive && localEmpathyValidationAction?.action === 'feedback',
    });

    return [{
      type: 'validation-card',
      id: `validation-${attemptId}`,
      timestamp: partnerEmpathyData.attempt.revealedAt,
      partnerName: partnerName || 'Partner',
      empathyContent: partnerEmpathyData.attempt.content,
      status: cardStatus,
      attemptId,
    }];
  }, [
    partnerEmpathyData,
    myProgress?.stage,
    partnerName,
    isEmpathyValidated,
    isLocalEmpathyValidationActive,
    localEmpathyValidationAction?.action,
  ]);

  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Validation Card Handlers
  // -------------------------------------------------------------------------
  const markLocalEmpathyValidation = useCallback((action: LocalEmpathyValidationAction['action']) => {
    const attempt = partnerEmpathyData?.attempt;
    if (!attempt) return;
    setLocalEmpathyValidationAction({
      attemptId: attempt.id,
      revisionCount: attempt.revisionCount,
      statusVersion: attempt.statusVersion,
      action,
    });
  }, [partnerEmpathyData?.attempt]);

  const handleValidationAccurate = useCallback(() => {
    markLocalEmpathyValidation('accepted');
    handleValidatePartnerEmpathy(true);
  }, [markLocalEmpathyValidation, handleValidatePartnerEmpathy]);

  const handleValidationNotQuite = useCallback(() => {
    setShowAccuracyFeedbackDrawer(true);
  }, []);

  const openFeedbackCoachWithRoughFeedback = useCallback((roughFeedback: string) => {
    setFeedbackCoachRoughFeedback(roughFeedback);
    feedbackCoachInitializedRef.current = false;
    setShowFeedbackCoachChat(true);
  }, []);

  // -------------------------------------------------------------------------
  // Render Inline Card
  // -------------------------------------------------------------------------
  // Legacy renderStrategyPreviewCard removed - Stage4RedesignPanel is the
  // canonical Stage 4 surface and renders its own inline cards.

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
        // Note: accuracy-feedback case removed - now handled by inline validation card

        // Note: needs-summary and needs-reveal-preview cases removed.
        // These are now shown in the NeedsDrawer bottom sheet, opened via
        // the above-input buttons (needs-review, needs-reveal-validation).

        // 'strategy-pool-preview' and 'overlap-preview' cases removed -
        // those entry points opened the legacy StrategyPool/OverlapReveal
        // overlays. Stage4RedesignPanel renders its own coverage/overlap UI.

        case 'agreement-preview': {
          const totalAgreements = card.props.totalAgreements as number;
          const confirmedByMeCount = card.props.confirmedByMe as number;
          const isWaitingForPartner = card.props.waitingForPartner as boolean;
          const cardPartnerName = card.props.partnerName as string | undefined;
          const cardAgreements = card.props.agreements as Array<{ experiment?: string }> | undefined;
          const firstExperiment = cardAgreements?.[0]?.experiment;

          let statusText: string;
          let showButton = true;

          if (isWaitingForPartner) {
            statusText = `Confirmed \u2014 waiting for ${cardPartnerName || 'partner'}`;
            showButton = false;
          } else if (confirmedByMeCount > 0 && confirmedByMeCount < totalAgreements) {
            statusText = `${confirmedByMeCount}/${totalAgreements} confirmed`;
          } else {
            statusText = `${totalAgreements} agreement${totalAgreements > 1 ? 's' : ''} to review`;
          }

          return (
            <TouchableOpacity
              style={styles.inlineCard}
              key={card.id}
              onPress={() => openOverlay('agreement-confirmation')}
              activeOpacity={0.7}
            >
              <Text style={styles.cardTitle}>Your Agreement</Text>
              {firstExperiment && (
                <Text style={styles.agreementExperiment} numberOfLines={3}>
                  {firstExperiment}
                </Text>
              )}
              <Text style={styles.cardSubtitle}>
                {statusText}
              </Text>
              {showButton && (
                <TouchableOpacity
                  testID="agreement-review-button"
                  style={styles.primaryButton}
                  onPress={() => openOverlay('agreement-confirmation')}
                >
                  <Text style={styles.primaryButtonText}>Review</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          );
        }

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
      handleConsentToShareNeeds,
      handleRespondToShareOffer,
      sendMessage,
      onStageComplete,
      onNavigateBack,
    ]
  );

  // 'strategy-pool-preview' is no longer emitted by useChatUIState now that the
  // legacy StrategyPool path is gone. Pass inlineCards through directly.
  const transcriptInlineCards = inlineCards;

  // -------------------------------------------------------------------------
  // Invitation URL for sharing (must be before early returns)
  // -------------------------------------------------------------------------
  const invitationUrl = useMemo(() => {
    if (invitation?.id) {
      return createInvitationLink(invitation.id);
    }
    return '';
  }, [invitation?.id]);

  const partnerAccepted = !!invitation?.acceptedAt;

  // Shared share-invitation handler used by both the InvitationReadyModal and
  // the ActivityDrawer's "Share invitation" button.
  const handleShareInvitation = useCallback(async (): Promise<boolean> => {
    if (!invitationUrl) return false;
    try {
      if (process.env.EXPO_PUBLIC_E2E_MODE === 'true') {
        console.log('[UnifiedSessionScreen] E2E mode: treating invitation as shared', {
          sessionId,
          invitationUrl,
        });
        return true;
      }

      const shareMessage = buildInvitationShareText(invitationUrl);
      const result = await Share.share(
        Platform.OS === 'web'
          ? {
              message: shareMessage,
              title: partnerName ? `Invitation for ${partnerName}` : 'Join me on Meet Without Fear',
            }
          : {
              message: shareMessage,
              title: partnerName ? `Invitation for ${partnerName}` : 'Join me on Meet Without Fear',
              url: invitationUrl,
            }
      );
      if (result.action === Share.sharedAction) {
        trackInvitationSent(sessionId, 'share_sheet');
        return true;
      }
      return false;
    } catch (e) {
      console.error('[UnifiedSessionScreen] Share invitation error:', e);
      return false;
    }
  }, [invitationUrl, partnerName, sessionId]);

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
    return shouldShowSessionEntryMoodCheck({
      activeOverlay,
      hasCompletedMoodCheck,
      isE2EMode: process.env.EXPO_PUBLIC_E2E_MODE === 'true',
      isInOnboardingUnsigned,
      isLoading,
      loadingCompact,
      moodCheckLoading,
      sessionStatus: session?.status,
    });
  }, [isLoading, moodCheckLoading, loadingCompact, isInOnboardingUnsigned, hasCompletedMoodCheck, activeOverlay, session?.status]);

  // -------------------------------------------------------------------------
  // Memoized Empty State Element (prevents typewriter restart on re-render)
  // -------------------------------------------------------------------------
  // Use useMemo to create a stable element reference, not a render function
  // Pass isFirstSession from compact data to show appropriate welcome message
  const isFirstSession = compactData?.isFirstSession ?? true;
  const compactEmptyStateElement = useMemo(() => {
    return <CompactChatItem testID="inline-compact" isFirstSession={isFirstSession} />;
  }, [isFirstSession]);

  const inviteeOpeningCards = useMemo((): ChatCustomCardItem[] => {
    if (isInviter || !compactData?.mySigned || !topicFrame) return [];

    return [{
      type: 'custom-card',
      id: 'invitee-topic-frame-card',
      animate: true,
      timestamp: timestampBeforeChatStart(
        compactData.mySignedAt || invitation?.acceptedAt || session?.createdAt
      ),
      render: (options) => (
        <InviteeTopicIntroCard
          partnerName={partnerName || 'your partner'}
          topicFrame={topicFrame}
          skipAnimation={options?.skipAnimation ?? true}
          onAnimationComplete={options?.onAnimationComplete}
        />
      ),
    }];
  }, [
    isInviter,
    compactData?.mySigned,
    compactData?.mySignedAt,
    topicFrame,
    partnerName,
    invitation?.acceptedAt,
    session?.createdAt,
  ]);

  const needsReviewCards = useMemo((): ChatCustomCardItem[] => {
    if (currentStage !== Stage.NEED_MAPPING) return [];
    if (!needsData?.synthesizedAt || !needs || needs.length === 0) return [];
    if (aboveInputPanel === 'needs-review' || aboveInputPanel === 'needs-share') return [];
    const gates = myProgress?.gatesSatisfied as Record<string, unknown> | undefined;
    let needsStatus: 'ready' | 'confirmed' | 'shared' = 'ready';
    if (gates?.needsShared === true) {
      needsStatus = 'shared';
    } else if (allNeedsConfirmed) {
      needsStatus = 'confirmed';
    }

    return [{
      type: 'custom-card',
      id: `needs-identified-${needsData.synthesizedAt}`,
      animate: true,
      timestamp: needsData.synthesizedAt,
      render: () => (
        <NeedsIdentifiedChatCard
          needs={needs.map((need) => ({
            id: need.id,
            need: need.need,
            category: String(need.category),
          }))}
          status={needsStatus}
          onReview={() => {
            setNeedsDrawerMode(getNeedsDrawerModeForNeedsStatus(needsStatus));
            setShowNeedsDrawer(true);
          }}
        />
      ),
    }];
  }, [currentStage, needsData?.synthesizedAt, needs, myProgress?.gatesSatisfied, allNeedsConfirmed, aboveInputPanel]);

  // Stage4RedesignPanel is now mounted inside a slide-up Modal (Stage 4 drawer)
  // rather than as an inline chat card. The CTA above the chat input opens it.

  const sourceInnerThoughts = session?.sourceInnerThoughts ?? null;
  const sourceInnerThoughtsCards = useMemo((): ChatCustomCardItem[] => {
    if (!sourceInnerThoughts) return [];

    const timestamp = timestampBeforeChatStart(displayMessages[0]?.timestamp || session?.createdAt);

    return [{
      type: 'custom-card',
      id: `source-inner-thoughts-${sourceInnerThoughts.id}`,
      timestamp,
      animate: false,
      render: () => (
        <TouchableOpacity
          style={styles.sourceInnerThoughtsCard}
          onPress={() => router.push({
            pathname: '/inner-work/self-reflection/[id]',
            params: {
              id: sourceInnerThoughts.id,
              partnerSessionId: sessionId,
              partnerName,
            },
          })}
          accessibilityRole="button"
          accessibilityLabel="Open source Inner Thoughts"
        >
          <Text style={styles.sourceInnerThoughtsIcon}>↙</Text>
          <View style={styles.sourceInnerThoughtsTextWrap}>
            <Text style={styles.sourceInnerThoughtsLabel} numberOfLines={1}>
              From Inner Thoughts
            </Text>
            <Text style={styles.sourceInnerThoughtsTitle} numberOfLines={2}>
              {sourceInnerThoughts.title || sourceInnerThoughts.theme || sourceInnerThoughts.summary || 'Private reflection'}
            </Text>
          </View>
        </TouchableOpacity>
      ),
    }];
  }, [
    displayMessages,
    partnerName,
    router,
    session?.createdAt,
    sessionId,
    sourceInnerThoughts,
    styles.sourceInnerThoughtsCard,
    styles.sourceInnerThoughtsIcon,
    styles.sourceInnerThoughtsLabel,
    styles.sourceInnerThoughtsTextWrap,
    styles.sourceInnerThoughtsTitle,
  ]);

  const chatCustomCards = useMemo(
    () => [...sourceInnerThoughtsCards, ...inviteeOpeningCards, ...needsReviewCards],
    [sourceInnerThoughtsCards, inviteeOpeningCards, needsReviewCards]
  );

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

      // 'strategy-pool', 'strategy-ranking', 'overlap-reveal' overlays removed
      // (Stage4RedesignPanel is the canonical Stage 4 surface now).

      case 'agreement-confirmation': {
        const unconfirmedAgreements = agreements.filter(a => !a.agreedByMe);
        const currentAgreement = unconfirmedAgreements[0];
        const confirmedCount = agreements.length - unconfirmedAgreements.length;

        if (!currentAgreement && agreements.length > 0) {
          // All confirmed by me - check if we should show waiting message
          const allConfirmedByPartner = agreements.every(a => a.agreedByPartner);
          if (!allConfirmedByPartner) {
            // Show brief waiting message then auto-close
            return (
              <View style={[styles.overlayContainer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
                <Text style={styles.waitingMessageText}>
                  {"You've confirmed your part. The agreement is now waiting for " +
                   (partnerName || 'your partner') +
                   ". There's nothing more you need to do right now."}
                </Text>
              </View>
            );
          }
          return null;
        }

        if (!currentAgreement) return null;

        return (
          <View style={[styles.overlayContainer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
            {agreements.length > 1 && (
              <Text style={styles.agreementCounter}>
                {confirmedCount + 1} of {agreements.length}
              </Text>
            )}
            <AgreementCard
              agreement={{
                experiment: currentAgreement.description,
                duration: currentAgreement.duration || 'To be determined',
                successMeasure: currentAgreement.measureOfSuccess || 'To be defined together',
                checkInDate: currentAgreement.followUpDate || undefined,
              }}
              confirmedByMe={currentAgreement.agreedByMe}
              confirmedByPartner={currentAgreement.agreedByPartner}
              partnerName={partnerName}
              onConfirm={() => {
                handleConfirmAgreement(currentAgreement.id, (response: ConfirmAgreementResponse) => {
                  if (response.sessionCanResolve) {
                    trackSessionResolved(sessionId, 'agreement');
                    handleResolveSession(() => onStageComplete?.(Stage.STRATEGIC_REPAIR));
                    closeOverlay();
                  } else if (unconfirmedAgreements.length <= 1) {
                    // Last agreement confirmed but partner hasn't confirmed all
                    // Close overlay after brief delay - user returns to chat with WaitingBanner
                    setTimeout(() => closeOverlay(), 3000);
                  }
                  // If more unconfirmed remain, the filter re-derives and shows the next
                });
              }}
            />
          </View>
        );
      }

      // curiosity-compact is now handled as a separate overlay using CuriosityCompactOverlay

      default:
        return null;
    }
  }, [
    activeOverlay,
    barometerValue,
    agreements,
    sessionId,
    styles,
    partnerName,
    handleBarometerChange,
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
  // Render guided input panel (now positioned below the chat input by ChatInterface)
  // -------------------------------------------------------------------------
  const renderAboveInput = useCallback((): React.ReactNode | undefined => {
    if (session?.status === SessionStatus.RESOLVED && viewingResolvedHistory) {
      return (
        <GuidedActionPanel
          tone="review"
          eyebrow="Resolved"
          title="A Path Forward"
          subtitle="Return to the summary of what you and your partner agreed."
          primaryAction={{
            label: 'View summary',
            onPress: () => setViewingResolvedHistory(false),
            testID: 'back-to-path-forward-button',
          }}
          testID="back-to-path-forward-panel"
        />
      );
    }
    switch (aboveInputPanel) {
      case 'compact-agreement-bar':
        return (
          <CompactAgreementBar
            onSign={() => {
              // Cache-First: useSignCompact.onMutate sets compact.mySignedAt optimistically
              // Mark that compact was just signed (for typewriter animation after mood check)
              setJustSignedCompact(true);
              trackCompactSigned(sessionId, invitation?.isInviter ?? true);
              handleSignCompact(() => onStageComplete?.(Stage.ONBOARDING));
            }}
            isPending={isSigningCompact}
            isFirstSession={isFirstSession}
            testID="compact-agreement-bar"
          />
        );

      case 'topic-proposal':
        if (!topicFrame) return undefined;
        return (
          <GuidedActionPanel
            tone="topic"
            eyebrow="Topic frame"
            title={topicFrame}
            subtitle="This stays above the input at the end of Stage 0. To change it, tell me below."
            primaryAction={{
              label: 'Use this topic',
              onPress: handleConfirmTopicFrame,
              disabled: isConfirmingTopicFrame,
              loading: isConfirmingTopicFrame,
              testID: 'topic-proposal-use-button',
            }}
            testID="topic-proposal-panel"
          />
        );

      case 'feel-heard':
        return (
          <MeasuredAnimatedPanel animationValue={feelHeardAnim}>
            <FeelHeardConfirmation
              onConfirm={() => {
                // Track felt heard response
                trackFeltHeardResponse(sessionId, 'yes');
                // Cache-First: useConfirmFeelHeard.onMutate sets milestones.feelHeardConfirmedAt optimistically
                handleConfirmFeelHeard(() => onStageComplete?.(Stage.WITNESS));
              }}
              isPending={isConfirmingFeelHeard}
            />
          </MeasuredAnimatedPanel>
        );

      case 'empathy-statement':
        return (
          <View pointerEvents={!isSharingEmpathy ? 'auto' : 'none'}>
            <MeasuredAnimatedPanel animationValue={empathyPanelAnim}>
              <GuidedActionPanel
                tone="review"
                eyebrow={isRefiningEmpathy ? 'Revision' : 'Empathy draft'}
                title={isRefiningEmpathy ? 'Revisit what you’ll share' : 'Review what you’ll share'}
                subtitle={isRefiningEmpathy
                  ? `${partnerName} shared more context. Check whether your understanding should change.`
                  : `Open your draft before sending it to ${partnerName}.`}
                primaryAction={{
                  label: 'Review',
                  onPress: () => setShowEmpathyDrawer(true),
                  testID: 'empathy-review-button',
                }}
                testID="empathy-review-panel"
              />
            </MeasuredAnimatedPanel>
          </View>
        );

      case 'share-suggestion':
        return (
          <MeasuredAnimatedPanel animationValue={shareSuggestionAnim}>
            {shareOfferData?.suggestion &&
             (shareOfferData.suggestion.action === 'OFFER_OPTIONAL' ||
              shareOfferData.suggestion.action === 'OFFER_SHARING') && (
              <ShareTopicPanel
                visible={true}
                action={shareOfferData.suggestion.action}
                partnerName={partnerName}
                onPress={() => {
                  setShowShareTopicDrawer(true);
                }}
              />
            )}
          </MeasuredAnimatedPanel>
        );

      case 'invitation':
        // The invitation step is now rendered as a centered modal (see
        // <InvitationReadyModal /> below). No inline panel above the input.
        return undefined;

      case 'needs-review':
        return undefined;

      case 'needs-share':
        return undefined;

      case 'needs-reveal-validation':
        return (
          <MeasuredAnimatedPanel animationValue={needsReviewAnim}>
            <GuidedActionPanel
              tone="needs"
              eyebrow="Needs review"
              title="Review needs together"
              subtitle="Open both needs lists side by side before continuing."
              primaryAction={{
                label: 'Review',
                onPress: () => {
                  setShowActivityMenu(false);
                  setNeedsDrawerMode('reveal');
                  setShowNeedsDrawer(true);
                },
                testID: 'needs-reveal-validate-button',
              }}
              testID="needs-reveal-validate-panel"
            />
          </MeasuredAnimatedPanel>
        );

      case 'waiting-banner':
        return (
          <WaitingBanner
            status={waitingStatus}
            partnerName={partnerName || 'your partner'}
            animationValue={waitingBannerAnim}
            onExercisePress={() => openOverlay('support-options')}
            onActionPress={
              waitingStatus === 'stage4-selections-pending'
                ? () => setShowStage4Drawer(true)
                : undefined
            }
            testID="waiting-banner"
          />
        );

      default:
        // Fallback: when no other panel is queued and we're in the redesigned
        // Stage 4, surface the proposal-review entry point above the input so
        // the user always has a way to open the Stage 4 drawer.
        if (hasRedesignedStage4 && stage4State) {
          const allProposals = [
            ...stage4State.inventory.sharedProposals,
            ...stage4State.inventory.individualCommitments,
          ];
          const proposalCount = allProposals.length;
          if (proposalCount === 0) return undefined;

          const who = partnerName || 'them';
          const mineSubmitted = stage4State.mySelectionStatus === 'SUBMITTED';
          const partnerSubmitted = stage4State.partnerSelectionStatus === 'SUBMITTED';
          const allStanced = allProposals.every((p) => Boolean(p.myDecision));
          const hasMutualWilling = stage4State.inventory.sharedProposals.some(
            (p) =>
              p.myDecision === Stage4SelectionDecision.WILLING &&
              p.partnerDecisionVisible === Stage4SelectionDecision.WILLING,
          );

          let title: string;
          let subtitle: string;
          let label: string;
          if (stage4State.outcome) {
            // Outcome already exists; chat surface doesn't need a CTA here.
            return undefined;
          } else if (!mineSubmitted && !allStanced) {
            title =
              proposalCount === 1 ? '1 proposal on the table' : `${proposalCount} proposals on the table`;
            subtitle = 'Take a stance on each one when you’re ready.';
            label = 'Review';
          } else if (!mineSubmitted && allStanced) {
            title = 'Ready to share your stances';
            subtitle = `Open this to share them with ${who}.`;
            label = 'Review & share';
          } else if (mineSubmitted && !partnerSubmitted) {
            title = `Waiting for ${who}`;
            subtitle = `You'll know as soon as ${who} shares.`;
            label = 'Review';
          } else if (mineSubmitted && partnerSubmitted && hasMutualWilling) {
            title = `You and ${who} agree on at least one proposal`;
            subtitle = 'Open this to close with a shared agreement.';
            label = 'Review & close';
          } else {
            title = `${who} has shared too`;
            subtitle = 'No mutual “willing” yet — open this to see your options.';
            label = 'Review';
          }

          return (
            <GuidedActionPanel
              tone="review"
              eyebrow="What comes next"
              title={title}
              subtitle={subtitle}
              primaryAction={{
                label,
                onPress: () => setShowStage4Drawer(true),
                testID: 'stage4-review-button',
              }}
              testID="stage4-review-panel"
            />
          );
        }
        return undefined;
    }
  }, [
    aboveInputPanel,
    hasRedesignedStage4,
    stage4State,
    session?.status,
    viewingResolvedHistory,
    sessionId,
    invitation?.isInviter,
    isInviter,
    isSigningCompact,
    isFirstSession,
    isTypewriterAnimating,
    isConfirmingFeelHeard,
    isSharingEmpathy,
    isRefiningEmpathy,
    isConfirmingInvitation,
    invitationUrl,
    topicFrame,
    topicFrameConfirmed,
    partnerName,
    shareOfferData,
    waitingStatus,
    user?.name,
    user?.firstName,
    styles,
    feelHeardAnim,
    empathyPanelAnim,
    shareSuggestionAnim,
    invitationPanelAnim,
    needsReviewAnim,
    waitingBannerAnim,
    handleSignCompact,
    handleConfirmFeelHeard,
    handleConfirmTopicFrame,
    isConfirmingTopicFrame,
    handleConfirmAllNeeds,
    handleValidateNeedsReveal,
    handleNeedsNotValidYet,
    markCompleted,
    onStageComplete,
    openOverlay,
  ]);

  const renderBelowInput = useCallback((): React.ReactNode | undefined => {
    if (aboveInputPanel === 'needs-review' || aboveInputPanel === 'needs-share') {
      if (!needs || needs.length === 0) {
        return undefined;
      }

      const gates = myProgress?.gatesSatisfied as Record<string, unknown> | undefined;
      let needsStatus: 'ready' | 'confirmed' | 'shared' = 'ready';
      if (gates?.needsShared === true) {
        needsStatus = 'shared';
      } else if (allNeedsConfirmed) {
        needsStatus = 'confirmed';
      }

      return (
        <Animated.View
          style={{
            opacity: needsReviewAnim,
            maxHeight: needsReviewAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 420],
            }),
            transform: [{
              translateY: needsReviewAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [20, 0],
              }),
            }],
            overflow: 'hidden',
          }}
          pointerEvents="auto"
        >
          <View style={styles.needsReviewBelowInputContainer}>
            <NeedsIdentifiedChatCard
              needs={needs.map((need) => ({
                id: need.id,
                need: need.need,
                category: String(need.category),
              }))}
              status={needsStatus}
              compact
              onReview={() => {
                setShowActivityMenu(false);
                setNeedsDrawerMode(getNeedsDrawerModeForNeedsStatus(needsStatus));
                setShowNeedsDrawer(true);
              }}
            />
          </View>
        </Animated.View>
      );
    }

    return undefined;
  }, [
    aboveInputPanel,
    needsReviewAnim,
    styles,
    needs,
    myProgress?.gatesSatisfied,
    allNeedsConfirmed,
  ]);

  // -------------------------------------------------------------------------
  // Loading State
  // -------------------------------------------------------------------------
  if (isLoading || !hasReleasedInitialSessionRender) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={styles.accentColor.color} />
        <Text style={styles.loadingText}>Loading session...</Text>
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // Load Error — network/server failure (retries exhausted)
  // The foreground recovery effect (AppState listener) will auto-retry when
  // the app returns from background, so the user can also just reopen.
  // -------------------------------------------------------------------------
  if (loadError) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>Couldn't load session</Text>
        <Text style={[styles.loadingText, { fontSize: 14, marginTop: 4, opacity: 0.7 }]}>
          Check your connection and try again.
        </Text>
        <TouchableOpacity onPress={() => refetchSession()} style={{ marginTop: 20 }}>
          <Text style={[styles.loadingText, { textDecorationLine: 'underline' }]}>Retry</Text>
        </TouchableOpacity>
        {onNavigateBack && (
          <TouchableOpacity onPress={onNavigateBack} style={{ marginTop: 12 }}>
            <Text style={[styles.loadingText, { textDecorationLine: 'underline' }]}>Go back</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // Access Denied — user is not a member of this session's relationship
  // -------------------------------------------------------------------------
  if (accessDenied) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>You don't have access to this session.</Text>
        {onNavigateBack && (
          <TouchableOpacity onPress={onNavigateBack} style={{ marginTop: 16 }}>
            <Text style={[styles.loadingText, { textDecorationLine: 'underline' }]}>Go back</Text>
          </TouchableOpacity>
        )}
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
        onBack={onNavigateBack}
        onComplete={(intensity) => {
          // Save to user profile (persists across sessions)
          updateMood({ intensity });
          // Update local user state immediately so next session uses it
          updateUser({ lastMoodIntensity: intensity });
          // Also update session-specific barometer
          handleBarometerChange(intensity);
          setHasCompletedMoodCheck(true);
          // Persist to AsyncStorage with timestamp for 2h cooldown
          AsyncStorage.setItem(
            `mood_check_${sessionId}`,
            JSON.stringify({ completedAt: Date.now() })
          ).catch(() => {});
        }}
      />
    );
  }

  const tendingPanel = session?.status === SessionStatus.RESOLVED ? (
    <TendingPanel
      entries={tendingEntriesQuery.data?.entries ?? []}
      agreements={stage4State?.outcome?.agreements ?? agreements}
      outcome={stage4State?.outcome}
      initialEntryId={initialTendingEntryId}
      isCreatingReentry={createTendingReentry.isPending}
      isSubmittingResponse={submitTendingResponse.isPending}
      onCreateReentry={handleCreateTendingReentry}
      onSubmitResponse={handleSubmitTendingResponse}
      currentUserId={user?.id}
      isUpdatingShare={setTendingEntryShare.isPending}
      onToggleShare={(entryId, optedInShared) => {
        if (!sessionId) return;
        setTendingEntryShare.mutate({ sessionId, entryId, optedInShared });
      }}
    />
  ) : null;

  // -------------------------------------------------------------------------
  // Session Completion - Full Screen (when session is resolved)
  // -------------------------------------------------------------------------
  if (session?.status === SessionStatus.RESOLVED && !viewingResolvedHistory) {
    if (
      stage4State?.outcome?.kind === Stage4ClosureKind.NO_SHARED_AGREEMENT ||
      stage4State?.phase === Stage4Phase.CLOSED_NO_SHARED_AGREEMENT
    ) {
      return (
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <SessionChatHeader
            partnerName={partnerName}
            partnerOnline={partnerOnline}
            connectionStatus={connectionStatus}
            briefStatus={getBriefStatus(session?.status, invitation?.isInviter)}
            onBackPress={onNavigateBack}
            onPress={() => setShowPartnerInfo(true)}
            conversationTopic={topicFrame}
            testID="session-chat-header"
          />
          {partnerInfoDrawer}
          <View style={styles.content}>
            <Stage4RedesignPanel
              state={stage4State}
              partnerName={partnerName}
              isSelecting={submitStage4Selection.isPending}
              isClosing={closeStage4.isPending}
              isSharing={shareStage4Selections.isPending}
              isRevising={unshareStage4Selections.isPending}
              onSelectProposal={handleStage4Selection}
              onShareSelections={handleShareStage4Selections}
              onReviseSelections={handleReviseStage4Selections}
              onBrainstormNeed={handleBrainstormStage4Need}
              onRefineProposal={handleRefineStage4Proposal}
              onKeepRefiningNoOverlap={handleKeepRefiningNoOverlap}
              onDeclineNeed={handleDeclineStage4Need}
              onUndeclineNeed={handleUndeclineStage4Need}
              onCloseStage4={handleCloseRedesignedStage4}
            />
            {tendingPanel}
            <TouchableOpacity
              style={styles.viewHistoryButton}
              onPress={() => setViewingResolvedHistory(true)}
              accessibilityRole="button"
              accessibilityLabel="View conversation history"
            >
              <Text style={styles.viewHistoryButtonText}>View conversation history</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <SessionChatHeader
          partnerName={partnerName}
          partnerOnline={partnerOnline}
          connectionStatus={connectionStatus}
          briefStatus={getBriefStatus(session?.status, invitation?.isInviter)}
          onBackPress={onNavigateBack}
          onPress={() => setShowPartnerInfo(true)}
          conversationTopic={topicFrame}
          testID="session-chat-header"
        />
        {partnerInfoDrawer}
        <SessionCompletionScreen
          partnerName={partnerName}
          agreements={agreements.map((a) => ({
            id: a.id,
            experiment: a.description,
            duration: a.duration,
            measureOfSuccess: a.measureOfSuccess,
            followUpDate: a.followUpDate,
          }))}
          individualCommitments={
            stage4State?.outcome?.individualCommitments.map((c) => ({
              id: c.id,
              description: c.description,
            })) ?? []
          }
          openNeeds={
            stage4State?.outcome?.openNeeds
              .filter((n): n is typeof n & { id: string } => Boolean(n.id))
              .map((n) => ({ id: n.id, label: n.label })) ?? []
          }
          tendingPanel={tendingPanel}
          onViewHistory={() => setViewingResolvedHistory(true)}
          onReturnToSessions={() => onNavigateBack?.()}
        />
      </SafeAreaView>
    );
  }

  // -------------------------------------------------------------------------
  // Agreement Confirmation / Waiting - Full Screen Overlay
  // -------------------------------------------------------------------------
  if (currentStage === Stage.STRATEGIC_REPAIR && agreements.length > 0) {
    const unconfirmedAgreement = agreements.find((a) => !a.agreedByMe);
    const waitingForPartner = agreements.every((a) => a.agreedByMe) &&
      agreements.some((a) => !a.agreedByPartner);

    if (unconfirmedAgreement) {
      return (
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <SessionChatHeader
            partnerName={partnerName}
            partnerOnline={partnerOnline}
            connectionStatus={connectionStatus}
            briefStatus={getBriefStatus(session?.status, invitation?.isInviter)}
            onBackPress={onNavigateBack}
            onPress={() => setShowPartnerInfo(true)}
            conversationTopic={topicFrame}
            testID="session-chat-header"
          />
          {partnerInfoDrawer}
          <AgreementCard
            agreement={{
              experiment: unconfirmedAgreement.description,
              duration: unconfirmedAgreement.duration || 'To be determined',
              successMeasure: unconfirmedAgreement.measureOfSuccess || 'To be defined together',
              checkInDate: unconfirmedAgreement.followUpDate || undefined,
            }}
            confirmedByMe={unconfirmedAgreement.agreedByMe}
            confirmedByPartner={unconfirmedAgreement.agreedByPartner}
            partnerName={partnerName}
            onConfirm={() => {
              handleConfirmAgreement(unconfirmedAgreement.id, (response: ConfirmAgreementResponse) => {
                if (response.sessionCanResolve) {
                  trackSessionResolved(sessionId, 'agreement');
                  handleResolveSession(() => onStageComplete?.(Stage.STRATEGIC_REPAIR));
                }
              });
            }}
          />
        </SafeAreaView>
      );
    }

    if (waitingForPartner) {
      return (
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <SessionChatHeader
            partnerName={partnerName}
            partnerOnline={partnerOnline}
            connectionStatus={connectionStatus}
            briefStatus={getBriefStatus(session?.status, invitation?.isInviter)}
            onBackPress={onNavigateBack}
            onPress={() => setShowPartnerInfo(true)}
            conversationTopic={topicFrame}
            testID="session-chat-header"
          />
          {partnerInfoDrawer}
          <WaitingRoom
            message={`You've proposed the agreement. Waiting for ${partnerName || 'your partner'} to confirm.`}
            partnerName={partnerName || undefined}
          />
        </SafeAreaView>
      );
    }
  }

  // Legacy "Strategy Ranking Phase" and "Strategy Revealing Phase" full-screen
  // overlays removed. Stage4RedesignPanel is the canonical Stage 4 surface and
  // is rendered above when hasRedesignedStage4 is true.

  // -------------------------------------------------------------------------
  // Main Chat Interface
  // -------------------------------------------------------------------------
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View
        style={[
          styles.initialSessionSurface,
          !hasCompletedInitialChatRender && styles.initialSessionSurfaceHidden,
        ]}
        pointerEvents={hasCompletedInitialChatRender ? 'auto' : 'none'}
      >
        <SessionChatHeader
          partnerName={partnerName}
          partnerOnline={partnerOnline}
          connectionStatus={connectionStatus}
          briefStatus={getBriefStatus(session?.status, invitation?.isInviter)}
          hideOnlineStatus={isInvitationPhase}
          onBackPress={onNavigateBack}
          onBriefStatusPress={
            session?.status === SessionStatus.INVITED && invitation?.isInviter
              ? () => {
                  setShowShareLaterTooltip(false);
                  setActivityFocusTarget(null);
                  setShowActivityMenu(true);
                }
              : undefined
          }
          hasNewActivity={!isInOnboardingUnsigned ? (pendingActionsQuery.data?.actions?.length ?? 0) > 0 : false}
          onMenuPress={
            !isInOnboardingUnsigned
              ? () => {
                  setShowShareLaterTooltip(false);
                  setActivityFocusTarget(null);
                  setShowActivityMenu(true);
                }
              : undefined
          }
          onPress={() => setShowPartnerInfo(true)}
          conversationTopic={topicFrame}
          testID="session-chat-header"
        />
        {partnerInfoDrawer}
        {/* Chat content - Share is now a separate route */}
        {(
        <View style={styles.content}>
          <ChatInterface
          sessionId={sessionId}
          messages={displayMessages}
          indicators={indicators}
          onSendMessage={sendMessageWithTracking}
          onInitialRenderReady={() => setHasCompletedInitialChatRender(true)}
          failedMessage={failedMessageContent}
          prefillText={stage4BrainstormPrefill}
          onPrefillConsumed={() => setStage4BrainstormPrefill(null)}
          // Cache-First: Ghost dots are derived from last message role in ChatInterface
          // isSending is still needed for brief moment during API call before optimistic message appears
          // isFetchingInitialMessage shows dots while fetching first AI message
          // Button-only actions do not add a USER message, so pass their pending state
          // explicitly to keep ghost dots visible until the AI follow-up is inserted.
          isLoading={
            isFetchingInitialMessage ||
            isConfirmingFeelHeard ||
            isSavingEmpathyDraft ||
            isSharingEmpathy ||
            isResubmittingEmpathy ||
            isRespondingToShareOffer ||
            isConfirmingInvitation ||
            isAwaitingInvitationFollowUp
          }
          // isInputDisabled prevents sending while API call is in progress
          isInputDisabled={isSending}
          showEmotionSlider={
            !isInOnboardingUnsigned &&
            waitingStatus !== 'stage4-selections-pending'
          }
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
          lastViewedAt={lastViewedAtForAnimation}
          // Open activity menu and focus the corresponding "Context shared" / "Empathy shared" item.
          onContextSharedPress={(timestamp, isFromMe, indicatorType) => {
            setActivityFocusTarget({
              type: indicatorType === 'empathy-shared' ? 'empathy' : 'context',
              direction: isFromMe === false ? 'received' : 'sent',
              timestamp,
            });
            setShowActivityMenu(true);
          }}
          customCards={chatCustomCards}
          // Show compact as custom empty state during onboarding when not signed.
          customEmptyState={
            isInOnboardingUnsigned
              ? compactEmptyStateElement
              : undefined
          }
          renderAboveInput={
            aboveInputPanel ||
            (hasRedesignedStage4 && !!stage4State) ||
            (session?.status === SessionStatus.RESOLVED && viewingResolvedHistory)
              ? renderAboveInput
              : undefined
          }
          renderBelowInput={
            aboveInputPanel === 'needs-review' || aboveInputPanel === 'needs-share'
              ? renderBelowInput
              : undefined
          }
          renderBelowChat={(transcriptInlineCards.length > 0 || memorySuggestion) ? () => (
            <>
              {transcriptInlineCards.map((card) => renderInlineCard(card))}
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
            </>
          ) : undefined}
          hideInput={
            redesignedStage4AllowsInput ? false : derivedShouldHideInput
          }
          validationCards={validationCards}
          onValidateAccurate={handleValidationAccurate}
          onValidateNotQuite={handleValidationNotQuite}
          />

          {/* Waiting banner removed - now handled by the guided input panel renderer */}

          {/* Note: Compact is now rendered via renderCustomEmptyState in ChatInterface */}

          {/* Inline cards and memory suggestion now rendered via renderBelowChat prop in ChatInterface */}
        </View>
        )}
      </View>

      {!hasCompletedInitialChatRender && (
        <View style={styles.loadingOverlay} pointerEvents="auto">
          <ActivityIndicator size="large" color={styles.accentColor.color} />
          <Text style={styles.loadingText}>Loading session...</Text>
        </View>
      )}

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
                  markCompleted('shared-empathy');
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
            markCompleted('shared-empathy');
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
          initialStep="feedback"
          onAccurate={() => {
            markLocalEmpathyValidation('accepted');
            handleValidatePartnerEmpathy(true);
            setShowAccuracyFeedbackDrawer(false);
          }}
          onPartiallyAccurate={() => {
            markLocalEmpathyValidation('accepted');
            handleValidatePartnerEmpathy(true, 'Some parts are accurate');
            setShowAccuracyFeedbackDrawer(false);
          }}
          onInaccurate={(roughFeedback) => {
            setShowAccuracyFeedbackDrawer(false);
            openFeedbackCoachWithRoughFeedback(roughFeedback);
          }}
          onClose={() => setShowAccuracyFeedbackDrawer(false)}
        />
      )}

      {/* Validation Feedback Coach - AI-mediated feedback crafting for inaccurate empathy */}
      <GuidedDraftChatModal
        visible={showFeedbackCoachChat}
        title="Feedback Coach"
        sessionKey={`feedback-coach-${sessionId}`}
        messages={feedbackCoachMessages}
        isLoading={isFeedbackCoachLoading}
        isFinalizing={isFeedbackCoachFinalizing}
        partnerName={partnerName}
        proposalTitle="Proposed Feedback"
        proposalSubtitle={`This is what will be sent to ${partnerName}`}
        finalActionLabel="Send Feedback"
        onSendMessage={sendFeedbackCoachMessage}
        onFinalize={(feedback) => {
          markLocalEmpathyValidation('feedback');
          handleValidatePartnerEmpathy(false, feedback);
          finalizeFeedback(feedback);
        }}
        onClose={() => {
          setShowFeedbackCoachChat(false);
          setFeedbackCoachRoughFeedback('');
        }}
        emptyStateTitle="Feedback Coach"
        emptyStateMessage="Share what felt off, and I will help you phrase it clearly."
        finalButtonTestID="send-feedback-button"
        testID="validation-feedback-coach"
      />

      {/* ShareTopicDrawer - Phase 1 of two-phase share flow */}
      {shareOfferData?.hasSuggestion && shareOfferData.suggestion &&
       (shareOfferData.suggestion.action === 'OFFER_OPTIONAL' ||
        shareOfferData.suggestion.action === 'OFFER_SHARING') && (
        <ShareTopicDrawer
          visible={showShareTopicDrawer}
          action={shareOfferData.suggestion.action}
          partnerName={partnerName}
          suggestedShareFocus={shareOfferData.suggestion.suggestedShareFocus || ''}
          onAccept={() => {
            setShowShareTopicDrawer(false);
            markCompleted('responded-to-share-offer');
            trackShareTopicAccepted(sessionId, shareOfferData.suggestion!.action as 'OFFER_SHARING' | 'OFFER_OPTIONAL');
            // Open refinement modal so user can chat about and refine the draft
            // before sharing (same flow as ActivityDrawer's "Refine" button)
            if (shareOfferData?.suggestion) {
              setRefinementInitialSuggestion(shareOfferData.suggestion.suggestedContent || '');
              setRefinementOfferId(shareOfferData.suggestion.offerId);
            }
          }}
          onDecline={() => {
            setShowShareTopicDrawer(false);
            markCompleted('responded-to-share-offer');
            trackShareTopicDeclined(sessionId, shareOfferData.suggestion!.action as 'OFFER_SHARING' | 'OFFER_OPTIONAL');
            // Decline marks empathy direction as READY (no notification to partner)
            handleRespondToShareOffer('decline');
          }}
          onClose={() => {
            trackShareTopicDismissed(sessionId, shareOfferData.suggestion!.action as 'OFFER_SHARING' | 'OFFER_OPTIONAL');
            setShowShareTopicDrawer(false);
          }}
        />
      )}

      {/* Needs Drawer - bottom sheet for Stage 3 needs/reveal */}
      <NeedsDrawer
        visible={showNeedsDrawer}
        onClose={() => setShowNeedsDrawer(false)}
        mode={needsDrawerMode}
        needs={(shouldUseRevealedNeeds ? (needsComparisonData?.myNeeds ?? []) : (needs ?? [])).map((n) => ({
          id: n.id,
          category: n.category || n.need,
          need: n.need,
          confirmed: n.confirmed,
        }))}
        onAdjustNeeds={() => {
          setShowNeedsDrawer(false);
        }}
        onConfirmNeeds={() => {
          if (allNeedsConfirmed) {
            handleConsentToShareNeeds(() => {
              markCompleted('confirmed-needs');
              setShowNeedsDrawer(false);
            });
          } else {
            handleConfirmAllNeeds(() => {
              setShowNeedsDrawer(false);
            });
          }
        }}
        confirmNeedsLabel={allNeedsConfirmed ? 'Share my needs' : 'Confirm my needs'}
        confirmingNeedsLabel={allNeedsConfirmed ? 'Sharing...' : 'Confirming...'}
        isConfirming={isConfirmingNeeds}
        partnerNeeds={(needsComparisonData?.partnerNeeds ?? []).map((n) => ({
          id: n.id,
          category: String(n.category) || n.need,
          need: n.need,
          confirmed: n.confirmed,
        }))}
        onValidateNeeds={() => {
          markCompleted('validated-needs');
          handleValidateNeedsReveal(() => onStageComplete?.(Stage.NEED_MAPPING));
        }}
        onNeedsNotValidYet={() => {
          handleNeedsNotValidYet(() => {
            setShowNeedsDrawer(false);
          });
        }}
        partnerName={partnerName}
        testID="needs-drawer"
      />

      {/* Stage 4 redesign drawer — bottom-sheet wrapper around Stage4RedesignPanel. */}
      <Modal
        visible={showStage4Drawer && hasRedesignedStage4 && !!stage4State}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowStage4Drawer(false)}
      >
        <SafeAreaView style={styles.stage4DrawerSafeArea} edges={['top', 'bottom']}>
          <View style={styles.stage4DrawerDragHandleArea}>
            <View style={styles.stage4DrawerDragHandle} />
          </View>
          <View style={styles.stage4DrawerHeader}>
            <Text style={styles.stage4DrawerTitle}>What comes next</Text>
          </View>
          <ScrollView contentContainerStyle={styles.stage4DrawerScroll}>
            {stage4State && (
              <Stage4RedesignPanel
                state={stage4State}
                partnerName={partnerName}
                isSelecting={submitStage4Selection.isPending}
                isClosing={closeStage4.isPending}
                isSharing={shareStage4Selections.isPending}
                isRevising={unshareStage4Selections.isPending}
                hideFooter
                onSelectProposal={handleStage4Selection}
                onShareSelections={handleShareStage4Selections}
                onReviseSelections={handleReviseStage4Selections}
                onBrainstormNeed={handleBrainstormStage4Need}
                onRefineProposal={handleRefineStage4Proposal}
                onKeepRefiningNoOverlap={handleKeepRefiningNoOverlap}
                onDeclineNeed={handleDeclineStage4Need}
                onUndeclineNeed={handleUndeclineStage4Need}
                onCloseStage4={(kind, reason, checkInDate) => {
                  handleCloseRedesignedStage4(kind, reason, checkInDate);
                  setShowStage4Drawer(false);
                }}
              />
            )}
          </ScrollView>
          {stage4State && (
            <Stage4RedesignFooter
              state={stage4State}
              partnerName={partnerName}
              isClosing={closeStage4.isPending}
              isSharing={shareStage4Selections.isPending}
              isRevising={unshareStage4Selections.isPending}
              onShareSelections={handleShareStage4Selections}
              onReviseSelections={handleReviseStage4Selections}
              onKeepRefiningNoOverlap={handleKeepRefiningNoOverlap}
              onCloseStage4={(kind, reason, checkInDate) => {
                handleCloseRedesignedStage4(kind, reason, checkInDate);
                setShowStage4Drawer(false);
              }}
            />
          )}
          {/* Nested inside the Stage 4 Modal so the sub-chat presents on top
              of "What comes next" — closing the sub-chat returns you here,
              not all the way out to the partner chat. */}
          <Stage4SubChatDrawer
            visible={Boolean(stage4SubChat)}
            subChat={stage4SubChat}
            anchorLabel={stage4SubChatAnchorLabel}
            initialProposalText={stage4SubChatInitialProposalText}
            isSending={sendStage4SubChatMessage.isPending}
            isResolving={resolveStage4SubChatMutation.isPending}
            onSendMessage={handleSendStage4SubChatMessage}
            onResolve={handleResolveStage4SubChat}
            onClose={() => setStage4SubChat(null)}
          />
        </SafeAreaView>
      </Modal>

      {/* Invitation Ready Modal — replaces the inline 'invitation' panel.
          Opens automatically when the topic is confirmed and the user has not
          yet shared or dismissed; "Later" then surfaces an onboarding tooltip
          pointing at the book icon. */}
      <Modal
        visible={
          (shouldShowInvitationPanel || auditFixture === 'invitation-ready') &&
          !!topicFrame &&
          !!invitationUrl &&
          !partnerAccepted
        }
        transparent
        animationType="fade"
        onRequestClose={() => {
          setInvitationPanelDismissed(true);
          confirmInvitationAndAwaitFollowUp();
          if (!shareLaterTooltipShownThisSession) {
            setShowShareLaterTooltip(true);
            setShareLaterTooltipShownThisSession(true);
          }
        }}
      >
        <View style={styles.invitationModalBackdrop}>
          <View
            style={styles.invitationModalCard}
            testID="invitation-ready-modal"
          >
            <TouchableOpacity
              style={styles.invitationModalCloseButton}
              onPress={() => {
                setInvitationPanelDismissed(true);
                confirmInvitationAndAwaitFollowUp();
                if (!shareLaterTooltipShownThisSession) {
                  setShowShareLaterTooltip(true);
                  setShareLaterTooltipShownThisSession(true);
                }
              }}
              accessibilityRole="button"
              accessibilityLabel="Close"
              testID="invitation-modal-close-button"
              hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
            >
              <Text style={styles.invitationModalCloseText}>×</Text>
            </TouchableOpacity>
            <Text style={styles.invitationModalText}>
              {`Ready to invite ${partnerName || 'your partner'}? They will see the topic we set once they join and you two can work separately at first.`}
            </Text>
            <View style={styles.invitationModalActionsRow}>
              <TouchableOpacity
                style={[
                  styles.invitationModalButton,
                  styles.invitationModalButtonPrimary,
                ]}
                onPress={async () => {
                  const didShare = await handleShareInvitation();
                  if (didShare) {
                    setInvitationPanelDismissed(true);
                    confirmInvitationAndAwaitFollowUp();
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel="Share invitation"
                testID="invitation-modal-share-button"
              >
                <Text style={styles.invitationModalButtonPrimaryText}>Share</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Share-Later Tooltip — onboarding overlay pointing at the book icon
          in the top-right of the header. Shown once per session after Later. */}
      {showShareLaterTooltip && (
        <View
          style={styles.shareLaterTooltipOverlay}
          pointerEvents="box-none"
          testID="share-later-tooltip-overlay"
        >
          <View
            style={[
              styles.shareLaterTooltipBubble,
              Platform.OS !== 'web' && {
                top: insets.top + 56,
              },
            ]}
            testID="share-later-tooltip"
          >
            <Text style={styles.shareLaterTooltipText}>
              You can share later from here ☝️
            </Text>
            <TouchableOpacity
              style={styles.shareLaterTooltipButton}
              onPress={() => setShowShareLaterTooltip(false)}
              accessibilityRole="button"
              accessibilityLabel="Got it"
              testID="share-later-tooltip-got-it"
            >
              <Text style={styles.shareLaterTooltipButtonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Activity Drawer - bottom sheet with timeline items */}
      <ActivityDrawer
        visible={showActivityMenu}
        sessionId={sessionId}
        partnerName={partnerName}
        sessionStatus={session?.status}
        focusTarget={activityFocusTarget}
        onClose={() => {
          setShowActivityMenu(false);
          setActivityFocusTarget(null);
        }}
        onOpenRefinement={(offerId, suggestion) => {
          setShowActivityMenu(false);
          setRefinementInitialSuggestion(suggestion);
          setRefinementOfferId(offerId);
        }}
        onShareAsIs={(_offerId) => {
          setShowActivityMenu(false);
          trackShareDraftSent(sessionId, (shareOfferData?.suggestion?.action ?? 'OFFER_OPTIONAL') as 'OFFER_SHARING' | 'OFFER_OPTIONAL', false);
          handleRespondToShareOffer('accept');
        }}
        onOpenEmpathyDetail={(_attemptId, _content) => {
          setShowActivityMenu(false);
          setShowEmpathyDrawer(true);
        }}
        topicFrame={topicFrameConfirmed ? (topicFrame || undefined) : undefined}
        invitationTimestamp={isInviter ? (invitation?.messageConfirmedAt || undefined) : undefined}
        partnerAccepted={partnerAccepted}
        onShareInvitation={
          isInviter && invitationUrl && !partnerAccepted
            ? () => {
                handleShareInvitation();
              }
            : undefined
        }
        partnerEmpathyValidated={isEmpathyValidated || (partnerEmpathyData?.validated ?? false)}
        testID="activity-drawer"
      />

      {/* Refinement Modal - AI-guided chat for refining share offer content */}
      {refinementOfferId && (
        <RefinementModalScreen
          visible={!!refinementOfferId}
          sessionId={sessionId}
          offerId={refinementOfferId}
          initialSuggestion={refinementInitialSuggestion}
          partnerName={partnerName}
          onClose={() => setRefinementOfferId(null)}
          onShareComplete={() => {
            setRefinementOfferId(null);
            trackShareDraftSent(sessionId, (shareOfferData?.suggestion?.action ?? 'OFFER_OPTIONAL') as 'OFFER_SHARING' | 'OFFER_OPTIONAL', true);
            // Shared context now appears inline in chat — no need to auto-open the activity drawer.
            // Refresh activity menu data so it's current if the user opens it later.
            queryClient.invalidateQueries({ queryKey: stageKeys.pendingActions(sessionId) });
            queryClient.invalidateQueries({ queryKey: stageKeys.shareOffer(sessionId) });
            queryClient.invalidateQueries({ queryKey: notificationKeys.badgeCount() });
          }}
          testID="refinement-modal"
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

const useStyles = () => {
  const { palette } = useAppAppearance();
  return createStyles((t) => ({
    container: {
      flex: 1,
      backgroundColor: palette.bg,
      ...appWidthStyle,
    },
    content: {
      flex: 1,
    },
    initialSessionSurface: {
      flex: 1,
    },
    initialSessionSurfaceHidden: {
      opacity: 0,
    },
    loadingOverlay: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: palette.bg,
      padding: 20,
    },
    centerContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: palette.bg,
      padding: 20,
    },
    loadingText: {
      marginTop: 12,
      fontSize: 16,
      color: palette.textMuted,
    },
    accentColor: {
      color: palette.accent,
    },
    sourceInnerThoughtsCard: {
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      width: '86%',
      maxWidth: 520,
      marginVertical: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: palette.bgElev,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 8,
    },
    sourceInnerThoughtsIcon: {
      fontSize: 15,
      color: palette.accent,
      fontWeight: '700',
    },
    sourceInnerThoughtsTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    sourceInnerThoughtsLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: palette.accent,
      textTransform: 'uppercase',
    },
    sourceInnerThoughtsTitle: {
      marginTop: 1,
      fontSize: 13,
      color: palette.textMuted,
    },

    // Invitation Draft
    invitationDraftContainer: {
      paddingHorizontal: t.spacing.lg,
      paddingVertical: t.spacing.md,
      backgroundColor: palette.bg,
      borderTopWidth: 1,
      borderTopColor: palette.border,
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
    invitationTopicChip: {
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.xs,
      paddingHorizontal: t.spacing.md,
      paddingVertical: t.spacing.xs,
      borderRadius: t.radius.full,
      backgroundColor: t.colors.bgPrimary,
      borderWidth: 1,
      borderColor: t.colors.border,
      marginBottom: t.spacing.sm,
      maxWidth: '90%' as const,
    },
    invitationTopicChipLabel: {
      fontSize: t.typography.fontSize.xs,
      color: t.colors.textSecondary,
      fontWeight: '600' as const,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.5,
    },
    invitationTopicChipText: {
      fontSize: t.typography.fontSize.sm,
      color: t.colors.textPrimary,
      fontWeight: '600' as const,
      flexShrink: 1,
    },
    invitationStepHeading: {
      fontSize: t.typography.fontSize.md,
      color: t.colors.textPrimary,
      textAlign: 'center' as const,
      lineHeight: 22,
      paddingHorizontal: t.spacing.lg,
      marginBottom: t.spacing.sm,
    },
    invitationActionsRow: {
      flexDirection: 'row' as const,
      gap: t.spacing.sm,
      marginHorizontal: t.spacing.lg,
      marginTop: t.spacing.sm,
    },
    invitationActionButton: {
      flex: 1,
      minHeight: 44,
      borderRadius: t.radius.md,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingHorizontal: t.spacing.md,
    },
    invitationActionPrimary: {
      backgroundColor: t.colors.accent,
    },
    invitationActionSecondary: {
      backgroundColor: t.colors.bgPrimary,
      borderWidth: 1,
      borderColor: t.colors.accent,
    },
    invitationActionDisabled: {
      opacity: 0.6,
    },
    invitationActionPrimaryText: {
      color: t.colors.textOnAccent,
      fontSize: t.typography.fontSize.md,
      fontWeight: '600' as const,
    },
    invitationActionSecondaryText: {
      color: t.colors.accent,
      fontSize: t.typography.fontSize.md,
      fontWeight: '600' as const,
    },

    // Invitation Ready Modal (replaces inline 'invitation' panel)
    invitationModalBackdrop: {
      flex: 1,
      backgroundColor: palette.scrim,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      paddingHorizontal: t.spacing.lg,
    },
    invitationModalCard: {
      width: '100%' as const,
      maxWidth: 420,
      backgroundColor: palette.bgElev,
      borderRadius: t.radius.lg,
      padding: t.spacing.lg,
      paddingTop: t.spacing.xl + t.spacing.lg,
      borderWidth: 1,
      borderColor: palette.border,
    },
    invitationModalCloseButton: {
      position: 'absolute' as const,
      top: 10,
      right: 10,
      width: 36,
      height: 36,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      zIndex: 1,
    },
    invitationModalCloseText: {
      color: palette.text,
      fontSize: 24,
      lineHeight: 24,
      fontWeight: '400' as const,
    },
    invitationModalText: {
      fontSize: t.typography.fontSize.md,
      color: palette.text,
      lineHeight: 22,
      marginBottom: t.spacing.lg,
    },
    invitationModalActionsRow: {
      flexDirection: 'row' as const,
      gap: t.spacing.sm,
    },
    invitationModalButton: {
      flex: 1,
      minHeight: 44,
      borderRadius: t.radius.md,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingHorizontal: t.spacing.md,
    },
    invitationModalButtonPrimary: {
      backgroundColor: palette.accent,
    },
    invitationModalButtonSecondary: {
      backgroundColor: 'transparent' as const,
      borderWidth: 1,
      borderColor: palette.accent,
    },
    invitationModalButtonPrimaryText: {
      color: '#0d0f12',
      fontSize: t.typography.fontSize.md,
      fontWeight: '600' as const,
    },
    invitationModalButtonSecondaryText: {
      color: palette.accentText,
      fontSize: t.typography.fontSize.md,
      fontWeight: '600' as const,
    },

    // Share-Later Tooltip
    shareLaterTooltipOverlay: {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 200,
    },
    shareLaterTooltipBubble: {
      position: 'absolute' as const,
      top: 49,
      right: 12,
      maxWidth: 240,
      backgroundColor: palette.bgElev,
      borderRadius: t.radius.md,
      paddingHorizontal: t.spacing.md,
      paddingVertical: t.spacing.sm,
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
      borderWidth: 1,
      borderColor: palette.borderStrong,
    },
    shareLaterTooltipTail: {
      position: 'absolute' as const,
      top: -8,
      right: 16,
      width: 0,
      height: 0,
      borderLeftWidth: 8,
      borderRightWidth: 8,
      borderBottomWidth: 8,
      borderLeftColor: 'transparent' as const,
      borderRightColor: 'transparent' as const,
      borderBottomColor: palette.bgElev,
    },
    shareLaterTooltipText: {
      fontSize: t.typography.fontSize.sm,
      color: palette.text,
      lineHeight: 20,
      marginBottom: t.spacing.sm,
    },
    shareLaterTooltipButton: {
      alignSelf: 'flex-end' as const,
      paddingHorizontal: t.spacing.md,
      paddingVertical: t.spacing.xs,
      borderRadius: t.radius.sm,
      backgroundColor: palette.accent,
    },
    shareLaterTooltipButtonText: {
      color: t.colors.textOnAccent,
      fontSize: t.typography.fontSize.sm,
      fontWeight: '600' as const,
    },

    inviteeTopicAckBody: {
      paddingHorizontal: t.spacing.lg,
      paddingTop: t.spacing.lg,
      paddingBottom: t.spacing.md,
    },
    inviteeTopicAckText: {
      fontSize: t.typography.fontSize.md,
      lineHeight: 22,
      color: t.colors.textPrimary,
    },
    inviteeTopicAckFrameWrap: {
      paddingVertical: t.spacing.xl,
      paddingHorizontal: t.spacing.md,
      marginVertical: t.spacing.lg,
      borderRadius: t.radius.md,
      backgroundColor: t.colors.bgSecondary,
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    inviteeTopicAckFrame: {
      fontSize: t.typography.fontSize.lg,
      color: t.colors.textPrimary,
      fontWeight: '600' as const,
      lineHeight: 28,
      textAlign: 'center' as const,
    },
    // Needs Review Panel (Stage 3)
    needsReviewBelowInputContainer: {
      paddingHorizontal: t.spacing.lg,
      paddingTop: t.spacing.sm,
      paddingBottom: t.spacing.md,
      backgroundColor: palette.bgElev,
      borderTopWidth: 1,
      borderTopColor: palette.border,
    },
    strategyPreviewBelowInputContainer: {
      paddingHorizontal: t.spacing.lg,
      paddingTop: t.spacing.sm,
      paddingBottom: t.spacing.md,
      backgroundColor: palette.bgElev,
      borderTopWidth: 1,
      borderTopColor: palette.border,
    },

    // Inline Cards
    inlineCard: {
      margin: 16,
      padding: 16,
      backgroundColor: palette.bgElev,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: palette.border,
    },
    strategyPreviewCompactCard: {
      paddingVertical: 12,
      paddingHorizontal: 14,
      backgroundColor: palette.bgElev,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: palette.border,
    },
    strategyPreviewCompactBody: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    strategyPreviewCompactText: {
      flex: 1,
      minWidth: 0,
    },
    strategyPreviewCompactActions: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 10,
    },
    strategyPreviewCompactPrimary: {
      flex: 1,
      minHeight: 40,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      backgroundColor: palette.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    strategyPreviewCompactPrimaryText: {
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '700',
      color: '#0d0f12',
      textAlign: 'center',
    },
    needsSummaryCard: {
      marginHorizontal: 16,
      marginVertical: 8,
      padding: 16,
      backgroundColor: palette.bgElev,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: palette.border,
    },
    needsSummaryCardCompact: {
      marginHorizontal: 0,
      marginVertical: 0,
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    needsSummaryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    needsSummaryEyebrow: {
      fontSize: 11,
      fontWeight: '700',
      color: palette.textMuted,
      letterSpacing: 0,
    },
    needsSummaryStatus: {
      fontSize: 12,
      fontWeight: '600',
      color: palette.accent,
    },
    needsSummaryTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: palette.text,
      marginBottom: 12,
    },
    needsSummaryCompactBody: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    needsSummaryCompactText: {
      flex: 1,
      minWidth: 0,
    },
    needsSummaryCompactTitle: {
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '700',
      color: palette.text,
    },
    needsSummaryCount: {
      fontSize: 13,
      lineHeight: 18,
      color: palette.textMuted,
    },
    needsSummaryList: {
      gap: 8,
    },
    needsSummaryRow: {
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 8,
      backgroundColor: palette.bg,
    },
    needsSummaryCategory: {
      fontSize: 11,
      fontWeight: '700',
      color: palette.textMuted,
      marginBottom: 3,
      letterSpacing: 0,
    },
    needsSummaryText: {
      fontSize: 14,
      lineHeight: 19,
      color: palette.text,
    },
    needsSummaryMore: {
      fontSize: 13,
      color: palette.textMuted,
      marginTop: 2,
    },
    needsSummaryAction: {
      marginTop: 14,
      fontSize: 14,
      fontWeight: '700',
      color: palette.accent,
    },
    needsSummaryActionCompact: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      backgroundColor: palette.bgPane,
      borderWidth: 1,
      borderColor: palette.border,
      fontSize: 14,
      fontWeight: '700',
      color: palette.success,
      overflow: 'hidden',
    },
    shareActions: {
      flexDirection: 'row',
      gap: t.spacing.sm,
      marginTop: t.spacing.sm,
    },
    primaryButton: {
      flex: 1,
      backgroundColor: palette.accent,
      paddingVertical: t.spacing.sm,
      borderRadius: t.radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonText: {
      color: '#0d0f12',
      fontWeight: '700',
      fontSize: t.typography.fontSize.md,
    },
    secondaryButton: {
      flex: 1,
      backgroundColor: palette.bgPane,
      paddingVertical: t.spacing.sm,
      borderRadius: t.radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: palette.border,
    },
    secondaryButtonText: {
      color: palette.text,
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
      color: palette.text,
      marginBottom: 8,
    },
    cardSubtitle: {
      fontSize: 14,
      color: palette.textMuted,
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
    viewHistoryButton: {
      marginHorizontal: 16,
      marginTop: 4,
      padding: 14,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.colors.border,
      alignItems: 'center',
      backgroundColor: t.colors.bgSecondary,
    },
    viewHistoryButtonText: {
      color: t.colors.textPrimary,
      fontSize: 14,
      fontWeight: '700',
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
    // Agreement overlay
    agreementCounter: {
      fontSize: 12,
      color: t.colors.textSecondary,
      textAlign: 'center' as const,
      marginBottom: 8,
    },
    waitingMessageText: {
      fontSize: 15,
      color: t.colors.textSecondary,
      textAlign: 'center' as const,
      paddingHorizontal: 24,
      paddingVertical: 32,
      lineHeight: 22,
    },

    overlayContainer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: palette.bg,
      // Stretch child to full width (not 'center' — that collapses it to intrinsic width).
      alignItems: 'stretch',
      // Sit above sibling chrome like ChatInterface's bottom EmotionSlider, which is
      // a normal-flow sibling and would otherwise bleed through on iOS at higher elevations.
      zIndex: 100,
      elevation: 100,
    },
    stage4DrawerSafeArea: {
      flex: 1,
      backgroundColor: palette.bgPane,
    },
    stage4DrawerDragHandleArea: {
      paddingTop: 12,
      paddingBottom: 8,
      alignItems: 'center',
    },
    stage4DrawerDragHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: palette.borderStrong,
    },
    stage4DrawerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 16,
    },
    stage4DrawerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: palette.text,
    },
    stage4DrawerCloseButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: palette.bgElev,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stage4DrawerCloseText: {
      color: palette.textMuted,
      fontSize: 16,
      fontWeight: '600',
    },
    stage4DrawerScroll: {
      paddingBottom: 8,
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
};

export default UnifiedSessionScreen;
