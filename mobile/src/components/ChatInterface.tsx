import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ListRenderItem,
  ActivityIndicator,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import type { MessageDTO } from '@meet-without-fear/shared';
import { MessageRole } from '@meet-without-fear/shared';
import { ChatBubble, ChatBubbleMessage, MessageDeliveryStatus } from './ChatBubble';
import { TypingIndicator } from './TypingIndicator';
import { ChatInput } from './ChatInput';
import { EmotionSlider } from './EmotionSlider';
import { ChatIndicator, ChatIndicatorType } from './ChatIndicator';
import { createStyles } from '../theme/styled';
import { useSpeech, useAutoSpeech } from '../hooks/useSpeech';

// ============================================================================
// Types
// ============================================================================

export interface ChatMessage extends MessageDTO {
  status?: MessageDeliveryStatus;
}

export { ChatIndicatorType } from './ChatIndicator';

export interface ChatIndicatorItem {
  type: 'indicator';
  indicatorType: ChatIndicatorType;
  id: string;
  timestamp?: string;
}

export type ChatListItem = ChatMessage | ChatIndicatorItem;

function isIndicator(item: ChatListItem): item is ChatIndicatorItem {
  return 'type' in item && item.type === 'indicator';
}

interface ChatInterfaceProps {
  messages: ChatMessage[];
  indicators?: ChatIndicatorItem[];
  onSendMessage: (content: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
  /** Hide the input area entirely (e.g., when waiting for partner) */
  hideInput?: boolean;
  emptyStateTitle?: string;
  emptyStateMessage?: string;
  showEmotionSlider?: boolean;
  emotionValue?: number;
  onEmotionChange?: (value: number) => void;
  onHighEmotion?: (value: number) => void;
  compactEmotionSlider?: boolean;
  renderAboveInput?: () => React.ReactNode;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  /** Callback when the latest AI message's typewriter animation completes */
  onTypewriterComplete?: () => void;
  /** Callback to report if typewriter is currently animating */
  onTypewriterStateChange?: (isAnimating: boolean) => void;
  /** Custom element to render when there are no messages (e.g., onboarding compact) */
  customEmptyState?: React.ReactNode;
  /** Keyboard vertical offset for iOS (accounts for header + status bar) */
  keyboardVerticalOffset?: number;
  /** Skip marking initial messages as history - animate them instead (e.g., after compact signing + mood check) */
  skipInitialHistory?: boolean;
}

// ============================================================================
// Component
// ============================================================================

const DEFAULT_EMPTY_TITLE = 'Start the Conversation';
const DEFAULT_EMPTY_MESSAGE =
  "Share what's on your mind. I'm here to listen and help you work through it.";

export function ChatInterface({
  messages,
  indicators = [],
  onSendMessage,
  isLoading = false,
  disabled = false,
  hideInput = false,
  emptyStateTitle = DEFAULT_EMPTY_TITLE,
  emptyStateMessage = DEFAULT_EMPTY_MESSAGE,
  showEmotionSlider = false,
  emotionValue = 5,
  onEmotionChange,
  onHighEmotion,
  compactEmotionSlider = false,
  renderAboveInput,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false,
  onTypewriterComplete,
  onTypewriterStateChange,
  customEmptyState,
  keyboardVerticalOffset = 100,
  skipInitialHistory = false,
}: ChatInterfaceProps) {
  const styles = useStyles();
  const flatListRef = useRef<FlatList<ChatListItem>>(null);

  // Track the ID of the message currently being animated via typewriter
  const [animatingMessageId, setAnimatingMessageId] = useState<string | null>(null);

  // Speech functionality
  const { isSpeaking, currentId, toggle: toggleSpeech } = useSpeech();
  const { isAutoSpeechEnabled } = useAutoSpeech();
  // Track messages that have already been auto-spoken (to avoid re-speaking)
  const spokenMessageIdsRef = useRef<Set<string>>(new Set());

  // Track messages that have completed typewriter animation (separate from initial load)
  const animatedMessageIdsRef = useRef<Set<string>>(new Set());

  // STABLE SORT: Ensure order never flip-flops if timestamps are identical
  const listItems = useMemo((): ChatListItem[] => {
    const items: ChatListItem[] = [...messages, ...indicators];
    return items.sort((a, b) => {
      const aTime = 'timestamp' in a && a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const bTime = 'timestamp' in b && b.timestamp ? new Date(b.timestamp).getTime() : 0;
      // Primary sort: Time (newest first)
      if (bTime !== aTime) return bTime - aTime;
      // Secondary sort: ID (stable tie-breaker)
      return b.id.localeCompare(a.id);
    });
  }, [messages, indicators]);

  const scrollMetricsRef = useRef({
    offset: 0,
    contentHeight: 0,
  });

  // Track when we're actively loading history to prevent scroll interference
  const isLoadingHistoryRef = useRef(false);

  // Snapshot of scroll state when history load started - used to restore position
  const historyLoadSnapshotRef = useRef<{
    contentHeight: number;
    scrollOffset: number;
  } | null>(null);

  // SCROLL LOGIC: Track newest message TIMESTAMP to detect new messages vs history
  const newestMessageTimestampRef = useRef<number>(0);

  useEffect(() => {
    // Skip scroll-to-bottom logic entirely while loading/restoring history
    if (isLoadingHistoryRef.current) {
      return;
    }

    const newestItem = listItems[0];
    if (!newestItem) return;

    const currentTimestamp = 'timestamp' in newestItem && newestItem.timestamp
      ? new Date(newestItem.timestamp).getTime()
      : 0;

    const previousTimestamp = newestMessageTimestampRef.current;

    // Update ref immediately
    newestMessageTimestampRef.current = currentTimestamp;

    // If this is the very first load (previous is 0), no special scroll needed
    // Let the inverted FlatList naturally show content at the bottom
    if (previousTimestamp === 0) {
      return;
    }

    // If the new message is NEWER than what we saw before, it's a new chat message
    // SCROLL TO BOTTOM
    if (currentTimestamp > previousTimestamp) {
      setTimeout(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, 100);
    }

    // If currentTimestamp === previousTimestamp, we just loaded history
    // DO NOT SCROLL - the newest message hasn't changed
  }, [listItems]);

  // Track message IDs that should skip typewriter (existed on initial load or loaded as history)
  const knownMessageIdsRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef(true);

  // Track previous value of customEmptyState to detect compact signing
  const prevCustomEmptyStateRef = useRef(customEmptyState);

  // Synchronously capture initial message IDs on first render
  // This ensures first render already knows these are history messages
  // Skip this if skipInitialHistory is true AND there's only one message
  // (e.g., after compact signing + mood check with just the first AI message)
  // If there are multiple messages, it's a returning session - treat as history
  if (isInitialLoadRef.current && messages.length > 0) {
    const shouldSkip = skipInitialHistory && messages.length === 1;
    if (!shouldSkip) {
      messages.forEach(m => knownMessageIdsRef.current.add(m.id));
    }
    isInitialLoadRef.current = false;
  }

  // Detect when custom empty state is removed (e.g., compact was signed)
  // Mark initial load as complete so new messages after this get typewriter effect
  useEffect(() => {
    if (prevCustomEmptyStateRef.current !== undefined && customEmptyState === undefined) {
      isInitialLoadRef.current = false;
    }
    prevCustomEmptyStateRef.current = customEmptyState;
  }, [customEmptyState]);

  // Also add any messages loaded as history (from pagination)
  // This happens when isLoadingMore transitions from true to false with new messages
  useEffect(() => {
    if (isLoadingHistoryRef.current) {
      // Mark all current messages as known (they're being loaded from history)
      messages.forEach(m => knownMessageIdsRef.current.add(m.id));
    }
  }, [messages]);

  // Auto-speech: speak new AI messages when enabled
  // Uses the same "new message" logic as typewriter (checks knownMessageIdsRef)
  useEffect(() => {
    if (!isAutoSpeechEnabled || messages.length === 0) return;

    // Find the newest AI message that is truly NEW (not from history)
    // Same criteria as typewriter: not in knownMessageIdsRef, not optimistic, not user message
    const newAIMessage = messages.find((m) => {
      if (m.role === MessageRole.USER) return false;
      if (m.id.startsWith('optimistic-')) return false;
      if (knownMessageIdsRef.current.has(m.id)) return false;
      if (spokenMessageIdsRef.current.has(m.id)) return false;
      return true;
    });

    if (!newAIMessage) return;

    // Mark as spoken immediately to prevent duplicate triggers
    spokenMessageIdsRef.current.add(newAIMessage.id);

    // Small delay to allow typewriter to start
    const timer = setTimeout(() => {
      toggleSpeech(newAIMessage.content, newAIMessage.id);
    }, 500);
    return () => clearTimeout(timer);
  }, [messages, isAutoSpeechEnabled, toggleSpeech]);

  // Handle speaker button press
  const handleSpeakerPress = useCallback(
    (text: string, id: string) => {
      toggleSpeech(text, id);
    },
    [toggleSpeech]
  );

  // Find the newest AI message that should animate (for typewriter tracking)
  const newestAnimatableAIMessageId = useMemo(() => {
    // listItems is sorted newest first (descending by timestamp)
    for (const item of listItems) {
      if (isIndicator(item)) continue;
      // Skip user messages and optimistic messages
      if (item.role === MessageRole.USER) continue;
      if (item.id.startsWith('optimistic-')) continue;
      // Skip known messages (history from initial load or pagination)
      if (knownMessageIdsRef.current.has(item.id)) continue;
      // Skip messages that have already completed animation
      if (animatedMessageIdsRef.current.has(item.id)) continue;
      // Skip the currently animating message (it's already being handled)
      if (item.id === animatingMessageId) continue;
      // This is the newest AI message that needs animation
      return item.id;
    }
    return null;
  }, [listItems, animatingMessageId]);

  // Notify parent when typewriter state changes
  useEffect(() => {
    const isAnimating = animatingMessageId !== null;
    onTypewriterStateChange?.(isAnimating);
  }, [animatingMessageId, onTypewriterStateChange]);

  const renderItem: ListRenderItem<ChatListItem> = useCallback(({ item }) => {
    if (isIndicator(item)) {
      return <ChatIndicator type={item.indicatorType} timestamp={item.timestamp} />;
    }

    // Skip typewriter for:
    // 1. Messages from initial load or pagination (in knownMessageIdsRef)
    // 2. Messages that have already animated (in animatedMessageIdsRef)
    // 3. The currently animating message (use stable state, don't restart)
    // 4. Optimistic messages (they may re-render with real IDs)
    // 5. User messages (only AI messages get typewriter)
    const isFromHistory = knownMessageIdsRef.current.has(item.id);
    const hasAlreadyAnimated = animatedMessageIdsRef.current.has(item.id);
    const isCurrentlyAnimating = item.id === animatingMessageId;
    const isOptimisticMessage = item.id.startsWith('optimistic-');
    const isAIMessage = item.role !== MessageRole.USER;

    // Animate if: AI message, not from history, not already animated, not optimistic
    // For currently animating message, keep animating (don't skip)
    const shouldAnimateTypewriter = isAIMessage &&
      !isFromHistory &&
      !hasAlreadyAnimated &&
      !isOptimisticMessage;

    // Track typewriter animation for the newest AI message
    const isNewestAnimatable = item.id === newestAnimatableAIMessageId;

    const bubbleMessage: ChatBubbleMessage = {
      id: item.id,
      role: item.role,
      content: item.content,
      timestamp: item.timestamp,
      status: item.status,
      skipTypewriter: !shouldAnimateTypewriter,
    };

    return (
      <ChatBubble
        message={bubbleMessage}
        onTypewriterStart={isNewestAnimatable ? () => setAnimatingMessageId(item.id) : undefined}
        onTypewriterComplete={(isNewestAnimatable || isCurrentlyAnimating) ? () => {
          // Mark this message as animated so it won't re-animate on future renders
          animatedMessageIdsRef.current.add(item.id);
          setAnimatingMessageId(null);
          onTypewriterComplete?.();
        } : undefined}
        isSpeaking={isSpeaking && currentId === item.id}
        onSpeakerPress={isAIMessage ? () => handleSpeakerPress(item.content, item.id) : undefined}
      />
    );
  }, [newestAnimatableAIMessageId, animatingMessageId, onTypewriterComplete, isSpeaking, currentId, handleSpeakerPress]);

  const keyExtractor = useCallback((item: ChatListItem) => item.id, []);

  // In inverted list: Header is visually at BOTTOM (for typing indicator)
  const renderHeader = useCallback(() => {
    if (!isLoading) return null;
    return <TypingIndicator />;
  }, [isLoading]);

  // Memoize the empty state element (not a callback!) to prevent remounts
  // NOTE: styles are excluded from deps because useStyles() creates new refs each render
  // but the actual style values are stable (theme-based)
  const emptyStateElement = useMemo(() => {
    if (isLoading) return null;
    // Use custom empty state if provided (e.g., onboarding compact)
    // Custom empty state starts at the top (flex-start) instead of centered
    if (customEmptyState) {
      return (
        <View style={styles.customEmptyState} testID="chat-custom-empty-state">
          {customEmptyState}
        </View>
      );
    }
    return (
      <View style={styles.emptyState} testID="chat-empty-state">
        <Text style={styles.emptyStateTitle}>{emptyStateTitle}</Text>
        {emptyStateMessage ? (
          <Text style={styles.emptyStateMessage}>{emptyStateMessage}</Text>
        ) : null}
      </View>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, emptyStateTitle, emptyStateMessage, customEmptyState]);

  // In inverted list: Footer is visually at TOP (for loading older messages spinner)
  const renderFooter = useCallback(() => {
    if (!isLoadingMore) return null;
    return (
      <View style={styles.loadingMore}>
        <ActivityIndicator size="small" color={styles.loadingSpinner.color} />
      </View>
    );
  }, [isLoadingMore, styles.loadingMore, styles.loadingSpinner.color]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize } = event.nativeEvent;
    scrollMetricsRef.current = {
      offset: contentOffset.y,
      contentHeight: contentSize.height,
    };
  }, []);

