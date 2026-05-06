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

  it('does not use felt-heard gate wording in the Stage 2 transition opener', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'messages.ts'),
      'utf8'
    );

    expect(source).not.toContain('until you felt heard');
    expect(source).toContain('staying with it took real honesty');
  });
});
