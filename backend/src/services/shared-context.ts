/**
 * Shared Content Context Service
 *
 * Fetches and formats information about what has been shared in a session
 * so the AI has full awareness of the shared content history.
 */

import prisma from '../lib/prisma';
import { EmpathyStatus, SharedContentDeliveryStatus } from '@prisma/client';

/**
 * Shared content item for formatting
 */
interface SharedContentItem {
  timestamp: Date;
  type: 'empathy_statement' | 'additional_context' | 'partner_perspective';
  content: string;
  sharedBy: 'user' | 'partner';
}

/**
 * Get formatted shared content context for a user in a session.
 * This includes:
 * - EmpathyAttempt with status REVEALED (shared empathy statements)
 * - ReconcilerShareOffer with deliveryStatus DELIVERED (shared context)
 * - Messages with role SHARED_CONTEXT or EMPATHY_STATEMENT
 * - ConsentedContent with consentActive true
 *
 * @param sessionId - The session ID
 * @param userId - The current user's ID (to determine perspective)
 * @returns Formatted string for injection into AI prompts, or null if no content
 */
export async function getSharedContentContext(
  sessionId: string,
  userId: string
): Promise<string | null> {
  const sharedItems: SharedContentItem[] = [];

  // 1. Get EmpathyAttempts that have been REVEALED
  const empathyAttempts = await prisma.empathyAttempt.findMany({
    where: {
      sessionId,
      status: EmpathyStatus.REVEALED,
    },
    select: {
      content: true,
      revealedAt: true,
      sourceUserId: true,
    },
    orderBy: { revealedAt: 'asc' },
  });

  for (const attempt of empathyAttempts) {
    if (attempt.revealedAt) {
      sharedItems.push({
        timestamp: attempt.revealedAt,
        type: 'empathy_statement',
        content: attempt.content,
        sharedBy: attempt.sourceUserId === userId ? 'user' : 'partner',
      });
    }
  }

  // 2. Get ReconcilerShareOffers that have been DELIVERED
  const shareOffers = await prisma.reconcilerShareOffer.findMany({
    where: {
      result: { sessionId },
      deliveryStatus: SharedContentDeliveryStatus.DELIVERED,
      sharedContent: { not: null },
    },
    select: {
      sharedContent: true,
      sharedAt: true,
      userId: true,
    },
    orderBy: { sharedAt: 'asc' },
  });

  for (const offer of shareOffers) {
    if (offer.sharedAt && offer.sharedContent) {
      sharedItems.push({
        timestamp: offer.sharedAt,
        type: 'additional_context',
        content: offer.sharedContent,
        sharedBy: offer.userId === userId ? 'user' : 'partner',
      });
    }
  }

  // 3. Get Messages with special sharing roles
  const sharedMessages = await prisma.message.findMany({
    where: {
      sessionId,
      role: { in: ['EMPATHY_STATEMENT', 'SHARED_CONTEXT'] },
    },
    select: {
      content: true,
      timestamp: true,
      role: true,
      senderId: true,
    },
    orderBy: { timestamp: 'asc' },
  });

  for (const msg of sharedMessages) {
    sharedItems.push({
      timestamp: msg.timestamp,
      type: msg.role === 'EMPATHY_STATEMENT' ? 'empathy_statement' : 'additional_context',
      content: msg.content,
      sharedBy: msg.senderId === userId ? 'user' : 'partner',
    });
  }

  // 4. Get ConsentedContent that is active
  // First need to find SharedVessel for the session
  const sharedVessels = await prisma.sharedVessel.findMany({
    where: { sessionId },
    select: { id: true },
  });

  if (sharedVessels.length > 0) {
    const consentedContent = await prisma.consentedContent.findMany({
      where: {
        sharedVesselId: { in: sharedVessels.map((v) => v.id) },
        consentActive: true,
      },
      select: {
        transformedContent: true,
        consentedAt: true,
        sourceUserId: true,
      },
      orderBy: { consentedAt: 'asc' },
    });

    for (const content of consentedContent) {
      sharedItems.push({
        timestamp: content.consentedAt,
        type: 'partner_perspective',
        content: content.transformedContent,
        sharedBy: content.sourceUserId === userId ? 'user' : 'partner',
      });
    }
  }

  // If no shared content, return null
  if (sharedItems.length === 0) {
    return null;
  }

  // Sort all items by timestamp
  sharedItems.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Format as prompt section
  const lines: string[] = ['## What has been shared in this conversation:'];

  for (const item of sharedItems) {
    const timeStr = item.timestamp.toISOString();
    const who = item.sharedBy === 'user' ? 'You' : 'Your partner';

    switch (item.type) {
      case 'empathy_statement':
        lines.push(`- [${timeStr}] ${who} shared an empathy statement: "${item.content}"`);
        break;
      case 'additional_context':
        lines.push(`- [${timeStr}] ${who} shared additional context: "${item.content}"`);
        break;
      case 'partner_perspective':
        lines.push(`- [${timeStr}] ${who} shared their perspective: "${item.content}"`);
        break;
    }
  }

  return lines.join('\n');
}
