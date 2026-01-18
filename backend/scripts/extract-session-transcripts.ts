/**
 * Session Transcript Extractor
 *
 * Extracts formatted transcripts for each user's chat with the AI,
 * including special elements like 'compact signed', 'felt heard',
 * empathy statements, shared context, etc.
 *
 * Usage: npx tsx scripts/extract-session-transcripts.ts <sessionId>
 *
 * Output: Creates formatted transcript files in ./transcripts/
 */

import { prisma } from '../src/lib/prisma';
import * as fs from 'fs';
import * as path from 'path';

const sessionId = process.argv[2];

if (!sessionId) {
  console.error('Usage: npx tsx scripts/extract-session-transcripts.ts <sessionId>');
  process.exit(1);
}

interface TranscriptEvent {
  timestamp: Date;
  type: 'message' | 'system' | 'milestone' | 'empathy' | 'shared_context' | 'validation';
  role?: string;
  content: string;
  metadata?: Record<string, unknown>;
}

async function extractTranscripts() {
  console.log(`\n=== Extracting transcripts for session: ${sessionId} ===\n`);

  // Get session with all related data
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      relationship: {
        include: {
          members: {
            include: {
              user: { select: { id: true, name: true, firstName: true, email: true } }
            }
          }
        }
      },
      stageProgress: {
        orderBy: [{ userId: 'asc' }, { stage: 'asc' }]
      },
      userVessels: true,
      invitations: true,
      empathyDrafts: true,
      empathyAttempts: {
        include: {
          validations: true
        },
        orderBy: { sharedAt: 'asc' }
      }
    }
  });

  if (!session) {
    console.error(`Session ${sessionId} not found`);
    process.exit(1);
  }

  // Get reconciler results
  const reconcilerResults = await prisma.reconcilerResult.findMany({
    where: { sessionId },
    include: { shareOffer: true },
    orderBy: { createdAt: 'asc' }
  });

  // Get all messages
  const messages = await prisma.message.findMany({
    where: { sessionId },
    orderBy: { timestamp: 'asc' },
    include: {
      sender: { select: { id: true, name: true, firstName: true } }
    }
  });

  // Build user lookup
  const users: Record<string, { id: string; name: string; email: string }> = {};
  for (const member of session.relationship.members) {
    const user = member.user;
    users[user.id] = {
      id: user.id,
      name: user.firstName || user.name || 'Unknown',
      email: user.email
    };
  }

  console.log('Participants:');
  for (const [id, user] of Object.entries(users)) {
    console.log(`  ${user.name} (${user.email})`);
  }
  console.log(`\nTotal messages: ${messages.length}`);
  console.log(`Session status: ${session.status}`);
  console.log(`Created: ${session.createdAt.toISOString()}`);

  // Create output directory
  const outputDir = path.join(__dirname, 'transcripts');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Extract transcript for each user
  for (const [userId, user] of Object.entries(users)) {
    const transcript = await buildUserTranscript(
      sessionId,
      userId,
      user.name,
      users,
      session,
      messages,
      reconcilerResults
    );

    const filename = `transcript_${user.name.replace(/\s+/g, '_')}_${sessionId.slice(0, 8)}.md`;
    const filepath = path.join(outputDir, filename);
    fs.writeFileSync(filepath, transcript);
    console.log(`\n✓ Saved: ${filepath}`);
  }

  await prisma.$disconnect();
}

