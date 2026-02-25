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
import type { MessageDTO, SharedContentDeliveryStatus } from '@meet-without-fear/shared';
import { MessageRole } from '@meet-without-fear/shared';
import { ChatBubble, ChatBubbleMessage, MessageDeliveryStatus } from './ChatBubble';
import { TypingIndicator } from './TypingIndicator';
import { ChatInput } from './ChatInput';
import { EmotionSlider } from './EmotionSlider';
import { ChatIndicator, ChatIndicatorType } from './ChatIndicator';
import { createStyles } from '../theme/styled';
import { useSpeech, useAutoSpeech } from '../hooks/useSpeech';

// ============================================================================
// Module-Level Animation Cache
// ============================================================================
// This cache persists animated message IDs across component remounts.
// When ChatInterface remounts (e.g., during stage transitions), the refs are reset,
// but this cache remembers which messages have already been animated.
// Key: sessionId (extracted from first message), Value: Set of animated message IDs
const animatedMessageCache = new Map<string, Set<string>>();

/**
 * Get the animated message IDs for a session from the persistent cache.
 * Creates a new Set if none exists.
 */
function getAnimatedCache(sessionId: string): Set<string> {
  let cache = animatedMessageCache.get(sessionId);
  if (!cache) {
    cache = new Set<string>();
    animatedMessageCache.set(sessionId, cache);
  }
  return cache;
}

/**
 * Mark a message as animated in the persistent cache.
 */
function markAnimatedInCache(sessionId: string, messageId: string): void {
  getAnimatedCache(sessionId).add(messageId);
}

/**
 * Check if a message has been animated (from persistent cache).
 */
function isAnimatedInCache(sessionId: string, messageId: string): boolean {
  return getAnimatedCache(sessionId).has(messageId);
}

// ============================================================================
// Types
// ============================================================================

export interface ChatMessage extends MessageDTO {
  status?: MessageDeliveryStatus;
  /** Delivery status for shared content (empathy statements, shared context) */
  sharedContentDeliveryStatus?: SharedContentDeliveryStatus;
}

export { ChatIndicatorType } from './ChatIndicator';

export interface ChatIndicatorItem {
  type: 'indicator';
  indicatorType: ChatIndicatorType;
  id: string;
  timestamp?: string;
  /** Optional metadata for dynamic indicator text */
  metadata?: {
    /** Whether this content is from the current user (vs partner) */
    isFromMe?: boolean;
    /** Partner's display name (for "Context from {name}" text) */
    partnerName?: string;
    /** Stage name for stage-chapter indicators */
    stageName?: string;
  };
}

export interface CustomEmptyStateItem {
  type: 'custom-empty-state';
  id: string;
}

export type ChatListItem = ChatMessage | ChatIndicatorItem | CustomEmptyStateItem;

function isIndicator(item: ChatListItem): item is ChatIndicatorItem {
  return 'type' in item && item.type === 'indicator';
}

function isCustomEmptyState(item: ChatListItem): item is CustomEmptyStateItem {
  return 'type' in item && item.type === 'custom-empty-state';
}

interface ChatInterfaceProps {
  /** Session ID - used for persistent animation state tracking across remounts */
  sessionId?: string;
  messages: ChatMessage[];
  indicators?: ChatIndicatorItem[];
  onSendMessage: (content: string) => void;
  /**
   * Legacy loading prop - controls typing indicator AND disables input.
   * 
   * For Cache-First Architecture, prefer using the derived "waiting for AI" state:
   * - The typing indicator is shown when the last message is from USER (derived from messages)
   * - This prop can still be used for non-message loading states (e.g., fetching initial message)
   * 
   * @deprecated Prefer letting the component derive typing indicator from last message role
   */
  isLoading?: boolean;
  /**
   * Whether the input should be disabled (e.g., during API call).
   * This is separate from isLoading to allow showing typing indicator
   * while input is still enabled.
   */
  isInputDisabled?: boolean;
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
  /** Render extra content below a message bubble (e.g., draft cards in refinement chat) */
  renderMessageExtra?: (message: ChatMessage) => React.ReactNode;
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
  /** Partner's name for personalized messages */
  partnerName?: string;
  /** ID of the last chat item the user has seen - used to show "New messages" separator */
  lastSeenChatItemId?: string | null;
  /** Callback when "Context shared" indicator is tapped - navigates to Sharing Status
   * @param timestamp - The timestamp of the shared context (for scrolling to it)
   */
  onContextSharedPress?: (timestamp?: string, isFromMe?: boolean) => void;
}

