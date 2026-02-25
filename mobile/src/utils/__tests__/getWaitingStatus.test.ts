/**
 * Tests for getWaitingStatus.ts
 *
 * Tests the pure derivation function that computes waiting status
 * from session state. Each test verifies a specific priority path.
 */

import { Stage, StrategyPhase } from '@meet-without-fear/shared';
import { computeWaitingStatus, WaitingStatusInputs } from '../getWaitingStatus';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Creates default inputs with all values set to "no waiting state".
 * Tests can override specific values to test specific scenarios.
 */
function createDefaultInputs(overrides: Partial<WaitingStatusInputs> = {}): WaitingStatusInputs {
  return {
    myStage: Stage.WITNESS,
    partnerStage: Stage.WITNESS,
    previousStatus: null,
    empathyStatus: undefined,
    empathyDraft: undefined,
    hasPartnerEmpathy: false,
    shareOffer: undefined,
    needs: { allConfirmed: false },
    commonGround: { count: 0 },
    strategyPhase: StrategyPhase.COLLECTING,
    overlappingStrategies: { count: 0 },
    ...overrides,
  };
}

// ============================================================================
// Priority 1: User Action Required (Overrides waiting)
// ============================================================================

describe('Priority 1: User Action Required', () => {
  it('returns null when user has new shared context (must refine)', () => {
    const inputs = createDefaultInputs({
      myStage: Stage.PERSPECTIVE_STRETCH,
      empathyStatus: {
        hasNewSharedContext: true,
        awaitingSharing: true, // Would normally show empathy-pending
      },
    });

    expect(computeWaitingStatus(inputs)).toBeNull();
  });
});

// ============================================================================
// Priority 2: Stage 2 Reconciler States
// ============================================================================

describe('Priority 2: Stage 2 Reconciler States', () => {
  it('returns reconciler-analyzing when reconciler is running', () => {
    const inputs = createDefaultInputs({
      myStage: Stage.PERSPECTIVE_STRETCH,
      empathyStatus: { analyzing: true },
    });

    expect(computeWaitingStatus(inputs)).toBe('reconciler-analyzing');
  });

  it('returns awaiting-context-share when share suggestion exists', () => {
    const inputs = createDefaultInputs({
      myStage: Stage.PERSPECTIVE_STRETCH,
      shareOffer: { hasSuggestion: true },
    });

    expect(computeWaitingStatus(inputs)).toBe('awaiting-context-share');
  });

  it('does not return awaiting-context-share when in Stage 3 (stage gate)', () => {
    const inputs = createDefaultInputs({
      myStage: Stage.NEED_MAPPING,
      shareOffer: { hasSuggestion: true },
    });

    expect(computeWaitingStatus(inputs)).toBeNull();
  });

  it('does not return awaiting-context-share when in Stage 4 (stage gate)', () => {
    const inputs = createDefaultInputs({
      myStage: Stage.STRATEGIC_REPAIR,
      shareOffer: { hasSuggestion: true },
    });

    expect(computeWaitingStatus(inputs)).toBeNull();
  });

  it('reconciler-analyzing takes priority over awaiting-context-share', () => {
    const inputs = createDefaultInputs({
      myStage: Stage.PERSPECTIVE_STRETCH,
      empathyStatus: { analyzing: true },
      shareOffer: { hasSuggestion: true },
    });

    expect(computeWaitingStatus(inputs)).toBe('reconciler-analyzing');
  });
});

// ============================================================================
// Priority 3: Stage 1 (Witness)
// ============================================================================

describe('Priority 3: Stage 1 (Witness)', () => {
  it('returns null when user is in Stage 2 but partner is in Stage 1 and user has NOT consented', () => {
    // User should be able to work on their empathy draft without waiting
    const inputs = createDefaultInputs({
      myStage: Stage.PERSPECTIVE_STRETCH,
      partnerStage: Stage.WITNESS,
      empathyDraft: { alreadyConsented: false },
    });

    expect(computeWaitingStatus(inputs)).toBeNull();
  });

  it('returns witness-pending when user is in Stage 2 and partner is in Stage 1 and user HAS consented', () => {
    // After sharing empathy, user should wait for partner to feel heard
    const inputs = createDefaultInputs({
      myStage: Stage.PERSPECTIVE_STRETCH,
      partnerStage: Stage.WITNESS,
      empathyDraft: { alreadyConsented: true },
    });

    expect(computeWaitingStatus(inputs)).toBe('witness-pending');
  });

  it('returns partner-completed-witness on transition from witness-pending', () => {
    const inputs = createDefaultInputs({
      myStage: Stage.PERSPECTIVE_STRETCH,
      partnerStage: Stage.PERSPECTIVE_STRETCH,
      previousStatus: 'witness-pending',
    });

    expect(computeWaitingStatus(inputs)).toBe('partner-completed-witness');
  });

  it('returns null after partner-completed-witness transition clears', () => {
    const inputs = createDefaultInputs({
      myStage: Stage.PERSPECTIVE_STRETCH,
      partnerStage: Stage.PERSPECTIVE_STRETCH,
      previousStatus: 'partner-completed-witness',
    });

    expect(computeWaitingStatus(inputs)).toBeNull();
  });
});