  const handleContentSizeChange = useCallback((_width: number, height: number) => {
    const snapshot = historyLoadSnapshotRef.current;

    // Always keep scroll metrics updated
    scrollMetricsRef.current.contentHeight = height;

    // If we're not in history loading mode, nothing to restore
    if (!isLoadingHistoryRef.current || !snapshot) {
      return;
    }

    // Check if content has grown (history was prepended)
    if (snapshot.contentHeight > 0 && height > snapshot.contentHeight) {
      // Calculate how much content was added above the current view
      const delta = height - snapshot.contentHeight;

      // Restore scroll position: add the delta to maintain viewport anchor
      flatListRef.current?.scrollToOffset({
        offset: snapshot.scrollOffset + delta,
        animated: false,
      });

      // Clear the snapshot and loading flag - restoration complete
      historyLoadSnapshotRef.current = null;
      isLoadingHistoryRef.current = false;
    }
  }, []);

  const handleEndReached = useCallback(() => {
    if (hasMore && !isLoadingMore && onLoadMore) {
      // Set flag BEFORE calling onLoadMore to prevent any scroll effects
      isLoadingHistoryRef.current = true;

      // Capture current scroll state to restore after content loads
      historyLoadSnapshotRef.current = {
        contentHeight: scrollMetricsRef.current.contentHeight,
        scrollOffset: scrollMetricsRef.current.offset,
      };

      onLoadMore();
    }
  }, [hasMore, isLoadingMore, onLoadMore]);

