/**
 * Onboarding Screen (Stage 0)
 *
 * The Curiosity Compact signing flow for new sessions.
 * Users must agree to the commitments before proceeding.
 */

import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '@/src/hooks/useSessions';
import { useCompactStatus } from '@/src/hooks/useStages';
import { CuriosityCompact } from '@/src/components/CuriosityCompact';
import { WaitingRoom } from '@/src/components/WaitingRoom';
import { colors } from '@/src/theme';

// ============================================================================
// Types
// ============================================================================

type OnboardingStep = 'welcome' | 'consent' | 'faq' | 'compact';

// ============================================================================
// FAQ Data
// ============================================================================

const faqItems = [
  {
    question: 'What is the Curiosity Compact?',
    answer:
      'The Curiosity Compact is a set of mutual commitments you and your partner make to approach this conversation with openness, curiosity, and respect. It helps create a safe space for honest dialogue.',
  },
  {
    question: 'What happens after I sign?',
    answer:
      'Once both you and your partner sign the compact, you will proceed to Stage 1 where you can begin sharing your perspectives through guided prompts.',
  },
  {
    question: 'Can I leave at any time?',
    answer:
      'Yes, you can exit the session at any point. However, we encourage you to give the process a fair chance - meaningful conversations take time and patience.',
  },
  {
    question: 'Is this conversation private?',
    answer:
      'Your conversation is confidential. The AI facilitator is there to help guide the discussion, but your personal reflections remain between you and your partner.',
  },
  {
    question: 'What if I disagree with something in the compact?',
    answer:
      'The compact represents guiding principles, not rigid rules. If something feels uncomfortable, you can discuss it with your partner. The goal is mutual understanding, not perfection.',
  },
];

// ============================================================================
// Sub-Components
// ============================================================================

interface StageProgressProps {
  currentStage: number;
  totalStages: number;
}

