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
