/**
 * Empathy State Machine
 *
 * Formalizes the EmpathyAttempt status transitions to prevent
 * invalid state changes. All empathy status mutations should go
 * through this module.
 *
 * Valid transitions:
 *   HELD → ANALYZING (reconciler starts comparing)
 *   HELD → AWAITING_SHARING (gaps detected, skip ANALYZING)
 *   HELD → READY (minor/no gaps, skip sharing)
 *   ANALYZING → AWAITING_SHARING (gaps detected)
 *   ANALYZING → READY (no significant gaps)
 *   AWAITING_SHARING → REFINING (subject shares context, guesser refines)
 *   AWAITING_SHARING → READY (subject declines sharing)
 *   REFINING → READY (guesser submits refined statement)
 *   REFINING → AWAITING_SHARING (re-analysis after resubmit shows gaps)
 *   READY → REVEALED (both users ready, mutual reveal)
 *   REVEALED → VALIDATED (recipient validates accuracy)
 *   REVEALED → REFINING (recipient sends validation feedback)
 */

import { EmpathyStatus } from '@prisma/client';

/** Events that trigger empathy status transitions */
export type EmpathyEvent =
  | 'START_ANALYSIS'
  | 'GAPS_DETECTED'
  | 'NO_SIGNIFICANT_GAPS'
  | 'MARK_READY'
  | 'CONTEXT_SHARED'
  | 'DECLINE_SHARING'
  | 'RESUBMIT_WITH_GAPS'
  | 'MUTUAL_REVEAL'
  | 'VALIDATE'
  | 'VALIDATION_FEEDBACK_SENT';

/**
 * Transition table: maps (currentStatus, event) → newStatus
 */
const TRANSITIONS: Record<string, EmpathyStatus | undefined> = {
  // From HELD
  [`${EmpathyStatus.HELD}:START_ANALYSIS`]: EmpathyStatus.ANALYZING,
  [`${EmpathyStatus.HELD}:GAPS_DETECTED`]: EmpathyStatus.AWAITING_SHARING,
  [`${EmpathyStatus.HELD}:MARK_READY`]: EmpathyStatus.READY,

  // From ANALYZING
  [`${EmpathyStatus.ANALYZING}:GAPS_DETECTED`]: EmpathyStatus.AWAITING_SHARING,
  [`${EmpathyStatus.ANALYZING}:NO_SIGNIFICANT_GAPS`]: EmpathyStatus.READY,
  [`${EmpathyStatus.ANALYZING}:MARK_READY`]: EmpathyStatus.READY,

  // From AWAITING_SHARING
  [`${EmpathyStatus.AWAITING_SHARING}:CONTEXT_SHARED`]: EmpathyStatus.REFINING,
  [`${EmpathyStatus.AWAITING_SHARING}:DECLINE_SHARING`]: EmpathyStatus.READY,
  [`${EmpathyStatus.AWAITING_SHARING}:MARK_READY`]: EmpathyStatus.READY,

  // From REFINING
  [`${EmpathyStatus.REFINING}:MARK_READY`]: EmpathyStatus.READY,
  [`${EmpathyStatus.REFINING}:RESUBMIT_WITH_GAPS`]: EmpathyStatus.AWAITING_SHARING,

  // From READY
  [`${EmpathyStatus.READY}:MUTUAL_REVEAL`]: EmpathyStatus.REVEALED,

  // From REVEALED
  [`${EmpathyStatus.REVEALED}:VALIDATE`]: EmpathyStatus.VALIDATED,
  [`${EmpathyStatus.REVEALED}:VALIDATION_FEEDBACK_SENT`]: EmpathyStatus.REFINING,

  // Legacy: NEEDS_WORK is treated as equivalent to AWAITING_SHARING
  [`${EmpathyStatus.NEEDS_WORK}:CONTEXT_SHARED`]: EmpathyStatus.REFINING,
  [`${EmpathyStatus.NEEDS_WORK}:DECLINE_SHARING`]: EmpathyStatus.READY,
  [`${EmpathyStatus.NEEDS_WORK}:MARK_READY`]: EmpathyStatus.READY,
};

/**
 * Validates and returns the new status for an empathy state transition.
 *
 * @param currentStatus - The current EmpathyStatus
 * @param event - The event triggering the transition
 * @returns The new EmpathyStatus
 * @throws Error if the transition is invalid
 */
export function transition(
  currentStatus: EmpathyStatus,
  event: EmpathyEvent
): EmpathyStatus {
  const key = `${currentStatus}:${event}`;
  const newStatus = TRANSITIONS[key];

  if (newStatus === undefined) {
    throw new Error(
      `Invalid empathy state transition: ${currentStatus} + ${event}. ` +
      `No valid transition defined for this combination.`
    );
  }

  return newStatus;
}

/**
 * Checks if a transition is valid without throwing.
 */
export function canTransition(
  currentStatus: EmpathyStatus,
  event: EmpathyEvent
): boolean {
  const key = `${currentStatus}:${event}`;
  return TRANSITIONS[key] !== undefined;
}

/**
 * Returns all valid events for a given status.
 */
export function validEventsFor(status: EmpathyStatus): EmpathyEvent[] {
  const prefix = `${status}:`;
  return Object.keys(TRANSITIONS)
    .filter((key) => key.startsWith(prefix) && TRANSITIONS[key] !== undefined)
    .map((key) => key.slice(prefix.length) as EmpathyEvent);
}
