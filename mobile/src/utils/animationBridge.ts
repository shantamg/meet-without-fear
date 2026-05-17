/**
 * Animation Bridge
 *
 * Allows useStreamingMessage to pre-register message IDs that should
 * skip typewriter animation in ChatInterface. This bridges the gap
 * when streaming placeholder IDs (e.g. "streaming-*") are replaced
 * with real server UUIDs before cache reconciliation.
 */

const preRegisteredIds = new Set<string>();
const animationIdentityById = new Map<string, string>();

export function preRegisterAnimatedId(id: string): void {
  preRegisteredIds.add(id);
}

export function isPreRegisteredAnimatedId(id: string): boolean {
  return preRegisteredIds.has(id);
}

export function bridgeAnimatedId(oldId: string, newId: string): void {
  animationIdentityById.set(newId, getAnimationIdentity(oldId));
}

export function getAnimationIdentity(id: string): string {
  return animationIdentityById.get(id) || id;
}
