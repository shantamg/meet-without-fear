/**
 * backfill-proposal-need-linkage
 *
 * Walks existing StrategyProposal rows and tries to match each proposal's
 * `needsAddressed` string labels to actual IdentifiedNeed rows from the
 * same session (via UserVessel). Writes StrategyProposalNeed rows for each
 * match.
 *
 * Usage:
 *   npx ts-node src/scripts/backfill-proposal-need-linkage.ts [--dry-run]
 */

import { prisma } from '../lib/prisma';
import { linkProposalToIdentifiedNeeds } from '../services/stage4-capture.service';

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const before = await prisma.strategyProposalNeed.count();
  const proposals = await prisma.strategyProposal.findMany({
    select: { id: true, sessionId: true, needsAddressed: true },
  });

  let scanned = 0;
  let linksCreated = 0;
  for (const proposal of proposals) {
    scanned += 1;
    if (!proposal.needsAddressed || proposal.needsAddressed.length === 0) continue;
    if (dryRun) continue;
    const created = await linkProposalToIdentifiedNeeds(
      proposal.id,
      proposal.sessionId,
      proposal.needsAddressed
    );
    linksCreated += created;
  }

  const after = await prisma.strategyProposalNeed.count();

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        dryRun,
        proposalsScanned: scanned,
        linksAttempted: linksCreated,
        strategyProposalNeed_before: before,
        strategyProposalNeed_after: after,
        delta: after - before,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
