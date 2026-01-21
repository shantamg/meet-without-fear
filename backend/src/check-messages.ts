import { prisma } from './lib/prisma';

async function main() {
  const sessionId = 'cmkn5p7oz000dpxbwb6ns8mws';

  // Get all messages for this session
  const messages = await prisma.message.findMany({
    where: { sessionId },
    orderBy: { timestamp: 'asc' },
  });

  console.log('=== ALL MESSAGES FOR SESSION ===');
  console.log('Total:', messages.length, 'messages\n');

  for (const msg of messages) {
    console.log('[' + msg.timestamp.toISOString() + '] ' + msg.role + ' (' + msg.id + ')');
    const contentLen = msg.content?.length || 0;
    const preview = msg.content?.substring(0, 200) || '';
    console.log('Content (' + contentLen + ' chars): ' + preview + (contentLen > 200 ? '...' : ''));
    console.log('Stage:', msg.stage);
    console.log('---');
  }

  // Check session state with invitations
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      invitations: true,
    }
  });

  console.log('\n=== SESSION STATE ===');
  console.log('Session status:', session?.status);
  if (session?.invitations && session.invitations.length > 0) {
    const inv = session.invitations[0];
    console.log('Invitation confirmed:', inv.messageConfirmed);
    console.log('Invitation confirmedAt:', inv.messageConfirmedAt);
    console.log('Invitation message:', inv.invitationMessage?.substring(0, 100));
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
