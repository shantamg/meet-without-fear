/**
 * invitationShareText.ts
 *
 * Hardcoded canonical share text for invitations. The user's spec calls
 * for a verbatim, non-personalized body — no sender name, no topic, no
 * app name. Just a neutral, low-friction message followed by the link.
 */

export const CANONICAL_INVITATION_BODY =
  "I'd like to talk through something that's been on my mind between us. I'm using a tool that helps both people feel heard before anything gets worked out. Would you be open to it?";

export function buildInvitationShareText(invitationUrl: string): string {
  return `${CANONICAL_INVITATION_BODY}\n\n${invitationUrl}`;
}
