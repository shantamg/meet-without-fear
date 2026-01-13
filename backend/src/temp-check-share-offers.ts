import { prisma } from './lib/prisma';

async function main() {
  const sessionId = 'cmkbmhh6y000npx8p4vpg1in0';

  console.log('=== RECONCILER RESULTS (full) ===\n');

  const results = await prisma.reconcilerResult.findMany({
    where: { sessionId },
    include: { shareOffer: true }
  });

  for (const r of results) {
    console.log(`[${r.guesserName} → ${r.subjectName}]`);
    console.log(`  guesserId: ${r.guesserId}`);
    console.log(`  subjectId: ${r.subjectId}`);
    console.log(`  alignmentScore: ${r.alignmentScore}`);
    console.log(`  recommendedAction: ${r.recommendedAction}`);
    console.log(`  suggestedShareContent: ${r.suggestedShareContent || 'NULL'}`);
    console.log(`  suggestedShareReason: ${r.suggestedShareReason || 'NULL'}`);
    console.log(`  shareOffer.userId: ${r.shareOffer?.userId || 'N/A'}`);
    console.log(`  shareOffer.status: ${r.shareOffer?.status || 'N/A'}`);
    console.log(`  shareOffer.suggestedContent: ${r.shareOffer?.suggestedContent || 'NULL'}`);
    console.log(`  shareOffer.offerMessage (full):\n${r.shareOffer?.offerMessage || 'NULL'}`);
    console.log('');
  }

  // Check who is supposed to see what
  console.log('\n=== WHO SEES WHAT ===\n');

  // ShareOffer.userId is the person who should see the share suggestion
  for (const r of results) {
    if (r.shareOffer) {
      console.log(`Share offer ${r.shareOffer.id}:`);
      console.log(`  Shown to userId: ${r.shareOffer.userId}`);
      console.log(`  Content: "${r.shareOffer.offerMessage?.substring(0, 100)}..."`);
      console.log(`  This is the share suggestion for ${r.subjectName} (because the guesser ${r.guesserName} missed understanding ${r.subjectName})`);
      console.log('');
    }
  }
}

main().finally(() => prisma.$disconnect());
