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
});
