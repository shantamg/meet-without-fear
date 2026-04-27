#!/usr/bin/env node
/**
 * Standalone test for parseTestCommand — exercises the regex on the sample
 * inputs we expect to see in Slack. Run with:
 *
 *   BOT_USER_ID=U123ABC node scripts/ec2-bot/socket-mode/test-parse-test-command.mjs
 *
 * Exits non-zero on any unexpected match/non-match so it's CI-friendly.
 */

// Mirror the parser in socket-listener.mjs. Kept verbatim — when this test
// flags a mismatch, fix BOTH copies.
const BOT_USER_ID = process.env.BOT_USER_ID || 'U_BOT_TEST';
const TEST_TRIGGER_RE = /^test\s+(\S+)/i;
const FROM_SNAPSHOT_RE = /from-snapshot:(\S+)/i;

function parseTestCommand(text) {
  if (!text) return null;
  const mentionPrefix = `<@${BOT_USER_ID}>`;
  if (!text.includes(mentionPrefix)) return null;
  const stripped = text.replace(mentionPrefix, '').trim();
  const m = stripped.match(TEST_TRIGGER_RE);
  if (!m) return null;
  const verb = stripped.match(/^(\w+)/)?.[1];
  if (verb && verb.toLowerCase() !== 'test') return null;
  const scenario = m[1];
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(scenario)) return null;
  const snapMatch = stripped.match(FROM_SNAPSHOT_RE);
  return { scenario, startingSnapshotId: snapMatch ? snapMatch[1] : null };
}

const cases = [
  // [input,                                                    expected (or null)]
  [`<@${BOT_USER_ID}> test single-user-journey`,                { scenario: 'single-user-journey', startingSnapshotId: null }],
  [`<@${BOT_USER_ID}> test two-browser-stage-2`,                { scenario: 'two-browser-stage-2', startingSnapshotId: null }],
  [`<@${BOT_USER_ID}>   test    two-browser-smoke`,             { scenario: 'two-browser-smoke', startingSnapshotId: null }],
  [`hey <@${BOT_USER_ID}> test partner-journey please`,         null],  // text before "test" rejected
  [`<@${BOT_USER_ID}> test stage-3-4-complete from-snapshot:01HK1234`,
                                                                { scenario: 'stage-3-4-complete', startingSnapshotId: '01HK1234' }],
  [`<@${BOT_USER_ID}> tests`,                                    null],  // "tests" not "test"
  [`<@${BOT_USER_ID}> testing`,                                  null],
  [`<@${BOT_USER_ID}> hello world`,                              null],
  [`test single-user-journey`,                                   null],  // no mention
  [``,                                                           null],
  [null,                                                         null],
  // Scenario name validation: only [a-z0-9-]
  [`<@${BOT_USER_ID}> test ../../../etc/passwd`,                 null],
  [`<@${BOT_USER_ID}> test "two browser stage 2"`,               null],
  [`<@${BOT_USER_ID}> test --evil`,                              null],
];

let failed = 0;
for (const [input, expected] of cases) {
  const got = parseTestCommand(input);
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  if (!ok) {
    failed++;
    console.error(`FAIL  input=${JSON.stringify(input)}\n      got=${JSON.stringify(got)}\n      want=${JSON.stringify(expected)}`);
  }
}

if (failed === 0) {
  console.log(`✓ ${cases.length}/${cases.length} parse cases passed`);
  process.exit(0);
} else {
  console.error(`\n✗ ${failed}/${cases.length} parse cases failed`);
  process.exit(1);
}
