/**
 * useAnimationQueue
 *
 * Hook that manages animation sequencing for chat items.
 * Ensures items animate one at a time, from oldest to newest.
 *
 * Key behaviors:
 * - Only NEW items (not in previous render) enter the animation queue
 * - One item animates at a time (oldest unananimated first)
 * - History items (loaded via pagination) skip animation
 * - Already-animated items stay complete on re-render
 *
 * This fixes the bug where old AI messages would re-animate
 * when a new message arrives.
 */

import { useState, useRef, useMemo, useCallback } from 'react';
import {
  ChatItem,
  ChatItemWithAnimation,
  AnimationState,
  ChatItemType,
} from '@meet-without-fear/shared';

interface UseAnimationQueueOptions {
  /** If true, mark initial items as history (don't animate) */
  treatInitialAsHistory?: boolean;
}

interface UseAnimationQueueResult {
  /** Items with animation state attached */
  itemsWithAnimation: ChatItemWithAnimation[];
  /** Callback to mark the current animating item as complete */
  onAnimationComplete: () => void;
  /** Check if the queue is currently animating */
  isAnimating: boolean;
}

/**
 * Manages animation sequencing for chat items.
 *
 * @param items - Array of ChatItem objects (sorted newest-first)
 * @param options - Configuration options
 * @returns Items with animation state and control callbacks
 */
export function useAnimationQueue(
  items: ChatItem[],
  options: UseAnimationQueueOptions = {}
): UseAnimationQueueResult {
  const { treatInitialAsHistory = true } = options;

  // Track the ID of the currently animating item
  const [animatingId, setAnimatingId] = useState<string | null>(null);

  // Track items that have completed animation
  const animatedIdsRef = useRef<Set<string>>(new Set());

  // Track items that were present on initial load (treated as history)
  const knownIdsRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef(true);

  // Track timestamp when we completed initial load (for race condition handling)
  const initialLoadTimestampRef = useRef<string | null>(null);

  // On first render with items, capture them as "known" (history)
  if (isInitialLoadRef.current && items.length > 0 && treatInitialAsHistory) {
    items.forEach((item) => knownIdsRef.current.add(item.id));
    initialLoadTimestampRef.current = new Date().toISOString();
    isInitialLoadRef.current = false;
  }

  // Handle race condition: items with timestamps before initial load are history
  // This runs synchronously during render to avoid race with animation calculation
  if (initialLoadTimestampRef.current && items.length > 0) {
    items.forEach((item) => {
      if (item.timestamp <= initialLoadTimestampRef.current!) {
        knownIdsRef.current.add(item.id);
      }
    });
  }

  // Determine which items should animate
  const shouldAnimate = useCallback((item: ChatItem): boolean => {
    // User messages don't animate (appear instantly)
    if (item.type === ChatItemType.USER_MESSAGE) return false;

    // Indicators don't animate (appear instantly)
    if (item.type === ChatItemType.INDICATOR) return false;

    // Emotion changes don't animate (not displayed)
    if (item.type === ChatItemType.EMOTION_CHANGE) return false;

    // Known items (initial load or pagination) don't animate
    if (knownIdsRef.current.has(item.id)) return false;

    // Optimistic messages (starting with 'optimistic-') don't animate
    if (item.id.startsWith('optimistic-')) return false;

    return true;
  }, []);

  // Find the next item to animate (oldest first)
  // Items are sorted newest-first, so we iterate from the end
  const nextToAnimateId = useMemo(() => {
    // If something is already animating, wait for it to complete
    if (animatingId !== null) return null;

    // Find the oldest item that needs animation
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];

      // Skip items that shouldn't animate
      if (!shouldAnimate(item)) continue;

      // Skip items that have already animated
      if (animatedIdsRef.current.has(item.id)) continue;

      // This is the next item to animate
      return item.id;
    }

    return null;
  }, [items, animatingId, shouldAnimate]);

  // Build items with animation state
  const itemsWithAnimation = useMemo((): ChatItemWithAnimation[] => {
    return items.map((item) => {
      let animationState: AnimationState;

      if (!shouldAnimate(item)) {
        // Items that don't animate are always complete
        animationState = AnimationState.COMPLETE;
      } else if (animatedIdsRef.current.has(item.id)) {
        // Already animated
        animationState = AnimationState.COMPLETE;
      } else if (item.id === animatingId) {
        // Currently animating
        animationState = AnimationState.ANIMATING;
      } else if (item.id === nextToAnimateId) {
        // Next up - start animating
        animationState = AnimationState.ANIMATING;
      } else {
        // Waiting in queue
        animationState = AnimationState.HIDDEN;
      }

      return {
        ...item,
        animationState,
      };
    });
  }, [items, animatingId, nextToAnimateId, shouldAnimate]);

  // Start animation for the next item when it becomes next
  // This is triggered by the itemsWithAnimation calculation above
  if (nextToAnimateId !== null && animatingId === null) {
    // Use setTimeout to avoid setState during render
    setTimeout(() => {
      setAnimatingId((current) => {
        // Only set if still null (avoid race conditions)
        if (current === null) {
          // Mark as animated immediately when animation starts (not when it completes)
          // This prevents re-animation if user navigates away mid-animation
          animatedIdsRef.current.add(nextToAnimateId);
          return nextToAnimateId;
        }
        return current;
      });
    }, 0);
  }

  // Callback when animation completes
  const onAnimationComplete = useCallback(() => {
    if (animatingId !== null) {
      // Mark as animated
      animatedIdsRef.current.add(animatingId);
      // Clear current animation to allow next item
      setAnimatingId(null);
    }
  }, [animatingId]);

  return {
    itemsWithAnimation,
    onAnimationComplete,
    isAnimating: animatingId !== null,
  };
}

/**
 * Mark an item ID as already animated (for items loaded from history).
 * Call this when loading paginated history to prevent animation.
 *
 * @param items - Items that were loaded as history
 * @param knownIdsRef - Ref to the set of known item IDs
 */
export function markAsHistory(
  items: ChatItem[],
  knownIdsRef: React.MutableRefObject<Set<string>>
): void {
  items.forEach((item) => knownIdsRef.current.add(item.id));
}
