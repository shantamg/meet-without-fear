import { useRef, useEffect, useCallback, useMemo } from 'react';
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
import { ChatBubble, ChatBubbleMessage, MessageDeliveryStatus } from './ChatBubble';
import { TypingIndicator } from './TypingIndicator';
import { ChatInput } from './ChatInput';
import { EmotionSlider } from './EmotionSlider';
import { ChatIndicator, ChatIndicatorType } from './ChatIndicator';
import { createStyles } from '../theme/styled';

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
}: ChatInterfaceProps) {
  const styles = useStyles();
  const flatListRef = useRef<FlatList<ChatListItem>>(null);

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

  const renderItem: ListRenderItem<ChatListItem> = useCallback(({ item }) => {
    if (isIndicator(item)) {
      return <ChatIndicator type={item.indicatorType} timestamp={item.timestamp} />;
    }

    const bubbleMessage: ChatBubbleMessage = {
      id: item.id,
      role: item.role,
      content: item.content,
      timestamp: item.timestamp,
      status: item.status,
      skipTypewriter: true, // Always skip typewriter - feature removed
    };
    return <ChatBubble message={bubbleMessage} />;
  }, []);

  const keyExtractor = useCallback((item: ChatListItem) => item.id, []);

  // In inverted list: Header is visually at BOTTOM (for typing indicator)
  const renderHeader = useCallback(() => {
    if (!isLoading) return null;
    return <TypingIndicator />;
  }, [isLoading]);

  const renderEmptyState = useCallback(() => {
    if (isLoading) return null;
    return (
      <View style={styles.emptyState} testID="chat-empty-state">
        <Text style={styles.emptyStateTitle}>{emptyStateTitle}</Text>
        {emptyStateMessage ? (
          <Text style={styles.emptyStateMessage}>{emptyStateMessage}</Text>
        ) : null}
      </View>
    );
  }, [isLoading, emptyStateTitle, emptyStateMessage, styles.emptyState, styles.emptyStateTitle, styles.emptyStateMessage]);

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
      keyboardVerticalOffset={90}
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
          listItems.length === 0 && styles.messageListEmpty,
        ]}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmptyState}
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
