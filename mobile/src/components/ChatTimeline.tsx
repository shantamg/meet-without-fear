/**
 * ChatTimeline Component
 *
 * Unified chat timeline component using the ChatItem-based architecture.
 * Uses the Type Registry pattern for rendering and useAnimationQueue for
 * sequential animation of new messages.
 *
 * This component replaces the legacy ChatInterface for new implementations.
 *
 * Key features:
 * - Uses useTimeline hook for data fetching with infinite scroll
 * - Uses useAnimationQueue for sequential animation of new items
 * - Uses itemRegistry for type-safe component rendering
 * - Typing indicator derived from last message type (Cache-First pattern)
 */

import { useRef, useCallback, useMemo, ComponentType } from 'react';
import {
  View,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ListRenderItem,
  ActivityIndicator,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import {
  ChatItem,
  ChatItemWithAnimation,
  ChatItemType,
  AnimationState,
} from '@meet-without-fear/shared';
import { useTimeline } from '../hooks/useTimeline';
import { useAnimationQueue } from '../hooks/useAnimationQueue';
import { getRendererForItem } from './chat/itemRegistry';
import { ChatItemRendererProps } from './chat/renderers/types';
import { TypingIndicator } from './TypingIndicator';
import { ChatInput } from './ChatInput';
import { EmotionSlider } from './EmotionSlider';
import { createStyles } from '../theme/styled';
import { useSpeech, useAutoSpeech } from '../hooks/useSpeech';

// ============================================================================
// Types
// ============================================================================

export interface ChatTimelineProps {
  /** Session ID to display timeline for */
  sessionId: string;
  /** Callback when user sends a message */
  onSendMessage: (content: string) => void;
  /** Whether the input should be disabled */
  isInputDisabled?: boolean;
  /** Hide the input area entirely */
  hideInput?: boolean;
  /** Show emotion slider */
  showEmotionSlider?: boolean;
  /** Current emotion value (1-10) */
  emotionValue?: number;
  /** Callback when emotion changes */
  onEmotionChange?: (value: number) => void;
  /** Callback when emotion reaches high threshold */
  onHighEmotion?: (value: number) => void;
  /** Use compact emotion slider */
  compactEmotionSlider?: boolean;
  /** Render content above the input */
  renderAboveInput?: () => React.ReactNode;
  /** Keyboard vertical offset for iOS */
  keyboardVerticalOffset?: number;
  /** Custom empty state element (e.g., onboarding compact) */
  customEmptyState?: React.ReactNode;
  /** Callback when typewriter animation completes */
  onTypewriterComplete?: () => void;
  /** Callback when typewriter state changes */
  onTypewriterStateChange?: (isAnimating: boolean) => void;
  /** Skip animating initial load items */
  skipInitialAnimation?: boolean;
  /** Partner's name for personalized messages */
  partnerName?: string;
}

// ============================================================================
// Component
// ============================================================================

export function ChatTimeline({
  sessionId,
  onSendMessage,
  isInputDisabled = false,
  hideInput = false,
  showEmotionSlider = false,
  emotionValue = 5,
  onEmotionChange,
  onHighEmotion,
  compactEmotionSlider = false,
  renderAboveInput,
  keyboardVerticalOffset = 100,
  customEmptyState,
  onTypewriterComplete,
  onTypewriterStateChange,
  skipInitialAnimation = true,
  partnerName,
}: ChatTimelineProps) {
  const styles = useStyles();
  const flatListRef = useRef<FlatList<ChatItemWithAnimation>>(null);

  // =========================================================================
  // Data Fetching
  // =========================================================================

  const {
    items,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useTimeline({
    sessionId,
    enabled: !!sessionId,
  });

  // =========================================================================
  // Animation Queue
  // =========================================================================

  const {
    itemsWithAnimation,
    onAnimationComplete,
    isAnimating,
  } = useAnimationQueue(items, {
    treatInitialAsHistory: skipInitialAnimation,
  });

  // Notify parent when animation state changes
  const prevIsAnimatingRef = useRef(isAnimating);
  if (prevIsAnimatingRef.current !== isAnimating) {
    prevIsAnimatingRef.current = isAnimating;
    onTypewriterStateChange?.(isAnimating);
    if (!isAnimating) {
      onTypewriterComplete?.();
    }
  }

  // =========================================================================
  // Derived State
  // =========================================================================

  // Typing indicator: shown when last item is a user message
  const showTypingIndicator = useMemo(() => {
    if (items.length === 0) return false;
    const lastItem = items[0]; // Items are sorted newest-first
    return lastItem?.type === ChatItemType.USER_MESSAGE;
  }, [items]);

  // =========================================================================
  // Speech
  // =========================================================================

  const { isSpeaking, currentId, toggle: toggleSpeech } = useSpeech();
  const { isAutoSpeechEnabled } = useAutoSpeech();
  const spokenMessageIdsRef = useRef<Set<string>>(new Set());

  // Auto-speak new AI messages
  useMemo(() => {
    if (!isAutoSpeechEnabled || items.length === 0) return;

    const newAIMessage = items.find((item) => {
      if (item.type !== ChatItemType.AI_MESSAGE) return false;
      if (item.id.startsWith('optimistic-')) return false;
      if (spokenMessageIdsRef.current.has(item.id)) return false;
      return true;
    });

    if (newAIMessage && newAIMessage.type === ChatItemType.AI_MESSAGE) {
      spokenMessageIdsRef.current.add(newAIMessage.id);
      setTimeout(() => {
        toggleSpeech(newAIMessage.content, newAIMessage.id);
      }, 500);
    }
  }, [items, isAutoSpeechEnabled, toggleSpeech]);

  // =========================================================================
  // Scroll Management
  // =========================================================================

  const scrollMetricsRef = useRef({
    offset: 0,
    contentHeight: 0,
  });

  const isLoadingHistoryRef = useRef(false);
  const historyLoadSnapshotRef = useRef<{
    contentHeight: number;
    scrollOffset: number;
  } | null>(null);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize } = event.nativeEvent;
    scrollMetricsRef.current = {
      offset: contentOffset.y,
      contentHeight: contentSize.height,
    };
  }, []);

  const handleContentSizeChange = useCallback((_width: number, height: number) => {
    const snapshot = historyLoadSnapshotRef.current;
    scrollMetricsRef.current.contentHeight = height;

    if (!isLoadingHistoryRef.current || !snapshot) return;

    if (snapshot.contentHeight > 0 && height > snapshot.contentHeight) {
      const delta = height - snapshot.contentHeight;
      flatListRef.current?.scrollToOffset({
        offset: snapshot.scrollOffset + delta,
        animated: false,
      });
      historyLoadSnapshotRef.current = null;
      isLoadingHistoryRef.current = false;
    }
  }, []);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      isLoadingHistoryRef.current = true;
      historyLoadSnapshotRef.current = {
        contentHeight: scrollMetricsRef.current.contentHeight,
        scrollOffset: scrollMetricsRef.current.offset,
      };
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // =========================================================================
  // Render Functions
  // =========================================================================

  const renderItem: ListRenderItem<ChatItemWithAnimation> = useCallback(({ item }) => {
    const Renderer = getRendererForItem(item) as ComponentType<ChatItemRendererProps<ChatItem> & {
      isSpeaking?: boolean;
      onSpeakerPress?: () => void;
      partnerName?: string;
    }>;

    // Build renderer props
    const rendererProps: ChatItemRendererProps<ChatItem> & {
      isSpeaking?: boolean;
      onSpeakerPress?: () => void;
      partnerName?: string;
    } = {
      item,
      animationState: item.animationState,
      onAnimationComplete: item.animationState === AnimationState.ANIMATING
        ? onAnimationComplete
        : undefined,
    };

    // Add speech props for AI messages
    if (item.type === ChatItemType.AI_MESSAGE) {
      rendererProps.isSpeaking = isSpeaking && currentId === item.id;
      rendererProps.onSpeakerPress = () => toggleSpeech(item.content, item.id);
    }

    // Add partner name for shared context
    if (item.type === ChatItemType.SHARED_CONTEXT && partnerName) {
      rendererProps.partnerName = partnerName;
    }

    return <Renderer {...rendererProps} />;
  }, [onAnimationComplete, isSpeaking, currentId, toggleSpeech, partnerName]);

  const keyExtractor = useCallback((item: ChatItemWithAnimation) => item.id, []);

  const renderHeader = useCallback(() => {
    return (
      <View style={styles.typingIndicatorContainer}>
        {showTypingIndicator && <TypingIndicator />}
      </View>
    );
  }, [showTypingIndicator, styles]);

  const renderFooter = useCallback(() => {
    if (!isFetchingNextPage) return null;
    return (
      <View style={styles.loadingMore}>
        <ActivityIndicator size="small" color={styles.loadingSpinner.color} />
      </View>
    );
  }, [isFetchingNextPage, styles]);

  const renderEmpty = useMemo(() => {
    if (isLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={styles.loadingSpinner.color} />
        </View>
      );
    }

    if (customEmptyState) {
      return (
        <View style={styles.customEmptyState} testID="chat-custom-empty-state">
          {customEmptyState}
        </View>
      );
    }

    return null;
  }, [isLoading, customEmptyState, styles]);

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      <FlatList
        ref={flatListRef}
        inverted
        data={itemsWithAnimation}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        style={styles.flatList}
        maintainVisibleContentPosition={{
          minIndexForVisible: 0,
        }}
        contentContainerStyle={[
          styles.messageList,
          itemsWithAnimation.length === 0 && styles.messageListEmpty,
        ]}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
        testID="chat-timeline"
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
          <ChatInput
            onSend={onSendMessage}
            disabled={isInputDisabled}
          />
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
    loadingMore: {
      paddingVertical: t.spacing.xl,
      alignItems: 'center',
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      // Counter-flip for inverted list
      transform: [{ scaleY: -1 }],
    },
    typingIndicatorContainer: {
      minHeight: 42,
    },
    loadingSpinner: {
      color: t.colors.textSecondary,
    },
    customEmptyState: {
      flex: 1,
      // Counter-flip for inverted list
      transform: [{ scaleY: -1 }],
      justifyContent: 'flex-start',
    },
    bottomContainer: {
      // Container for emotion slider, panels above input, and input
    },
  }));
