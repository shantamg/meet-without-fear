import { prisma } from './lib/prisma';

async function main() {
  const sessionId = 'cmkbmhh6y000npx8p4vpg1in0';

  console.log('=== SHARE OFFERS with QUOTES ===\n');

  const offers = await prisma.reconcilerShareOffer.findMany({
    where: {
      result: { sessionId }
    },
    include: { result: true }
  });

  for (const offer of offers) {
    console.log(`Share Offer ${offer.id}:`);
    console.log(`  For user: ${offer.userId}`);
    console.log(`  Result: ${offer.result.guesserName} → ${offer.result.subjectName}`);
    console.log(`  Status: ${offer.status}`);
    console.log(`  suggestedContent: ${offer.suggestedContent || 'NULL'}`);
    console.log(`  suggestedReason: ${offer.suggestedReason || 'NULL'}`);
    console.log(`  offerMessage: ${offer.offerMessage || 'NULL'}`);
    console.log(`  quoteOptions: ${JSON.stringify(offer.quoteOptions, null, 2)}`);
    console.log(`  recommendedQuote: ${offer.recommendedQuote}`);
    console.log('');
  }
}

main().finally(() => prisma.$disconnect());
