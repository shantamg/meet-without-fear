import { prisma } from '../lib/prisma';

interface CategorizedFact {
  category: string;
  fact: string;
}

async function main() {
  // Check all UserVessels
  const allVessels = await prisma.userVessel.findMany({
    select: {
      userId: true,
      sessionId: true,
      notableFacts: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: 10,
  });

  console.log(`Total UserVessels found: ${allVessels.length}\n`);

  for (const v of allVessels) {
    console.log(`Session: ${v.sessionId}`);
    console.log(`User: ${v.userId}`);
    console.log(`Updated: ${v.updatedAt}`);
    // Handle both old string[] and new CategorizedFact[] formats
    const facts = v.notableFacts as unknown;
    if (Array.isArray(facts)) {
      console.log(`Facts (${facts.length}):`, facts);
    } else {
      console.log('Facts: null');
    }
    console.log('---');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
