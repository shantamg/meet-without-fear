/**
 * Home Screen
 *
 * Simplified landing page with:
 * - Big greeting: "Hi [username]"
 * - Main question: "What can I help you work through today?"
 * - Low-profile quick actions: Continue with [nickname], New Session, Inner Work
 * - Pending invitation CTA: "Accept [name]'s invitation" (if invited)
 */

import { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowRight, Plus, Layers, UserPlus } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/src/hooks/useAuth';
import { useBiometricAuth, usePendingInvitation } from '@/src/hooks';
import { useInvitationDetails } from '@/src/hooks/useInvitation';
import { useSessions, useAcceptInvitation } from '../../../src/hooks/useSessions';
import { BiometricPrompt, Logo } from '../../../src/components';
import { createStyles } from '@/src/theme/styled';
import { colors } from '@/src/theme';

// ============================================================================
// Component
// ============================================================================

export default function HomeScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();
  const { data, isLoading: isSessionsLoading } = useSessions();
  const { isAvailable, isEnrolled, hasPrompted, isLoading: biometricLoading } = useBiometricAuth();

  // Check for pending invitation from deep link
  const { pendingInvitation, isLoading: isPendingLoading, clearInvitation } = usePendingInvitation();
  const { invitation, isLoading: isInvitationLoading } = useInvitationDetails(pendingInvitation);

  // Accept invitation mutation
  const acceptInvitation = useAcceptInvitation({
    onSuccess: async (data) => {
      await clearInvitation();
      router.push(`/session/${data.session.id}`);
    },
    onError: async () => {
      // Clear the pending invitation on error (e.g., expired, already accepted)
      await clearInvitation();
    },
  });

  // Wait for auth, sessions, and pending invitation check to load
  const isLoading = isAuthLoading || isSessionsLoading || isPendingLoading;

  // Biometric prompt state
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);

  // Show biometric prompt when conditions are met
  useEffect(() => {
    if (!biometricLoading && isAvailable && isEnrolled && !hasPrompted) {
      const timer = setTimeout(() => {
        setShowBiometricPrompt(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [biometricLoading, isAvailable, isEnrolled, hasPrompted]);

  // Find the most recent session with a partner nickname
  const mostRecentSession = useMemo(() => {
    const sessions = data?.items || [];
    if (sessions.length === 0) return null;

    // Sort by most recently updated
    const sorted = [...sessions].sort((a, b) => {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    return sorted[0];
  }, [data?.items]);

  // Get the partner's nickname or name for the continue button
  const partnerDisplayName = mostRecentSession?.partner?.nickname || mostRecentSession?.partner?.name;

  // Get inviter's name for pending invitation
  const inviterName = invitation?.invitedBy?.name || 'Someone';
  const hasPendingInvitation = pendingInvitation && invitation && invitation.status === 'PENDING';

  const handleNewSession = () => {
    router.push('/session/new');
  };

  const handleContinueSession = () => {
    if (mostRecentSession) {
      router.push(`/session/${mostRecentSession.id}`);
    }
  };

  const handleInnerThoughts = () => {
    // Navigate to Inner Thoughts list
    router.push('/inner-thoughts');
  };

  const handleAcceptInvitation = () => {
    if (pendingInvitation) {
      acceptInvitation.mutate({ invitationId: pendingInvitation });
    }
  };

  // Get the user's display name
  const userName = user?.firstName || user?.name?.split(' ')[0] || 'there';

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.content}>
        {/* Main greeting section - centered */}
        <View style={styles.greetingSection}>
          <Logo size={120} />
          <Text style={styles.greeting}>Hi {userName}</Text>
          <Text style={styles.question}>
            What can I help you work through today?
          </Text>
        </View>

        {/* Low-profile action buttons at bottom */}
        <View style={styles.actionsSection}>
          {/* Accept pending invitation - shown first if there's a pending invitation */}
          {hasPendingInvitation && (
            <TouchableOpacity
              style={[styles.actionButton, styles.invitationButton]}
              onPress={handleAcceptInvitation}
              accessibilityRole="button"
              accessibilityLabel={`Accept ${inviterName}'s invitation`}
              disabled={acceptInvitation.isPending}
            >
              {acceptInvitation.isPending ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <UserPlus color={colors.accent} size={18} />
              )}
              <Text style={[styles.actionText, styles.invitationText]}>
                Accept {inviterName}&apos;s invitation
              </Text>
            </TouchableOpacity>
          )}

          {/* Continue with partner - only show if there's a recent session and no pending invitation */}
          {!hasPendingInvitation && mostRecentSession && partnerDisplayName && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleContinueSession}
              accessibilityRole="button"
              accessibilityLabel={`Continue with ${partnerDisplayName}`}
            >
              <ArrowRight color="#888" size={18} />
              <Text style={styles.actionText}>
                Continue with {partnerDisplayName}
              </Text>
            </TouchableOpacity>
          )}

          {/* New Session */}
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleNewSession}
            accessibilityRole="button"
            accessibilityLabel="Start new session"
          >
            <Plus color="#888" size={18} />
            <Text style={styles.actionText}>New Session</Text>
          </TouchableOpacity>

          {/* Inner Thoughts */}
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleInnerThoughts}
            accessibilityRole="button"
            accessibilityLabel="Inner Thoughts"
          >
            <Layers color="#888" size={18} />
            <Text style={styles.actionText}>Inner Thoughts</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Biometric opt-in prompt */}
      <BiometricPrompt
        visible={showBiometricPrompt}
        onDismiss={() => setShowBiometricPrompt(false)}
        testID="biometric-prompt"
      />
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
    centerContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    loadingText: {
      marginTop: 12,
      fontSize: 16,
      color: t.colors.textSecondary,
    },
    content: {
      flex: 1,
      paddingHorizontal: t.spacing.xl,
    },
    greetingSection: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingBottom: 60, // Offset slightly above center
    },
    greeting: {
      fontSize: 36,
      fontWeight: '700',
      color: t.colors.textPrimary,
      marginTop: t.spacing.xl,
      marginBottom: t.spacing.lg,
      textAlign: 'center',
    },
    question: {
      fontSize: 20,
      color: t.colors.textSecondary,
      textAlign: 'center',
      lineHeight: 28,
      maxWidth: 280,
    },
    actionsSection: {
      paddingBottom: t.spacing['3xl'],
      gap: t.spacing.sm,
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: t.spacing.md,
      paddingHorizontal: t.spacing.lg,
      gap: t.spacing.sm,
    },
    actionText: {
      fontSize: 15,
      color: t.colors.textMuted,
    },
    invitationButton: {
      backgroundColor: `${t.colors.accent}15`,
      borderRadius: 12,
      marginBottom: t.spacing.sm,
    },
    invitationText: {
      color: t.colors.accent,
      fontWeight: '600',
    },
  }));
