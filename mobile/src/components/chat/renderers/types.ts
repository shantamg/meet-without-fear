/**
 * Shared types for chat item renderers.
 *
 * Each renderer receives the same base props structure for consistency.
 */

import type { AnimationState, ChatItem } from '@meet-without-fear/shared';

/**
 * Base props that all chat item renderers receive.
 */
export interface ChatItemRendererProps<T extends ChatItem = ChatItem> {
  /** The chat item to render */
  item: T;
  /** Current animation state */
  animationState: AnimationState;
  /** Callback when animation completes (triggers next in queue) */
  onAnimationComplete?: () => void;
}