async function buildUserTranscript(
  sessionId: string,
  userId: string,
  userName: string,
  users: Record<string, { id: string; name: string; email: string }>,
  session: any,
  allMessages: any[],
  reconcilerResults: any[]
): Promise<string> {
  const events: TranscriptEvent[] = [];

  // Get partner info
  const partnerId = Object.keys(users).find(id => id !== userId);
  const partnerName = partnerId ? users[partnerId].name : 'Partner';

  // 1. Session created
  events.push({
    timestamp: session.createdAt,
    type: 'milestone',
    content: '📋 SESSION CREATED'
  });

  // 2. Check for invitation
  const invitation = session.invitations[0];
  if (invitation) {
    if (invitation.invitedById === userId && invitation.messageConfirmedAt) {
      events.push({
        timestamp: invitation.messageConfirmedAt,
        type: 'milestone',
        content: `📨 INVITATION SENT to ${partnerName}`,
        metadata: { message: invitation.invitationMessage }
      });
    }
    if (invitation.invitedById !== userId && invitation.acceptedAt) {
      events.push({
        timestamp: invitation.acceptedAt,
        type: 'milestone',
        content: `✅ JOINED SESSION (invited by ${invitation.invitedById === partnerId ? partnerName : 'partner'})`
      });
    }
  }

  // 3. Stage progress milestones
  const userProgress = session.stageProgress.filter((sp: any) => sp.userId === userId);
  for (const progress of userProgress) {
    if (progress.startedAt) {
      events.push({
        timestamp: progress.startedAt,
        type: 'milestone',
        content: `🎯 STAGE ${progress.stage} STARTED`
      });
    }
    if (progress.completedAt) {
      events.push({
        timestamp: progress.completedAt,
        type: 'milestone',
        content: `✅ STAGE ${progress.stage} COMPLETED`
      });
    }
    // Check for gates satisfied
    if (progress.gatesSatisfied && typeof progress.gatesSatisfied === 'object') {
      const gates = progress.gatesSatisfied as Record<string, unknown>;
      if (gates.compactSigned) {
        events.push({
          timestamp: progress.startedAt || session.createdAt,
          type: 'milestone',
          content: '📝 COMPACT SIGNED'
        });
      }
      if (gates.feltHeard) {
        events.push({
          timestamp: progress.completedAt || session.createdAt,
          type: 'milestone',
          content: '💚 FELT HEARD CONFIRMED'
        });
      }
    }
  }

  // 4. Messages (filtered to this user's conversation)
  const userMessages = allMessages.filter((msg: any) =>
    msg.senderId === userId ||
    (msg.role === 'AI' && msg.forUserId === userId) ||
    (msg.role === 'EMPATHY_STATEMENT' && msg.forUserId === userId) ||
    (msg.role === 'EMPATHY_REVEAL_INTRO' && msg.forUserId === userId) ||
    (msg.role === 'SHARED_CONTEXT' && msg.forUserId === userId) ||
    (msg.role === 'SHARE_SUGGESTION' && msg.forUserId === userId) ||
    (msg.role === 'EMPATHY_VALIDATION_PROMPT' && msg.forUserId === userId)
  );

  for (const msg of userMessages) {
    let eventType: TranscriptEvent['type'] = 'message';
    let roleLabel = msg.role;

    switch (msg.role) {
      case 'USER':
        roleLabel = userName;
        break;
      case 'AI':
        roleLabel = 'AI';
        break;
      case 'EMPATHY_STATEMENT':
        eventType = 'empathy';
        roleLabel = `💜 ${partnerName}'S EMPATHY STATEMENT`;
        break;
      case 'EMPATHY_REVEAL_INTRO':
        eventType = 'empathy';
        roleLabel = '💜 AI (REVEALING EMPATHY)';
        break;
      case 'SHARED_CONTEXT':
        eventType = 'shared_context';
        roleLabel = `📤 ${partnerName} SHARED WITH YOU`;
        break;
      case 'SHARE_SUGGESTION':
        eventType = 'shared_context';
        roleLabel = '📝 AI (SHARE SUGGESTION)';
        break;
      case 'EMPATHY_VALIDATION_PROMPT':
        eventType = 'validation';
        roleLabel = '❓ AI (VALIDATION PROMPT)';
        break;
      case 'SYSTEM':
        eventType = 'system';
        roleLabel = '⚙️ SYSTEM';
        break;
    }

    events.push({
      timestamp: msg.timestamp,
      type: eventType,
      role: roleLabel,
      content: msg.content,
      metadata: { stage: msg.stage }
    });
  }

  // 5. Empathy attempts by this user
  const userEmpathyAttempts = session.empathyAttempts.filter((ea: any) => ea.sourceUserId === userId);
  for (const attempt of userEmpathyAttempts) {
    events.push({
      timestamp: attempt.sharedAt,
      type: 'empathy',
      content: `📤 YOUR EMPATHY STATEMENT SUBMITTED:\n"${attempt.content}"`,
      metadata: { status: attempt.status, deliveryStatus: attempt.deliveryStatus }
    });

    if (attempt.revealedAt) {
      events.push({
        timestamp: attempt.revealedAt,
        type: 'empathy',
        content: `👁️ YOUR EMPATHY REVEALED TO ${partnerName.toUpperCase()}`
      });
    }

    // Validations received
    for (const validation of attempt.validations) {
      if (validation.validatedAt) {
        events.push({
          timestamp: validation.validatedAt,
          type: 'validation',
          content: validation.validated
            ? `✅ ${partnerName.toUpperCase()} VALIDATED YOUR EMPATHY${validation.feedback ? `: "${validation.feedback}"` : ''}`
            : `⚠️ ${partnerName.toUpperCase()} INDICATED YOUR EMPATHY NEEDS WORK${validation.feedback ? `: "${validation.feedback}"` : ''}`
        });
      }
    }
  }

  // 6. Empathy attempts FOR this user (from partner)
  const partnerEmpathyAttempts = session.empathyAttempts.filter((ea: any) => ea.sourceUserId === partnerId);
  for (const attempt of partnerEmpathyAttempts) {
    if (attempt.revealedAt) {
      events.push({
        timestamp: attempt.revealedAt,
        type: 'empathy',
        content: `💜 RECEIVED ${partnerName.toUpperCase()}'S EMPATHY STATEMENT:\n"${attempt.content}"`
      });
    }

    // Your validations of partner's empathy
    const yourValidation = attempt.validations.find((v: any) => v.userId === userId);
    if (yourValidation?.validatedAt) {
      events.push({
        timestamp: yourValidation.validatedAt,
        type: 'validation',
        content: yourValidation.validated
          ? `✅ YOU VALIDATED ${partnerName.toUpperCase()}'S UNDERSTANDING${yourValidation.feedback ? `: "${yourValidation.feedback}"` : ''}`
          : `⚠️ YOU INDICATED ${partnerName.toUpperCase()}'S UNDERSTANDING NEEDS WORK${yourValidation.feedback ? `: "${yourValidation.feedback}"` : ''}`
      });
    }
  }

  // 7. Reconciler results (share offers)
  for (const result of reconcilerResults) {
    if (result.subjectId === userId && result.shareOffer) {
      const offer = result.shareOffer;
      if (offer.suggestedContent || offer.offerMessage) {
        events.push({
          timestamp: offer.createdAt,
          type: 'shared_context',
          content: `💡 SHARE SUGGESTION (to help ${partnerName} understand you better):\n${offer.suggestedContent || offer.offerMessage}`
        });
      }
      if (offer.sharedAt && offer.sharedContent) {
        events.push({
          timestamp: offer.sharedAt,
          type: 'shared_context',
          content: `📤 YOU SHARED WITH ${partnerName.toUpperCase()}:\n"${offer.sharedContent}"`
        });
      }
      if (offer.declinedAt) {
        events.push({
          timestamp: offer.declinedAt,
          type: 'system',
          content: '⏭️ YOU DECLINED TO SHARE ADDITIONAL CONTEXT'
        });
      }
    }

    if (result.guesserId === userId) {
      // You're the guesser - show reconciler summary
      events.push({
        timestamp: result.createdAt,
        type: 'system',
        content: `📊 RECONCILER ANALYSIS (Your empathy vs ${partnerName}'s actual feelings):
  Alignment: ${result.alignmentScore}%
  Gap Severity: ${result.gapSeverity}
  Action: ${result.recommendedAction}`
      });
    }
  }

  // Sort events by timestamp
  events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Format as markdown
  return formatTranscriptMarkdown(userName, partnerName, session, events);
}

