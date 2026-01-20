/**
 * PerspectiveStretchScreen Component
 *
 * Stage 2 - Perspective Stretch
 * Users create and share empathy drafts to understand each other's perspective.
 *
 * Phases:
 * 1. Building - User works with AI to draft their understanding of partner's perspective
 * 2. Ready to Share - User reviews draft and consents to share with partner
 * 3. Waiting for Partner - User has consented, waiting for partner to do the same
 * 4. Validation - User reviews partner's attempt and provides accuracy feedback
 * 5. Revision - Partner provided feedback, user can revise their attempt
 * 6. Complete - Both users have validated, stage advances
 *
 * Features:
 * - Revision Loop: Allows revision when partner rates empathy as inaccurate
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, Text, ActivityIndicator, TouchableOpacity, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme';
import { useSession } from '../hooks/useSessions';
import {
  useProgress,
  useEmpathyDraft,
  usePartnerEmpathy,
  useSaveEmpathyDraft,
  useConsentToShareEmpathy,
  useValidateEmpathy,
  useSkipRefinement,
} from '../hooks/useStages';
import { useMessages } from '../hooks/useMessages';
import { useStreamingMessage } from '../hooks/useStreamingMessage';
import { useCreateInnerThoughtsSession, useLinkedInnerThoughts } from '../hooks/useInnerThoughts';
import { ChatInterface } from '../components/ChatInterface';
import { ChatHeader } from '../components/ChatHeader';
import { EmpathyAttemptCard } from '../components/EmpathyAttemptCard';
import { ConsentPrompt, SharingOption } from '../components/ConsentPrompt';
import { AccuracyFeedback } from '../components/AccuracyFeedback';
import { ValidationCoachChat } from '../components/ValidationCoachChat';
import { WaitingRoom } from '../components/WaitingRoom';
import { Stage, StageStatus } from '@meet-without-fear/shared';

// ============================================================================
// Types
// ============================================================================

type Phase = 'building' | 'ready_to_share' | 'waiting_for_partner' | 'validation' | 'revision' | 'complete';

// ============================================================================
// Phase Determination
// ============================================================================

function determinePhase(
  progressData: ReturnType<typeof useProgress>['data'],
  empathyDraftData: ReturnType<typeof useEmpathyDraft>['data'],
  partnerEmpathyData: ReturnType<typeof usePartnerEmpathy>['data'],
  needsRevision: boolean
): Phase {
  // Check if stage is complete
  if (progressData?.myProgress?.status === StageStatus.COMPLETED && progressData?.canAdvance) {
    return 'complete';
  }

  // Check if user needs to revise their empathy attempt based on partner feedback
  if (needsRevision && empathyDraftData?.draft) {
    return 'revision';
  }

  // Check if we have partner's attempt to validate
  if (partnerEmpathyData?.attempt && !partnerEmpathyData.validated) {
    return 'validation';
  }

  // Check if we're waiting for partner
  if (empathyDraftData?.alreadyConsented && partnerEmpathyData?.waitingForPartner) {
    return 'waiting_for_partner';
  }

  // Check if draft is ready to share
  if (empathyDraftData?.canConsent && empathyDraftData?.draft?.readyToShare) {
    return 'ready_to_share';
  }

  // Default to building phase
  return 'building';
}

// ============================================================================
// Component
// ============================================================================

export function PerspectiveStretchScreen() {
  const { id: sessionId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // Data hooks
  const { data: sessionData, isLoading: loadingSession } = useSession(sessionId);
  const { data: progressData, isLoading: loadingProgress } = useProgress(sessionId);
  const { data: empathyDraftData, isLoading: loadingDraft } = useEmpathyDraft(sessionId);
  const { data: partnerEmpathyData, isLoading: loadingPartnerEmpathy } =
    usePartnerEmpathy(sessionId);
  const { data: messagesData } = useMessages({ sessionId: sessionId || '', stage: Stage.PERSPECTIVE_STRETCH });
  const messages = messagesData?.messages ?? [];

  // Mutation hooks
  const { sendMessage, isSending } = useStreamingMessage();
  const { mutate: saveDraft } = useSaveEmpathyDraft();
  const { mutate: consentToShare } = useConsentToShareEmpathy();
  const { mutate: validateEmpathy } = useValidateEmpathy();
  const { mutate: skipRefinement } = useSkipRefinement();

  // Inner Thoughts hooks for linked session
  const { data: linkedData } = useLinkedInnerThoughts(sessionId);
  const createInnerThoughts = useCreateInnerThoughtsSession();

  // Revision state (for when partner rates empathy as inaccurate)
  const [needsRevision, setNeedsRevision] = useState(false);
  const [partnerFeedback, setPartnerFeedback] = useState<string | null>(null);

  // Feedback Coach State
  const [showFeedbackCoach, setShowFeedbackCoach] = useState(false);
  const [showInitialInput, setShowInitialInput] = useState(false);
  const [initialFeedback, setInitialFeedback] = useState('');

  // Acceptance Check State
  const [showAcceptanceCheck, setShowAcceptanceCheck] = useState(false);
  const [acceptanceReason, setAcceptanceReason] = useState('');
  const [showRefusalInput, setShowRefusalInput] = useState(false);

  // Derived data
  const session = sessionData?.session;
  const myProgress = progressData?.myProgress;
  const partnerName = session?.partner?.nickname ?? session?.partner?.name ?? 'Partner';

  // Determine current phase
  const phase = useMemo(
    () => determinePhase(progressData, empathyDraftData, partnerEmpathyData, needsRevision),
    [progressData, empathyDraftData, partnerEmpathyData, needsRevision]
  );

  // Navigate away when complete
  useEffect(() => {
    if (phase === 'complete' && sessionId) {
      router.replace(`/session/${sessionId}`);
    }
  }, [phase, sessionId, router]);

  // Loading state
  const isLoading = loadingSession || loadingProgress || loadingDraft || loadingPartnerEmpathy;
  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading perspective stretch...</Text>
      </View>
    );
  }

  // Check if we're on the right stage
  if (myProgress?.stage !== Stage.PERSPECTIVE_STRETCH) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Perspective Stretch',
            headerBackTitle: 'Session',
          }}
        />
        <SafeAreaView style={styles.container} edges={['bottom']}>
          <View style={styles.centerContainer}>
            <Text style={styles.title}>Perspective Stretch</Text>
            <Text style={styles.subtitle}>
              This stage will be unlocked after completing the Witness stage.
            </Text>
          </View>
        </SafeAreaView>
      </>
    );
  }

  // Handle sharing option selection (simplified to consent/decline)
  const handleShareSelect = (option: SharingOption) => {
    if (!sessionId) return;

    if (option === 'private') {
      // Go back to editing - mark draft as not ready
      if (!empathyDraftData?.draft?.content) return;
      saveDraft({
        sessionId,
        content: empathyDraftData.draft.content,
        readyToShare: false,
      });
    } else {
      // Share with partner
      // Ensure draft is marked ready before consenting
      if (empathyDraftData?.draft?.content) {
        saveDraft({
          sessionId,
          content: empathyDraftData.draft.content,
          readyToShare: true,
        });
      }
      consentToShare({ sessionId, consent: true });
    }
  };

  // Handle validation actions
  const handleAccurate = () => {
    if (!sessionId) return;
    validateEmpathy({
      sessionId,
      validated: true,
    });
  };

  const handlePartiallyAccurate = () => {
    if (!sessionId) return;
    // When partner says partially accurate, trigger revision for the other user
    // For now, we store feedback and allow the partner to revise
    validateEmpathy({
      sessionId,
      validated: false,
      feedback: 'Some parts are accurate, but I need to add more context.',
    });
  };



  const handleInaccurate = () => {
    if (!sessionId) return;
    // Open initial feedback input
    setInitialFeedback('');
    setShowInitialInput(true);
  };

  // Feedback Coach Handlers
  const handleSubmitInitialFeedback = () => {
    if (!initialFeedback.trim()) return;
    setShowInitialInput(false);
    setShowFeedbackCoach(true);
  };

  const handleCompleteFeedback = (refinedFeedback: string) => {
    if (!sessionId) return;
    validateEmpathy({
      sessionId,
      validated: false,
      feedback: refinedFeedback,
    });
    setShowFeedbackCoach(false);
  };

  const handleCancelFeedback = () => {
    setShowFeedbackCoach(false);
    setInitialFeedback('');
  };

  // Handle message sending
  const handleSendMessage = (content: string) => {
    if (!sessionId) return;
    sendMessage({ sessionId, content, currentStage: Stage.PERSPECTIVE_STRETCH });
  };

  // Handle revision submission (used for future partner feedback feature)
  const _handleRevisionSubmit = (revisedContent: string) => {
    if (!sessionId) return;
    saveDraft({
      sessionId,
      content: revisedContent,
      readyToShare: true,
    });
    setNeedsRevision(false);
    setPartnerFeedback(null);
  };

  // Handle skipping revision and continuing
  // Handle skipping revision and continuing
  const handleSkipRevision = () => {
    setShowAcceptanceCheck(true);
  };

  const handleConfirmAcceptance = () => {
    if (!sessionId) return;
    skipRefinement({ sessionId, willingToAccept: true });
    setShowAcceptanceCheck(false);
    // Optimistically proceed
    setNeedsRevision(false);
    setPartnerFeedback(null);
  };

  const handleRejectAcceptance = () => {
    setShowAcceptanceCheck(false);
    setAcceptanceReason('');
    setShowRefusalInput(true);
  };

  const handleSubmitRefusal = () => {
    if (!sessionId) return;
    skipRefinement({ sessionId, willingToAccept: false, reason: acceptanceReason });
    setShowRefusalInput(false);
    // Optimistically proceed
    setNeedsRevision(false);
    setPartnerFeedback(null);
  };

  // Navigate to Inner Thoughts (create linked session if needed)
  const handleContinueInInnerThoughts = useCallback(async () => {
    if (!sessionId) return;

    // If a linked session already exists, navigate to it
    if (linkedData?.innerThoughtsSessionId) {
      router.push({
        pathname: '/inner-thoughts/[id]',
        params: {
          id: linkedData.innerThoughtsSessionId,
          linkedPartnerSessionId: sessionId,
          linkedPartnerName: partnerName,
        },
      });
      return;
    }

    // Create a new linked Inner Thoughts session
    try {
      const result = await createInnerThoughts.mutateAsync({
        linkedPartnerSessionId: sessionId,
        linkedTrigger: 'empathy_wait',
      });

      if (result?.session?.id) {
        router.push({
          pathname: '/inner-thoughts/[id]',
          params: {
            id: result.session.id,
            linkedPartnerSessionId: sessionId,
            linkedPartnerName: partnerName,
          },
        });
      }
    } catch (error) {
      console.error('[PerspectiveStretch] Failed to create Inner Thoughts session:', error);
    }
  }, [sessionId, linkedData, partnerName, router, createInnerThoughts]);

  // Render phase-specific content
  const renderContent = () => {
    switch (phase) {
      case 'building':
        return (
          <View style={styles.chatContainer}>
            <ChatHeader
              stageName="Perspective Stretch"
              stageNumber={2}
              stageDescription="Work with the AI to understand your partner's perspective."
              completedStages={1}
              testID="perspective-stretch-chat-header"
            />
            <View style={styles.header}>
              <Text style={styles.title}>Building Your Understanding</Text>
              <Text style={styles.subtitle}>
                Work with the AI to understand your partner's perspective
              </Text>
            </View>
            <ChatInterface
              messages={messages}
              onSendMessage={handleSendMessage}
              isLoading={isSending}
              emptyStateTitle="Build Your Understanding"
              emptyStateMessage="Share what you understand about your partner's perspective. The AI will help you refine it."
            />
          </View>
        );

      case 'ready_to_share':
        return (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.header}>
              <Text style={styles.title}>Ready to Share</Text>
              <Text style={styles.subtitle}>
                Review your empathy attempt before sharing with {partnerName}
              </Text>
            </View>
            <EmpathyAttemptCard
              attempt={empathyDraftData?.draft?.content || ''}
              testID="my-empathy-attempt"
            />
            <ConsentPrompt
              title="Share your attempt?"
              description={`${partnerName} will see your attempt to understand their perspective. They can provide feedback on how accurate it feels.`}
              onSelect={handleShareSelect}
              simplified
              testID="consent-prompt"
            />
          </ScrollView>
        );

      case 'waiting_for_partner':
        return (
          <WaitingRoom
            message={`You've shared your empathy attempt. Waiting for ${partnerName} to share theirs.`}
            partnerName={partnerName}
            currentStage={2}
            onContinueInInnerThoughts={handleContinueInInnerThoughts}
          />
        );

      case 'validation':
        return (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.header}>
              <Text style={styles.title}>Partner's Understanding of You</Text>
              <Text style={styles.subtitle}>
                Review how {partnerName} understands your perspective
              </Text>
            </View>
            <EmpathyAttemptCard
              attempt={partnerEmpathyData?.attempt?.content || ''}
              isPartner
              testID="partner-empathy-attempt"
            />
            <AccuracyFeedback
              onAccurate={handleAccurate}
              onPartiallyAccurate={handlePartiallyAccurate}
              onInaccurate={handleInaccurate}
              testID="accuracy-feedback"
            />
          </ScrollView>
        );

      case 'revision':
        return (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.header}>
              <Text style={styles.title}>Revise Your Understanding</Text>
              <Text style={styles.subtitle}>
                {partnerName} provided feedback on your empathy attempt
              </Text>
            </View>
            {partnerFeedback && (
              <View style={styles.feedbackCard}>
                <Text style={styles.feedbackLabel}>Partner's feedback:</Text>
                <Text style={styles.feedbackText}>{partnerFeedback}</Text>
              </View>
            )}
            <EmpathyAttemptCard
              attempt={empathyDraftData?.draft?.content || ''}
              testID="my-empathy-attempt-revision"
            />
            <View style={styles.revisionActions}>
              <ChatInterface
                messages={messages}
                onSendMessage={handleSendMessage}
                isLoading={isSending}
                emptyStateTitle="Revise Your Understanding"
                emptyStateMessage="Consider the feedback and work with the AI to improve your understanding."
              />
              <View style={styles.revisionButtons}>
                <TouchableOpacity
                  style={styles.skipRevisionButton}
                  onPress={handleSkipRevision}
                  accessibilityRole="button"
                >
                  <Text style={styles.skipRevisionText}>Skip revision</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        );

      case 'complete':
        // Will be navigated away
        return null;

      default:
        return null;
    }
  };

  if (showFeedbackCoach && sessionId) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ValidationCoachChat
          sessionId={sessionId}
          initialDraft={initialFeedback}
          onCancel={handleCancelFeedback}
          onComplete={handleCompleteFeedback}
          partnerName={partnerName}
        />
      </SafeAreaView>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: phase === 'validation' ? 'Review Understanding' : 'Building Empathy',
          headerBackTitle: 'Session',
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        {renderContent()}

        {/* Initial Feedback Modal */}
        <Modal
          visible={showInitialInput}
          transparent
          animationType="fade"
          onRequestClose={() => setShowInitialInput(false)}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>What felt off?</Text>
              <Text style={styles.modalSubtitle}>Briefly describe what wasn't quite right.</Text>
              <TextInput
                style={styles.modalInput}
                value={initialFeedback}
                onChangeText={setInitialFeedback}
                placeholder="It felt like..."
                placeholderTextColor={colors.textSecondary}
                multiline
                autoFocus
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={[styles.modalButton, styles.secondaryButton]} onPress={() => setShowInitialInput(false)}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalButton, styles.primaryButton]} onPress={handleSubmitInitialFeedback}>
                  <Text style={styles.buttonText}>Next</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Acceptance Check Modal */}
        <Modal
          visible={showAcceptanceCheck}
          transparent
          animationType="fade"
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Moving On</Text>
              <Text style={styles.modalSubtitle}>Since you're not revising your empathy statement, are you willing to accept your partner's experience as valid, even if you see it differently?</Text>
              <View style={styles.modalActions}>
                <TouchableOpacity style={[styles.modalButton, styles.secondaryButton]} onPress={handleRejectAcceptance}>
                  <Text style={[styles.secondaryButtonText, { color: colors.error }]}>No, I don't accept it</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalButton, styles.primaryButton]} onPress={handleConfirmAcceptance}>
                  <Text style={styles.buttonText}>Yes, I accept it</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Refusal Reason Modal */}
        <Modal
          visible={showRefusalInput}
          transparent
          animationType="fade"
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Help us understand</Text>
              <Text style={styles.modalSubtitle}>Please share why you can't accept this experience right now.</Text>
              <TextInput
                style={styles.modalInput}
                value={acceptanceReason}
                onChangeText={setAcceptanceReason}
                placeholder="I can't accept this because..."
                placeholderTextColor={colors.textSecondary}
                multiline
                autoFocus
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={[styles.modalButton, styles.secondaryButton]} onPress={() => setShowRefusalInput(false)}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalButton, styles.primaryButton]} onPress={handleSubmitRefusal}>
                  <Text style={styles.buttonText}>Submit</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </SafeAreaView>
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
  chatContainer: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 16,
    color: colors.textSecondary,
    fontSize: 16,
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    padding: 24,
    paddingBottom: 0,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  section: {
    padding: 24,
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 16,
  },
  card: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  feedbackCard: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)', // Light error red
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: colors.error,
  },
  feedbackLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.error,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  feedbackText: {
    fontSize: 15,
    color: colors.textPrimary,
    fontStyle: 'italic',
    lineHeight: 22,
  },
  revisionActions: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 16,
  },
  revisionButtons: {
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  skipRevisionButton: {
    padding: 12,
  },
  skipRevisionText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: colors.bgPrimary,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 24,
    lineHeight: 22,
  },
  modalInput: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: 16,
    color: colors.textPrimary,
    minHeight: 120,
    textAlignVertical: 'top',
    marginBottom: 24,
    fontSize: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  primaryButton: {
    backgroundColor: colors.accent,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  secondaryButtonText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 16,
  },
});


export default PerspectiveStretchScreen;
