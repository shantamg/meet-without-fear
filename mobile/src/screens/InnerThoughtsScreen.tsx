/**
 * InnerThoughtsScreen Component
 *
 * A chat-centric interface for Inner Thoughts (solo self-reflection) sessions.
 * Can be linked to a partner session for context-aware private reflection.
 * Reuses the ChatInterface component for consistency with partner sessions.
 */

import { useCallback, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Layers } from 'lucide-react-native';
import { MessageRole, MemorySuggestion } from '@meet-without-fear/shared';

import { ChatInterface, ChatMessage } from '../components/ChatInterface';
import { MemorySuggestionCard } from '../components/MemorySuggestionCard';
import { useInnerThoughtsSession, useSendInnerThoughtsMessage } from '../hooks';
import { createStyles } from '../theme/styled';
import { colors } from '../theme';

// ============================================================================
// Types
// ============================================================================

interface InnerThoughtsScreenProps {
  sessionId: string;
  /** If linked to a partner session, show context about it */
  linkedPartnerName?: string;
  onNavigateBack?: () => void;
  /** Navigate back to the linked partner session */
  onNavigateToPartnerSession?: () => void;
  /** Whether a new session is being created (shows typing indicator) */
  isCreating?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function InnerThoughtsScreen({
  sessionId,
  linkedPartnerName,
  onNavigateBack,
  onNavigateToPartnerSession,
  isCreating = false,
}: InnerThoughtsScreenProps) {
  const styles = useStyles();

  // Memory suggestion state
  const [memorySuggestion, setMemorySuggestion] = useState<MemorySuggestion | null>(null);

  // Only fetch session if we have a valid sessionId (not creating)
  const { data, isLoading, error } = useInnerThoughtsSession(
    isCreating ? undefined : sessionId
  );
  const sendMessage = useSendInnerThoughtsMessage(sessionId);

  const session = data?.session;

  // Convert inner thoughts messages to ChatMessage format
  const messages: ChatMessage[] = useMemo(() => {
    if (!session?.messages) return [];

    return session.messages.map((msg) => ({
      id: msg.id,
      sessionId: sessionId,
      senderId: msg.role === 'USER' ? 'user' : null,
      role: msg.role === 'USER' ? MessageRole.USER : MessageRole.AI,
      content: msg.content,
      stage: 1, // Inner thoughts doesn't use stages, but ChatMessage requires it
      timestamp: msg.timestamp,
    }));
  }, [session?.messages, sessionId]);

  const handleSendMessage = useCallback(
    async (content: string) => {
      try {
        const result = await sendMessage.mutateAsync({ content });
        // Check for memory suggestion in response
        if (result.memorySuggestion) {
          setMemorySuggestion(result.memorySuggestion);
        }
      } catch (err) {
        console.error('Failed to send inner thoughts message:', err);
      }
    },
    [sendMessage]
  );

  const handleDismissMemorySuggestion = useCallback(() => {
    setMemorySuggestion(null);
  }, []);

  const handleBack = useCallback(() => {
    onNavigateBack?.();
  }, [onNavigateBack]);

  // Loading state - but NOT when creating (we show typing indicator instead)
  if (isLoading && !isCreating) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error state - but NOT when creating
  if (!isCreating && (error || !session)) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>Failed to load session</Text>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Text style={styles.backButtonText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const title = isCreating ? 'Inner Thoughts' : (session?.title || session?.theme || 'Inner Thoughts');
  const isLinked = !!linkedPartnerName;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header - styled like the rest of the app */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBackButton}
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft color="#ececec" size={24} />
        </TouchableOpacity>

        <View style={styles.headerContent}>
          <View style={styles.headerTitleRow}>
            <Layers color={colors.accent} size={16} />
            <Text style={styles.headerTitle} numberOfLines={1}>
              {title}
            </Text>
          </View>
          {isLinked ? (
            <TouchableOpacity onPress={onNavigateToPartnerSession}>
              <Text style={styles.linkedSubtitle} numberOfLines={1}>
                ↩ Back to session with {linkedPartnerName}
              </Text>
            </TouchableOpacity>
          ) : !isCreating && session?.theme && session?.title ? (
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {session.theme}
            </Text>
          ) : null}
        </View>

        {/* Spacer to balance the back button */}
        <View style={{ width: 48 }} />
      </View>

      {/* Chat Interface */}
      <ChatInterface
        messages={messages}
        onSendMessage={handleSendMessage}
        isLoading={isCreating || sendMessage.isPending}
        disabled={isCreating || sendMessage.isPending}
        emptyStateTitle="Inner Thoughts"
        emptyStateMessage="A private space for reflection. Share what's on your mind."
      />

      {/* Memory Suggestion Card - shown when AI detects a memory intent */}
      {memorySuggestion && (
        <View style={styles.memorySuggestionContainer}>
          <MemorySuggestionCard
            suggestion={memorySuggestion}
            onDismiss={handleDismissMemorySuggestion}
            onApproved={handleDismissMemorySuggestion}
          />
        </View>
      )}
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
    errorText: {
      fontSize: 16,
      color: t.colors.error,
      marginBottom: 16,
    },
    backButton: {
      paddingVertical: 12,
      paddingHorizontal: 24,
      backgroundColor: t.colors.bgSecondary,
      borderRadius: t.radius.lg,
    },
    backButtonText: {
      fontSize: 16,
      color: t.colors.textPrimary,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.colors.bgSecondary,
      paddingHorizontal: t.spacing.md,
      paddingVertical: t.spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: t.colors.border,
    },
    headerBackButton: {
      padding: t.spacing.sm,
    },
    headerContent: {
      flex: 1,
      alignItems: 'center',
    },
    headerTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.sm,
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: t.colors.textPrimary,
    },
    headerSubtitle: {
      fontSize: 12,
      color: t.colors.textMuted,
      marginTop: 2,
    },
    linkedSubtitle: {
      fontSize: 12,
      color: t.colors.accent,
      marginTop: 2,
    },
    memorySuggestionContainer: {
      position: 'absolute',
      bottom: 80,  // Above the chat input
      left: t.spacing.md,
      right: t.spacing.md,
      zIndex: 100,
    },
  }));
