import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Keyboard,
  Platform,
  ListRenderItem,
  ActivityIndicator,
  NativeSyntheticEvent,
  NativeScrollEvent,
  LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MessageDTO, SharedContentDeliveryStatus } from '@meet-without-fear/shared';
import { MessageRole } from '@meet-without-fear/shared';
import { ChatBubble, ChatBubbleMessage, MessageDeliveryStatus } from './ChatBubble';
import { TypingIndicator } from './TypingIndicator';
import { ChatInput } from './ChatInput';
import { EmotionSlider } from './EmotionSlider';
import { ChatIndicator, ChatIndicatorType } from './ChatIndicator';
import { EmpathyValidationCard } from './EmpathyValidationCard';
import { createStyles } from '../theme/styled';
import { designFonts, useAppAppearance } from '../theme';
import { useSpeech, useAutoSpeech } from '../hooks/useSpeech';
import { getAnimationIdentity, isPreRegisteredAnimatedId } from '../utils/animationBridge';
import { hasLinkedKeyboardController, KeyboardAwareAvoidingView, KeyboardStickyComposer } from '../utils/keyboardController';

// ============================================================================
// Types
// ============================================================================

export interface ChatMessage extends MessageDTO {
  status?: MessageDeliveryStatus;
  /** Delivery status for shared content (empathy statements, shared context) */
  sharedContentDeliveryStatus?: SharedContentDeliveryStatus;
  /** Whether the shared artifact was sent by the current user or received from partner */
  sharedContentDirection?: 'sent' | 'received';
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
    /** Stage accent color for stage-chapter bar background */
    stageColor?: string;
  };
}

export interface CustomEmptyStateItem {
  type: 'custom-empty-state';
  id: string;
}

export interface ChatValidationCardItem {
  type: 'validation-card';
  id: string;
  timestamp: string;
  partnerName: string;
  empathyContent: string;
  status: 'pending' | 'validated' | 'feedback-given' | 'superseded';
  attemptId: string;
}

export interface ChatCustomCardItem {
  type: 'custom-card';
  id: string;
  timestamp: string;
  /** Whether this card participates in the same animation queue as AI messages. */
  animate?: boolean;
  render: (options?: {
    skipAnimation: boolean;
    onAnimationComplete?: () => void;
  }) => React.ReactNode;
}

export type ChatListItem = ChatMessage | ChatIndicatorItem | ChatValidationCardItem | ChatCustomCardItem | CustomEmptyStateItem;

function isIndicator(item: ChatListItem): item is ChatIndicatorItem {
  return 'type' in item && item.type === 'indicator';
}

function isValidationCard(item: ChatListItem): item is ChatValidationCardItem {
  return 'type' in item && item.type === 'validation-card';
}

function isCustomCard(item: ChatListItem): item is ChatCustomCardItem {
  return 'type' in item && item.type === 'custom-card';
}

function isCustomEmptyState(item: ChatListItem): item is CustomEmptyStateItem {
  return 'type' in item && item.type === 'custom-empty-state';
}

function getSameMomentSortRank(item: ChatListItem): number {
  if (isIndicator(item)) {
    switch (item.indicatorType) {
      case 'invitation-sent':
      case 'invitation-accepted':
      case 'feel-heard':
        return 0;
      case 'stage-chapter':
        return 1;
      default:
        return 1;
    }
  }

  if (isValidationCard(item)) return 3;
  if (isCustomCard(item)) return 3;
  return 2;
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
  /** Render guided action content after the input so chat remains attached to the transcript. */
  renderAboveInput?: () => React.ReactNode;
  /** Render content below the input area (e.g., persistent review affordances) */
  renderBelowInput?: () => React.ReactNode;
  /** Render content above the emotion slider / input area (e.g., inline cards) */
  renderBelowChat?: () => React.ReactNode;
  /** Render card-shaped content in the chronological chat stream */
  customCards?: ChatCustomCardItem[];
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
  /** Optional voice press handler -- passed through to ChatInput; renders mic button when provided */
  onVoicePress?: () => void;
  /** Content of a failed message to restore to the input field */
  failedMessage?: string | null;
  /** Pre-fill the input with provided text and focus it. */
  prefillText?: string | null;
  /** Callback invoked once a prefill has been applied. */
  onPrefillConsumed?: () => void;
  /** ID of the last chat item the user has seen - used to show "New messages" separator */
  lastSeenChatItemId?: string | null;
  /** Server-backed timestamp from before this screen marked the session viewed. */
  lastViewedAt?: string | null;
  /** Callback when "Context shared" indicator is tapped - navigates to Sharing Status
   * @param timestamp - The timestamp of the shared context (for scrolling to it)
   */
  onContextSharedPress?: (
    timestamp?: string,
    isFromMe?: boolean,
    indicatorType?: ChatIndicatorType,
  ) => void;
  /** Validation cards to render inline (e.g., partner's empathy attempt for validation) */
  validationCards?: ChatValidationCardItem[];
  /** Callback when user taps "Yes, mostly" on a validation card */
  onValidateAccurate?: () => void;
  /** Callback when user taps "Not quite yet" on a validation card */
  onValidateNotQuite?: () => void;
}