// ============================================================================
// Component
// ============================================================================

const DEFAULT_EMPTY_TITLE = 'Start the Conversation';
const DEFAULT_EMPTY_MESSAGE =
  "Share what's on your mind. I'm here to listen and help you work through it.";

export function ChatInterface({
  sessionId,
  messages,
  indicators = [],
  onSendMessage,
  isLoading = false,
  isInputDisabled,
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
  renderMessageExtra,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false,
  onTypewriterComplete,
  onTypewriterStateChange,
  customEmptyState,
  keyboardVerticalOffset = 100,
  skipInitialHistory = false,
  partnerName,
  lastSeenChatItemId,
  onContextSharedPress,
}: ChatInterfaceProps) {
  const styles = useStyles();
  const flatListRef = useRef<FlatList<ChatListItem>>(null);

  // ---------------------------------------------------------------------------
  // Cache-First Architecture: Derive "waiting for AI" from last message role
  // ---------------------------------------------------------------------------
  // If the last message is from USER, we're waiting for AI response → show typing indicator
  // If the last message is from AI/SYSTEM, response has arrived → hide typing indicator
  // This eliminates the need for a separate waitingForAIResponse boolean state
  const isWaitingForAI = useMemo(() => {
    if (messages.length === 0) return false;
    // Messages are sorted oldest-to-newest in the array (but displayed inverted)
    // So the last element in the array is the newest message
    const lastMessage = messages[messages.length - 1];
    return lastMessage?.role === MessageRole.USER;
  }, [messages]);

  // Combined loading state: explicit isLoading OR derived from last message
  // This allows both:
  // 1. Legacy behavior (passing isLoading for initial fetch, confirmation, etc.)
  // 2. Cache-First behavior (deriving from last message role)
  const showTypingIndicator = isLoading || isWaitingForAI;

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
    // 1. Combine messages and indicators
    const items: ChatListItem[] = [...messages, ...indicators];

    // 2. Sort Newest First (standard chat sort)
    items.sort((a, b) => {
      const aTime = 'timestamp' in a && a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const bTime = 'timestamp' in b && b.timestamp ? new Date(b.timestamp).getTime() : 0;
      // Primary sort: Time (newest first) - with 1 second tolerance for items created in sequence
      const timeDiff = bTime - aTime;
      if (Math.abs(timeDiff) > 1000) return timeDiff;

      // For items within 1 second: indicators should appear ABOVE messages at the same time
      // (older position = higher index in the sorted array)
      const aIsIndicator = isIndicator(a);
      const bIsIndicator = isIndicator(b);
      if (aIsIndicator && !bIsIndicator) return 1; // a (indicator) comes after b (message) in array = appears higher
      if (bIsIndicator && !aIsIndicator) return -1; // b (indicator) comes after a (message) in array = appears higher

      // Fallback: ID comparison for stability
      return b.id.localeCompare(a.id);
    });

    // 3. Inject Compact Item (Custom Empty State)
    // Condition: We have a custom state and NO messages
    // This handles both:
    // - New sessions (no indicators): Compact appears as first item
    // - Accepted invitations (with indicators): Compact appears below indicators
    if (customEmptyState && messages.length === 0) {
      // Unshift adds to Index 0.
      // In an INVERTED list, Index 0 is the Visual BOTTOM (closest to input).
      // For new sessions: Compact is the only item (appears at bottom)
      // For accepted invitations: Compact appears below the "ACCEPTED INVITATION" indicator
      items.unshift({
        type: 'custom-empty-state',
        id: 'custom-empty-state-item',
      });
    }

    return items;
  }, [messages, indicators, customEmptyState, lastSeenChatItemId]);

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
  // Track the timestamp of when initial load completed - messages created before this are "known"
  const initialLoadCompletedAtRef = useRef<string | null>(null);

  // Track previous value of customEmptyState to detect compact signing
  const prevCustomEmptyStateRef = useRef(customEmptyState);

  // Synchronously capture initial message IDs on first render
  // This ensures first render already knows these are history messages
  // Skip this if skipInitialHistory is true AND there's only one message
  // (e.g., after compact signing + mood check with just the first AI message)
  // If there are multiple messages, it's a returning session - treat as history
  //
  // NOTE: We mark messages as known IMMEDIATELY on first render, without waiting for
  // lastSeenChatItemId. This prevents hot reload issues where all messages would animate.
  // The lastSeenChatItemId is only used for the "New messages" separator, not for
  // determining which messages to animate.
  //
  // RACE CONDITION FIX: When async query loads messages after first empty render,
  // we capture the "initial load completed" timestamp. Any messages with timestamps
  // before this are considered history and won't animate. This handles cases where
  // messages arrive in batches or race with Ably events.
  if (isInitialLoadRef.current && messages.length > 0) {
    const shouldSkip = skipInitialHistory && messages.length === 1;
    if (!shouldSkip) {
      // Mark ALL current messages as known on initial load
      // New messages arriving AFTER this point will animate (not in this set)
      messages.forEach(m => {
        knownMessageIdsRef.current.add(m.id);
        // Also mark AI messages in persistent cache to survive component remounts
        // (e.g., navigating to Share screen and back)
        if (sessionId && m.role !== MessageRole.USER) {
          markAnimatedInCache(sessionId, m.id);
        }
      });
      // Capture timestamp for race condition handling
      if (initialLoadCompletedAtRef.current === null) {
        initialLoadCompletedAtRef.current = new Date().toISOString();
      }
    }
    isInitialLoadRef.current = false;
  }

  // RACE CONDITION FIX: After initial load, check incoming messages SYNCHRONOUSLY.
  // If a message's timestamp is before initialLoadCompletedAt, it's history
  // that arrived via async query (or refetch) and should be marked as known.
  // This MUST run synchronously during render (not in useEffect) to prevent
  // a race where nextAnimatableMessageId is calculated before messages are marked as known.
  if (initialLoadCompletedAtRef.current && messages.length > 0) {
    messages.forEach(m => {
      // If message timestamp is before initial load completed, it's history
      // Use <= to catch messages created at the same millisecond as initial load
      if (m.timestamp && m.timestamp <= initialLoadCompletedAtRef.current!) {
        knownMessageIdsRef.current.add(m.id);
        // Also mark AI messages in persistent cache to survive component remounts
        if (sessionId && m.role !== MessageRole.USER) {
          markAnimatedInCache(sessionId, m.id);
        }
      }
    });
  }

  // DEFENSIVE FIX: Copy animatedMessageIds to knownMessageIds synchronously.
  // This ensures that messages which have already animated are protected from
  // re-animation even during rapid refetches (e.g., after feel-heard confirmation).
  // Without this, a race condition could occur where animatedMessageIdsRef contains
  // a message ID, but due to timing of state updates during refetch, the message
  // might slip through the checks in nextAnimatableMessageId.
  if (animatedMessageIdsRef.current.size > 0) {
    animatedMessageIdsRef.current.forEach(id => {
      knownMessageIdsRef.current.add(id);
    });
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
      messages.forEach(m => {
        knownMessageIdsRef.current.add(m.id);
        // Also mark AI messages in persistent cache to survive component remounts
        if (sessionId && m.role !== MessageRole.USER) {
          markAnimatedInCache(sessionId, m.id);
        }
      });
    }
  }, [messages, sessionId]);

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

  // Find the OLDEST non-user message that should animate
  // This creates a sequential animation effect from oldest to newest (top to bottom visually)
  // when user returns to chat with multiple new messages
  const nextAnimatableMessageId = useMemo(() => {
    // If a message is currently animating, don't start another one
    // Wait for the current animation to complete before queueing the next
    if (animatingMessageId !== null) return null;

    // listItems is sorted newest first (descending by timestamp)
    // Iterate from the END (oldest) to find the oldest animatable message
    for (let i = listItems.length - 1; i >= 0; i--) {
      const item = listItems[i];
      if (isIndicator(item)) continue;
      if (isCustomEmptyState(item)) continue;
      // At this point, item must be a ChatMessage
      const message = item as ChatMessage;
      // Skip user messages and optimistic messages
      if (message.role === MessageRole.USER) continue;
      if (message.id.startsWith('optimistic-')) continue;
      // Skip known messages (history from initial load or pagination)
      if (knownMessageIdsRef.current.has(message.id)) continue;
      // Skip messages that have already completed animation
      if (animatedMessageIdsRef.current.has(message.id)) continue;
      // Skip messages animated in persistent cache (survives component remounts)
      if (sessionId && isAnimatedInCache(sessionId, message.id)) continue;
      // This is the oldest non-user message that needs animation
      return message.id;
    }
    return null;
  }, [listItems, animatingMessageId, sessionId]);

  // Notify parent when typewriter state changes
  useEffect(() => {
    const isAnimating = animatingMessageId !== null;
    onTypewriterStateChange?.(isAnimating);
  }, [animatingMessageId, onTypewriterStateChange]);

  const renderItem: ListRenderItem<ChatListItem> = useCallback(({ item }) => {
    // 1. Render Custom Empty State (Compact)
    if (isCustomEmptyState(item)) {
      return (
        <View style={styles.customEmptyStateItem} testID="chat-custom-empty-state-item">
          {customEmptyState}
        </View>
      );
    }

    // 2. Render Indicators
    if (isIndicator(item)) {
      // Context-shared and empathy-shared indicators are tappable to navigate to Partner tab
      const isSharedContent = item.indicatorType === 'context-shared' || item.indicatorType === 'empathy-shared';
      const onPress = isSharedContent && onContextSharedPress
        ? () => onContextSharedPress(item.timestamp, item.metadata?.isFromMe)
        : undefined;
      return (
        <ChatIndicator
          type={item.indicatorType}
          timestamp={item.timestamp}
          onPress={onPress}
          metadata={item.metadata}
        />
      );
    }

    // 4. Render Messages
    // At this point, item must be a ChatMessage (we've already handled indicators and custom empty state)
    const message = item as ChatMessage;
    
    // Skip typewriter for:
    // 1. Messages from initial load or pagination (in knownMessageIdsRef)
    // 2. Messages that have already animated (in animatedMessageIdsRef)
    // 3. The currently animating message (use stable state, don't restart)
    // 4. Optimistic messages (they may re-render with real IDs)
    // 5. User messages (only AI messages get typewriter)
    // Streaming messages also use typewriter - TypewriterText handles growing text
    const isFromHistory = knownMessageIdsRef.current.has(message.id);
    const hasAlreadyAnimated = animatedMessageIdsRef.current.has(message.id);
    // Also check the persistent cache (survives component remounts)
    const isAnimatedInPersistentCache = sessionId ? isAnimatedInCache(sessionId, message.id) : false;
    const isCurrentlyAnimating = message.id === animatingMessageId;
    const isOptimisticMessage = message.id.startsWith('optimistic-');
    const isAIMessage = message.role !== MessageRole.USER;

    // Animate if: AI message, not from history, not already animated, not optimistic
    // Check both the ref (current session) and persistent cache (survives remounts)
    // Streaming messages also animate - TypewriterText handles text that grows over time
    const shouldAnimateTypewriter = isAIMessage &&
      !isFromHistory &&
      !hasAlreadyAnimated &&
      !isAnimatedInPersistentCache &&
      !isOptimisticMessage;

    // Track animation for the next message in queue (oldest unanimatied)
    const isNextAnimatable = message.id === nextAnimatableMessageId;

    const bubbleMessage: ChatBubbleMessage = {
      id: message.id,
      role: message.role,
      content: message.content,
      timestamp: message.timestamp,
      status: message.status,
      skipTypewriter: !shouldAnimateTypewriter,
      sharedContentDeliveryStatus: message.sharedContentDeliveryStatus,
    };

    return (
      <>
        <ChatBubble
          message={bubbleMessage}
          onAnimationStart={isNextAnimatable ? () => setAnimatingMessageId(message.id) : undefined}
          onAnimationComplete={(isNextAnimatable || isCurrentlyAnimating) ? () => {
            // Mark this message as animated so it won't re-animate on future renders
            animatedMessageIdsRef.current.add(message.id);
            // Also mark in persistent cache (survives component remounts)
            if (sessionId) {
              markAnimatedInCache(sessionId, message.id);
            }
            setAnimatingMessageId(null);
            onTypewriterComplete?.();
          } : undefined}
          isSpeaking={isSpeaking && currentId === message.id}
          onSpeakerPress={isAIMessage ? () => handleSpeakerPress(message.content, message.id) : undefined}
          partnerName={partnerName}
        />
        {renderMessageExtra?.(message)}
      </>
    );
  }, [sessionId, nextAnimatableMessageId, animatingMessageId, onTypewriterComplete, isSpeaking, currentId, handleSpeakerPress, customEmptyState, styles, partnerName, renderMessageExtra]);

  const keyExtractor = useCallback((item: ChatListItem) => item.id, []);

  // In inverted list: Header is visually at BOTTOM (Typing Indicator)
  // We always render a container with minHeight to prevent layout shift
  // when the indicator disappears and the AI message appears
  const renderHeader = useCallback(() => {
    return (
      <View style={styles.typingIndicatorContainer}>
        {showTypingIndicator && <TypingIndicator />}
      </View>
    );
  }, [showTypingIndicator, styles]);

  // Memoize the empty state element (not a callback!) to prevent remounts
  // NOTE: styles are excluded from deps because useStyles() creates new refs each render
  // but the actual style values are stable (theme-based)
  const emptyStateElement = useMemo(() => {
    if (showTypingIndicator) return null;
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
  }, [showTypingIndicator, emptyStateTitle, emptyStateMessage, customEmptyState]);

  // In inverted list: Footer is visually at TOP (Loading Spinner)
  const renderFooter = useCallback(() => {
    if (!isLoadingMore) return null;
    return (
      <View style={styles.loadingMore}>
        <ActivityIndicator size="small" color={styles.loadingSpinner.color} />
      </View>
    );
  }, [isLoadingMore, styles]);

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
      <View style={styles.bottomContainer}>
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
          <ChatInput onSend={onSendMessage} disabled={disabled || isInputDisabled || isLoading} />
        )}
      </View>
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
    typingIndicatorContainer: {
      // Reserve space for typing indicator to prevent layout shift
      // when it disappears and AI message appears
      // Height: padding (12*2) + dot (8) + border (2) + margin (4*2) = 42
      minHeight: 42,
    },
    customEmptyStateItem: {
      // Add padding to separate it from the input or the item above it
      paddingTop: t.spacing.md,
      paddingBottom: t.spacing.md,
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
    bottomContainer: {
      // Container for emotion slider, panels above input, and input
      // This ensures KeyboardAvoidingView adjusts relative to this container's bottom
      // rather than just the input field itself
    },
  }));
