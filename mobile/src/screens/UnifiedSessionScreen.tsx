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
import { Stage, MessageRole, StrategyPhase, SessionStatus } from '@meet-without-fear/shared';

import { ChatInterface, ChatMessage, ChatIndicatorItem } from '../components/ChatInterface';
import { SessionChatHeader } from '../components/SessionChatHeader';
import { FeelHeardConfirmation } from '../components/FeelHeardConfirmation';
import { ReadyToShareConfirmation } from '../components/ReadyToShareConfirmation';
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
import { CuriosityCompactOverlay } from '../components/CuriosityCompactOverlay';
import { InvitationShareButton } from '../components/InvitationShareButton';
import { RefineInvitationDrawer } from '../components/RefineInvitationDrawer';
import { ViewEmpathyStatementDrawer } from '../components/ViewEmpathyStatementDrawer';

import { useUnifiedSession, InlineChatCard } from '../hooks/useUnifiedSession';
import { createInvitationLink } from '../hooks/useInvitation';
import { useAuth, useUpdateMood } from '../hooks/useAuth';
import { useRealtime } from '../hooks/useRealtime';
import { createStyles } from '../theme/styled';

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

  // Real-time presence tracking
  const { partnerOnline, connectionStatus } = useRealtime({
    sessionId,
    enablePresence: true,
  });

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

    // Stage-specific data
    compactData,
    loadingCompact,
    empathyDraftData,
    liveProposedEmpathyStatement,
    allNeedsConfirmed,
    commonGround,
    strategyPhase,
    strategies,
    overlappingStrategies,
    agreements,
    isGenerating,
    waitingStatus,

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

    // Utility actions
    clearMirrorIntervention,
    showCooling,
    setPendingConfirmation,
  } = useUnifiedSession(sessionId);

  // -------------------------------------------------------------------------
  // Local State for Refine Invitation Drawer
  // -------------------------------------------------------------------------
  const [showRefineDrawer, setShowRefineDrawer] = useState(false);

  // Track when user is refining the invitation (after initial send, from Stage 1)
  // This overrides Stage 1 UI to show invitation crafting UI instead
  const [isRefiningInvitation, setIsRefiningInvitation] = useState(false);

  // -------------------------------------------------------------------------
  // Local State for View Empathy Statement Drawer (Stage 2)
  // -------------------------------------------------------------------------
  const [showEmpathyDrawer, setShowEmpathyDrawer] = useState(false);
  const [showShareConfirm, setShowShareConfirm] = useState(false);

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

  // -------------------------------------------------------------------------
  // Track Typewriter Animation State
  // -------------------------------------------------------------------------
  // Used to delay showing inline cards until typewriter completes
  const [isTypewriterAnimating, setIsTypewriterAnimating] = useState(false);

  // -------------------------------------------------------------------------
  // Preserve Feel Heard State Across Re-renders
  // -------------------------------------------------------------------------
  // Once feel-heard is confirmed, keep showing the indicator even during re-renders
  // This prevents the indicator from flashing away when new messages arrive
  const hasEverConfirmedFeelHeard = useRef(false);

  // Update ref when milestones confirm feel-heard
  if (milestones?.feelHeardConfirmedAt && !hasEverConfirmedFeelHeard.current) {
    hasEverConfirmedFeelHeard.current = true;
  }

  // Animation for the invitation panel slide-up
  const invitationPanelAnim = useRef(new Animated.Value(0)).current;

  // Calculate whether panel should show: have message, in right phase
  const shouldShowInvitationPanel = !!(
    invitationMessage &&
    (isInvitationPhase || isRefiningInvitation) &&
    !isConfirmingInvitation // Hide panel when confirming
  );

  // Animate panel when shouldShowInvitationPanel changes
  useEffect(() => {
    Animated.spring(invitationPanelAnim, {
      toValue: shouldShowInvitationPanel ? 1 : 0,
      useNativeDriver: true,
      tension: 50,
      friction: 8,
    }).start();
  }, [shouldShowInvitationPanel, invitationPanelAnim]);

  // Clear optimistic state when API confirms
  useEffect(() => {
    if (invitationConfirmed && isConfirmingInvitation) {
      setIsConfirmingInvitation(false);
      setOptimisticConfirmTimestamp(null);
    }
  }, [invitationConfirmed, isConfirmingInvitation]);

  // Clear feel-heard optimistic state when API confirms
  useEffect(() => {
    if (milestones?.feelHeardConfirmedAt && optimisticFeelHeardTimestamp) {
      setOptimisticFeelHeardTimestamp(null);
    }
  }, [milestones?.feelHeardConfirmedAt, optimisticFeelHeardTimestamp]);

  // Build indicators array
  // Use messageConfirmedAt from API for reliable positioning across reloads
  const indicators = useMemo((): ChatIndicatorItem[] => {
    const items: ChatIndicatorItem[] = [];

    // For inviters: Show "Invitation Sent" when they confirmed the invitation message
    // Use the API timestamp for reliable positioning, or optimistic timestamp during confirmation
    const confirmedAt = invitation?.messageConfirmedAt ?? optimisticConfirmTimestamp;
    const isInviter = invitation?.isInviter ?? true; // Default to inviter for backwards compatibility

    if (isInviter && (invitationConfirmed || isConfirmingInvitation) && confirmedAt) {
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

    // Show "Felt Heard" indicator when user confirms they feel heard
    // Use API timestamp for reliable positioning, or optimistic timestamp during confirmation
    // IMPORTANT: Use hasEverConfirmedFeelHeard ref to prevent indicator from disappearing
    // during re-renders when milestones cache is temporarily invalidated
    const feelHeardAt = milestones?.feelHeardConfirmedAt ?? optimisticFeelHeardTimestamp;
    const shouldShowFeelHeard = hasEverConfirmedFeelHeard.current || milestones?.feelHeardConfirmedAt || isConfirmingFeelHeard;
    if (shouldShowFeelHeard && feelHeardAt) {
      items.push({
        type: 'indicator',
        indicatorType: 'feel-heard',
        id: 'feel-heard',
        timestamp: feelHeardAt,
      });
    }
    return items;
  }, [invitationConfirmed, isConfirmingInvitation, invitation?.messageConfirmedAt, invitation?.acceptedAt, invitation?.isInviter, optimisticConfirmTimestamp, milestones?.feelHeardConfirmedAt, isConfirmingFeelHeard, optimisticFeelHeardTimestamp]);

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
  // Inner Thoughts Button Visibility
  // -------------------------------------------------------------------------
  // Show inner thoughts button only after Stage 2 (PERSPECTIVE_STRETCH) is completed,
  // or when user is waiting for partner to finish Stage 2.
  const shouldShowInnerThoughts = useMemo(() => {
    if (!onNavigateToInnerThoughts) return false;

    // Show if stage 2 is completed (we're in stage 3 or 4)
    if (currentStage > Stage.PERSPECTIVE_STRETCH) return true;

    // Show if in stage 2 and waiting for partner to share their empathy
    if (currentStage === Stage.PERSPECTIVE_STRETCH && waitingStatus === 'empathy-pending') return true;

    return false;
  }, [onNavigateToInnerThoughts, currentStage, waitingStatus]);

  // -------------------------------------------------------------------------
  // Prepare Messages for Display
  // -------------------------------------------------------------------------
  const displayMessages = useMemo((): ChatMessage[] => {
    return messages;
  }, [messages]);

  // -------------------------------------------------------------------------
  // Render Inline Card
  // -------------------------------------------------------------------------
  const renderInlineCard = useCallback(
    (card: InlineChatCard) => {
      switch (card.type) {
        // Note: 'waiting-status' case removed - we no longer show "waiting for partner" messages

        case 'feel-heard-confirmation':
          return (
            <View style={styles.inlineCard} key={card.id}>
              <FeelHeardConfirmation
                onConfirm={() => {
                  // Set optimistic timestamp immediately for instant indicator display
                  setOptimisticFeelHeardTimestamp(new Date().toISOString());
                  handleConfirmFeelHeard(() => onStageComplete?.(Stage.WITNESS));
                }}
                onContinue={handleDismissFeelHeard}
              />
            </View>
          );

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

        case 'ready-to-share-confirmation':
          return (
            <View style={styles.inlineCard} key={card.id}>
              <ReadyToShareConfirmation
                onViewFull={() => setShowEmpathyDrawer(true)}
              />
            </View>
          );

        case 'empathy-draft-preview':
          return (
            <View style={styles.inlineCard} key={card.id}>
              <EmpathyAttemptCard
                attempt={card.props.content as string}
                testID="empathy-draft-preview"
              />
              <View style={styles.shareActions}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => setShowEmpathyDrawer(true)}
                >
                  <Text style={styles.secondaryButtonText}>Edit draft</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => setShowShareConfirm(true)}
                  testID="send-empathy-button"
                >
                  <Text style={styles.primaryButtonText}>Send empathy statement</Text>
                </TouchableOpacity>
              </View>
            </View>
          );

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
  // Curiosity Compact Overlay - shown when compact needs to be signed
  // -------------------------------------------------------------------------
  // The compact is shown as an overlay while the chat loads in the background.
  // This allows the initial AI message to be fetched while the user reviews the compact.
  // Shows regardless of invitation phase - compact must be signed first before any chat interaction.
  // Important: Show overlay while compact status is loading OR if compact is not signed.
  // This prevents users from interacting with chat before compact status is confirmed.
  const shouldShowCompactOverlay =
    currentStage === Stage.ONBOARDING &&
    (loadingCompact || !compactData?.mySigned);

  // -------------------------------------------------------------------------
  // Session Entry Mood Check - shown after compact signed, before chat
  // -------------------------------------------------------------------------
  // Asks user "How are you feeling right now?" to set accurate barometer value.
  // Only shows once per session entry (resets when navigating away and back).
  // Skipped if user is currently in an exercise overlay (will set intensity after).
  // NOTE: This must be before early returns to maintain hook order
  const shouldShowMoodCheck = useMemo(() => {
    // Don't show if still loading
    if (isLoading) return false;
    // Don't show if compact overlay is showing (must sign compact first)
    if (shouldShowCompactOverlay) return false;
    // Don't show if already completed mood check this session entry
    if (hasCompletedMoodCheck) return false;
    // Don't show if currently in an exercise overlay (user will set intensity after)
    if (activeOverlay) return false;

    // Show mood check for all session entries
    return true;
  }, [isLoading, shouldShowCompactOverlay, hasCompletedMoodCheck, activeOverlay]);

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
        initialValue={user?.lastMoodIntensity ?? 5}
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
          onSendMessage={sendMessage}
          isLoading={isSending || isFetchingInitialMessage}
          showEmotionSlider={effectiveStage === Stage.WITNESS && !isInvitationPhase && !isRefiningInvitation}
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
          renderAboveInput={
            // Show invitation panel during invitation phase
            (isInvitationPhase || isRefiningInvitation) && invitationMessage && invitationUrl
              ? () => (
                  <Animated.View
                    style={[
                      styles.invitationDraftContainer,
                      {
                        opacity: invitationPanelAnim,
                        transform: [
                          {
                            translateY: invitationPanelAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [100, 0],
                            }),
                          },
                        ],
                      },
                    ]}
                    pointerEvents={shouldShowInvitationPanel ? 'auto' : 'none'}
                  >
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
                        // Optimistic UI: immediately show loading state and indicator
                        setIsConfirmingInvitation(true);
                        setOptimisticConfirmTimestamp(new Date().toISOString());
                        setIsRefiningInvitation(false); // Exit refinement mode
                        handleConfirmInvitationMessage(invitationMessage);
                      }}
                      testID="invitation-continue-button"
                    >
                      <Text style={styles.continueButtonText}>
                        {isRefiningInvitation ? "I've sent it - Back to conversation" : "I've sent it - Continue"}
                      </Text>
                    </TouchableOpacity>
                  </Animated.View>
                )
              // Show waiting banner when waiting for partner's empathy
              : waitingStatus === 'empathy-pending'
              ? () => (
                  <View style={styles.waitingBanner}>
                    <Text style={styles.waitingBannerText}>
                      Waiting for {partnerName || 'your partner'} to share their empathy statement.
                    </Text>
                    {onNavigateToInnerThoughts && (
                      <TouchableOpacity
                        style={styles.innerThoughtsLink}
                        onPress={() => onNavigateToInnerThoughts(sessionId)}
                      >
                        <Text style={styles.innerThoughtsLinkText}>
                          Continue with Inner Thoughts while you wait →
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )
              : undefined
          }
          hideInput={waitingStatus === 'empathy-pending'}
        />

        {/* Waiting banner removed - now handled in renderAboveInput */}

        {/* Render inline cards at the end of the chat - ONLY after typewriter animation completes */}
        {/* This ensures UI elements like feel-heard confirmation appear after AI message finishes */}
        {!isTypewriterAnimating && inlineCards.map((card) => renderInlineCard(card))}
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
            // Optimistic UI: immediately show loading state and indicator
            setIsConfirmingInvitation(true);
            setOptimisticConfirmTimestamp(new Date().toISOString());
            setShowRefineDrawer(false);
            // Confirm the invitation after sharing
            handleConfirmInvitationMessage(invitationMessage);
          }}
          onClose={() => setShowRefineDrawer(false)}
        />
      )}

      {/* View Empathy Statement Drawer - for viewing full statement */}
      {liveProposedEmpathyStatement && (
        <ViewEmpathyStatementDrawer
          visible={showEmpathyDrawer}
          statement={liveProposedEmpathyStatement}
          partnerName={partnerName}
          onShare={() => {
            // Close drawer and open a simple confirmation before sending
            setShowEmpathyDrawer(false);
            setShowShareConfirm(true);
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

      {/* Curiosity Compact Overlay - blocks interaction until signed */}
      <CuriosityCompactOverlay
        visible={shouldShowCompactOverlay}
        onSign={() => handleSignCompact(() => onStageComplete?.(Stage.ONBOARDING))}
        onNavigateBack={onNavigateBack}
        isPending={isSigningCompact}
      />

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
    waitingBanner: {
      paddingHorizontal: t.spacing.lg,
      paddingVertical: t.spacing.md,
      backgroundColor: t.colors.bgSecondary,
      borderTopWidth: 1,
      borderTopColor: t.colors.border,
    },
    waitingBannerText: {
      color: t.colors.textSecondary,
      fontSize: t.typography.fontSize.sm,
      lineHeight: 20,
      textAlign: 'center',
    },
    innerThoughtsLink: {
      marginTop: t.spacing.sm,
      paddingVertical: t.spacing.xs,
      alignItems: 'center',
    },
    innerThoughtsLinkText: {
      color: t.colors.brandBlue,
      fontSize: t.typography.fontSize.sm,
      fontWeight: '600',
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