// ============================================================================
// Priority 4: Stage 2 (Empathy)
// ============================================================================

describe('Priority 4: Stage 2 (Empathy)', () => {
  it('returns awaiting-subject-decision when guesser is waiting for subject to decide on sharing', () => {
    const inputs = createDefaultInputs({
      myStage: Stage.PERSPECTIVE_STRETCH,
      partnerStage: Stage.PERSPECTIVE_STRETCH, // Partner also in Stage 2
      empathyStatus: { awaitingSharing: true },
    });

    expect(computeWaitingStatus(inputs)).toBe('awaiting-subject-decision');
  });

  it('returns partner-considering-perspective when my attempt is REVEALED', () => {
    const inputs = createDefaultInputs({
      myStage: Stage.PERSPECTIVE_STRETCH,
      partnerStage: Stage.PERSPECTIVE_STRETCH, // Partner also in Stage 2
      empathyStatus: { myAttemptStatus: 'REVEALED' },
      hasPartnerEmpathy: false,
    });

    expect(computeWaitingStatus(inputs)).toBe('partner-considering-perspective');
  });

  it('returns partner-considering-perspective when my attempt is READY (asymmetric reconciler approved)', () => {
    // When User A shares empathy and the asymmetric reconciler approves it (READY),
    // but User B hasn't shared yet, A should see "partner is considering your perspective"
    const inputs = createDefaultInputs({
      myStage: Stage.PERSPECTIVE_STRETCH,
      partnerStage: Stage.PERSPECTIVE_STRETCH,
      empathyStatus: { myAttemptStatus: 'READY' },
      empathyDraft: { alreadyConsented: true },
      hasPartnerEmpathy: false,
    });

    expect(computeWaitingStatus(inputs)).toBe('partner-considering-perspective');
  });

  it('returns null when REVEALED but partner has shared empathy', () => {
    const inputs = createDefaultInputs({
      myStage: Stage.PERSPECTIVE_STRETCH,
      partnerStage: Stage.PERSPECTIVE_STRETCH, // Partner also in Stage 2
      empathyStatus: { myAttemptStatus: 'REVEALED' },
      hasPartnerEmpathy: true,
    });

    expect(computeWaitingStatus(inputs)).toBeNull();
  });

  it('returns null when READY and partner has shared empathy', () => {
    const inputs = createDefaultInputs({
      myStage: Stage.PERSPECTIVE_STRETCH,
      partnerStage: Stage.PERSPECTIVE_STRETCH,
      empathyStatus: { myAttemptStatus: 'READY' },
      empathyDraft: { alreadyConsented: true },
      hasPartnerEmpathy: true,
    });

    expect(computeWaitingStatus(inputs)).toBeNull();
  });

  it('returns empathy-pending when user consented but partner has not shared', () => {
    const inputs = createDefaultInputs({
      myStage: Stage.PERSPECTIVE_STRETCH,
      partnerStage: Stage.PERSPECTIVE_STRETCH, // Partner also in Stage 2
      empathyDraft: { alreadyConsented: true },
      hasPartnerEmpathy: false,
    });

    expect(computeWaitingStatus(inputs)).toBe('empathy-pending');
  });

  it('returns null when user consented and partner has shared', () => {
    const inputs = createDefaultInputs({
      myStage: Stage.PERSPECTIVE_STRETCH,
      partnerStage: Stage.PERSPECTIVE_STRETCH, // Partner also in Stage 2
      empathyDraft: { alreadyConsented: true },
      hasPartnerEmpathy: true,
    });

    expect(computeWaitingStatus(inputs)).toBeNull();
  });

  it('returns partner-shared-empathy on transition from empathy-pending', () => {
    const inputs = createDefaultInputs({
      myStage: Stage.PERSPECTIVE_STRETCH,
      partnerStage: Stage.PERSPECTIVE_STRETCH, // Partner also in Stage 2
      hasPartnerEmpathy: true,
      previousStatus: 'empathy-pending',
    });

    expect(computeWaitingStatus(inputs)).toBe('partner-shared-empathy');
  });
});

