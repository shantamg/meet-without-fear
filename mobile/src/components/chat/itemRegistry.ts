/**
 * Chat Item Type Registry
 *
 * Central registry mapping ChatItemType strings to React components.
 * This pattern provides:
 * 1. Single place to configure all renderers
 * 2. Type-safe exhaustive coverage enforcement
 * 3. Easy extensibility for new item types
 */

import { ComponentType } from 'react';
import { ChatItemType, ChatItem } from '@meet-without-fear/shared';
import { ChatItemRendererProps } from './renderers/types';
import { AIMessageRenderer } from './renderers/AIMessageRenderer';
import { UserMessageRenderer } from './renderers/UserMessageRenderer';
import { EmpathyStatementRenderer } from './renderers/EmpathyStatementRenderer';
import { SharedContextRenderer } from './renderers/SharedContextRenderer';
import { ShareSuggestionRenderer } from './renderers/ShareSuggestionRenderer';
import { SystemMessageRenderer } from './renderers/SystemMessageRenderer';
import { IndicatorRenderer } from './renderers/IndicatorRenderer';
import { EmotionChangeRenderer } from './renderers/EmotionChangeRenderer';

/**
 * Registry mapping item types to their renderer components.
 *
 * TypeScript enforces that all ChatItemType values are covered.
 * If a new item type is added, this will cause a compile error
 * until a renderer is added to the registry.
 */
export const itemRenderers: Record<
  ChatItemType,
  ComponentType<ChatItemRendererProps<any>>
> = {
  [ChatItemType.AI_MESSAGE]: AIMessageRenderer,
  [ChatItemType.USER_MESSAGE]: UserMessageRenderer,
  [ChatItemType.EMPATHY_STATEMENT]: EmpathyStatementRenderer,
  [ChatItemType.SHARED_CONTEXT]: SharedContextRenderer,
  [ChatItemType.SHARE_SUGGESTION]: ShareSuggestionRenderer,
  [ChatItemType.SYSTEM_MESSAGE]: SystemMessageRenderer,
  [ChatItemType.INDICATOR]: IndicatorRenderer,
  [ChatItemType.EMOTION_CHANGE]: EmotionChangeRenderer,
};

/**
 * Get the renderer component for a chat item.
 *
 * @param item - The chat item to get a renderer for
 * @returns The React component to render this item
 */
export function getRendererForItem(
  item: ChatItem
): ComponentType<ChatItemRendererProps<any>> {
  return itemRenderers[item.type];
}

/**
 * Check if a renderer exists for an item type.
 * Useful for runtime validation.
 *
 * @param type - The item type to check
 * @returns true if a renderer is registered for this type
 */
export function hasRenderer(type: ChatItemType): boolean {
  return type in itemRenderers;
}

/**
 * Get all registered item types.
 * Useful for debugging and validation.
 *
 * @returns Array of all registered ChatItemType values
 */
export function getRegisteredTypes(): ChatItemType[] {
  return Object.keys(itemRenderers) as ChatItemType[];
}
