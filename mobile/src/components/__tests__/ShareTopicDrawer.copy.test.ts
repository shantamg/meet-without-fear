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

  it('does not present partner interpretation as product truth', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'ShareTopicDrawer.tsx'),
      'utf8'
    );

    expect(source).toContain('There may be context that would help');
    expect(source).not.toContain('what {partnerName} is imagining');
  });
});