// ============================================================================
// Priority 5: Stage 3 (Needs)
// ============================================================================

describe('Priority 5: Stage 3 (Needs)', () => {
  it('returns needs-pending when all needs confirmed but no common ground yet', () => {
    const inputs = createDefaultInputs({
      myStage: Stage.NEED_MAPPING,
      needs: { allConfirmed: true },
      commonGround: { count: 0 },
    });

    expect(computeWaitingStatus(inputs)).toBe('needs-pending');
  });

  it('does not return needs-pending when in Stage 2 (stage gate)', () => {
    const inputs = createDefaultInputs({
      myStage: Stage.PERSPECTIVE_STRETCH,
      needs: { allConfirmed: true },
      commonGround: { count: 0 },
    });

    expect(computeWaitingStatus(inputs)).toBeNull();
  });

  it('returns null when needs confirmed and common ground exists', () => {
    const inputs = createDefaultInputs({
      myStage: Stage.NEED_MAPPING,
      needs: { allConfirmed: true },
      commonGround: { count: 2 },
    });

    expect(computeWaitingStatus(inputs)).toBeNull();
  });

  it('returns partner-confirmed-needs on transition from needs-pending', () => {
    const inputs = createDefaultInputs({
      myStage: Stage.NEED_MAPPING,
      needs: { allConfirmed: true },
      commonGround: { count: 2 },
      previousStatus: 'needs-pending',
    });

    expect(computeWaitingStatus(inputs)).toBe('partner-confirmed-needs');
  });
});

// ============================================================================
// Priority 6: Stage 4 (Strategies)
// ============================================================================

describe('Priority 6: Stage 4 (Strategies)', () => {
  it('returns ranking-pending when in REVEALING phase with no overlap', () => {
    const inputs = createDefaultInputs({
      myStage: Stage.STRATEGIC_REPAIR,
      strategyPhase: StrategyPhase.REVEALING,
      overlappingStrategies: { count: 0 },
    });

    expect(computeWaitingStatus(inputs)).toBe('ranking-pending');
  });

  it('returns null when in REVEALING phase with overlap', () => {
    const inputs = createDefaultInputs({
      myStage: Stage.STRATEGIC_REPAIR,
      strategyPhase: StrategyPhase.REVEALING,
      overlappingStrategies: { count: 3 },
    });

    expect(computeWaitingStatus(inputs)).toBeNull();
  });

  it('returns null when in COLLECTING phase', () => {
    const inputs = createDefaultInputs({
      myStage: Stage.STRATEGIC_REPAIR,
      strategyPhase: StrategyPhase.COLLECTING,
      overlappingStrategies: { count: 0 },
    });

    expect(computeWaitingStatus(inputs)).toBeNull();
  });
});

// ============================================================================
// Default Case
// ============================================================================

describe('Default Case', () => {
  it('returns null when no conditions match', () => {
    const inputs = createDefaultInputs();
    expect(computeWaitingStatus(inputs)).toBeNull();
  });

  it('returns null during onboarding', () => {
    const inputs = createDefaultInputs({
      myStage: Stage.ONBOARDING,
      partnerStage: Stage.ONBOARDING,
    });

    expect(computeWaitingStatus(inputs)).toBeNull();
  });
});

// ============================================================================
// Priority Ordering Tests
// ============================================================================

describe('Priority Ordering', () => {
  it('hasNewSharedContext overrides reconciler-analyzing', () => {
    const inputs = createDefaultInputs({
      myStage: Stage.PERSPECTIVE_STRETCH,
      empathyStatus: {
        analyzing: true,
        hasNewSharedContext: true,
      },
    });

    expect(computeWaitingStatus(inputs)).toBeNull();
  });

  it('reconciler-analyzing overrides witness-pending', () => {
    const inputs = createDefaultInputs({
      myStage: Stage.PERSPECTIVE_STRETCH,
      partnerStage: Stage.WITNESS,
      empathyStatus: { analyzing: true },
    });

    expect(computeWaitingStatus(inputs)).toBe('reconciler-analyzing');
  });

  it('awaiting-context-share overrides witness-pending', () => {
    const inputs = createDefaultInputs({
      myStage: Stage.PERSPECTIVE_STRETCH,
      partnerStage: Stage.WITNESS,
      shareOffer: { hasSuggestion: true },
    });

    expect(computeWaitingStatus(inputs)).toBe('awaiting-context-share');
  });
});
