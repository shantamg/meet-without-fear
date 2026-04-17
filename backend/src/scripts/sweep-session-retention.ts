/**
 * Sweep Session Retention
 *
 * CLI entrypoint for the session retention policy. Invoke via:
 *   npx tsx src/scripts/sweep-session-retention.ts
 *
 * Designed to be wired into any scheduler (Render cron, EC2 crontab, GitHub
 * Actions schedule). The policy itself is in `services/session-retention.ts`.
 */

import { enforceSessionRetention } from '../services/session-retention';

async function main(): Promise<void> {
  const result = await enforceSessionRetention();
  // Emit to stdout so cron hosts capture results in their log aggregation.
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[sweep-session-retention] failed:', err);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
