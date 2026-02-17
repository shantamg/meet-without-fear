/**
 * Share Screen Route
 *
 * Shows shared content between the user and partner.
 * Navigated to via "Share →" button from the main chat screen.
 * Uses standard navigation with native slide transition.
 *
 * Data sharing: Uses React Query cache populated by the Chat screen.
 * The Ably connection is a singleton shared across the app.
 *
 * Empathy History: Uses messages from cache to detect revision history.
 * Older empathy statements are marked as "superseded" (Updated Below).
 *
 * Stage 3/4 Content: Now includes Need Mapping and Strategic Repair content
 * - Stage 3: NeedsSection, CommonGroundCard
 * - Stage 4: StrategyPool, StrategyRanking, OverlapReveal, AgreementCard
 */

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, StyleSheet, ActivityIndicator, ScrollView, Text, TouchableOpacity } from 'react-native';
import { MessageRole, EmpathyStatus, Stage, StrategyPhase } from '@meet-without-fear/shared';

import { SessionChatHeader } from '@/src/components/SessionChatHeader';
import { PartnerChatTab, EmpathyAttemptWithHistory } from '@/src/components/PartnerChatTab';
import { ViewEmpathyStatementDrawer } from '@/src/components/ViewEmpathyStatementDrawer';
import { RefineInvitationDrawer } from '@/src/components/RefineInvitationDrawer';
import { NeedsSection } from '@/src/components/NeedsSection';
import { CommonGroundCard } from '@/src/components/CommonGroundCard';
import { StrategyPool } from '@/src/components/StrategyPool';
import { StrategyRanking } from '@/src/components/StrategyRanking';
import { OverlapReveal } from '@/src/components/OverlapReveal';
import { AgreementCard } from '@/src/components/AgreementCard';
import { useSharingStatus } from '@/src/hooks/useSharingStatus';
import { useSessionState, useMarkShareTabViewed } from '@/src/hooks/useSessions';
import {
  useRespondToShareOffer,
  useResubmitEmpathy,
  useSkipRefinement,
  useProgress,
  useNeeds,
  useCommonGround,
  useStrategies,
  useStrategiesReveal,
  useAgreements,
  useMarkReadyToRank,
  useSubmitRankings,
  useConfirmAgreement,
  useCreateAgreement,
  useProposeStrategy,
  useRequestStrategySuggestions,
} from '@/src/hooks/useStages';
import { useSendMessage, useInfiniteMessages } from '@/src/hooks/useMessages';
import { useAuth } from '@/src/hooks/useAuth';
import { createInvitationLink } from '@/src/hooks/useInvitation';
import { colors } from '@/src/theme';

// ============================================================================
// Types
// ============================================================================

type ShareTab = 'empathy' | 'needs' | 'strategies' | 'agreement';

