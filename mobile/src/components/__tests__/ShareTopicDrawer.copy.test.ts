import fs from 'fs';
import path from 'path';

describe('ShareTopicDrawer copy', () => {
  it('does not expose internal reconciler wording', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'ShareTopicDrawer.tsx'),
      'utf8'
    );

    expect(source.toLowerCase()).not.toContain('internal reconciler');
  });
});
