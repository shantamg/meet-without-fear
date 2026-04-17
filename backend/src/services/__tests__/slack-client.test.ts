/**
 * Slack Client Tests — Markdown → mrkdwn conversion
 */

import { toSlackMrkdwn } from '../slack-client';

describe('toSlackMrkdwn', () => {
  it('converts **bold** to *bold*', () => {
    expect(toSlackMrkdwn('this is **bold** text')).toBe('this is *bold* text');
  });

  it('converts __bold__ to *bold*', () => {
    expect(toSlackMrkdwn('this is __bold__ text')).toBe('this is *bold* text');
  });

  it('leaves single *italic* alone (it would mean bold in Slack, so we trust the model)', () => {
    // We don't rewrite single-asterisk because the prompt told the model
    // asterisks = bold in Slack. Rewriting here would inverse-convert bold
    // the model got right.
    expect(toSlackMrkdwn('leave *single* alone')).toBe('leave *single* alone');
  });

  it('converts [label](url) to <url|label>', () => {
    expect(toSlackMrkdwn('see [docs](https://example.com) here')).toBe(
      'see <https://example.com|docs> here'
    );
  });

  it('converts # headers to *bold* lines', () => {
    expect(toSlackMrkdwn('# Title\nbody')).toBe('*Title*\nbody');
    expect(toSlackMrkdwn('## Subtitle\nbody')).toBe('*Subtitle*\nbody');
    expect(toSlackMrkdwn('### H3')).toBe('*H3*');
  });

  it('converts - and * bullets at line start to •', () => {
    expect(toSlackMrkdwn('- first\n- second')).toBe('• first\n• second');
    expect(toSlackMrkdwn('* first\n* second')).toBe('• first\n• second');
  });

  it('preserves indentation on bullets', () => {
    expect(toSlackMrkdwn('  - indented')).toBe('  • indented');
  });

  it('leaves fenced code blocks untouched', () => {
    const input = 'normal **bold** text\n```\n**bold inside code**\n# not a header\n```\nafter';
    const output = toSlackMrkdwn(input);
    expect(output).toContain('*bold* text');
    expect(output).toContain('**bold inside code**'); // preserved
    expect(output).toContain('# not a header'); // preserved
  });

  it('handles multiline text with mixed markdown', () => {
    const input = '# Greeting\n\nThis is **important** — see [link](https://x.com).\n\n- point one\n- point two';
    expect(toSlackMrkdwn(input)).toBe(
      '*Greeting*\n\nThis is *important* — see <https://x.com|link>.\n\n• point one\n• point two'
    );
  });

  it('returns empty string unchanged', () => {
    expect(toSlackMrkdwn('')).toBe('');
  });

  it('does not touch single underscore italics', () => {
    expect(toSlackMrkdwn('_already italic_')).toBe('_already italic_');
  });

  describe('multi-line blockquote normalization', () => {
    it('adds `> ` prefix to lazy-continuation lines', () => {
      const input = '> first line\nsecond line\nthird line';
      expect(toSlackMrkdwn(input)).toBe(
        '> first line\n> second line\n> third line'
      );
    });

    it('ends the blockquote at a blank line', () => {
      const input = '> inside quote\nstill inside\n\nafter quote';
      expect(toSlackMrkdwn(input)).toBe(
        '> inside quote\n> still inside\n\nafter quote'
      );
    });

    it('preserves a single-line blockquote unchanged', () => {
      expect(toSlackMrkdwn('> just one line\n\nbody')).toBe(
        '> just one line\n\nbody'
      );
    });

    it('handles two separate blockquotes', () => {
      const input = '> quote one\nmore of one\n\n> quote two\nmore of two';
      expect(toSlackMrkdwn(input)).toBe(
        '> quote one\n> more of one\n\n> quote two\n> more of two'
      );
    });

    it('does not re-prefix already-prefixed lines', () => {
      const input = '> line a\n> line b\n> line c';
      expect(toSlackMrkdwn(input)).toBe('> line a\n> line b\n> line c');
    });

    it('works for reconciler-style quoted partner context', () => {
      // Matches the kind of output the Stage 2B / reconciler flow produces.
      const input =
        '💡 *Partner just shared this:*\n> I think what\'s hard for me\nis that I feel unheard\nwhen plans change.\n\nKeep going when ready.';
      expect(toSlackMrkdwn(input)).toContain(
        '> I think what\'s hard for me\n> is that I feel unheard\n> when plans change.'
      );
    });
  });

  describe('nested bullets', () => {
    it('normalizes tab indentation to two-space for nested bullets', () => {
      const input = '- top\n\t- nested\n\t\t- deeper';
      expect(toSlackMrkdwn(input)).toBe('• top\n  • nested\n    • deeper');
    });

    it('preserves existing space indentation', () => {
      const input = '- top\n  - nested\n    - deeper';
      expect(toSlackMrkdwn(input)).toBe('• top\n  • nested\n    • deeper');
    });

    it('converts * bullets at any indent level', () => {
      const input = '* a\n  * b\n    * c';
      expect(toSlackMrkdwn(input)).toBe('• a\n  • b\n    • c');
    });
  });
});
