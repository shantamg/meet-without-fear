/**
 * EmotionChangeRenderer
 *
 * Renderer for emotion change items.
 * Currently returns null as emotion changes are included in the timeline
 * for data completeness but are not displayed.
 */

import { EmotionChangeItem } from '@meet-without-fear/shared';
import type { ChatItemRendererProps } from './types';

type EmotionChangeRendererProps = ChatItemRendererProps<EmotionChangeItem>;

/**
 * Renders null - emotion changes are tracked but not displayed.
 * Included in the type system for data completeness.
 */
export function EmotionChangeRenderer(_props: EmotionChangeRendererProps) {
  return null;
}
