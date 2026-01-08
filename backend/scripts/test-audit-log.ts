
import dotenv from 'dotenv';
import path from 'path';

// Load env before imports
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { auditLog } from '../src/services/audit-logger';
import { prisma } from '../src/lib/prisma';

async function test() {
  console.log('Testing auditLog...');

  const sessionId = 'test-session-' + Date.now();
  const turnId = sessionId + '-1';

  try {
    // Mimic the exact USER log payload
    await auditLog('USER', 'Test User Message', {
      turnId,
      sessionId,
      userId: 'test-user',
      userName: 'Test User',
      stage: 1,
      turnCount: 1,
      userMessage: 'This is a test message to verify DB persistence',
      messageLength: 45,
      isFirstTurnInSession: true,
    });

    console.log('auditLog called. Waiting for async operations...');

    // Give time for Ably/DB promises to settle (fire-and-forget in auditLog)
    await new Promise(r => setTimeout(r, 2000));

    // Check DB
    const log = await prisma.auditLog.findFirst({
      where: { sessionId },
    });

    if (log) {
      console.log('SUCCESS: Log persisted to DB:', log);
      // Check if turnId is preserved
      if (log.turnId === turnId) {
        console.log('SUCCESS: turnId preserved');
      } else {
        console.error('FAILURE: turnId missing or mismatch', log.turnId);
      }
    } else {
      console.error('FAILURE: Log NOT found in DB');
    }

  } catch (error) {
    console.error('CRITICAL ERROR:', error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