  // Cleanup: If loading finishes but no content was added, reset state
  useEffect(() => {
    if (!isLoadingMore && isLoadingHistoryRef.current) {
      // Give handleContentSizeChange a chance to fire first
      const timeoutId = setTimeout(() => {
        if (isLoadingHistoryRef.current) {
          isLoadingHistoryRef.current = false;
          historyLoadSnapshotRef.current = null;
        }
      }, 500);

      return () => clearTimeout(timeoutId);
    }
  }, [isLoadingMore]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      <FlatList
        ref={flatListRef}
        inverted
        data={listItems}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        style={styles.flatList}
        // Stabilizer: maintains position when spinners appear/disappear
        maintainVisibleContentPosition={{
          minIndexForVisible: 0,
        }}
        contentContainerStyle={[
          styles.messageList,
          listItems.length === 0 && (customEmptyState ? styles.customMessageListEmpty : styles.messageListEmpty),
        ]}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={emptyStateElement}
        showsVerticalScrollIndicator={false}
        testID="chat-message-list"
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.2}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onContentSizeChange={handleContentSizeChange}
      />
      {showEmotionSlider && onEmotionChange && (
        <EmotionSlider
          value={emotionValue}
          onChange={onEmotionChange}
          onHighEmotion={onHighEmotion}
          compact={compactEmotionSlider}
          testID="chat-emotion-slider"
        />
      )}
      {renderAboveInput?.()}
      {!hideInput && (
        <ChatInput onSend={onSendMessage} disabled={disabled || isLoading} />
      )}
    </KeyboardAvoidingView>
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
    flatList: {
      flex: 1,
    },
    messageList: {
      paddingVertical: t.spacing.lg,
      flexGrow: 1,
      gap: t.spacing.xs,
    },
    messageListEmpty: {
      flexGrow: 1,
      justifyContent: 'center',
    },
    customMessageListEmpty: {
      flexGrow: 1,
      // In inverted list, flex-end aligns to visual TOP
      justifyContent: 'flex-end',
    },
    loadingMore: {
      // In inverted list, this appears at visual TOP
      paddingVertical: t.spacing.xl,
      alignItems: 'center',
    },
    loadingSpinner: {
      color: t.colors.textSecondary,
    },
    emptyState: {
      flex: 1,
      // Counter-flip the inverted list for empty state text
      transform: [{ scaleY: -1 }],
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: t.spacing['3xl'],
      paddingVertical: t.spacing['3xl'],
    },
    customEmptyState: {
      flex: 1,
      // Counter-flip the inverted list for empty state content
      transform: [{ scaleY: -1 }],
      // Start content at the top (in flipped view this is flex-start)
      justifyContent: 'flex-start',
    },
    emptyStateTitle: {
      fontSize: 28,
      fontWeight: '600',
      color: t.colors.textPrimary,
      textAlign: 'center',
      lineHeight: 36,
    },
    emptyStateMessage: {
      fontSize: t.typography.fontSize.lg,
      lineHeight: 24,
      color: t.colors.textSecondary,
      textAlign: 'center',
      marginTop: t.spacing.md,
    },
  }));
