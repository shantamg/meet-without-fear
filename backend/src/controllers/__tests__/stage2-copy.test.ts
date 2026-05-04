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
});
