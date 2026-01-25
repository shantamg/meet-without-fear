/**
 * SharingStatusScreen
 *
 * Dedicated screen for viewing and managing empathy sharing activity.
 * Consolidates all sharing-related UI that was previously in drawers.
 *
 * Layout (top to bottom):
 * 1. Pending Actions (share suggestions requiring response)
 * 2. My Empathy Attempt Card
 * 3. Partner's Empathy Attempt Card
 * 4. Shared Context History
 */

import React, { useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { colors } from '@/theme';
import { useSharingStatus } from '@/hooks/useSharingStatus';
import { useRespondToShareOffer, useValidateEmpathy } from '@/hooks/useStages';
import { useSessionState } from '@/hooks/useSessions';
import { sessionKeys, stageKeys } from '@/hooks/queryKeys';
import {
  EmpathyAttemptCard,
  ShareSuggestionCard,
  SharedContextTimeline,
} from '@/components/sharing';

// ============================================================================
// Types
// ============================================================================

export interface SharingStatusScreenProps {
  sessionId: string;
}

// ============================================================================
// Component
// ============================================================================

export function SharingStatusScreen({ sessionId }: SharingStatusScreenProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const scrollViewRef = useRef<ScrollView>(null);

  // Data hooks
  const sharingStatus = useSharingStatus(sessionId);
  const sessionState = useSessionState(sessionId);
  const respondToShareOffer = useRespondToShareOffer();
  const validateEmpathy = useValidateEmpathy();

  const partnerName = sessionState.data?.session?.partner?.nickname || 'Partner';

  // Refresh handler
  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: sessionKeys.state(sessionId) });
    queryClient.invalidateQueries({ queryKey: stageKeys.empathyStatus(sessionId) });
    queryClient.invalidateQueries({ queryKey: stageKeys.shareOffer(sessionId) });
    queryClient.invalidateQueries({ queryKey: stageKeys.partnerEmpathy(sessionId) });
  }, [queryClient, sessionId]);

  // Handle share suggestion actions
  const handleShareAccept = useCallback(() => {
    if (!sharingStatus.shareOffer) return;

    respondToShareOffer.mutate({
      sessionId,
      action: 'accept',
      sharedContent: sharingStatus.shareOffer.suggestedContent,
    });
  }, [sessionId, sharingStatus.shareOffer, respondToShareOffer]);

  const handleShareDecline = useCallback(() => {
    respondToShareOffer.mutate(
      { sessionId, action: 'decline' },
      {
        onSuccess: () => {
          // Navigate back to chat after declining
          router.back();
        },
      }
    );
  }, [sessionId, respondToShareOffer, router]);

  const handleShareRefine = useCallback(
    (message: string) => {
      respondToShareOffer.mutate({
        sessionId,
        action: 'refine',
        refinedContent: message,
      });
    },
    [sessionId, respondToShareOffer]
  );

  // Handle validation actions
  const handleValidateAccurate = useCallback(() => {
    validateEmpathy.mutate({
      sessionId,
      validated: true,
    });
  }, [sessionId, validateEmpathy]);

  const handleValidatePartial = useCallback(() => {
    validateEmpathy.mutate({
      sessionId,
      validated: true,
      feedback: 'partially_accurate',
    });
  }, [sessionId, validateEmpathy]);

  const handleValidateInaccurate = useCallback(() => {
    // Navigate to chat for AI coaching flow
    router.back();
  }, [router]);

  // Loading state
  if (sharingStatus.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.brandBlue} />
          <Text style={styles.loadingText}>Loading sharing status...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Empty state
  const hasContent =
    sharingStatus.hasSuggestion ||
    sharingStatus.myAttempt ||
    sharingStatus.partnerAttempt ||
    sharingStatus.sharedContextHistory.length > 0;

  if (!hasContent) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>Nothing here yet</Text>
          <Text style={styles.emptyText}>
            Continue chatting to build understanding.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={sharingStatus.isLoading}
            onRefresh={handleRefresh}
            tintColor={colors.textSecondary}
          />
        }
      >
        {/* Section 1: Pending Actions (Share Suggestions) */}
        {sharingStatus.hasSuggestion && sharingStatus.shareOffer && (
          <View style={styles.section}>
            <ShareSuggestionCard
              suggestion={sharingStatus.shareOffer}
              partnerName={partnerName}
              onShare={handleShareAccept}
              onDecline={handleShareDecline}
              onRefine={handleShareRefine}
              isRefining={respondToShareOffer.isPending}
              testID="share-suggestion-card"
            />
          </View>
        )}

        {/* Section 2: My Empathy Attempt */}
        {sharingStatus.myAttempt && (
          <View style={styles.section}>
            <EmpathyAttemptCard
              attempt={sharingStatus.myAttempt}
              isMine={true}
              testID="my-empathy-card"
            />
          </View>
        )}

        {/* Section 3: Partner's Empathy Attempt */}
        {sharingStatus.partnerAttempt &&
          sharingStatus.partnerAttempt.status === 'REVEALED' && (
            <View style={styles.section}>
              <EmpathyAttemptCard
                attempt={sharingStatus.partnerAttempt}
                isMine={false}
                showValidation={sharingStatus.needsToValidatePartner}
                isValidated={sharingStatus.myValidation.validated}
                onValidateAccurate={handleValidateAccurate}
                onValidatePartial={handleValidatePartial}
                onValidateInaccurate={handleValidateInaccurate}
                testID="partner-empathy-card"
              />
            </View>
          )}

        {/* Section 4: Shared Context History */}
        {sharingStatus.sharedContextHistory.length > 0 && (
          <View style={styles.section}>
            <SharedContextTimeline
              items={sharingStatus.sharedContextHistory}
              testID="sharing-timeline"
            />
          </View>
        )}

        {/* Analyzing indicator */}
        {sharingStatus.isAnalyzing && (
          <View style={styles.analyzingContainer}>
            <ActivityIndicator size="small" color={colors.brandBlue} />
            <Text style={styles.analyzingText}>
              Analyzing empathy exchange...
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
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
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
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
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 16,
  },
  analyzingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  analyzingText: {
    fontSize: 14,
    color: colors.brandBlue,
  },
});

export default SharingStatusScreen;
