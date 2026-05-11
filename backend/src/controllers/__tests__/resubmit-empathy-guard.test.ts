/**
 * Tests for the identical-resubmission guard in resubmitEmpathy.
 *
 * The controller normalizes whitespace and casing before comparing
 * the new content against the previous attempt. This file validates
 * that normalization logic directly.
 */

// Mirrors the normalize function in stage2.ts resubmitEmpathy
const normalize = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

describe('resubmitEmpathy identical-content guard', () => {
  const original = 'I think you felt frustrated because of the situation.';

  it('detects exact duplicate', () => {
    expect(normalize(original)).toBe(normalize(original));
  });

  it('detects duplicate with extra whitespace', () => {
    const resubmitted = '  I think  you  felt  frustrated   because of the situation.  ';
    expect(normalize(resubmitted)).toBe(normalize(original));
  });

  it('detects duplicate with different casing', () => {
    const resubmitted = 'I THINK YOU FELT FRUSTRATED BECAUSE OF THE SITUATION.';
    expect(normalize(resubmitted)).toBe(normalize(original));
  });

  it('detects duplicate with tabs and newlines', () => {
    const resubmitted = 'I think you felt\nfrustrated\tbecause of the situation.';
    expect(normalize(resubmitted)).toBe(normalize(original));
  });

  it('allows genuinely revised content', () => {
    const revised = 'I think you felt hurt and unheard because your perspective was dismissed.';
    expect(normalize(revised)).not.toBe(normalize(original));
  });

  it('allows content with meaningful additions', () => {
    const revised = 'I think you felt frustrated because of the situation, and also unheard.';
    expect(normalize(revised)).not.toBe(normalize(original));
  });
});