function StageProgress({ currentStage, totalStages }: StageProgressProps) {
  return (
    <View style={styles.progressContainer}>
      <Text style={styles.progressText}>
        Stage {currentStage} of {totalStages}
      </Text>
      <View style={styles.progressBar}>
        {Array.from({ length: totalStages + 1 }).map((_, index) => (
          <View
            key={index}
            style={[
              styles.progressDot,
              index <= currentStage && styles.progressDotActive,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

interface WelcomeMessageProps {
  onContinue: () => void;
}

function WelcomeMessage({ onContinue }: WelcomeMessageProps) {
  return (
    <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
      <View style={styles.welcomeContainer}>
        <View style={styles.aiMessageContainer}>
          <View style={styles.aiAvatar}>
            <Text style={styles.aiAvatarText}>AI</Text>
          </View>
          <View style={styles.aiMessageBubble}>
            <Text style={styles.aiMessageText}>
              Congratulations on taking this step! Before we begin, I'd like to share some
              commitments that will help us work through this together.
            </Text>
          </View>
        </View>

        <View style={styles.explanationCard}>
          <Text style={styles.explanationTitle}>What is the Curiosity Compact?</Text>
          <Text style={styles.explanationText}>
            The Curiosity Compact is a set of guiding principles that you and your partner
            will agree to before starting your conversation. These commitments help create
            a foundation of trust, openness, and mutual respect.
          </Text>
          <Text style={styles.explanationText}>
            By signing the compact, you're agreeing to approach this conversation with
            genuine curiosity about each other's perspectives, even when you disagree.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={onContinue}
          accessibilityRole="button"
        >
          <Text style={styles.primaryButtonText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

interface ConsentQuestionProps {
  onAccept: () => void;
  onQuestions: () => void;
}

function ConsentQuestion({ onAccept, onQuestions }: ConsentQuestionProps) {
  return (
    <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
      <View style={styles.consentContainer}>
        <View style={styles.aiMessageContainer}>
          <View style={styles.aiAvatar}>
            <Text style={styles.aiAvatarText}>AI</Text>
          </View>
          <View style={styles.aiMessageBubble}>
            <Text style={styles.aiMessageText}>
              Are you open to being guided through this process?
            </Text>
          </View>
        </View>

        <Text style={styles.consentDescription}>
          I'll be here to help facilitate your conversation, offer prompts when helpful,
          and ensure both voices are heard. This works best when you're ready to engage
          with an open mind.
        </Text>

        <View style={styles.consentButtons}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={onAccept}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>Yes, let's begin</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={onQuestions}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>I have questions</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

interface FAQScreenProps {
  onBack: () => void;
  onContinue: () => void;
}

function FAQScreen({ onBack, onContinue }: FAQScreenProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  return (
    <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
      <View style={styles.faqContainer}>
        <Text style={styles.faqTitle}>Frequently Asked Questions</Text>

        {faqItems.map((item, index) => (
          <TouchableOpacity
            key={index}
            style={styles.faqItem}
            onPress={() => setExpandedIndex(expandedIndex === index ? null : index)}
            accessibilityRole="button"
          >
            <View style={styles.faqQuestionRow}>
              <Text style={styles.faqQuestion}>{item.question}</Text>
              <Text style={styles.faqExpandIcon}>
                {expandedIndex === index ? '-' : '+'}
              </Text>
            </View>
            {expandedIndex === index && (
              <Text style={styles.faqAnswer}>{item.answer}</Text>
            )}
          </TouchableOpacity>
        ))}

        <View style={styles.faqButtons}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={onBack}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>Back</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={onContinue}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>I'm ready to continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function OnboardingScreen() {
  const { id: sessionId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: sessionData, refetch: refetchSession } = useSession(sessionId);
  const { data: compactStatus, refetch: refetchCompact } = useCompactStatus(sessionId);

  const [step, setStep] = useState<OnboardingStep>('welcome');

  const handleSigned = () => {
    // Refresh both queries to get updated state
    refetchSession();
    refetchCompact();
    // Navigate back to session detail which will route appropriately
    router.replace(`/session/${sessionId}`);
  };

  const session = sessionData?.session;
  const mySigned = compactStatus?.mySigned ?? false;
  const partnerSigned = compactStatus?.partnerSigned ?? false;

  // If we signed but partner hasn't, show waiting room
  if (mySigned && !partnerSigned) {
    return (
      <>
        <Stack.Screen
          options={{
            headerShown: true,
            title: 'Waiting',
            headerBackTitle: 'Session',
          }}
        />
        <SafeAreaView style={styles.container} edges={['bottom']}>
          <WaitingRoom
            message="Waiting for your partner to sign the Curiosity Compact"
            partnerName={session?.partner?.name ?? undefined}
          />
        </SafeAreaView>
      </>
    );
  }

  const getHeaderTitle = () => {
    switch (step) {
      case 'welcome':
        return 'Welcome';
      case 'consent':
        return 'Getting Started';
      case 'faq':
        return 'Questions';
      case 'compact':
        return 'Curiosity Compact';
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: getHeaderTitle(),
          headerBackTitle: 'Session',
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <StageProgress currentStage={0} totalStages={4} />

        {step === 'welcome' && (
          <WelcomeMessage onContinue={() => setStep('consent')} />
        )}

        {step === 'consent' && (
          <ConsentQuestion
            onAccept={() => setStep('compact')}
            onQuestions={() => setStep('faq')}
          />
        )}

        {step === 'faq' && (
          <FAQScreen
            onBack={() => setStep('consent')}
            onContinue={() => setStep('compact')}
          />
        )}

        {step === 'compact' && (
          <CuriosityCompact sessionId={sessionId!} onSign={handleSigned} />
        )}
      </SafeAreaView>
    </>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },

  // Progress indicator
  progressContainer: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: colors.bgSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
    textAlign: 'center',
  },
  progressBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  progressDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.bgTertiary,
    borderWidth: 2,
    borderColor: colors.border,
  },
  progressDotActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },

  // Welcome message
  welcomeContainer: {
    flex: 1,
    padding: 24,
  },
  aiMessageContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  aiAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  aiAvatarText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  aiMessageBubble: {
    flex: 1,
    backgroundColor: colors.bgSecondary,
    borderRadius: 16,
    borderTopLeftRadius: 4,
    padding: 16,
  },
  aiMessageText: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.textPrimary,
  },
  explanationCard: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  explanationTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  explanationText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    marginBottom: 12,
  },

  // Consent question
  consentContainer: {
    flex: 1,
    padding: 24,
  },
  consentDescription: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    marginBottom: 32,
    paddingLeft: 52,
  },
  consentButtons: {
    gap: 12,
  },

  // FAQ
  faqContainer: {
    flex: 1,
    padding: 24,
  },
  faqTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 20,
  },
  faqItem: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  faqQuestionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  faqQuestion: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
    marginRight: 12,
  },
  faqExpandIcon: {
    fontSize: 20,
    color: colors.accent,
    fontWeight: 'bold',
  },
  faqAnswer: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  faqButtons: {
    marginTop: 24,
    gap: 12,
  },

  // Buttons
  primaryButton: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '600',
  },
});
