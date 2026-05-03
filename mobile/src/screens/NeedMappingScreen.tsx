/**
 * NeedMappingScreen Component
 *
 * Stage 3 - Need Mapping
 * AI helps users identify their underlying needs from the conversation,
 * then users confirm their needs before moving to strategies.
 *
 * Phases:
 * - Exploration: Chat with AI to explore needs
 * - Review: View and confirm identified needs
 * - Waiting: Wait for partner to complete their needs
 * - Complete: Redirect to next stage
 */

import { View, ScrollView, StyleSheet, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useState, useCallback } from 'react';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme';
import { useSession } from '../hooks/useSessions';
import { useMessages } from '../hooks/useMessages';
import { useStreamingMessage } from '../hooks/useStreamingMessage';
import {
  useProgress,
  useNeeds,
  useConfirmNeeds,
  useConsentShareNeeds,
} from '../hooks/useStages';
import { ChatInterface } from '../components/ChatInterface';
import { NeedsSection } from '../components/NeedsSection';
import { WaitingRoom } from '../components/WaitingRoom';
import { Stage, IdentifiedNeedDTO } from '@meet-without-fear/shared';

// ============================================================================
// Types
// ============================================================================

type NeedMappingPhase = 'exploration' | 'review' | 'waiting' | 'complete';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Determine the current phase based on data state.
 */
function determinePhase(
  needs: IdentifiedNeedDTO[] | undefined,
  allNeedsConfirmed: boolean,
): NeedMappingPhase {
  // No needs synthesized yet - still in exploration
  if (!needs || needs.length === 0) {
    return 'exploration';
  }

  // Needs exist but not all confirmed - review phase
  if (!allNeedsConfirmed) {
    return 'review';
  }

  // Needs confirmed - complete (AI handles transition conversationally)
  return 'complete';
}

/**
 * Transform IdentifiedNeedDTO to NeedsSection format.
 */
function transformNeedsForDisplay(needs: IdentifiedNeedDTO[]) {
  return needs.map((need) => ({
    id: need.id,
    category: need.need,
    description: need.description,
  }));
}

// ============================================================================
// Component
// ============================================================================