interface Strategy {
  id: string;
  description: string;
  duration?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function transformNeedsForDisplay(needs: { id: string; need: string; description: string; category?: string }[]) {
  return needs.map((need) => ({
    id: need.id,
    category: need.category || need.need, // Use category enum if available, fallback to need name
    description: need.need, // The need text is the actual description
  }));
}

function transformCommonGroundForDisplay(commonGround: { id: string; need: string; description: string; category?: string }[]) {
  return commonGround.map((cg) => ({
    category: cg.category || cg.need, // Use category enum if available, fallback to need name
    description: cg.need, // The need text is the actual description
  }));
}

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Tab Selector for switching between Share page sections
 */
function ShareTabSelector({ 
  activeTab, 
  onTabChange, 
  availableTabs,
  testID 
}: { 
  activeTab: ShareTab; 
  onTabChange: (tab: ShareTab) => void;
  availableTabs: ShareTab[];
  testID?: string;
}) {
  const tabs: { id: ShareTab; label: string }[] = [
    { id: 'empathy', label: 'Empathy' },
    { id: 'needs', label: 'Needs' },
    { id: 'strategies', label: 'Strategies' },
    { id: 'agreement', label: 'Agreement' },
  ];

  return (
    <View style={tabSelectorStyles.container} testID={testID}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={tabSelectorStyles.scrollContent}>
        {tabs.map((tab) => {
          const isAvailable = availableTabs.includes(tab.id);
          const isActive = activeTab === tab.id;
          
          return (
            <TouchableOpacity
              key={tab.id}
              style={[
                tabSelectorStyles.tab,
                isActive && tabSelectorStyles.activeTab,
                !isAvailable && tabSelectorStyles.disabledTab,
              ]}
              onPress={() => isAvailable && onTabChange(tab.id)}
              disabled={!isAvailable}
              testID={`${testID}-tab-${tab.id}`}
            >
              <Text style={[
                tabSelectorStyles.tabText,
                isActive && tabSelectorStyles.activeTabText,
                !isAvailable && tabSelectorStyles.disabledTabText,
              ]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const tabSelectorStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.bgSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: colors.bgTertiary,
    marginRight: 8,
  },
  activeTab: {
    backgroundColor: colors.accent,
  },
  disabledTab: {
    opacity: 0.5,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  activeTabText: {
    color: colors.textOnAccent,
  },
  disabledTabText: {
    color: colors.textMuted,
  },
});

/**
 * Stage 3: Needs Content Section
 */
function NeedsContentSection({
  sessionId,
  partnerName,
  testID,
}: {
  sessionId: string;
  partnerName: string;
  testID?: string;
}) {
  const { data: needsData, isLoading: loadingNeeds } = useNeeds(sessionId);
  const { data: commonGroundData, isLoading: loadingCommonGround } = useCommonGround(sessionId);

  if (loadingNeeds || loadingCommonGround) {
    return (
      <View style={sectionStyles.loadingContainer} testID={testID}>
        <ActivityIndicator size="small" color={colors.accent} />
        <Text style={sectionStyles.loadingText}>Loading needs...</Text>
      </View>
    );
  }

  const needs = needsData?.needs || [];
  const commonGround = commonGroundData?.commonGround || [];
  const hasNeeds = needs.length > 0;
  const hasCommonGround = commonGround.length > 0;

  return (
    <ScrollView style={sectionStyles.container} testID={testID}>
      {hasNeeds && (
        <View style={sectionStyles.section}>
          <Text style={sectionStyles.sectionTitle}>Your Identified Needs</Text>
          <NeedsSection
            title="What you need most"
            needs={transformNeedsForDisplay(needs)}
            testID={`${testID}-needs-section`}
          />
        </View>
      )}

      {hasCommonGround && (
        <View style={sectionStyles.section}>
          <Text style={sectionStyles.sectionTitle}>Common Ground with {partnerName}</Text>
          <CommonGroundCard
            sharedNeeds={transformCommonGroundForDisplay(commonGround)}
            insight="When we see our shared needs, we remember we're on the same team."
            testID={`${testID}-common-ground`}
          />
        </View>
      )}

      {!hasNeeds && !hasCommonGround && (
        <View style={sectionStyles.emptyState}>
          <Text style={sectionStyles.emptyTitle}>Needs Mapping</Text>
          <Text style={sectionStyles.emptyText}>
            Your needs will appear here once they've been identified through the conversation.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

/**
 * Stage 4: Strategies Content Section
 */
function StrategiesContentSection({
  sessionId,
  testID,
}: {
  sessionId: string;
  testID?: string;
}) {
  const { data: strategyData, isLoading: loadingStrategies } = useStrategies(sessionId);
  const { data: revealData, isLoading: loadingReveal } = useStrategiesReveal(sessionId);
  const { mutate: markReady } = useMarkReadyToRank();
  const { mutate: submitRankings } = useSubmitRankings();
  const { mutate: requestSuggestions, isPending: isGenerating } = useRequestStrategySuggestions();
  const { mutate: proposeStrategy, isPending: isProposing } = useProposeStrategy();

  const [showRanking, setShowRanking] = useState(false);

  const phase = strategyData?.phase || StrategyPhase.COLLECTING;
  const strategies: Strategy[] = (strategyData?.strategies || []).map((s) => ({
    id: s.id,
    description: s.description,
    duration: s.duration || undefined,
  }));

  const handleRequestMore = useCallback(() => {
    requestSuggestions({ sessionId, count: 3 });
  }, [sessionId, requestSuggestions]);

  const handleReady = useCallback(() => {
    markReady({ sessionId });
    setShowRanking(true);
  }, [sessionId, markReady]);

  const handleSubmitRankings = useCallback((rankedIds: string[]) => {
    submitRankings({ sessionId, rankedIds });
    setShowRanking(false);
  }, [sessionId, submitRankings]);

  const handleProposeStrategy = useCallback((description: string) => {
    proposeStrategy({ sessionId, description });
  }, [sessionId, proposeStrategy]);

  if (loadingStrategies || loadingReveal) {
    return (
      <View style={sectionStyles.loadingContainer} testID={testID}>
        <ActivityIndicator size="small" color={colors.accent} />
        <Text style={sectionStyles.loadingText}>Loading strategies...</Text>
      </View>
    );
  }

  // Phase: Private ranking
  if (phase === StrategyPhase.RANKING || showRanking) {
    return (
      <View style={sectionStyles.container} testID={testID}>
        <StrategyRanking
          strategies={strategies}
          onSubmit={handleSubmitRankings}
        />
      </View>
    );
  }

  // Phase: Reveal overlap
  if (phase === StrategyPhase.REVEALING && revealData) {
    const overlappingStrategies = revealData.overlap.map((s) => ({
      id: s.id,
      description: s.description,
      duration: s.duration || undefined,
    }));

    return (
      <View style={sectionStyles.container} testID={testID}>
        <OverlapReveal
          overlapping={overlappingStrategies}
          uniqueToMe={[]}
          uniqueToPartner={[]}
        />
      </View>
    );
  }

  // Phase: Collecting strategies (default)
  return (
    <View style={sectionStyles.container} testID={testID}>
      <StrategyPool
        strategies={strategies}
        onRequestMore={handleRequestMore}
        onReady={handleReady}
        isGenerating={isGenerating}
      />
    </View>
  );
}

/**
 * Stage 4: Agreement Content Section
 */
function AgreementContentSection({
  sessionId,
  testID,
}: {
  sessionId: string;
  testID?: string;
}) {
  const { data: agreementsData, isLoading: loadingAgreements } = useAgreements(sessionId);
  const { data: strategyData } = useStrategies(sessionId);
  const { mutate: confirmAgreement } = useConfirmAgreement();
  const { mutate: createAgreement } = useCreateAgreement();

  const phase = strategyData?.phase || StrategyPhase.COLLECTING;
  const agreement = agreementsData?.agreements?.[0];

  const handleConfirmAgreement = useCallback(() => {
    if (agreement) {
      confirmAgreement({ sessionId, agreementId: agreement.id, confirmed: true });
    }
  }, [sessionId, agreement, confirmAgreement]);

  if (loadingAgreements) {
    return (
      <View style={sectionStyles.loadingContainer} testID={testID}>
        <ActivityIndicator size="small" color={colors.accent} />
        <Text style={sectionStyles.loadingText}>Loading agreement...</Text>
      </View>
    );
  }

  // No agreement yet
  if (!agreement) {
    return (
      <View style={sectionStyles.emptyState} testID={testID}>
        <Text style={sectionStyles.emptyTitle}>Agreement</Text>
        <Text style={sectionStyles.emptyText}>
          {phase === StrategyPhase.NEGOTIATING 
            ? 'Creating your agreement based on shared priorities...'
            : 'Complete the strategy ranking to generate your agreement.'}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={sectionStyles.container} testID={testID}>
      <AgreementCard
        agreement={{
          experiment: agreement.description,
          duration: agreement.duration || 'To be determined',
          successMeasure: agreement.measureOfSuccess || 'To be defined together',
          checkInDate: agreement.followUpDate || undefined,
        }}
        onConfirm={handleConfirmAgreement}
      />
    </ScrollView>
  );
}

const sectionStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: 16,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.textSecondary,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});

// ============================================================================
// Main Component
// ============================================================================

export default function ShareScreen() {
  const { id: sessionId, highlight, tab } = useLocalSearchParams<{ 
    id: string; 
    highlight?: string;
    tab?: ShareTab;
  }>();
  const router = useRouter();
  const { user } = useAuth();

  // Decode the highlight timestamp if provided
  const highlightTimestamp = highlight ? decodeURIComponent(highlight) : null;

  // Active tab state
  const [activeTab, setActiveTab] = useState<ShareTab>(tab || 'empathy');

  // Session data from React Query cache (populated by Chat screen)
  const { data: sessionState, isLoading: isLoadingSession } = useSessionState(sessionId ?? '');
  const session = sessionState?.session;
  const invitation = sessionState?.invitation;

  // Progress data to determine available stages
  const { data: progressData } = useProgress(sessionId ?? '');
  const myProgress = progressData?.myProgress;

  // Sharing status from React Query cache
  const sharingStatus = useSharingStatus(sessionId ?? '');

  // Messages from React Query cache (for empathy revision history)
  const { data: messagesData } = useInfiniteMessages({
    sessionId: sessionId ?? '',
  });

  // Derive empathy history from messages
  // Find all EMPATHY_STATEMENT messages from current user and mark older ones as superseded
  const myEmpathyAttempts = useMemo((): EmpathyAttemptWithHistory[] => {
    if (!messagesData?.pages || !user?.id) {
      // Fall back to single attempt from sharingStatus if no messages yet
      if (sharingStatus.myAttempt) {
        return [sharingStatus.myAttempt];
      }
      return [];
    }

    // Flatten all messages from all pages
    const allMessages = messagesData.pages.flatMap((page) => page.messages);

    // Get shared context content to filter out "what you shared" echo messages
    // These appear as EMPATHY_STATEMENT but are actually echoes of shared context
    const sharedContextContent = sharingStatus.mySharedContext?.content;

    // Filter for EMPATHY_STATEMENT messages from current user
    // Exclude messages that match the shared context (to avoid duplicates)
    const empathyMessages = allMessages.filter(
      (msg) =>
        msg.role === MessageRole.EMPATHY_STATEMENT &&
        msg.senderId === user.id &&
        // Exclude if this is a "what you shared" echo
        msg.content !== sharedContextContent
    );

    if (empathyMessages.length === 0) {
      // No empathy messages, fall back to sharingStatus.myAttempt
      if (sharingStatus.myAttempt) {
        return [sharingStatus.myAttempt];
      }
      return [];
    }

    // Sort by timestamp (oldest first for display)
    const sortedMessages = [...empathyMessages].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // The latest one (last in sorted array) is NOT superseded
    // All others are superseded
    const latestId = sortedMessages[sortedMessages.length - 1]?.id;

    // Convert messages to EmpathyAttemptWithHistory
    return sortedMessages.map((msg): EmpathyAttemptWithHistory => {
      const isSuperseded = msg.id !== latestId;

      // Use delivery status from message if available, otherwise derive from sharingStatus
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messageDeliveryStatus = (msg as any).sharedContentDeliveryStatus;
      const deliveryStatus = isSuperseded
        ? 'superseded'
        : messageDeliveryStatus ?? sharingStatus.myAttempt?.deliveryStatus ?? 'pending';

      // Use status from sharingStatus for the latest attempt, otherwise default to the message's implied status
      const status: EmpathyStatus = isSuperseded
        ? EmpathyStatus.READY // Superseded attempts are effectively "done" (but never delivered)
        : sharingStatus.myAttempt?.status ?? EmpathyStatus.HELD;

      return {
        id: msg.id,
        sourceUserId: msg.senderId ?? user.id,
        content: msg.content,
        sharedAt: msg.timestamp,
        consentRecordId: '', // Not available from message
        status,
        revealedAt: null,
        revisionCount: 0, // Calculated implicitly by position
        deliveryStatus,
        isSuperseded,
      };
    });
  }, [messagesData, user?.id, sharingStatus.myAttempt, sharingStatus.mySharedContext]);

  // Determine available tabs based on progress
  const availableTabs = useMemo((): ShareTab[] => {
    const tabs: ShareTab[] = ['empathy'];
    
    if (!myProgress) return tabs;
    
    const currentStage = myProgress.stage;
    
    // Stage 3 (Need Mapping) and beyond
    if (currentStage >= Stage.NEED_MAPPING) {
      tabs.push('needs');
    }
    
    // Stage 4 (Strategic Repair) and beyond
    if (currentStage >= Stage.STRATEGIC_REPAIR) {
      tabs.push('strategies');
      tabs.push('agreement');
    }
    
    return tabs;
  }, [myProgress]);

  // Mutations
  const { mutate: respondToShareOffer } = useRespondToShareOffer();
  const { mutate: markShareTabViewed } = useMarkShareTabViewed(sessionId);
  const { mutate: resubmitEmpathy } = useResubmitEmpathy();
  const { mutate: skipRefinement } = useSkipRefinement();
  const { mutate: sendMessage } = useSendMessage();

  // Local state for drawers
  const [showEmpathyDrawer, setShowEmpathyDrawer] = useState(false);
  const [showRefineDrawer, setShowRefineDrawer] = useState(false);
  const [isRefiningInvitation, setIsRefiningInvitation] = useState(false);

  // Invitation URL for sharing
  const invitationUrl = useMemo(() => {
    if (invitation?.id) {
      return createInvitationLink(invitation.id);
    }
    return '';
  }, [invitation?.id]);

  // Get invitation message
  const invitationMessage = invitation?.invitationMessage;

  // Mark Share tab as viewed on mount - this triggers "seen" delivery status for shared content
  const hasMarkedViewed = useRef(false);
  useEffect(() => {
    if (sessionId && !hasMarkedViewed.current) {
      hasMarkedViewed.current = true;
      markShareTabViewed();
    }
  }, [sessionId, markShareTabViewed]);

  const partnerName = session?.partner?.nickname ?? session?.partner?.name ?? 'Partner';

  // State for share suggestion refinement
  const [isRefiningShare, setIsRefiningShare] = useState(false);

  const handleRespondToShareOffer = (response: 'accept' | 'decline') => {
    if (sharingStatus.shareOffer && sessionId) {
      const sharedContent = response === 'accept' ? sharingStatus.shareOffer.suggestedContent : undefined;
      respondToShareOffer({ sessionId, action: response, sharedContent });
    }
  };

  const handleRefineShareOffer = (message: string) => {
    if (sharingStatus.shareOffer && sessionId) {
      setIsRefiningShare(true);
      respondToShareOffer({
        sessionId,
        action: 'refine',
        refinedContent: message,
      });
      // Clear loading state after a delay
      setTimeout(() => {
        setIsRefiningShare(false);
      }, 5000);
    }
  };

  const handleBackToChat = () => {
    router.back();
  };

  const handleInvitationPress = () => {
    // Open the refine invitation drawer
    setShowRefineDrawer(true);
  };

  const handleSendInvitationRefinement = (message: string) => {
    if (!sessionId) return;

    // Set loading state
    setIsRefiningInvitation(true);

    // Send refinement message - backend will detect "Refine invitation:" prefix
    // and use the invitation prompt context
    const refinementMessage = `Refine invitation: ${message}`;
    sendMessage({ sessionId, content: refinementMessage });

    // The invitation will be updated via the backend when the AI responds.
    // After a delay, clear the loading state. The invitation message will update
    // from React Query cache when session state is invalidated.
    setTimeout(() => {
      setIsRefiningInvitation(false);
    }, 5000);
  };

  const handleTabChange = useCallback((tab: ShareTab) => {
    setActiveTab(tab);
    // Update URL param without navigation
    router.setParams({ tab });
  }, [router]);

  if (!sessionId) {
    return null;
  }

  if (isLoadingSession) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
          animation: 'slide_from_right',
        }}
      />
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <SessionChatHeader
          partnerName={partnerName}
          onBackPress={handleBackToChat}
          testID="share-screen-header"
        />
        
        {/* Tab Selector - only show if we have multiple tabs available */}
        {availableTabs.length > 1 && (
          <ShareTabSelector
            activeTab={activeTab}
            onTabChange={handleTabChange}
            availableTabs={availableTabs}
            testID="share-tab-selector"
          />
        )}

        {/* Content based on active tab */}
        {activeTab === 'empathy' && (
          <PartnerChatTab
            sessionId={sessionId}
            partnerName={partnerName}
            myEmpathyAttempts={myEmpathyAttempts}
            partnerEmpathyAttempt={sharingStatus.partnerAttempt}
            sharedContextSent={sharingStatus.mySharedContext ? [sharingStatus.mySharedContext] : []}
            sharedContextReceived={sharingStatus.sharedContext}
            // Don't show share suggestion if content has already been shared
            shareSuggestion={sharingStatus.mySharedContext ? null : sharingStatus.shareOffer}
            partnerEmpathyNeedsValidation={sharingStatus.needsToValidatePartner}
            isAnalyzing={sharingStatus.isAnalyzing}
            awaitingSharing={sharingStatus.hasSuggestion}
            myReconcilerResult={sharingStatus.myReconcilerResult}
            partnerHasSubmittedEmpathy={sharingStatus.partnerHasSubmittedEmpathy}
            partnerEmpathyHeldStatus={sharingStatus.partnerEmpathyHeldStatus}
            partnerEmpathySubmittedAt={sharingStatus.partnerEmpathySubmittedAt}
            onValidateAccurate={() => {/* Validation handled in Chat screen */}}
            onValidatePartial={() => {/* Validation handled in Chat screen */}}
            onValidateInaccurate={() => {/* Validation handled in Chat screen */}}
            onShareSuggestionAccept={() => handleRespondToShareOffer('accept')}
            onShareSuggestionDecline={() => handleRespondToShareOffer('decline')}
            onShareSuggestionRefine={handleRefineShareOffer}
            isRefiningShareSuggestion={isRefiningShare}
            onRefineEmpathy={() => {
              // Open the empathy drawer directly on this screen
              setShowEmpathyDrawer(true);
            }}
            hasActiveInvitation={invitation?.isInviter && !invitation?.acceptedAt}
            onInvitationPress={handleInvitationPress}
            highlightTimestamp={highlightTimestamp}
            onHighlightComplete={() => {
              // Clear the URL param after highlight completes
              router.setParams({ highlight: undefined });
            }}
            testID="share-screen-partner-tab"
          />
        )}

        {activeTab === 'needs' && (
          <NeedsContentSection
            sessionId={sessionId}
            partnerName={partnerName}
            testID="share-needs-section"
          />
        )}

        {activeTab === 'strategies' && (
          <StrategiesContentSection
            sessionId={sessionId}
            testID="share-strategies-section"
          />
        )}

        {activeTab === 'agreement' && (
          <AgreementContentSection
            sessionId={sessionId}
            testID="share-agreement-section"
          />
        )}
      </SafeAreaView>

      {/* Empathy Refinement Drawer */}
      {/* Use the latest (non-superseded) empathy attempt for the drawer */}
      {(() => {
        const latestAttempt = myEmpathyAttempts.find((a) => !a.isSuperseded) ||
          myEmpathyAttempts[myEmpathyAttempts.length - 1];
        const content = latestAttempt?.content;

        if (!content) return null;

        return (
          <ViewEmpathyStatementDrawer
            visible={showEmpathyDrawer}
            statement={content}
            partnerName={partnerName}
            isRevising={true}
            onShare={() => {
              // Resubmit the empathy statement
              if (sessionId && content) {
                resubmitEmpathy({ sessionId, content });
              }
              setShowEmpathyDrawer(false);
              // Navigate to AI chat to see the acknowledgment message
              router.back();
            }}
            onSendRefinement={(message) => {
              // Send refinement message to AI and navigate to chat
              if (sessionId) {
                const refined = message.trim().toLowerCase().startsWith('refine empathy draft')
                  ? message
                  : `Refine empathy draft: ${message}`;
                sendMessage({ sessionId, content: refined });
              }
              setShowEmpathyDrawer(false);
              router.back(); // Go to chat to see the AI response
            }}
            onAcceptWithoutRevising={() => {
              // Acceptance check: guesser accepts subject's experience without revising empathy
              if (sessionId) {
                skipRefinement({ sessionId, willingToAccept: true });
              }
              setShowEmpathyDrawer(false);
              // Navigate back to chat
              router.back();
            }}
            onClose={() => setShowEmpathyDrawer(false)}
          />
        );
      })()}

      {/* Refine Invitation Drawer */}
      {invitationMessage && invitationUrl && (
        <RefineInvitationDrawer
          visible={showRefineDrawer}
          invitationMessage={invitationMessage}
          invitationUrl={invitationUrl}
          partnerName={partnerName}
          senderName={user?.name || user?.firstName || undefined}
          isRefining={isRefiningInvitation}
          onSendRefinement={handleSendInvitationRefinement}
          onShareSuccess={() => setShowRefineDrawer(false)}
          onClose={() => setShowRefineDrawer(false)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
