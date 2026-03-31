/**
 * Home Screen
 *
 * Simplified landing page with:
 * - Big greeting: "Hi [username]"
 * - Main question: "What can I help you work through today?"
 * - Low-profile quick actions: Continue with [nickname], New Session, Inner Work
 * - Pending invitation CTA: "Accept [name]'s invitation" (if invited)
 *
 * Inner Work navigates to the hub for all inner work features:
 * - Self-Reflection, Needs Assessment, Gratitude, Meditation
 */

import { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowRight, Plus, Layers, UserPlus, Menu, Settings } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/src/hooks/useAuth';
import { useBiometricAuth, usePendingInvitation, useSessionDrawer } from '@/src/hooks';
import { useInvitationDetails } from '@/src/hooks/useInvitation';
import { useSessions, useAcceptInvitation } from '../../../src/hooks/useSessions';
import { useUnreadSessionCount } from '@/src/hooks/useUnreadSessionCount';
import { BiometricPrompt, Logo, ChatInput, SessionDrawer } from '../../../src/components';
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
  const { openDrawer } = useSessionDrawer();
  const { count: unreadCount } = useUnreadSessionCount();

  // Check for pending invitation from deep link
  const { pendingInvitation, isLoading: isPendingLoading, clearInvitation } = usePendingInvitation();
  const { invitation } = useInvitationDetails(pendingInvitation);

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

  // Handle sending a message from home page chat input
  // Navigate to inner thoughts - Expo Router handles the fade transition
  const handleHomeChat = useCallback((message: string) => {
    Keyboard.dismiss();
    router.push({
      pathname: '/inner-work/self-reflection/[id]',
      params: { id: 'new', initialMessage: message },
    });
  }, [router]);

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

  const handleInnerWork = () => {
    // Navigate to Inner Work hub
    router.push('/inner-work');
  };

  const handleAcceptInvitation = () => {
    if (pendingInvitation) {
      acceptInvitation.mutate({ invitationId: pendingInvitation });
    }
  };

  const handleSettings = useCallback(() => {
    router.push('/settings');
  }, [router]);

  // Get the user's display name
  const userName = user?.firstName || user?.name?.split(' ')[0] || 'there';

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SessionDrawer>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {/* Header with hamburger and settings icons */}
          <View style={styles.headerBar}>
            <TouchableOpacity
              style={styles.headerIconButton}
              onPress={openDrawer}
              accessibilityRole="button"
              accessibilityLabel="Open session drawer"
            >
              <Menu color={colors.textPrimary} size={24} />
              {unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerIconButton}
              onPress={handleSettings}
              accessibilityRole="button"
              accessibilityLabel="Open settings"
            >
              <Settings color={colors.textPrimary} size={24} />
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView
            style={styles.keyboardAvoid}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={90}
          >
            <Pressable style={styles.content} onPress={Keyboard.dismiss}>
              {/* Main greeting section - centered */}
              <View style={styles.greetingSection}>
                <Logo size={120} />
                <Text style={styles.greeting}>Hi {userName}</Text>
                <Text style={styles.question}>
                  What can I help you work through today?
                </Text>
              </View>

              {/* Low-profile action buttons */}
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

                {/* Inner Work */}
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={handleInnerWork}
                  accessibilityRole="button"
                  accessibilityLabel="Inner Work"
                >
                  <Layers color="#888" size={18} />
                  <Text style={styles.actionText}>Inner Work</Text>
                </TouchableOpacity>
              </View>
            </Pressable>

            {/* Chat input - full width at bottom */}
            <View style={styles.chatInputSection}>
              <ChatInput
                onSend={handleHomeChat}
                placeholder="What's on your mind?"
              />
            </View>
        </KeyboardAvoidingView>

        {/* Biometric opt-in prompt */}
        <BiometricPrompt
          visible={showBiometricPrompt}
          onDismiss={() => setShowBiometricPrompt(false)}
          testID="biometric-prompt"
        />
      </SafeAreaView>
    </SessionDrawer>
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
    headerBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: t.spacing.lg,
      paddingVertical: t.spacing.sm,
    },
    headerIconButton: {
      padding: t.spacing.sm,
      position: 'relative',
    },
    badge: {
      position: 'absolute',
      top: 0,
      right: 0,
      backgroundColor: t.colors.error,
      borderRadius: 10,
      minWidth: 18,
      height: 18,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 4,
    },
    badgeText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '700',
    },
    keyboardAvoid: {
      flex: 1,
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
      alignItems: 'center',
      paddingTop: t.spacing.xl,
      paddingBottom: t.spacing.lg,
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
      flex: 1,
      justifyContent: 'center',
      gap: t.spacing.sm,
    },
    chatInputSection: {
      borderTopWidth: 1,
      borderTopColor: t.colors.border,
      backgroundColor: t.colors.bgPrimary,
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
