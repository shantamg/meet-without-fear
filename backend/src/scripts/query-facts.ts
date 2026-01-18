import { prisma } from '../lib/prisma';

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
    console.log(`Facts (${v.notableFacts.length}):`, v.notableFacts);
    console.log('---');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