// ============================================================================
// Component
// ============================================================================

const DEFAULT_EMPTY_TITLE = 'Start the Conversation';
const DEFAULT_EMPTY_MESSAGE =
  "Share what's on your mind. I'm here to listen and help you work through it.";

const seenAnimatedItemIdsByScope = new Map<string, Set<string>>();
let localAnimationScopeCounter = 0;

function createLocalAnimationScope(): string {
  localAnimationScopeCounter += 1;
  return `__local_chat_animation_scope_${localAnimationScopeCounter}`;
}

function getSeenAnimatedItemIds(scope: string): Set<string> {
  let ids = seenAnimatedItemIdsByScope.get(scope);
  if (!ids) {
    ids = new Set<string>();
    seenAnimatedItemIdsByScope.set(scope, ids);
  }
  return ids;
}

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
  renderBelowInput,
  renderBelowChat,
  customCards,
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
  lastViewedAt,
  onContextSharedPress,
  validationCards,
  onValidateAccurate,
  onValidateNotQuite,
  onVoicePress,
  failedMessage,
  prefillText,
  onPrefillConsumed,
}: ChatInterfaceProps) {
  const styles = useStyles();
  const safeAreaInsets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList<ChatListItem>>(null);
  const scrollMetricsRef = useRef({
    offset: 0,
    contentHeight: 0,
    layoutHeight: 0,
  });
  const isNearBottomRef = useRef(true);
  const shouldStickToBottomRef = useRef(true);
  const scrollRetryTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scrollRetryAnimationFrameRef = useRef<number | null>(null);
  const localAnimationScopeRef = useRef<string | null>(null);
  if (localAnimationScopeRef.current === null) {
    localAnimationScopeRef.current = createLocalAnimationScope();
  }
  const animationScope = sessionId || localAnimationScopeRef.current;
  const animationScopeRef = useRef(animationScope);
  const seenAnimatedItemIdsRef = useRef(getSeenAnimatedItemIds(animationScope));
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  if (animationScopeRef.current !== animationScope) {
    animationScopeRef.current = animationScope;
    seenAnimatedItemIdsRef.current = getSeenAnimatedItemIds(animationScope);
  }

  const scrollToBottom = useCallback((animated: boolean) => {
    scrollRetryTimeoutsRef.current.forEach(clearTimeout);
    scrollRetryTimeoutsRef.current = [];
    if (scrollRetryAnimationFrameRef.current !== null) {
      cancelAnimationFrame(scrollRetryAnimationFrameRef.current);
    }

    const run = () => {
      const { contentHeight, layoutHeight } = scrollMetricsRef.current;
      const maxOffset = Math.max(0, contentHeight - layoutHeight);

      if (contentHeight > 0 && layoutHeight > 0) {
        flatListRef.current?.scrollToOffset({ offset: maxOffset, animated });
        return;
      }

      flatListRef.current?.scrollToEnd({ animated });
    };

    scrollRetryAnimationFrameRef.current = requestAnimationFrame(run);
    scrollRetryTimeoutsRef.current = [
      setTimeout(run, 40),
      setTimeout(run, 120),
      setTimeout(run, 260),
      setTimeout(run, 500),
      setTimeout(run, 800),
    ];
  }, []);

  useEffect(() => {
    return () => {
      scrollRetryTimeoutsRef.current.forEach(clearTimeout);
      if (scrollRetryAnimationFrameRef.current !== null) {
        cancelAnimationFrame(scrollRetryAnimationFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () => {
      setIsKeyboardVisible(true);
      if (isNearBottomRef.current || shouldStickToBottomRef.current) {
        scrollToBottom(false);
      }
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setIsKeyboardVisible(false);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [scrollToBottom]);

  // ---------------------------------------------------------------------------
  // Cache-First Architecture: Derive "waiting for AI" from last message role
  // ---------------------------------------------------------------------------
  // If the last message is from USER, we're waiting for AI response → show typing indicator
  // If the last message is from AI/SYSTEM, response has arrived → hide typing indicator
  // This eliminates the need for a separate waitingForAIResponse boolean state
  const newestChatFlowMessage = useMemo(() => {
    if (messages.length === 0) return null;
    // Find the newest message by timestamp among chat-flow roles (USER/AI).
    // Synthetic messages (EMPATHY_STATEMENT, SHARED_CONTEXT, etc.) may be
    // appended at the end of the array but have older timestamps — using
    // array position would incorrectly suppress the typing indicator.
    let newest: ChatMessage | null = null;
    let newestTime = 0;
    for (const m of messages) {
      if (m.role !== MessageRole.USER && m.role !== MessageRole.AI) continue;
      const t = new Date(m.timestamp).getTime();
      if (t >= newestTime) {
        newestTime = t;
        newest = m;
      }
    }
    return newest;
  }, [messages]);
  const isWaitingForAI = newestChatFlowMessage?.role === MessageRole.USER;
  const shouldDelayTypingIndicator =
    isWaitingForAI &&
    !isLoading &&
    (newestChatFlowMessage?.status === 'sending' || newestChatFlowMessage?.id.startsWith('optimistic-user-'));

  // Combined loading state: explicit isLoading OR derived from last message
  // This allows both:
  // 1. Legacy behavior (passing isLoading for initial fetch, confirmation, etc.)
  // 2. Cache-First behavior (deriving from last message role)
  const showTypingIndicator = isLoading || isWaitingForAI;
  const [showDelayedTypingIndicator, setShowDelayedTypingIndicator] = useState(false);

  useEffect(() => {
    if (!showTypingIndicator) {
      setShowDelayedTypingIndicator(false);
      return;
    }

    if (!shouldDelayTypingIndicator) {
      setShowDelayedTypingIndicator(true);
      return;
    }

    const timeoutId = setTimeout(() => {
      setShowDelayedTypingIndicator(true);
    }, 420);

    return () => clearTimeout(timeoutId);
  }, [showTypingIndicator, shouldDelayTypingIndicator]);

  useEffect(() => {
    if (showDelayedTypingIndicator && (isNearBottomRef.current || shouldStickToBottomRef.current)) {
      shouldStickToBottomRef.current = true;
      scrollToBottom(false);
    }
  }, [showDelayedTypingIndicator, scrollToBottom]);

  // Track the ID of the chat item currently being animated.
  const [animatingItemId, setAnimatingItemId] = useState<string | null>(null);

  // Speech functionality
  const { isSpeaking, currentId, toggle: toggleSpeech } = useSpeech();
  const { isAutoSpeechEnabled } = useAutoSpeech();
  // Track messages that have already been auto-spoken (to avoid re-speaking)
  const spokenMessageIdsRef = useRef<Set<string>>(new Set());

  // Track items that have completed animation during this mount.
  const animatedItemIdsRef = useRef<Set<string>>(new Set());

  const markItemAnimationSeen = useCallback((itemId: string) => {
    const animationIdentity = getAnimationIdentity(itemId);
    animatedItemIdsRef.current.add(itemId);
    animatedItemIdsRef.current.add(animationIdentity);
    seenAnimatedItemIdsRef.current.add(itemId);
    seenAnimatedItemIdsRef.current.add(animationIdentity);
  }, []);

  // STABLE SORT: Ensure order never flip-flops if timestamps are identical
  const listItems = useMemo((): ChatListItem[] => {
    // 1. Combine messages, indicators, and validation cards
    const items: ChatListItem[] = [...messages, ...indicators, ...(validationCards || []), ...(customCards || [])];

    // 2. Sort Oldest First so native sticky headers own the visual start of
    // each section. New messages are kept at the bottom via explicit scroll.
    items.sort((a, b) => {
      const aTime = 'timestamp' in a && a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const bTime = 'timestamp' in b && b.timestamp ? new Date(b.timestamp).getTime() : 0;
      // Primary sort: Time (oldest first). Chat messages must keep exact
      // chronological order; otherwise a fast AI reply can land before the
      // user message that triggered it and get suppressed by the animation
      // queue's "user already replied" guard.
      const timeDiff = aTime - bTime;

      const rankDiff = getSameMomentSortRank(a) - getSameMomentSortRank(b);
      if (Math.abs(timeDiff) <= 1000 && rankDiff !== 0) return rankDiff;
      if (timeDiff !== 0) return timeDiff;

      // For items within 1 second: indicators should appear above messages at
      // the same time.
      const aIsIndicator = isIndicator(a);
      const bIsIndicator = isIndicator(b);
      if (aIsIndicator && !bIsIndicator) return -1;
      if (bIsIndicator && !aIsIndicator) return 1;

      // Validation cards should appear BELOW messages at the same time
      const aIsValidation = isValidationCard(a);
      const bIsValidation = isValidationCard(b);
      if (aIsValidation && !bIsValidation) return 1;
      if (bIsValidation && !aIsValidation) return -1;

      // Custom cards should appear below the prompt/message that introduced them.
      const aIsCustomCard = isCustomCard(a);
      const bIsCustomCard = isCustomCard(b);
      if (aIsCustomCard && !bIsCustomCard) return 1;
      if (bIsCustomCard && !aIsCustomCard) return -1;

      // Fallback: ID comparison for stability
      return a.id.localeCompare(b.id);
    });

    // 3. Inject Compact Item (Custom Empty State)
    // Condition: We have a custom state and NO messages
    // This handles both:
    // - New sessions (no indicators): Compact appears as first item
    // - Accepted invitations (with indicators): Compact appears below indicators
    if (customEmptyState && messages.length === 0) {
      items.push({
        type: 'custom-empty-state',
        id: 'custom-empty-state-item',
      });
    }

    return items;
  }, [messages, indicators, validationCards, customCards, customEmptyState, lastSeenChatItemId, lastViewedAt]);

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

    const newestItem = listItems[listItems.length - 1];
    if (!newestItem) return;

    const currentTimestamp = 'timestamp' in newestItem && newestItem.timestamp
      ? new Date(newestItem.timestamp).getTime()
      : 0;

    const previousTimestamp = newestMessageTimestampRef.current;

    // Update ref immediately
    newestMessageTimestampRef.current = currentTimestamp;

    // If this is the very first load, jump to the bottom after layout.
    if (previousTimestamp === 0) {
      shouldStickToBottomRef.current = true;
      scrollToBottom(false);
      return;
    }

    // If the new message is NEWER than what we saw before, it's a new chat message
    // SCROLL TO BOTTOM
    if (currentTimestamp > previousTimestamp) {
      shouldStickToBottomRef.current = true;
      scrollToBottom(true);
    }

    // If currentTimestamp === previousTimestamp, we just loaded history
    // DO NOT SCROLL - the newest message hasn't changed
  }, [listItems, scrollToBottom]);

  // Snapshot boundary: captures all message IDs present on first meaningful render.
  // Messages in the snapshot render instantly. Messages not in the snapshot may animate.
  const mountSnapshotIdsRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef(true);

  // Track previous value of customEmptyState to detect compact signing
  const prevCustomEmptyStateRef = useRef(customEmptyState);

  // Capture mount snapshot: all messages present on first meaningful render
  // Skip if skipInitialHistory is true AND there's only one message
  // (e.g., after compact signing + mood check with just the first AI message)
  if (isInitialLoadRef.current && messages.length > 0) {
    const shouldSkip = skipInitialHistory && messages.length === 1;
    if (!shouldSkip) {
      messages.forEach((m) => {
        mountSnapshotIdsRef.current.add(m.id);
        seenAnimatedItemIdsRef.current.add(m.id);
      });
    }
    isInitialLoadRef.current = false;
  }

  // Add pagination messages to snapshot (they're history, not new)
  if (isLoadingHistoryRef.current && messages.length > 0) {
    messages.forEach((m) => {
      mountSnapshotIdsRef.current.add(m.id);
      seenAnimatedItemIdsRef.current.add(m.id);
    });
  }

  // Detect when custom empty state is removed (e.g., compact was signed)
  useEffect(() => {
    if (prevCustomEmptyStateRef.current !== undefined && customEmptyState === undefined) {
      isInitialLoadRef.current = false;
    }
    prevCustomEmptyStateRef.current = customEmptyState;
  }, [customEmptyState]);

  const lastViewedAtTime = useMemo(() => {
    if (!lastViewedAt) return null;
    const time = new Date(lastViewedAt).getTime();
    return Number.isFinite(time) ? time : null;
  }, [lastViewedAt]);

  const lastSeenItemIndex = useMemo(() => {
    if (!lastSeenChatItemId) return -1;
    return listItems.findIndex((item) => item.id === lastSeenChatItemId);
  }, [listItems, lastSeenChatItemId]);

  const isAtOrBeforeSeenBoundary = useCallback((item: ChatListItem, index: number) => {
    if (lastSeenItemIndex >= 0 && index <= lastSeenItemIndex) {
      return true;
    }

    if (lastViewedAtTime !== null && 'timestamp' in item && item.timestamp) {
      const itemTime = new Date(item.timestamp).getTime();
      if (Number.isFinite(itemTime) && itemTime <= lastViewedAtTime) {
        return true;
      }
    }

    return false;
  }, [lastSeenItemIndex, lastViewedAtTime]);

  const shouldAnimateItem = useCallback((item: ChatListItem, index: number) => {
    if (isIndicator(item) || isValidationCard(item) || isCustomEmptyState(item)) return false;
    const animationIdentity = getAnimationIdentity(item.id);
    if (animatedItemIdsRef.current.has(item.id) || animatedItemIdsRef.current.has(animationIdentity)) return false;
    if (seenAnimatedItemIdsRef.current.has(item.id) || seenAnimatedItemIdsRef.current.has(animationIdentity)) return false;
    if (isPreRegisteredAnimatedId(item.id) || isPreRegisteredAnimatedId(animationIdentity)) return false;

    if (isCustomCard(item)) {
      if (isAtOrBeforeSeenBoundary(item, index)) return false;
      return item.animate === true;
    }

    const message = item as ChatMessage;
    if (message.role === MessageRole.USER) return false;
    if (message.id.startsWith('optimistic-')) return false;
    const wasPresentAtMount = mountSnapshotIdsRef.current.has(message.id);
    if (wasPresentAtMount && isAtOrBeforeSeenBoundary(item, index)) return false;

    // If the user has already replied after this assistant/system message,
    // the message must be visible immediately. It is no longer a live pending
    // animation candidate, and hiding it leaves blank transcript gaps.
    for (let i = index + 1; i < listItems.length; i++) {
      const laterItem = listItems[i];
      if (isIndicator(laterItem) || isValidationCard(laterItem) || isCustomEmptyState(laterItem) || isCustomCard(laterItem)) continue;
      if ((laterItem as ChatMessage).role === MessageRole.USER) {
        return false;
      }
    }

    // If there is no server read boundary yet, fall back to the original
    // mount snapshot so loaded history does not animate on first render.
    if (lastSeenItemIndex < 0 && lastViewedAtTime === null && mountSnapshotIdsRef.current.has(message.id)) {
      return false;
    }

    return true;
  }, [isAtOrBeforeSeenBoundary, lastSeenItemIndex, lastViewedAtTime, listItems]);

  // Auto-speech: speak new AI messages when enabled
  useEffect(() => {
    if (!isAutoSpeechEnabled || messages.length === 0) return;

    // Find the newest AI message that is truly NEW (not in mount snapshot)
    const newAIMessage = messages.find((m) => {
      if (m.role === MessageRole.USER) return false;
      if (m.id.startsWith('optimistic-')) return false;
      if (spokenMessageIdsRef.current.has(m.id)) return false;
      const itemIndex = listItems.findIndex((item) => item.id === m.id);
      if (itemIndex >= 0 && !shouldAnimateItem(m, itemIndex)) return false;
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
  }, [messages, listItems, isAutoSpeechEnabled, toggleSpeech, shouldAnimateItem]);

  // Handle speaker button press
  const handleSpeakerPress = useCallback(
    (text: string, id: string) => {
      toggleSpeech(text, id);
    },
    [toggleSpeech]
  );

  // Find the OLDEST non-user message that should animate
  // Sequential animation: oldest to newest (top to bottom visually)
  const nextAnimatableMessageId = useMemo(() => {
    if (animatingItemId !== null) return null;

    // listItems is sorted oldest first. Iterate forward to animate in
    // chronological order.
    for (let i = 0; i < listItems.length; i++) {
      const item = listItems[i];
      if (!shouldAnimateItem(item, i)) continue;

      // Skip if a user message exists after this AI message chronologically
      // (user already saw and responded — no need to animate)
      let hasUserResponseAfter = false;
      for (let j = i + 1; j < listItems.length; j++) {
        const laterItem = listItems[j];
        if (isIndicator(laterItem) || isValidationCard(laterItem) || isCustomEmptyState(laterItem) || isCustomCard(laterItem)) continue;
        if ((laterItem as ChatMessage).role === MessageRole.USER) {
          hasUserResponseAfter = true;
          break;
        }
      }
      if (hasUserResponseAfter) continue;
      return getAnimationIdentity(item.id);
    }
    return null;
  }, [listItems, animatingItemId, shouldAnimateItem]);

  // Once a non-user chat item renders in full, it should never be eligible for
  // a later typewriter pass. This prevents refetches/status changes after
  // button-only actions from replaying older visible messages one by one.
  useEffect(() => {
    if (animatingItemId !== null) {
      const animatingIndex = listItems.findIndex((item) => getAnimationIdentity(item.id) === animatingItemId);
      const animatingItem = animatingIndex >= 0 ? listItems[animatingIndex] : null;

      if (animatingItem && !isIndicator(animatingItem) && !isValidationCard(animatingItem) && !isCustomEmptyState(animatingItem) && !isCustomCard(animatingItem)) {
        const message = animatingItem as ChatMessage;
        const hasUserResponseAfter = listItems.slice(animatingIndex + 1).some((laterItem) => {
          if (isIndicator(laterItem) || isValidationCard(laterItem) || isCustomEmptyState(laterItem) || isCustomCard(laterItem)) return false;
          return (laterItem as ChatMessage).role === MessageRole.USER;
        });

        if (message.status !== 'streaming' && hasUserResponseAfter) {
          markItemAnimationSeen(animatingItemId);
          setAnimatingItemId(null);
        }
      } else if (!animatingItem) {
        setAnimatingItemId(null);
      }
    }

    listItems.forEach((item, index) => {
      if (isIndicator(item) || isValidationCard(item) || isCustomEmptyState(item)) return;
      const animationIdentity = getAnimationIdentity(item.id);
      if (animationIdentity === nextAnimatableMessageId || animationIdentity === animatingItemId) return;

      if (isCustomCard(item)) {
        if (item.animate === true && !shouldAnimateItem(item, index)) {
          markItemAnimationSeen(item.id);
        }
        return;
      }

      const message = item as ChatMessage;
      if (message.role === MessageRole.USER) return;
      if (message.id.startsWith('optimistic-')) return;
      if (!shouldAnimateItem(message, index)) {
        markItemAnimationSeen(message.id);
      }
    });
  }, [listItems, nextAnimatableMessageId, animatingItemId, shouldAnimateItem, markItemAnimationSeen]);

  // Notify parent when typewriter state changes
  useEffect(() => {
    const isAnimating = animatingItemId !== null;
    onTypewriterStateChange?.(isAnimating);

    if (isAnimating && (isNearBottomRef.current || shouldStickToBottomRef.current)) {
      shouldStickToBottomRef.current = true;
      scrollToBottom(false);
    }
  }, [animatingItemId, onTypewriterStateChange, scrollToBottom]);

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
      // Shared content and share suggestion indicators are tappable to open the Activity Drawer
      const isTappableIndicator = item.indicatorType === 'context-shared'
        || item.indicatorType === 'empathy-shared';
      const onPress = isTappableIndicator && onContextSharedPress
        ? () => onContextSharedPress(item.timestamp, item.metadata?.isFromMe, item.indicatorType)
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

    // 3. Render Validation Cards
    if (isValidationCard(item)) {
      return (
        <EmpathyValidationCard
          partnerName={item.partnerName}
          empathyContent={item.empathyContent}
          status={item.status}
          onValidateAccurate={onValidateAccurate || (() => {})}
          onValidateNotQuite={onValidateNotQuite || (() => {})}
          skipRevealAnimation={item.status !== 'pending'}
          testID={`validation-card-${item.id}`}
        />
      );
    }

    // 4. Render Custom Cards
    if (isCustomCard(item)) {
      const itemIndex = listItems.findIndex((listItem) => listItem.id === item.id);
      const shouldAnimate = itemIndex >= 0 ? shouldAnimateItem(item, itemIndex) : false;
      const animationIdentity = getAnimationIdentity(item.id);
      const isNextAnimatable = animationIdentity === nextAnimatableMessageId;

      return (
        <>
          {item.render({
            skipAnimation: !shouldAnimate || !isNextAnimatable,
            onAnimationComplete: shouldAnimate && isNextAnimatable ? () => {
              markItemAnimationSeen(item.id);
              setAnimatingItemId(null);
              onTypewriterComplete?.();
            } : undefined,
          })}
        </>
      );
    }

    // 5. Render Messages
    // At this point, item must be a ChatMessage (we've already handled indicators, validation cards, custom cards, and custom empty state)
    const message = item as ChatMessage;
    const animationIdentity = getAnimationIdentity(message.id);
    
    const itemIndex = listItems.findIndex((listItem) => listItem.id === message.id);
    const isCurrentlyAnimating = animationIdentity === animatingItemId;
    const isAIMessage = message.role !== MessageRole.USER;

    const shouldAnimateTypewriter = itemIndex >= 0 ? shouldAnimateItem(message, itemIndex) : false;

    // Track animation for the next message in queue (oldest unanimatied)
    const isNextAnimatable = animationIdentity === nextAnimatableMessageId;

    const bubbleMessage: ChatBubbleMessage = {
      id: message.id,
      role: message.role,
      content: message.content,
      timestamp: message.timestamp,
      senderId: message.senderId,
      status: message.status,
      skipTypewriter: !shouldAnimateTypewriter,
      sharedContentDeliveryStatus: message.sharedContentDeliveryStatus,
      sharedContentDirection: message.sharedContentDirection,
    };

    return (
      <>
        <ChatBubble
          message={bubbleMessage}
          animationIdentity={animationIdentity}
          onAnimationStart={isNextAnimatable ? () => setAnimatingItemId(animationIdentity) : undefined}
          onAnimationProgress={() => {
            if (isNearBottomRef.current || shouldStickToBottomRef.current) {
              shouldStickToBottomRef.current = true;
              scrollToBottom(false);
            }
          }}
          onAnimationComplete={(isNextAnimatable || isCurrentlyAnimating) ? () => {
            markItemAnimationSeen(message.id);
            setAnimatingItemId(null);
            onTypewriterComplete?.();
          } : undefined}
          isSpeaking={isSpeaking && currentId === message.id}
          onSpeakerPress={isAIMessage ? () => handleSpeakerPress(message.content, message.id) : undefined}
          partnerName={partnerName}
        />
        {renderMessageExtra?.(message)}
      </>
    );
  }, [listItems, shouldAnimateItem, nextAnimatableMessageId, animatingItemId, onTypewriterComplete, isSpeaking, currentId, handleSpeakerPress, customEmptyState, styles, partnerName, renderMessageExtra, onContextSharedPress, onValidateAccurate, onValidateNotQuite, markItemAnimationSeen, scrollToBottom]);

  const keyExtractor = useCallback((item: ChatListItem) => getAnimationIdentity(item.id), []);

  // Footer is visually at the bottom (Typing Indicator)
  // We always render a container with minHeight to prevent layout shift
  // when the indicator disappears and the AI message appears
  const renderHeader = useCallback(() => {
    return (
      <View
        style={styles.typingIndicatorContainer}
        onLayout={() => {
          if (isNearBottomRef.current || shouldStickToBottomRef.current) {
            shouldStickToBottomRef.current = true;
            scrollToBottom(false);
          }
        }}
      >
        {showDelayedTypingIndicator && <TypingIndicator />}
      </View>
    );
  }, [showDelayedTypingIndicator, styles, scrollToBottom]);

  // Memoize the empty state element (not a callback!) to prevent remounts
  // NOTE: styles are excluded from deps because useStyles() creates new refs each render
  // but the actual style values are stable (theme-based)
  const emptyStateElement = useMemo(() => {
    if (showDelayedTypingIndicator) return null;
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
  }, [showDelayedTypingIndicator, emptyStateTitle, emptyStateMessage, customEmptyState]);

  // Header is visually at the top (Loading Spinner)
  const renderLoadingHeader = useCallback(() => {
    if (!isLoadingMore) return null;
    return (
      <View style={styles.loadingMore}>
        <ActivityIndicator size="small" color={styles.loadingSpinner.color} />
      </View>
    );
  }, [isLoadingMore, styles]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = Math.max(
      0,
      contentSize.height - layoutMeasurement.height - contentOffset.y,
    );
    const isNearBottom = distanceFromBottom < 80;

    scrollMetricsRef.current = {
      offset: contentOffset.y,
      contentHeight: contentSize.height,
      layoutHeight: layoutMeasurement.height,
    };
    isNearBottomRef.current = isNearBottom;
    shouldStickToBottomRef.current = isNearBottom;
  }, []);

  const handleContentSizeChange = useCallback((_width: number, height: number) => {
    const snapshot = historyLoadSnapshotRef.current;

    // Always keep scroll metrics updated
    scrollMetricsRef.current.contentHeight = height;

    // If we're not in history loading mode, keep the bottom pinned only when
    // the user was already reading at the bottom.
    if (!isLoadingHistoryRef.current || !snapshot) {
      scrollMetricsRef.current.contentHeight = height;
      if (isNearBottomRef.current || shouldStickToBottomRef.current) {
        scrollToBottom(false);
      }
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
  }, [scrollToBottom]);

  const handleListLayout = useCallback((event: LayoutChangeEvent) => {
    scrollMetricsRef.current.layoutHeight = event.nativeEvent.layout.height;
    if (isNearBottomRef.current || shouldStickToBottomRef.current) {
      scrollToBottom(false);
    }
  }, [scrollToBottom]);

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

  const stickyHeaderIndices = useMemo(() => {
    // VirtualizedList counts ListHeaderComponent as scroll child 0, so data
    // rows are offset by one when passed through stickyHeaderIndices.
    const listHeaderOffset = 1;
    return listItems.reduce<number[]>((indices, item, index) => {
      if (isIndicator(item) && item.indicatorType === 'stage-chapter') {
        indices.push(index + listHeaderOffset);
      }
      return indices;
    }, []);
  }, [listItems]);

  // ---------------------------------------------------------------------------
  // New Activity Pill: floating indicator for off-screen new items
  // ---------------------------------------------------------------------------

  const auxiliaryControls = !isKeyboardVisible ? (
    <>
      {renderAboveInput?.()}
      {renderBelowInput?.()}
    </>
  ) : null;

  const composerControls = (
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
      {!hideInput && (
        <ChatInput
          onSend={onSendMessage}
          disabled={disabled || isInputDisabled || isLoading}
          inputDisabled={disabled || isLoading}
          onVoicePress={onVoicePress}
          failedMessage={failedMessage}
          prefillText={prefillText}
          onPrefillConsumed={onPrefillConsumed}
        />
      )}
    </View>
  );

  const messageList = (
    <FlatList
      ref={flatListRef}
      data={listItems}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      style={styles.flatList}
      stickyHeaderIndices={stickyHeaderIndices}
      contentContainerStyle={[
        styles.messageList,
        listItems.length === 0 && (customEmptyState ? styles.customMessageListEmpty : styles.messageListEmpty),
      ]}
      ListHeaderComponent={renderLoadingHeader}
      ListFooterComponent={
        <>
          {renderBelowChat?.()}
          {renderHeader?.()}
        </>
      }
      ListEmptyComponent={emptyStateElement}
      showsVerticalScrollIndicator={false}
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      keyboardShouldPersistTaps="handled"
      testID="chat-message-list"
      onStartReached={handleEndReached}
      onStartReachedThreshold={0.2}
      onLayout={handleListLayout}
      onScroll={handleScroll}
      scrollEventThrottle={16}
      onContentSizeChange={handleContentSizeChange}
    />
  );

  if (Platform.OS === 'ios' && hasLinkedKeyboardController()) {
    return (
      <View style={styles.container}>
        <View style={styles.flatListContainer}>
          {messageList}
        </View>
        <KeyboardStickyComposer offset={{ opened: safeAreaInsets.bottom }}>
          {composerControls}
        </KeyboardStickyComposer>
        {auxiliaryControls}
      </View>
    );
  }

  return (
    <KeyboardAwareAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      {messageList}
      {composerControls}
      {auxiliaryControls}
    </KeyboardAwareAvoidingView>
  );
}

// ============================================================================
// Styles
// ============================================================================

const useStyles = () => {
  const { palette } = useAppAppearance();
  return createStyles((t) => ({
    container: {
      flex: 1,
      backgroundColor: palette.bg,
    },
    flatList: {
      flex: 1,
    },
    flatListContainer: {
      flex: 1,
      backgroundColor: palette.bg,
    },
    messageList: {
      paddingVertical: 18,
      flexGrow: 1,
      gap: 2,
    },
    messageListEmpty: {
      flexGrow: 1,
      justifyContent: 'center',
    },
    customMessageListEmpty: {
      flexGrow: 1,
      justifyContent: 'flex-start',
    },
    loadingMore: {
      paddingVertical: t.spacing.xl,
      alignItems: 'center',
    },
    typingIndicatorContainer: {
      // Reserve space for typing indicator to prevent layout shift
      // when it disappears and AI message appears
      // Height: padding (12*2) + dot (8) + border (2) + margin (4*2) = 42
      minHeight: 36,
    },
    customEmptyStateItem: {
      // Add padding to separate it from the input or the item above it
      paddingTop: t.spacing.md,
      paddingBottom: t.spacing.md,
    },
    loadingSpinner: {
      color: palette.textMuted,
    },
    emptyState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: t.spacing['3xl'],
      paddingVertical: t.spacing['3xl'],
    },
    customEmptyState: {
      flex: 1,
      justifyContent: 'flex-start',
    },
    emptyStateTitle: {
      fontSize: 32,
      color: palette.text,
      textAlign: 'center',
      lineHeight: 36,
      fontFamily: designFonts.serif,
    },
    emptyStateMessage: {
      fontSize: t.typography.fontSize.lg,
      lineHeight: 24,
      color: palette.textMuted,
      textAlign: 'center',
      marginTop: t.spacing.md,
      fontFamily: designFonts.sans,
    },
    bottomContainer: {
      // Container for emotion slider, panels above input, and input
      // This ensures KeyboardAvoidingView adjusts relative to this container's bottom
      // rather than just the input field itself
      paddingBottom: t.spacing.sm,
    },
  }));
};