export function NeedMappingScreen() {
  const { id: sessionId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // Session and progress data
  const { data: sessionData, isLoading: loadingSession } = useSession(sessionId);
  const { data: progressData, isLoading: loadingProgress } = useProgress(sessionId);

  // Messages for chat interface
  const { data: messagesData, isLoading: loadingMessages } = useMessages(
    { sessionId: sessionId!, stage: Stage.NEED_MAPPING },
    { enabled: !!sessionId }
  );
  const { sendMessage, isSending } = useStreamingMessage();

  // Needs data
  const { data: needsData, isLoading: loadingNeeds } = useNeeds(sessionId);
  const { mutate: confirmNeeds, isPending: isConfirming } = useConfirmNeeds();
  const { mutate: consentShareNeeds } = useConsentShareNeeds();

  // Local state for adjustment mode
  const [adjustmentMode, setAdjustmentMode] = useState(false);

  // Derived data
  const session = sessionData?.session;
  const messages = messagesData?.messages ?? [];
  const needs = needsData?.needs ?? [];
  const myProgress = progressData?.myProgress;
  const partnerProgress = progressData?.partnerProgress;

  // Check if all needs are confirmed
  const allNeedsConfirmed = needs.length > 0 && needs.every((n) => n.confirmed);

  // Determine current phase
  const phase = determinePhase(needs, allNeedsConfirmed);

  // Loading state
  const isLoading = loadingSession || loadingProgress || loadingMessages || loadingNeeds;

  // ============================================================================
  // Hooks must be called unconditionally (before any early returns)
  // ============================================================================

  // Handle sending messages
  const handleSendMessage = useCallback(
    (content: string) => {
      if (!sessionId) return;
      sendMessage({ sessionId, content, currentStage: Stage.NEED_MAPPING });
    },
    [sessionId, sendMessage]
  );

  // Handle confirming all needs
  const handleConfirmNeeds = useCallback(() => {
    if (!sessionId) return;

    const needIds = needs.map((need) => need.id);

    confirmNeeds(
      { sessionId, needIds },
      {
        onSuccess: () => {
          // After confirming, consent to share for common ground discovery
          consentShareNeeds({
            sessionId,
            needIds,
          });
        },
      }
    );
  }, [sessionId, needs, confirmNeeds, consentShareNeeds]);

  // Handle adjustment request
  const handleAdjustNeeds = useCallback(() => {
    setAdjustmentMode(true);
    // Send a message to the AI requesting adjustment
    handleSendMessage('I would like to adjust my identified needs');
  }, [handleSendMessage]);

  // ============================================================================
  // Early Returns (after all hooks)
  // ============================================================================

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading need mapping...</Text>
      </View>
    );
  }

  // Check if we're on the right stage
  if (myProgress?.stage !== Stage.NEED_MAPPING && myProgress?.stage !== Stage.STRATEGIC_REPAIR) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Need Mapping',
            headerBackTitle: 'Session',
          }}
        />
        <SafeAreaView style={styles.container} edges={['bottom']}>
          <View style={styles.centerContainer}>
            <Text style={styles.title}>Need Mapping</Text>
            <Text style={styles.subtitle}>
              This stage will be unlocked after completing Perspective Stretch.
            </Text>
          </View>
        </SafeAreaView>
      </>
    );
  }

  // Check if we completed stage 3 but partner hasn't
  if (
    myProgress?.stage === Stage.STRATEGIC_REPAIR &&
    partnerProgress?.stage === Stage.NEED_MAPPING
  ) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Waiting',
            headerBackTitle: 'Session',
          }}
        />
        <SafeAreaView style={styles.container} edges={['bottom']}>
          <WaitingRoom
            message="Waiting for your partner to complete need mapping"
            partnerName={session?.partner?.nickname ?? session?.partner?.name ?? undefined}
          />
        </SafeAreaView>
      </>
    );
  }

  // ============================================================================
  // Render Phases
  // ============================================================================

  // Phase: Exploration - chat with AI about needs
  if (phase === 'exploration') {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Understanding Needs',
            headerBackTitle: 'Session',
          }}
        />
        <SafeAreaView style={styles.container} edges={['bottom']} testID="need-mapping-exploration">
          <View style={styles.header}>
            <Text style={styles.title}>Understanding Your Needs</Text>
            <Text style={styles.subtitle}>
              The AI will help translate your feelings into underlying needs
            </Text>
          </View>
          <ChatInterface
            messages={messages}
            onSendMessage={handleSendMessage}
            isLoading={isSending}
            emptyStateTitle="Explore Your Needs"
            emptyStateMessage="Let's discover what you truly need in this situation. The AI will help translate your feelings into underlying needs."
          />
        </SafeAreaView>
      </>
    );
  }

  // Phase: Review - show identified needs for confirmation
  if (phase === 'review' || adjustmentMode) {
    const displayNeeds = transformNeedsForDisplay(needs);

    return (
      <>
        <Stack.Screen
          options={{
            title: 'Your Needs',
            headerBackTitle: 'Session',
          }}
        />
        <SafeAreaView style={styles.container} edges={['bottom']} testID="need-mapping-review">
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.header}>
              <Text style={styles.title}>Your Identified Needs</Text>
              <Text style={styles.subtitle}>
                Review the needs identified from your conversation
              </Text>
            </View>

            <View style={styles.content}>
              <NeedsSection
                title="What you need most"
                needs={displayNeeds}
                testID="needs-section"
              />

              <View style={styles.confirmation} testID="needs-confirm-question">
                <Text style={styles.confirmQuestion}>
                  Does this capture what you need?
                </Text>

                <TouchableOpacity
                  style={styles.adjustButton}
                  onPress={handleAdjustNeeds}
                  disabled={isConfirming}
                  testID="adjust-needs-button"
                  accessibilityRole="button"
                  accessibilityLabel="Adjust needs"
                >
                  <Text style={styles.adjustText}>I want to adjust these</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.confirmButton, isConfirming && styles.disabledButton]}
                  onPress={handleConfirmNeeds}
                  disabled={isConfirming}
                  testID="confirm-needs-button"
                  accessibilityRole="button"
                  accessibilityLabel="Confirm my needs"
                >
                  <Text style={styles.confirmText}>
                    {isConfirming ? 'Confirming...' : 'Yes, confirm my needs'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </>
    );
  }

  // Phase: Complete - redirect to session
  if (phase === 'complete') {
    router.replace(`/session/${sessionId}`);
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Moving to next stage...</Text>
      </View>
    );
  }

  return null;
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bgPrimary,
    padding: 20,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  content: {
    padding: 16,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.textSecondary,
  },
  confirmation: {
    marginTop: 24,
    padding: 16,
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
  },
  confirmQuestion: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
    color: colors.textPrimary,
  },
  adjustButton: {
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: colors.bgSecondary,
  },
  adjustText: {
    color: colors.textPrimary,
    fontSize: 14,
  },
  confirmButton: {
    padding: 14,
    backgroundColor: colors.accent,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
});

export default NeedMappingScreen;
