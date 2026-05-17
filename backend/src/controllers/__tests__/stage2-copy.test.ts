import fs from 'fs';
import path from 'path';

describe('Stage 2 user-facing copy', () => {
  it('does not expose internal reconciler wording in controller prompts or responses', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'stage2.ts'),
      'utf8'
    );

    expect(source.toLowerCase()).not.toContain('internal reconciler');
  });

  it('uses deterministic privacy-review copy for empathy resubmission acknowledgments', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'stage2.ts'),
      'utf8'
    );

    expect(source).toContain('separate privacy-protected review to check whether your updated perspective is ready to share');
    expect(source).not.toContain('Priya');
    expect(source).not.toContain('honors');
    expect(source).not.toContain('honour');
  });

  it('does not promise partner empathy validation before reveal is ready', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'stage2.ts'),
      'utf8'
    );
    const messagesSource = fs.readFileSync(
      path.join(__dirname, '..', 'messages.ts'),
      'utf8'
    );

    expect(source).toContain('Both empathy statements are now submitted');
    expect(source).toContain('privacy-protected review is ready');
    expect(source).toContain('Your empathy attempt has been submitted');
    expect(source).not.toContain("they'll read");
    expect(source).not.toContain('mark whether it feels accurate');
    expect(source).not.toContain('Now you can read');
    expect(source).not.toContain('real courage');
    expect(source).not.toContain('Thank you for taking that step');
    expect(messagesSource).not.toContain('What you just did really mattered');
    expect(messagesSource).not.toContain('real honesty');
    expect(messagesSource).not.toContain('protected attempt');
  });

  it('does not force optional share suggestions ahead of empathy reveal from the Stage 2 controller', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'stage2.ts'),
      'utf8'
    );

    expect(source).toContain('const hasSignificantGapsA = false');
    expect(source).toContain('const hasSignificantGapsB = false');
    expect(source).not.toContain("recommendation.action === 'OFFER_OPTIONAL' &&");
  });

  it('does not frame Stage 2 empathy as repair or working things out', () => {
    const files = [
      path.join(__dirname, '..', 'stage2.ts'),
      path.join(__dirname, '..', 'messages.ts'),
      path.join(__dirname, '..', '..', 'services', 'dispatch-handler.ts'),
    ];

    const sources = files.map((file) => fs.readFileSync(file, 'utf8').toLowerCase());

    for (const source of sources) {
      expect(source).not.toContain('strongest things you can do to actually work things out');
      expect(source).not.toContain('single strongest predictor of working things out');
      expect(source).not.toContain('helps people work things out');
      expect(source).not.toContain('before moving forward together');
      expect(source).not.toContain("you'll move forward together");
      expect(source).not.toContain("you'll be ready to move forward together");
    }
  });
});
