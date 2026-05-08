import { deriveEmpathyValidatedIndicator } from '../chatListSelector';

describe('deriveEmpathyValidatedIndicator', () => {
  it('returns null when status is not VALIDATED', () => {
    expect(deriveEmpathyValidatedIndicator('REVEALED', '2026-01-01T00:00:00Z', 'Catherine')).toBeNull();
    expect(deriveEmpathyValidatedIndicator(null, '2026-01-01T00:00:00Z', 'Catherine')).toBeNull();
  });

  it('returns null when revealedAt is missing, even if VALIDATED (no Date.now() fallback)', () => {
    // This guards the milestone-divider-position bug: a `new Date()` fallback
    // would re-anchor the indicator on every render and the divider would
    // visually slide just above the most-recent AI message each turn.
    expect(deriveEmpathyValidatedIndicator('VALIDATED', null, 'Catherine')).toBeNull();
  });

  it('pins the indicator to revealedAt when validated', () => {
    const indicator = deriveEmpathyValidatedIndicator(
      'VALIDATED',
      '2026-05-08T12:00:00.000Z',
      'Catherine'
    );
    expect(indicator).toEqual({
      type: 'indicator',
      indicatorType: 'empathy-validated',
      id: 'empathy-validated',
      timestamp: '2026-05-08T12:00:00.000Z',
      metadata: { partnerName: 'Catherine' },
    });
  });

  it('returns the same stable timestamp across many invocations (no drift)', () => {
    // Simulates the indicator being rederived on every render after every
    // new message arrives. The timestamp must not change.
    const calls = Array.from({ length: 10 }, () =>
      deriveEmpathyValidatedIndicator('VALIDATED', '2026-05-08T12:00:00.000Z', 'Catherine')
    );
    const timestamps = new Set(calls.map((c) => c?.timestamp));
    expect(timestamps.size).toBe(1);
    expect([...timestamps][0]).toBe('2026-05-08T12:00:00.000Z');
  });
});
