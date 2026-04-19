/**
 * Tests for the Stage 3 safety-net extraction helper in `services/needs.ts`.
 *
 * Covers the content-aware pacing counterpart to the stage-prompt changes:
 * after 6 stage-3 turns with no extracted needs, we run extraction instead
 * of just alerting a stalled state.
 *
 * Scope note: these tests verify the *control flow* of the safety-net —
 * short-circuits, lock behavior, error containment — without trying to
 * mock `extractNeedsFromConversation` itself. Internal module bindings
 * bypass `jest.mock` on the same module, so we instead starve the real
 * extraction path at the prisma boundary (empty messages → zero needs).
 */

import { prisma } from '../../lib/prisma';
import {
  runStage3SafetyNetExtraction,
  isExtractionRunning,
  acquireExtractionLock,
  releaseExtractionLock,
} from '../needs';
import * as realtime from '../realtime';

jest.mock('../../lib/prisma');
jest.mock('../realtime');

const SESSION_ID = 'sess_1';
const USER_ID = 'user_1';
const VESSEL_ID = 'vessel_1';

beforeEach(() => {
  jest.clearAllMocks();
  releaseExtractionLock(SESSION_ID, USER_ID);
  // Default: no messages in history → extraction returns [] without AI call
  (prisma.message.findMany as jest.Mock).mockResolvedValue([]);
});

describe('runStage3SafetyNetExtraction', () => {
  it('no-ops when needs have already been extracted', async () => {
    (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue({ id: VESSEL_ID });
    (prisma.identifiedNeed.count as jest.Mock).mockResolvedValue(3);

    await runStage3SafetyNetExtraction(SESSION_ID, USER_ID);

    expect(prisma.message.findMany).not.toHaveBeenCalled();
    expect(realtime.publishSessionEvent).not.toHaveBeenCalled();
  });

  it('no-ops when no vessel exists yet for the user/session', async () => {
    (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue(null);

    await runStage3SafetyNetExtraction(SESSION_ID, USER_ID);

    expect(prisma.identifiedNeed.count).not.toHaveBeenCalled();
    expect(prisma.message.findMany).not.toHaveBeenCalled();
  });

  it('no-ops when another extraction is already running for the same (session, user)', async () => {
    acquireExtractionLock(SESSION_ID, USER_ID);

    await runStage3SafetyNetExtraction(SESSION_ID, USER_ID);

    expect(prisma.userVessel.findUnique).not.toHaveBeenCalled();
    expect(prisma.message.findMany).not.toHaveBeenCalled();

    releaseExtractionLock(SESSION_ID, USER_ID);
  });

  it('enters the extraction path when vessel exists with zero identified needs', async () => {
    (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue({ id: VESSEL_ID });
    (prisma.identifiedNeed.count as jest.Mock).mockResolvedValue(0);

    await runStage3SafetyNetExtraction(SESSION_ID, USER_ID);

    // Proof we got past the gates and into extraction: it queried stage 1-2 messages.
    expect(prisma.message.findMany).toHaveBeenCalled();
    // Zero messages → zero needs → no event emitted.
    expect(realtime.publishSessionEvent).not.toHaveBeenCalled();
  });

  it('releases the lock when extraction completes', async () => {
    (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue({ id: VESSEL_ID });
    (prisma.identifiedNeed.count as jest.Mock).mockResolvedValue(0);

    await runStage3SafetyNetExtraction(SESSION_ID, USER_ID);

    expect(isExtractionRunning(SESSION_ID, USER_ID)).toBe(false);
  });

  it('swallows errors so the caller (message stream) is not broken', async () => {
    (prisma.userVessel.findUnique as jest.Mock).mockRejectedValue(
      new Error('db down')
    );

    await expect(
      runStage3SafetyNetExtraction(SESSION_ID, USER_ID)
    ).resolves.toBeUndefined();
  });

  it('releases the lock even when extraction throws', async () => {
    (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue({ id: VESSEL_ID });
    (prisma.identifiedNeed.count as jest.Mock).mockResolvedValue(0);
    (prisma.message.findMany as jest.Mock).mockRejectedValue(new Error('db down'));

    await runStage3SafetyNetExtraction(SESSION_ID, USER_ID);

    expect(isExtractionRunning(SESSION_ID, USER_ID)).toBe(false);
  });
});
