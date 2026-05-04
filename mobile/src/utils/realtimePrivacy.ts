/**
 * Realtime privacy helpers.
 *
 * Session-channel events are broadcast to both participants, so any payload with
 * a recipient must be treated as private unless it is addressed to the current
 * user. Public payloads should omit forUserId.
 */

export type AddressedRealtimePayload = {
  forUserId?: unknown;
  message?: unknown;
};

export function isRealtimePayloadAddressedToCurrentUser(
  payload: unknown,
  currentUserId: string | null | undefined
): boolean {
  if (!payload) return true;
  if (typeof payload !== 'object') return true;

  const addressedPayload = payload as AddressedRealtimePayload;

  const forUserId = typeof addressedPayload.forUserId === 'string'
    ? addressedPayload.forUserId
    : undefined;
  const message = addressedPayload.message && typeof addressedPayload.message === 'object'
    ? addressedPayload.message as { forUserId?: unknown }
    : undefined;
  const messageForUserId = typeof message?.forUserId === 'string'
    ? message.forUserId
    : undefined;

  const recipientId = messageForUserId ?? forUserId;
  if (!recipientId) return true;

  return !!currentUserId && recipientId === currentUserId;
}

export function canInsertRealtimeMessageForCurrentUser(
  message: ({ forUserId?: unknown; [key: string]: unknown }) | null | undefined,
  currentUserId: string | null | undefined
): boolean {
  if (!message) return false;
  return isRealtimePayloadAddressedToCurrentUser({ message }, currentUserId);
}
