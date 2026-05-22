/**
 * Open Due Tending Entries
 *
 * CLI entrypoint for scheduled shared-agreement check-ins. Invoke via:
 *   npx tsx src/scripts/open-due-tending-entries.ts
 */

import { openDueTendingEntries, processDueTendingReminders } from '../services/tending.service';

async function main(): Promise<void> {
  const [entries, reminders] = await Promise.all([
    openDueTendingEntries(),
    processDueTendingReminders(),
  ]);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, entries, reminders }, null, 2));
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[open-due-tending-entries] failed:', err);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
