import { prisma } from './lib/prisma';

async function main() {
  const sessionId = 'cmkbmhh6y000npx8p4vpg1in0';

  // Get all empathy-related data with timestamps
  const attempts = await prisma.empathyAttempt.findMany({
    where: { sessionId },
    include: { sourceUser: { select: { firstName: true, name: true } } },
    orderBy: { sharedAt: 'asc' }
  });

  const reconcilerResults = await prisma.reconcilerResult.findMany({
    where: { sessionId },
    include: { shareOffer: true },
    orderBy: { createdAt: 'asc' }
  });

  const stageProgress = await prisma.stageProgress.findMany({
    where: { sessionId },
    orderBy: [{ userId: 'asc' }, { stage: 'asc' }]
  });

  const users: Record<string, string> = {};
  for (const a of attempts) {
    const name = a.sourceUser?.firstName || a.sourceUser?.name || 'Unknown';
    if (a.sourceUserId) users[a.sourceUserId] = name;
  }

  console.log('=== DETAILED SEQUENCE OF EVENTS ===\n');

  type Event = { time: Date; actor: string; event: string };
  const events: Event[] = [];

  // Stage progress
  for (const sp of stageProgress) {
    const name = users[sp.userId] || sp.userId;
    if (sp.startedAt) {
      events.push({ time: sp.startedAt, actor: name, event: `Stage ${sp.stage} started (status=${sp.status})` });
    }
    if (sp.stage === 1 && sp.gatesSatisfied && (sp.gatesSatisfied as any).feelHeardConfirmedAt) {
      events.push({
        time: new Date((sp.gatesSatisfied as any).feelHeardConfirmedAt),
        actor: name,
        event: 'feelHeard confirmed (completed Stage 1)'
      });
    }
  }

  // Empathy attempts
  for (const a of attempts) {
    const name = a.sourceUserId ? users[a.sourceUserId] : 'Unknown';
    events.push({ time: a.sharedAt, actor: name, event: `Empathy SUBMITTED (status=${a.status}, consent to share)` });
    if (a.revealedAt) {
      events.push({ time: a.revealedAt, actor: name, event: `Empathy REVEALED` });
    }
  }

  // Reconciler results
  for (const r of reconcilerResults) {
    events.push({
      time: r.createdAt,
      actor: 'SYSTEM',
      event: `Reconciler analyzed ${r.guesserName}→${r.subjectName}: ${r.alignmentScore}% alignment, action=${r.recommendedAction}`
    });
  }

  // Share offers
  for (const r of reconcilerResults) {
    if (r.shareOffer) {
      events.push({
        time: r.shareOffer.createdAt,
        actor: 'SYSTEM',
        event: `ShareOffer created for ${r.subjectName} (status=${r.shareOffer.status})`
      });
    }
  }

  // Sort by time
  events.sort((a, b) => a.time.getTime() - b.time.getTime());

  for (const e of events) {
    const time = e.time.toISOString().replace('T', ' ').substring(11, 23);
    console.log(`${time}  [${e.actor.padEnd(10)}]  ${e.event}`);
  }

  console.log('\n=== KEY OBSERVATIONS ===\n');

  // Find the gaps
  const shantamSubmitted = attempts.find(a => a.sourceUser?.firstName === 'Shantam')?.sharedAt;
  const jasonSubmitted = attempts.find(a => a.sourceUser?.firstName === 'Jason')?.sharedAt;
  const reconcilerRan = reconcilerResults[0]?.createdAt;
  const shareOffersCreated = reconcilerResults[0]?.shareOffer?.createdAt;

  if (shantamSubmitted && jasonSubmitted && reconcilerRan && shareOffersCreated) {
    console.log(`Shantam submitted empathy: ${shantamSubmitted.toISOString()}`);
    console.log(`Jason submitted empathy: ${jasonSubmitted.toISOString()}`);
    console.log(`Gap between submissions: ${Math.round((jasonSubmitted.getTime() - shantamSubmitted.getTime()) / 1000)}s`);
    console.log(`Reconciler ran: ${reconcilerRan.toISOString()}`);
    console.log(`Gap from Jason submit to reconciler: ${Math.round((reconcilerRan.getTime() - jasonSubmitted.getTime()) / 1000)}s`);
    console.log(`Share offers created: ${shareOffersCreated.toISOString()}`);
    console.log(`Gap from reconciler to share offers: ${Math.round((shareOffersCreated.getTime() - reconcilerRan.getTime()) / 1000)}s`);
  }

  // Check current empathy attempt statuses
  console.log('\n=== CURRENT EMPATHY ATTEMPT STATUSES ===\n');
  for (const a of attempts) {
    const name = a.sourceUserId ? users[a.sourceUserId] : 'Unknown';
    console.log(`${name}: status=${a.status}, deliveryStatus=${a.deliveryStatus}`);
  }
}

main().finally(() => prisma.$disconnect());