function formatTranscriptMarkdown(
  userName: string,
  partnerName: string,
  session: any,
  events: TranscriptEvent[]
): string {
  let md = `# Chat Transcript: ${userName}\n\n`;
  md += `**Session ID:** ${session.id}\n`;
  md += `**Partner:** ${partnerName}\n`;
  md += `**Status:** ${session.status}\n`;
  md += `**Created:** ${session.createdAt.toISOString()}\n`;
  md += `**Resolved:** ${session.resolvedAt?.toISOString() || 'Not yet'}\n\n`;
  md += `---\n\n`;

  let currentStage = 0;

  for (const event of events) {
    // Check for stage changes in metadata
    if (event.metadata?.stage && event.metadata.stage !== currentStage) {
      currentStage = event.metadata.stage as number;
      md += `\n## Stage ${currentStage}\n\n`;
    }

    const time = event.timestamp.toISOString().replace('T', ' ').slice(0, 19);

    switch (event.type) {
      case 'milestone':
        md += `### ${event.content}\n`;
        md += `*${time}*\n\n`;
        if (event.metadata?.message) {
          md += `> "${event.metadata.message}"\n\n`;
        }
        break;

      case 'message':
        md += `**[${time}] ${event.role}:**\n`;
        md += `${event.content}\n\n`;
        break;

      case 'empathy':
        md += `---\n`;
        md += `**${event.content}**\n`;
        md += `*${time}*\n`;
        md += `---\n\n`;
        break;

      case 'shared_context':
        md += `---\n`;
        md += `${event.content}\n`;
        md += `*${time}*\n`;
        md += `---\n\n`;
        break;

      case 'validation':
        md += `**${event.content}**\n`;
        md += `*${time}*\n\n`;
        break;

      case 'system':
        md += `*${event.content}*\n`;
        md += `*${time}*\n\n`;
        break;
    }
  }

  return md;
}

extractTranscripts().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
