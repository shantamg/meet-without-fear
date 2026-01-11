/**
 * Session Analysis Script
 *
 * Usage: npx ts-node src/scripts/analyze-session.ts <sessionId>
 *
 * This script provides a comprehensive view of a session's state and timeline,
 * useful for debugging flow issues.
 */

import { prisma } from '../lib/prisma';

const sessionId = process.argv[2];

if (!sessionId) {
  console.error('Usage: npx ts-node src/scripts/analyze-session.ts <sessionId>');
  process.exit(1);
}

interface TimelineEvent {
  timestamp: Date;
  type: string;
  actor?: string;
  details: string;
  data?: Record<string, unknown>;
}

async function analyzeSession() {
  console.log('='.repeat(80));
  console.log(`SESSION ANALYSIS: ${sessionId}`);
  console.log('='.repeat(80));

  // Get session with relationships
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      relationship: {
        include: {
          members: {
            include: {
              user: { select: { id: true, name: true, firstName: true } }
            }
          }
        }
      }
    }
  });

  if (!session) {
    console.error(`Session ${sessionId} not found`);
    process.exit(1);
  }

  // Build user lookup
  const users: Record<string, string> = {};
  for (const member of session.relationship.members) {
    users[member.userId] = member.user.firstName || member.user.name || member.userId;
  }

  console.log('\n## PARTICIPANTS');
  console.log('-'.repeat(40));
  for (const [id, name] of Object.entries(users)) {
    console.log(`  ${name}: ${id}`);
  }

  console.log('\n## SESSION STATUS');
  console.log('-'.repeat(40));
  console.log(`  Status: ${session.status}`);
  console.log(`  Created: ${session.createdAt.toISOString()}`);

  // Get stage progress for each user
  console.log('\n## STAGE PROGRESS');
  console.log('-'.repeat(40));
  const stageProgress = await prisma.stageProgress.findMany({
    where: { sessionId },
    orderBy: [{ userId: 'asc' }, { stage: 'asc' }]
  });

  for (const [userId, name] of Object.entries(users)) {
    console.log(`\n  ${name}:`);
    const userProgress = stageProgress.filter(p => p.userId === userId);
    for (const p of userProgress) {
      console.log(`    Stage ${p.stage}: ${p.status} (started: ${p.startedAt?.toISOString() || 'N/A'})`);
      if (p.gatesSatisfied) {
        console.log(`      Gates: ${JSON.stringify(p.gatesSatisfied)}`);
      }
    }
  }

  // Get empathy drafts
  console.log('\n## EMPATHY DRAFTS');
  console.log('-'.repeat(40));
  const drafts = await prisma.empathyDraft.findMany({
    where: { sessionId },
    include: { user: { select: { name: true, firstName: true } } }
  });

  for (const draft of drafts) {
    const name = draft.user?.firstName || draft.user?.name || 'Unknown';
    console.log(`\n  ${name}'s draft:`);
    console.log(`    Ready to Share: ${draft.readyToShare}`);
    console.log(`    Version: ${draft.version}`);
    console.log(`    Content: "${draft.content?.substring(0, 80)}..."`);
    console.log(`    Updated: ${draft.updatedAt.toISOString()}`);
  }

  // Get empathy attempts
  console.log('\n## EMPATHY ATTEMPTS');
  console.log('-'.repeat(40));
  const attempts = await prisma.empathyAttempt.findMany({
    where: { sessionId },
    include: {
      sourceUser: { select: { name: true, firstName: true } },
      validations: {
        include: { user: { select: { name: true, firstName: true } } }
      }
    },
    orderBy: { sharedAt: 'asc' }
  });

  for (const attempt of attempts) {
    const guesserName = attempt.sourceUser?.firstName || attempt.sourceUser?.name || 'Unknown';
    console.log(`\n  ${guesserName}'s empathy attempt:`);
    console.log(`    ID: ${attempt.id}`);
    console.log(`    Status: ${attempt.status}`);
    console.log(`    Delivery: ${attempt.deliveryStatus}`);
    console.log(`    Content: "${attempt.content.substring(0, 80)}..."`);
    console.log(`    Shared At: ${attempt.sharedAt.toISOString()}`);
    console.log(`    Revealed At: ${attempt.revealedAt?.toISOString() || 'N/A'}`);
    console.log(`    Delivered At: ${attempt.deliveredAt?.toISOString() || 'N/A'}`);
    console.log(`    Seen At: ${attempt.seenAt?.toISOString() || 'N/A'}`);

    if (attempt.validations.length > 0) {
      console.log(`    Validations:`);
      for (const v of attempt.validations) {
        const validatorName = v.user?.firstName || v.user?.name || 'Unknown';
        console.log(`      - ${validatorName}: validated=${v.validated} at ${v.validatedAt?.toISOString()}`);
        if (v.feedback) {
          console.log(`        Feedback: "${v.feedback.substring(0, 50)}..."`);
        }
      }
    }
  }

  // Get reconciler results
  console.log('\n## RECONCILER RESULTS');
  console.log('-'.repeat(40));
  const reconcilerResults = await prisma.reconcilerResult.findMany({
    where: { sessionId },
    include: { shareOffer: true },
    orderBy: { createdAt: 'asc' }
  });

  for (const result of reconcilerResults) {
    console.log(`\n  [${result.guesserName} → ${result.subjectName}]`);
    console.log(`    ID: ${result.id}`);
    console.log(`    Created: ${result.createdAt.toISOString()}`);
    console.log(`    Alignment: ${result.alignmentScore}%`);
    console.log(`    Gap Severity: ${result.gapSeverity}`);
    console.log(`    Recommended Action: ${result.recommendedAction}`);
    console.log(`    Most Important Gap: ${result.mostImportantGap?.substring(0, 80) || 'N/A'}`);
    console.log(`    suggestedShareContent: ${result.suggestedShareContent?.substring(0, 50) || 'NONE'}`);
    console.log(`    suggestedShareReason: ${result.suggestedShareReason?.substring(0, 50) || 'NONE'}`);

    if (result.shareOffer) {
      console.log(`    Share Offer:`);
      console.log(`      ID: ${result.shareOffer.id}`);
      console.log(`      Status: ${result.shareOffer.status}`);
      console.log(`      Created: ${result.shareOffer.createdAt.toISOString()}`);
      console.log(`      suggestedContent: ${result.shareOffer.suggestedContent?.substring(0, 50) || 'NONE'}`);
      console.log(`      offerMessage: ${result.shareOffer.offerMessage?.substring(0, 50) || 'NONE'}`);
      console.log(`      Declined At: ${result.shareOffer.declinedAt?.toISOString() || 'N/A'}`);
      console.log(`      Shared At: ${result.shareOffer.sharedAt?.toISOString() || 'N/A'}`);
      console.log(`      Delivery: ${result.shareOffer.deliveryStatus}`);
    }
  }

  // Build timeline
  console.log('\n## TIMELINE');
  console.log('-'.repeat(40));

  const timeline: TimelineEvent[] = [];

  // Add session creation
  timeline.push({
    timestamp: session.createdAt,
    type: 'SESSION',
    details: 'Session created'
  });

  // Add stage progress events
  for (const p of stageProgress) {
    if (p.startedAt) {
      timeline.push({
        timestamp: p.startedAt,
        type: 'STAGE',
        actor: users[p.userId],
        details: `Started Stage ${p.stage}`
      });
    }
  }

  // Add empathy events
  for (const attempt of attempts) {
    const name = attempt.sourceUser?.firstName || attempt.sourceUser?.name || 'Unknown';

    timeline.push({
      timestamp: attempt.sharedAt,
      type: 'EMPATHY',
      actor: name,
      details: `Shared empathy (status: HELD)`
    });

    if (attempt.revealedAt) {
      timeline.push({
        timestamp: attempt.revealedAt,
        type: 'EMPATHY',
        actor: name,
        details: `Empathy revealed (status: ${attempt.status})`
      });
    }

    for (const v of attempt.validations) {
      if (v.validatedAt) {
        const validatorName = v.user?.firstName || v.user?.name || 'Unknown';
        timeline.push({
          timestamp: v.validatedAt,
          type: 'VALIDATION',
          actor: validatorName,
          details: `Validated ${name}'s empathy: ${v.validated ? 'ACCURATE' : 'INACCURATE'}`
        });
      }
    }
  }

  // Add reconciler events
  for (const result of reconcilerResults) {
    timeline.push({
      timestamp: result.createdAt,
      type: 'RECONCILER',
      details: `Analyzed ${result.guesserName} → ${result.subjectName}: ${result.recommendedAction} (${result.alignmentScore}%)`
    });

    if (result.shareOffer) {
      timeline.push({
        timestamp: result.shareOffer.createdAt,
        type: 'SHARE_OFFER',
        actor: result.subjectName,
        details: `Share offer created (status: ${result.shareOffer.status})`
      });

      if (result.shareOffer.declinedAt) {
        timeline.push({
          timestamp: result.shareOffer.declinedAt,
          type: 'SHARE_OFFER',
          actor: result.subjectName,
          details: 'Share offer DECLINED'
        });
      }

      if (result.shareOffer.sharedAt) {
        timeline.push({
          timestamp: result.shareOffer.sharedAt,
          type: 'SHARE_OFFER',
          actor: result.subjectName,
          details: 'Context shared with partner'
        });
      }
    }
  }

  // Add key messages (feel heard, etc.)
  const keyMessages = await prisma.message.findMany({
    where: {
      sessionId,
      OR: [
        { role: 'AI' },
        { content: { contains: 'feel heard' } },
        { content: { contains: 'SHARED_CONTEXT' } }
      ]
    },
    include: { sender: { select: { name: true, firstName: true } } },
    orderBy: { timestamp: 'asc' },
    take: 50
  });

  for (const msg of keyMessages) {
    if (msg.role === 'AI' || msg.content.includes('[')) {
      const actor = msg.sender?.firstName || msg.sender?.name || 'AI';
      timeline.push({
        timestamp: msg.timestamp,
        type: 'MESSAGE',
        actor,
        details: msg.content.substring(0, 100)
      });
    }
  }

  // Sort and print timeline
  timeline.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  for (const event of timeline) {
    const time = event.timestamp.toISOString().replace('T', ' ').substring(0, 23);
    const actor = event.actor ? `[${event.actor}]` : '';
    console.log(`  ${time} ${event.type.padEnd(12)} ${actor.padEnd(15)} ${event.details}`);
  }

  // Print summary of issues
  console.log('\n## POTENTIAL ISSUES');
  console.log('-'.repeat(40));

  let issues = 0;

  for (const result of reconcilerResults) {
    if (result.recommendedAction === 'OFFER_SHARING') {
      if (!result.suggestedShareContent) {
        console.log(`  [!] ${result.guesserName} → ${result.subjectName}: OFFER_SHARING but no suggestedShareContent`);
        issues++;
      }
      if (result.shareOffer && !result.shareOffer.suggestedContent && !result.shareOffer.offerMessage) {
        console.log(`  [!] ${result.guesserName} → ${result.subjectName}: Share offer has no content`);
        issues++;
      }
    }

    if (result.shareOffer) {
      // Check if share offer was declined without being offered first
      if (result.shareOffer.status === 'DECLINED' && result.shareOffer.declinedAt) {
        const createToDeclineMs = result.shareOffer.declinedAt.getTime() - result.shareOffer.createdAt.getTime();
        if (createToDeclineMs > 60000) { // More than 1 minute
          console.log(`  [?] ${result.subjectName}'s share offer: Created at ${result.shareOffer.createdAt.toISOString()}, declined at ${result.shareOffer.declinedAt.toISOString()} (${Math.round(createToDeclineMs/1000)}s gap)`);
          issues++;
        }
      }
    }
  }

  for (const attempt of attempts) {
    if (attempt.status === 'REVEALED' && !attempt.revealedAt) {
      const name = attempt.sourceUser?.firstName || attempt.sourceUser?.name || 'Unknown';
      console.log(`  [!] ${name}'s empathy: Status is REVEALED but no revealedAt timestamp`);
      issues++;
    }
  }

  if (issues === 0) {
    console.log('  No obvious issues detected');
  }

  console.log('\n' + '='.repeat(80));
}

analyzeSession()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
