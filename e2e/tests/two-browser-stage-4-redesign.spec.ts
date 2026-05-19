/**
 * Redesigned Stage 4 deterministic coverage.
 *
 * These tests intentionally seed Stage 4 data instead of relying on prompt output.
 * They exercise the two-user API contract that the mobile two-browser surfaces use:
 * inventory visibility, selection privacy, closure outcomes, and Tending entries.
 */

import { test, expect, APIRequestContext } from '@playwright/test';
import { cleanupE2EData, getE2EHeaders, SessionBuilder } from '../helpers';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

const users = {
  a: { email: 'stage4-redesign-a@e2e.test', name: 'Alice' },
  b: { email: 'stage4-redesign-b@e2e.test', name: 'Bob' },
};

type SeedStage =
  | 'STAGE4_REDESIGN_INVENTORY'
  | 'STAGE4_REDESIGN_SHARED_SELECTIONS'
  | 'STAGE4_REDESIGN_NO_OVERLAP_SELECTIONS'
  | 'STAGE4_REDESIGN_PARTNER_INACTIVE';

interface SeededSession {
  sessionId: string;
  userAId: string;
  userBId: string;
}

function apiFor(request: APIRequestContext, email: string, userId: string) {
  const headers = getE2EHeaders(email, userId);
  return {
    get: (path: string) => request.get(`${API_BASE_URL}${path}`, { headers }),
    post: (path: string, data?: object) => request.post(`${API_BASE_URL}${path}`, { headers, data }),
  };
}

async function readJson<T>(response: { ok(): boolean; status(): number; text(): Promise<string>; json(): Promise<unknown> }, label: string): Promise<T> {
  if (!response.ok()) {
    throw new Error(`${label} failed: ${response.status()} ${await response.text()}`);
  }
  return await response.json() as T;
}

async function seedSession(request: APIRequestContext, targetStage: SeedStage): Promise<SeededSession> {
  const setup = await new SessionBuilder(API_BASE_URL)
    .userA(users.a.email, users.a.name)
    .userB(users.b.email, users.b.name)
    .startingAt(targetStage)
    .setup(request);

  if (!setup.userB) {
    throw new Error('Redesigned Stage 4 fixtures require two users');
  }

  return {
    sessionId: setup.session.id,
    userAId: setup.userA.id,
    userBId: setup.userB.id,
  };
}

