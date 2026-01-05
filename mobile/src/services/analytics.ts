/**
 * Analytics tracking helpers for Meet Without Fear mobile app
 *
 * MVP Events tracked:
 * - Session: Created, Person Selected, Invitation Sent, Compact Signed, Resolved
 * - Flow: Stage Started/Completed, Message Sent, Felt Heard, Common Ground
 * - Inner Thoughts: Created, Linked
 * - Errors: API/Critical errors
 */

import { track } from './mixpanel';

// ============================================================================
// Session Events
// ============================================================================

export function trackSessionCreated(sessionId: string, personId?: string): void {
  track('Session Created', {
    session_id: sessionId,
    person_id: personId,
  });
}

export function trackPersonSelected(personId: string, isNewPerson: boolean): void {
  track('Person Selected', {
    person_id: personId,
    is_new_person: isNewPerson,
  });
}

export function trackInvitationSent(
  sessionId: string,
  shareMethod: 'copy' | 'share_sheet'
): void {
  track('Invitation Sent', {
    session_id: sessionId,
    share_method: shareMethod,
  });
}

export function trackCompactSigned(sessionId: string, isInviter: boolean): void {
  track('Compact Signed', {
    session_id: sessionId,
    is_inviter: isInviter,
  });
}

export function trackSessionResolved(
  sessionId: string,
  resolutionType?: string
): void {
  track('Session Resolved', {
    session_id: sessionId,
    resolution_type: resolutionType,
  });
}

// ============================================================================
// Flow Events
// ============================================================================

export function trackStageStarted(
  sessionId: string,
  stageName: string,
  previousStage?: string
): void {
  track('Stage Started', {
    session_id: sessionId,
    stage_name: stageName,
    previous_stage: previousStage,
  });
}

export function trackStageCompleted(
  sessionId: string,
  stageName: string,
  durationSeconds: number
): void {
  track('Stage Completed', {
    session_id: sessionId,
    stage_name: stageName,
    duration_seconds: durationSeconds,
  });
}

export function trackMessageSent(sessionId: string, messageLength: number): void {
  track('Message Sent', {
    session_id: sessionId,
    message_length: messageLength,
  });
}

export function trackFeltHeardResponse(
  sessionId: string,
  response: 'yes' | 'no'
): void {
  track('Felt Heard Response', {
    session_id: sessionId,
    response,
  });
}

export function trackCommonGroundFound(
  sessionId: string,
  overlappingNeeds: number
): void {
  track('Common Ground Found', {
    session_id: sessionId,
    overlapping_needs: overlappingNeeds,
  });
}

// ============================================================================
// Inner Thoughts Events
// ============================================================================

export function trackInnerThoughtsCreated(sessionId: string): void {
  track('Inner Thoughts Created', {
    session_id: sessionId,
  });
}

export function trackInnerThoughtsLinked(
  sessionId: string,
  partnerSessionId: string
): void {
  track('Inner Thoughts Linked', {
    session_id: sessionId,
    partner_session_id: partnerSessionId,
  });
}

// ============================================================================
// Error Events
// ============================================================================

export function trackError(
  errorType: 'api' | 'network' | 'auth' | 'session' | 'validation',
  errorCode: string,
  context?: string
): void {
  track('Error', {
    error_type: errorType,
    error_code: errorCode,
    context,
  });
}
