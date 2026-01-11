import { prisma } from './lib/prisma';

async function main() {
  // Get the most recent session with Shantam and Jason
  const sessions = await prisma.session.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: {
      relationship: {
        include: {
          members: {
            include: {
              user: {
                select: { id: true, name: true, firstName: true }
              }
            }
          }
        }
      },
      messages: {
        orderBy: { timestamp: 'asc' },
        select: {
          id: true,
          role: true,
          content: true,
          stage: true,
          senderId: true,
          forUserId: true,
          timestamp: true
        }
      },
      stageProgress: {
        select: {
          userId: true,
          stage: true,
          status: true,
          startedAt: true,
          completedAt: true,
          gatesSatisfied: true
        }
      },
      empathyDrafts: {
        select: {
          id: true,
          userId: true,
          content: true,
          readyToShare: true,
          version: true
        }
      },
      empathyAttempts: {
        orderBy: { sharedAt: 'asc' },
        select: {
          id: true,
          sourceUserId: true,
          content: true,
          status: true,
          deliveryStatus: true,
          revealedAt: true,
          sharedAt: true,
          validations: {
            select: {
              userId: true,
              validated: true,
              feedback: true
            }
          }
        }
      }
    }
  });

  // Find the most recent session with Shantam
  const session = sessions.find(s => {
    const names = s.relationship.members.map(m => m.user.firstName?.toLowerCase() || '');
    return names.includes('shantam');
  });

  if (!session) {
    console.log('No session found with Shantam');
    console.log('Available sessions:', sessions.map(s => ({
      id: s.id,
      members: s.relationship.members.map(m => m.user.firstName)
    })));
    return;
  }

  const members = session.relationship.members;
  const shantam = members.find(m => m.user.firstName?.toLowerCase() === 'shantam')?.user;
  // Partner is whoever is not Shantam
  const partner = members.find(m => m.user.firstName?.toLowerCase() !== 'shantam')?.user;

  console.log('=== Session Info ===');
  console.log('Session ID:', session.id);
  console.log('Status:', session.status);
  console.log('Shantam ID:', shantam?.id);
  console.log('Jason ID:', partner?.id);

  console.log('\n=== Stage Progress ===');
  for (const sp of session.stageProgress) {
    const userName = sp.userId === shantam?.id ? 'Shantam' : 'Jason';
    console.log(`${userName} Stage ${sp.stage}: ${sp.status}`, sp.gatesSatisfied);
  }

  console.log('\n=== Empathy Drafts ===');
  for (const draft of session.empathyDrafts) {
    const userName = draft.userId === shantam?.id ? 'Shantam' : 'Jason';
    console.log(`${userName}: readyToShare=${draft.readyToShare}, v${draft.version}`);
    console.log(`  Content: ${draft.content.substring(0, 100)}...`);
  }

  console.log('\n=== Empathy Attempts ===');
  for (const attempt of session.empathyAttempts) {
    const userName = attempt.sourceUserId === shantam?.id ? 'Shantam' : 'Jason';
    console.log(`${userName}: status=${attempt.status}, delivery=${attempt.deliveryStatus}`);
    console.log(`  Shared at: ${attempt.sharedAt}`);
    console.log(`  Revealed at: ${attempt.revealedAt}`);
    console.log(`  Content: ${attempt.content.substring(0, 100)}...`);
    if (attempt.validations.length > 0) {
      console.log(`  Validations:`, attempt.validations);
    }
  }

  console.log('\n=== Messages (in order) ===');
  for (const msg of session.messages) {
    const senderName = msg.senderId === shantam?.id ? 'Shantam' :
                       msg.senderId === partner?.id ? 'Jason' :
                       msg.senderId === null ? 'AI' : 'Unknown';
    const forName = msg.forUserId === shantam?.id ? ' (for Shantam)' :
                    msg.forUserId === partner?.id ? ' (for Jason)' : '';
    console.log(`[Stage ${msg.stage}] ${msg.role} from ${senderName}${forName}:`);
    console.log(`  ${msg.content.substring(0, 200)}...`);
    console.log(`  Time: ${msg.timestamp}`);
    console.log('---');
  }

  // Now check reconciler results
  const reconcilerResults = await prisma.reconcilerResult.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: 'asc' },
    include: {
      shareOffer: true
    }
  });

  console.log('\n=== Reconciler Results ===');
  for (const result of reconcilerResults) {
    const guesserName = result.guesserId === shantam?.id ? 'Shantam' : 'Jason';
    const subjectName = result.subjectId === shantam?.id ? 'Shantam' : 'Jason';
    console.log(`${guesserName} guessed about ${subjectName}:`);
    console.log(`  Alignment: ${result.alignmentScore}, Gap: ${result.gapSeverity}`);
    console.log(`  Recommended Action: ${result.recommendedAction}`);
    console.log(`  Rationale: ${result.rationale.substring(0, 200)}...`);
    if (result.shareOffer) {
      console.log(`  Share Offer:`);
      console.log(`    Status: ${result.shareOffer.status}`);
      console.log(`    Delivery: ${result.shareOffer.deliveryStatus}`);
      if (result.shareOffer.suggestedContent) {
        console.log(`    Suggested: ${result.shareOffer.suggestedContent.substring(0, 100)}...`);
      }
      if (result.shareOffer.sharedContent) {
        console.log(`    Shared: ${result.shareOffer.sharedContent.substring(0, 100)}...`);
      }
    }
    console.log('---');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