test.describe('Stage 4 redesign: deterministic two-user coverage', () => {
  test.beforeEach(async () => {
    await cleanupE2EData().catch(() => {});
  });

  test('inventory fixture exposes active proposals and hides removed proposals from partner-active inventory', async ({ request }) => {
    const seeded = await seedSession(request, 'STAGE4_REDESIGN_INVENTORY');
    const apiA = apiFor(request, users.a.email, seeded.userAId);

    const state = await readJson<any>(
      await apiA.get(`/api/sessions/${seeded.sessionId}/stage4`),
      'get redesigned Stage 4 inventory'
    );

    const sharedDescriptions = state.data.inventory.sharedProposals.map((proposal: any) => proposal.description);
    const individualDescriptions = state.data.inventory.individualCommitments.map((proposal: any) => proposal.description);

    expect(sharedDescriptions).toContain('Try a Sunday evening planning check-in for the next two weeks');
    expect(sharedDescriptions).toContain('Use a pause phrase when either person starts to shut down');
    expect(sharedDescriptions).not.toContain('Track every chore in a shared spreadsheet every night');
    expect(individualDescriptions).toContain('I will name when I am overloaded before I disappear');
    expect(state.data.inventory.removedProposalCount).toBe(1);
    expect(state.data.coverageAudit.open.map((row: any) => row.label)).toContain('Appreciation');
  });

  test('selection privacy holds while one partner is inactive and shared closure is rejected', async ({ request }) => {
    const seeded = await seedSession(request, 'STAGE4_REDESIGN_PARTNER_INACTIVE');
    const apiA = apiFor(request, users.a.email, seeded.userAId);
    const apiB = apiFor(request, users.b.email, seeded.userBId);

    const stateA = await readJson<any>(
      await apiA.get(`/api/sessions/${seeded.sessionId}/stage4`),
      'get one-sided Stage 4 state for user A'
    );
    const stateB = await readJson<any>(
      await apiB.get(`/api/sessions/${seeded.sessionId}/stage4`),
      'get one-sided Stage 4 state for user B'
    );

    expect(stateA.data.partnerSelectionStatus).toBe('NOT_STARTED');
    expect(stateB.data.partnerSelectionStatus).toBe('SUBMITTED');
    for (const proposal of stateA.data.inventory.sharedProposals) {
      expect(proposal.partnerDecisionVisible).toBeUndefined();
    }
    for (const proposal of stateB.data.inventory.sharedProposals) {
      expect(proposal.partnerDecisionVisible).toBeUndefined();
    }

    const closeResponse = await apiA.post(`/api/sessions/${seeded.sessionId}/stage4/close`, {
      kind: 'SHARED_AGREEMENT',
    });
    expect(closeResponse.status()).toBe(400);
    const closeData = await closeResponse.json() as any;
    expect(closeData.error?.message ?? closeData.message).toMatch(/Both partners must submit selections/i);
  });

  test('mutual shared selection closes with scheduled Tending', async ({ request }) => {
    const seeded = await seedSession(request, 'STAGE4_REDESIGN_SHARED_SELECTIONS');
    const apiA = apiFor(request, users.a.email, seeded.userAId);

    const beforeClose = await readJson<any>(
      await apiA.get(`/api/sessions/${seeded.sessionId}/stage4`),
      'get mutual Stage 4 state'
    );
    const sharedProposal = beforeClose.data.inventory.sharedProposals.find((proposal: any) =>
      proposal.description.includes('Sunday evening planning check-in')
    );
    expect(sharedProposal).toBeTruthy();
    expect(sharedProposal.partnerDecisionVisible).toBe('WILLING');

    const followUpDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const closeData = await readJson<any>(
      await apiA.post(`/api/sessions/${seeded.sessionId}/stage4/close`, {
        kind: 'SHARED_AGREEMENT',
        followUpDatesByProposalId: { [sharedProposal.id]: followUpDate },
      }),
      'close shared-agreement Stage 4'
    );

    expect(closeData.data.closed).toBe(true);
    expect(closeData.data.outcome.kind).toBe('SHARED_AGREEMENT');
    expect(closeData.data.outcome.agreements).toHaveLength(1);
    expect(closeData.data.state.tendingPreview.scheduledCount).toBe(2);

    const tendingData = await readJson<any>(
      await apiA.get(`/api/sessions/${seeded.sessionId}/tending`),
      'list scheduled Tending entries'
    );
    expect(tendingData.data.entries).toHaveLength(2);
    const sharedTending = tendingData.data.entries.find((entry: any) =>
      entry.type === 'SCHEDULED_SHARED_AGREEMENT_CHECKIN'
    );
    expect(sharedTending).toBeTruthy();
    expect(sharedTending.status).toBe('SCHEDULED');
    expect(sharedTending.agreementId).toBe(closeData.data.outcome.agreements[0].id);
  });

  test('no shared agreement preserves individual Tending and supports passive re-entry', async ({ request }) => {
    const seeded = await seedSession(request, 'STAGE4_REDESIGN_NO_OVERLAP_SELECTIONS');
    const apiA = apiFor(request, users.a.email, seeded.userAId);

    const closeData = await readJson<any>(
      await apiA.post(`/api/sessions/${seeded.sessionId}/stage4/close`, {
        kind: 'NO_SHARED_AGREEMENT',
        reason: 'NO_OVERLAP',
      }),
      'close no-shared-agreement Stage 4'
    );

    expect(closeData.data.outcome.kind).toBe('NO_SHARED_AGREEMENT');
    expect(closeData.data.outcome.agreements).toHaveLength(0);
    expect(closeData.data.state.tendingPreview.scheduledCount).toBe(1);
    expect(closeData.data.state.tendingPreview.passiveReentryAvailable).toBe(true);

    const initialTending = await readJson<any>(
      await apiA.get(`/api/sessions/${seeded.sessionId}/tending`),
      'list Tending before passive re-entry'
    );
    expect(initialTending.data.entries).toHaveLength(1);
    expect(initialTending.data.entries[0].type).toBe('SCHEDULED_INDIVIDUAL_COMMITMENT_CHECKIN');

    const reentryData = await readJson<any>(
      await apiA.post(`/api/sessions/${seeded.sessionId}/tending/reentry`, {
        intent: 'I want to revisit the open appreciation need without forcing an agreement.',
      }),
      'create passive Tending re-entry'
    );
    expect(reentryData.data.entry.type).toBe('USER_INITIATED_REENTRY');
    expect(reentryData.data.entry.status).toBe('OPEN');
    expect(reentryData.data.entry.agreementId).toBeNull();
  });
});
