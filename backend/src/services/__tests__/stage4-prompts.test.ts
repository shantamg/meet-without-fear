import {
  isExplicitAskForInput,
  needsBrainstormPersona,
  proposalRefinementPersona,
  noOverlapPersona,
  coverageReviewOpenNeedsClause,
  stage4HandoffBridgeMessage,
} from '../stage4-prompts';

describe('isExplicitAskForInput', () => {
  it.each([
    'what should I do?',
    'What should I do here, honestly',
    "help me think about this please",
    'Can you weigh in?',
    'weigh in on this',
    'any advice?',
    'any ideas for next steps',
    'any suggestions?',
    'what would you suggest?',
    'what would you recommend',
    'what would you do',
    'give me your take',
    'give me advice',
  ])('matches explicit ask: %s', (text) => {
    expect(isExplicitAskForInput(text)).toBe(true);
  });

  it.each([
    '',
    'I was thinking about it on the drive home.',
    'It worked, actually.',
    'I stopped doing it last week.',
    "I don't know what to feel.",
    'what a day',
  ])('does not match passive/reflective text: %s', (text) => {
    expect(isExplicitAskForInput(text)).toBe(false);
  });
});

describe('persona templates ground in user phrasing', () => {
  it('needsBrainstormPersona quotes the exact need label verbatim', () => {
    const persona = needsBrainstormPersona('feeling like myself inside this marriage');
    expect(persona).toContain('"feeling like myself inside this marriage"');
    expect(persona).toMatch(/do not lead with your own draft/i);
  });

  it('needsBrainstormPersona falls back gracefully when label is missing', () => {
    const persona = needsBrainstormPersona(null);
    expect(persona).toContain('the named need');
  });

  it('proposalRefinementPersona quotes the proposal description and probes blockers', () => {
    const persona = proposalRefinementPersona('walk together each evening');
    expect(persona).toContain('"walk together each evening"');
    expect(persona).toMatch(/what's making (them|the user) hesitate/i);
  });

  it('noOverlapPersona instructs near-miss and combination scanning, not pushing closure', () => {
    const persona = noOverlapPersona();
    expect(persona).toMatch(/near-miss/i);
    expect(persona).toMatch(/combinable/i);
    expect(persona).toMatch(/not to push for closure/i);
  });
});

describe('coverageReviewOpenNeedsClause', () => {
  it('returns empty when there are no open needs', () => {
    expect(coverageReviewOpenNeedsClause([])).toBe('');
  });

  it('lists each open need by exact phrasing and instructs surfacing one at a time', () => {
    const clause = coverageReviewOpenNeedsClause([
      { needLabel: 'feeling like myself inside this marriage' },
      { needLabel: 'not being alone on the inside' },
    ]);
    expect(clause).toContain('"feeling like myself inside this marriage"');
    expect(clause).toContain('"not being alone on the inside"');
    expect(clause).toMatch(/one at a time/i);
    expect(clause).toMatch(/that's a valid place to land/i);
  });
});

describe('stage4HandoffBridgeMessage', () => {
  it('interpolates partner name and frames the wait + individual carry-forward', () => {
    const msg = stage4HandoffBridgeMessage('Eve');
    expect(msg).toContain('Eve');
    expect(msg).toMatch(/shared experiment/i);
    expect(msg).toMatch(/your own/i);
  });

  it('falls back to a generic partner phrase when name is missing', () => {
    expect(stage4HandoffBridgeMessage(null)).toContain('your partner');
    expect(stage4HandoffBridgeMessage('')).toContain('your partner');
  });
});
