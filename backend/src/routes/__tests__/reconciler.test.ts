/**
 * Reconciler API Tests
 *
 * Tests for the Empathy Reconciler endpoints:
 * - POST /sessions/:id/reconciler/run - Run reconciler analysis
 * - GET /sessions/:id/reconciler/status - Get reconciler status
 * - GET /sessions/:id/reconciler/share-offer - Get pending share offer
 * - POST /sessions/:id/reconciler/share-offer/respond - Respond to share offer
 * - POST /sessions/:id/reconciler/share-offer/skip - Skip share offer
 * - GET /sessions/:id/reconciler/summary - Get reconciler summary
 */

import { prisma } from '../../lib/prisma';
import { notifyPartner } from '../../services/realtime';

// Mock prisma
jest.mock('../../lib/prisma');


// Mock realtime
jest.mock('../../services/realtime');


// Mock bedrock
jest.mock('../../lib/bedrock', () => ({
  getSonnetResponse: jest.fn().mockResolvedValue(
    JSON.stringify({
      alignment: {
        score: 75,
        summary: 'Partner understood most key feelings.',
        correctlyIdentified: ['frustration', 'disappointment'],
      },
      gaps: {
        severity: 'moderate',
        summary: 'Missed the underlying fear of disconnection.',
        missedFeelings: ['fear', 'vulnerability'],
        misattributions: [],
        mostImportantGap: 'The fear of growing apart was not captured.',
      },
      recommendation: {
        action: 'OFFER_OPTIONAL',
        rationale: 'Sharing could deepen understanding but is not critical.',
        sharingWouldHelp: true,
        suggestedShareFocus: 'The fear of disconnection mentioned earlier.',
      },
    })
  ),
  getHaikuJson: jest.fn().mockResolvedValue({ themes: ['frustration', 'disappointment', 'fear'] }),
}));

// Mock json-extractor
jest.mock('../../utils/json-extractor', () => ({
  extractJsonFromResponse: jest.fn().mockImplementation((str) => {
    try {
      return JSON.parse(str);
    } catch {
      return {
        alignment: { score: 75, summary: 'Good understanding', correctlyIdentified: [] },
        gaps: { severity: 'minor', summary: 'Minor gaps', missedFeelings: [], misattributions: [], mostImportantGap: null },
        recommendation: { action: 'PROCEED', rationale: 'Ready', sharingWouldHelp: false, suggestedShareFocus: null },
      };
    }
  }),
}));

// Mock empathy-status service (used for Ably events with full data)
jest.mock('../../services/empathy-status', () => ({
  buildEmpathyExchangeStatus: jest.fn().mockResolvedValue({
    myAttempt: { id: 'mock-attempt', status: 'VALIDATED', content: 'I think they felt...', sharedAt: new Date().toISOString(), sourceUserId: '', consentRecordId: '', revealedAt: null, revisionCount: undefined, deliveryStatus: 'pending' },
    partnerAttempt: null,
    analyzing: false,
    awaitingSharing: false,
    hasNewSharedContext: false,
    sharedContext: null,
    refinementHint: null,
    readyForStage3: false,
    messageCountSinceSharedContext: 0,
    sharedContentDeliveryStatus: null,
    mySharedContext: null,
    myReconcilerResult: null,
    partnerHasSubmittedEmpathy: true,
    partnerEmpathyHeldStatus: null,
    partnerEmpathySubmittedAt: new Date().toISOString(),
    partnerCompletedStage1: false,
  }),
  buildEmpathyExchangeStatusForBothUsers: jest.fn().mockResolvedValue({
    'user-1': { myAttempt: { status: 'VALIDATED' }, partnerAttempt: null },
    'partner-1': { myAttempt: { status: 'VALIDATED' }, partnerAttempt: null },
  }),
}));

// Import controllers after mocks
import {
  runReconcilerHandler,
  getReconcilerStatusHandler,
  getShareOfferHandler,
  respondToShareOfferHandler,
  skipShareOfferHandler,
  getReconcilerSummaryHandler,
} from '../../controllers/reconciler';

// Mock Express request/response
function mockRequest(overrides: Record<string, unknown> = {}) {
  return {
    params: { id: 'session-123' },
    body: {},
    query: {},
    user: { id: 'user-1', name: 'Alice', firstName: 'Alice', email: 'alice@example.com' },
    ...overrides,
  } as any;
}

function mockResponse() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

// Helper to create mock session
function mockSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-123',
    status: 'ACTIVE',
    relationship: {
      members: [
        { userId: 'user-1', user: { id: 'user-1', name: 'Alice', firstName: 'Alice' } },
        { userId: 'partner-1', user: { id: 'partner-1', name: 'Bob', firstName: 'Bob' } },
      ],
    },
    ...overrides,
  };
}

// Helper to create mock reconciler result
function mockReconcilerResult(overrides: Record<string, unknown> = {}) {
  return {
    id: 'result-1',
    sessionId: 'session-123',
    guesserId: 'user-1',
    guesserName: 'Alice',
    subjectId: 'partner-1',
    subjectName: 'Bob',
    alignmentScore: 75,
    alignmentSummary: 'Good understanding overall.',
    correctlyIdentified: ['frustration', 'disappointment'],
    gapSeverity: 'moderate',
    gapSummary: 'Missed the underlying fear.',
    missedFeelings: ['fear', 'vulnerability'],
    misattributions: [],
    mostImportantGap: 'Fear of disconnection was not captured.',
    recommendedAction: 'OFFER_OPTIONAL',
    rationale: 'Sharing could help but is not critical.',
    sharingWouldHelp: true,
    suggestedShareFocus: 'The fear of disconnection.',
    createdAt: new Date(),
    shareOffer: null,
    ...overrides,
  };
}

// Helper to create mock share offer
function mockShareOffer(overrides: Record<string, unknown> = {}) {
  return {
    id: 'offer-1',
    resultId: 'result-1',
    userId: 'partner-1',
    status: 'OFFERED',
    offerMessage: 'Bob understood a lot, but missed something. Would you like to share more?',
    suggestedContent: 'I felt afraid we might grow apart, and that distance was scary for me.',
    suggestedReason: 'Helps convey the underlying fear of disconnection.',
    sharedContent: null,
    sharedAt: null,
    declinedAt: null,
    skippedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    result: mockReconcilerResult(),
    ...overrides,
  };
}

describe('Reconciler API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /sessions/:id/reconciler/run (runReconcilerHandler)', () => {
    it('returns 401 if user is not authenticated', async () => {
      const req = mockRequest({ user: null });
      const res = mockResponse();

      await runReconcilerHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
        })
      );
    });

    it('returns 404 if session not found', async () => {
      const req = mockRequest();
      const res = mockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(null);

      await runReconcilerHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'NOT_FOUND' }),
        })
      );
    });

    it('returns 400 if session is not active', async () => {
      const req = mockRequest();
      const res = mockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession({ status: 'PAUSED' }));

      await runReconcilerHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'SESSION_NOT_ACTIVE' }),
        })
      );
    });

    it('returns bothCompleted=false if only one user has shared empathy', async () => {
      const req = mockRequest();
      const res = mockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(mockSession());

      // User A has shared, User B has not
      (prisma.empathyAttempt.findFirst as jest.Mock)
        .mockResolvedValueOnce({ content: 'I think Bob felt...', sharedAt: new Date() })
        .mockResolvedValueOnce(null);

      await runReconcilerHandler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            bothCompleted: false,
            readyToProceed: false,
            blockingReason: expect.stringContaining('has not shared'),
          }),
        })
      );
    });

    it('runs reconciler analysis when both users have shared empathy', async () => {
      const req = mockRequest();
      const res = mockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(mockSession());

      // Both users have shared
      (prisma.empathyAttempt.findFirst as jest.Mock)
        .mockResolvedValue({ content: 'I think they felt...', sharedAt: new Date() });

      // No existing results
      (prisma.reconcilerResult.findUnique as jest.Mock).mockResolvedValue(null);

      // Messages for witnessing content
      (prisma.message.findMany as jest.Mock).mockResolvedValue([
        { content: 'I felt frustrated and scared.', extractedEmotions: ['frustrated', 'scared'] },
      ]);

      // Mock create
      (prisma.reconcilerResult.create as jest.Mock).mockResolvedValue(mockReconcilerResult());

      await runReconcilerHandler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            sessionId: 'session-123',
            bothCompleted: true,
          }),
        })
      );
    });
  });

  describe('GET /sessions/:id/reconciler/status (getReconcilerStatusHandler)', () => {
    it('returns hasRun=false if reconciler has not run', async () => {
      const req = mockRequest();
      const res = mockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.reconcilerResult.findMany as jest.Mock).mockResolvedValue([]);

      await getReconcilerStatusHandler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            sessionId: 'session-123',
            hasRun: false,
            pendingShareOffers: 0,
            readyForStage3: false,
          }),
        })
      );
    });

    it('returns reconciler results when available', async () => {
      const req = mockRequest();
      const res = mockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.reconcilerResult.findMany as jest.Mock).mockResolvedValue([
        mockReconcilerResult({ shareOffer: { status: 'OFFERED' } }),
        mockReconcilerResult({ guesserId: 'partner-1', subjectId: 'user-1', shareOffer: null }),
      ]);

      await getReconcilerStatusHandler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            hasRun: true,
            pendingShareOffers: 1,
            readyForStage3: false, // Still has pending offer
          }),
        })
      );
    });

    it('returns readyForStage3=true when all offers resolved', async () => {
      const req = mockRequest();
      const res = mockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.reconcilerResult.findMany as jest.Mock).mockResolvedValue([
        mockReconcilerResult({ recommendedAction: 'PROCEED', shareOffer: null }),
        mockReconcilerResult({ guesserId: 'partner-1', subjectId: 'user-1', recommendedAction: 'PROCEED', shareOffer: null }),
      ]);

      await getReconcilerStatusHandler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            hasRun: true,
            pendingShareOffers: 0,
            readyForStage3: true,
          }),
        })
      );
    });
  });

  describe('GET /sessions/:id/reconciler/share-offer (getShareOfferHandler)', () => {
    it('returns hasSuggestion=false if no offer exists', async () => {
      const req = mockRequest();
      const res = mockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.reconcilerShareOffer.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.reconcilerResult.findFirst as jest.Mock).mockResolvedValue(null);

      await getShareOfferHandler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            hasSuggestion: false,
            suggestion: null,
          }),
        })
      );
    });

    it('returns pending share suggestion with details', async () => {
      const req = mockRequest({ user: { id: 'partner-1', name: 'Bob' } });
      const res = mockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.reconcilerShareOffer.findFirst as jest.Mock).mockResolvedValue(mockShareOffer());

      await getShareOfferHandler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            hasSuggestion: true,
            suggestion: expect.objectContaining({
              guesserName: 'Alice',
              // Uses the AI-crafted suggestedContent from the share offer
              suggestedContent: 'I felt afraid we might grow apart, and that distance was scary for me.',
              reason: 'Helps convey the underlying fear of disconnection.',
              canRefine: true,
            }),
          }),
        })
      );
    });

    it('uses suggestedContent from AI-crafted suggestion', async () => {
      const req = mockRequest({ user: { id: 'partner-1', name: 'Bob' } });
      const res = mockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.reconcilerShareOffer.findFirst as jest.Mock).mockResolvedValue(
        mockShareOffer({ suggestedContent: 'I felt afraid we might grow apart.' })
      );

      await getShareOfferHandler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            hasSuggestion: true,
            suggestion: expect.objectContaining({
              suggestedContent: 'I felt afraid we might grow apart.',
            }),
          }),
        })
      );
    });

    it('falls back to offerMessage when suggestedContent is NULL', async () => {
      const req = mockRequest({ user: { id: 'partner-1', name: 'Bob' } });
      const res = mockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.reconcilerShareOffer.findFirst as jest.Mock).mockResolvedValue(
        mockShareOffer({
          suggestedContent: null,
          offerMessage: 'Fallback offer message',
        })
      );

      await getShareOfferHandler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            hasSuggestion: true,
            suggestion: expect.objectContaining({
              suggestedContent: 'Fallback offer message',
            }),
          }),
        })
      );
    });
  });

  describe('POST /sessions/:id/reconciler/share-offer/respond (respondToShareOfferHandler)', () => {
    it('returns 400 for invalid request body', async () => {
      const req = mockRequest({ body: { invalid: true } });
      const res = mockResponse();

      await respondToShareOfferHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
        })
      );
    });

    it('accepts share offer with AI-crafted suggestion', async () => {
      const req = mockRequest({
        user: { id: 'partner-1', name: 'Bob' },
        body: { accept: true },
      });
      const res = mockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.reconcilerShareOffer.findFirst as jest.Mock).mockResolvedValue(mockShareOffer());
      (prisma.reconcilerShareOffer.update as jest.Mock).mockResolvedValue({
        ...mockShareOffer(),
        status: 'ACCEPTED',
        sharedContent: 'I felt afraid we might grow apart, and that distance was scary for me.',
        sharedAt: new Date(),
      });
      (prisma.relationshipMember.findMany as jest.Mock).mockResolvedValue([
        { userId: 'user-1' },
        { userId: 'partner-1' },
      ]);

      await respondToShareOfferHandler(req, res);

      expect(prisma.reconcilerShareOffer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ACCEPTED',
            sharedContent: 'I felt afraid we might grow apart, and that distance was scary for me.',
          }),
        })
      );
      expect(prisma.message.create).toHaveBeenCalled();
      expect(notifyPartner).toHaveBeenCalledWith(
        'session-123',
        'user-1',
        'partner.additional_context_shared',
        expect.objectContaining({
          stage: 2,
          forUserId: 'user-1',
          empathyStatus: expect.any(Object),
        }),
        expect.objectContaining({ excludeUserId: 'partner-1' })
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            status: 'ACCEPTED',
            sharedContent: 'I felt afraid we might grow apart, and that distance was scary for me.',
          }),
        })
      );
    });

    it('accepts share offer with custom content', async () => {
      const req = mockRequest({
        user: { id: 'partner-1', name: 'Bob' },
        body: { accept: true, customContent: 'I was really scared of losing our connection.' },
      });
      const res = mockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.reconcilerShareOffer.findFirst as jest.Mock).mockResolvedValue(mockShareOffer());
      (prisma.reconcilerShareOffer.update as jest.Mock).mockResolvedValue({
        ...mockShareOffer(),
        status: 'ACCEPTED',
        sharedContent: 'I was really scared of losing our connection.',
        sharedAt: new Date(),
      });
      (prisma.relationshipMember.findMany as jest.Mock).mockResolvedValue([
        { userId: 'user-1' },
        { userId: 'partner-1' },
      ]);

      await respondToShareOfferHandler(req, res);

      expect(prisma.reconcilerShareOffer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ACCEPTED',
            sharedContent: 'I was really scared of losing our connection.',
          }),
        })
      );
    });

    it('declines share offer', async () => {
      const req = mockRequest({
        user: { id: 'partner-1', name: 'Bob' },
        body: { accept: false },
      });
      const res = mockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.reconcilerShareOffer.findFirst as jest.Mock).mockResolvedValue(mockShareOffer());
      (prisma.reconcilerShareOffer.update as jest.Mock).mockResolvedValue({
        ...mockShareOffer(),
        status: 'DECLINED',
        declinedAt: new Date(),
      });

      await respondToShareOfferHandler(req, res);

      expect(prisma.reconcilerShareOffer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'DECLINED',
          }),
        })
      );
      expect(notifyPartner).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            status: 'DECLINED',
            sharedContent: null,
          }),
        })
      );
    });
  });

  describe('POST /sessions/:id/reconciler/share-offer/skip (skipShareOfferHandler)', () => {
    it('returns 404 if no pending share offer', async () => {
      const req = mockRequest();
      const res = mockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.reconcilerShareOffer.findFirst as jest.Mock).mockResolvedValue(null);

      await skipShareOfferHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'NOT_FOUND' }),
        })
      );
    });

    it('skips share offer successfully', async () => {
      const req = mockRequest({ user: { id: 'partner-1', name: 'Bob' } });
      const res = mockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.reconcilerShareOffer.findFirst as jest.Mock).mockResolvedValue(mockShareOffer());
      (prisma.reconcilerShareOffer.update as jest.Mock).mockResolvedValue({
        ...mockShareOffer(),
        status: 'SKIPPED',
        skippedAt: new Date(),
      });

      await skipShareOfferHandler(req, res);

      expect(prisma.reconcilerShareOffer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'SKIPPED',
          }),
        })
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            status: 'SKIPPED',
          }),
        })
      );
    });
  });

  describe('GET /sessions/:id/reconciler/summary (getReconcilerSummaryHandler)', () => {
    it('returns 400 if reconciler has not run', async () => {
      const req = mockRequest();
      const res = mockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.reconcilerResult.findMany as jest.Mock).mockResolvedValue([]);

      await getReconcilerSummaryHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
        })
      );
    });

    it('returns 400 if pending share offers exist', async () => {
      const req = mockRequest();
      const res = mockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.reconcilerResult.findMany as jest.Mock).mockResolvedValue([
        mockReconcilerResult({ shareOffer: { status: 'OFFERED' } }),
        mockReconcilerResult({ guesserId: 'partner-1', subjectId: 'user-1' }),
      ]);

      await getReconcilerSummaryHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
            message: expect.stringContaining('pending'),
          }),
        })
      );
    });

    it('returns summary when reconciliation is complete', async () => {
      const req = mockRequest();
      const res = mockResponse();

      // Mock getSonnetResponse to return summary
      const bedrockMock = require('../../lib/bedrock');
      bedrockMock.getSonnetResponse.mockResolvedValueOnce(
        JSON.stringify({
          summary: 'Both partners showed strong empathy. Some gaps were bridged through sharing.',
          readyForNextStage: true,
        })
      );

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.reconcilerResult.findMany as jest.Mock).mockResolvedValue([
        mockReconcilerResult({ recommendedAction: 'PROCEED', shareOffer: null }),
        mockReconcilerResult({ guesserId: 'partner-1', subjectId: 'user-1', recommendedAction: 'PROCEED', shareOffer: null }),
      ]);

      await getReconcilerSummaryHandler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            summary: expect.any(String),
            readyForNextStage: true,
          }),
        })
      );
    });
  });

  describe('Authentication and Authorization', () => {
    it('requires authentication for all endpoints', async () => {
      const endpoints = [
        runReconcilerHandler,
        getReconcilerStatusHandler,
        getShareOfferHandler,
        respondToShareOfferHandler,
        skipShareOfferHandler,
        getReconcilerSummaryHandler,
      ];

      for (const handler of endpoints) {
        const req = mockRequest({ user: null });
        const res = mockResponse();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(401);
      }
    });

    it('checks session membership for all endpoints', async () => {
      const endpoints = [
        { handler: runReconcilerHandler, body: {} },
        { handler: getReconcilerStatusHandler, body: {} },
        { handler: getShareOfferHandler, body: {} },
        { handler: respondToShareOfferHandler, body: { accept: false } },
        { handler: skipShareOfferHandler, body: {} },
        { handler: getReconcilerSummaryHandler, body: {} },
      ];

      for (const { handler, body } of endpoints) {
        jest.clearAllMocks();
        const req = mockRequest({ body });
        const res = mockResponse();

        // User not in session
        (prisma.session.findFirst as jest.Mock).mockResolvedValue(null);

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
      }
    });
  });

  describe('Edge Cases', () => {
    it('handles accept when share offer has no suggestedContent', async () => {
      const req = mockRequest({
        user: { id: 'partner-1', name: 'Bob' },
        body: { accept: true },
      });
      const res = mockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      // Share offer without suggestedContent
      (prisma.reconcilerShareOffer.findFirst as jest.Mock).mockResolvedValue({
        ...mockShareOffer(),
        suggestedContent: null,
      });

      await respondToShareOfferHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('handles accept without custom content (uses suggestedContent)', async () => {
      const req = mockRequest({
        user: { id: 'partner-1', name: 'Bob' },
        body: { accept: true }, // Uses AI-crafted suggestedContent
      });
      const res = mockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.reconcilerShareOffer.findFirst as jest.Mock).mockResolvedValue(mockShareOffer());
      (prisma.reconcilerShareOffer.update as jest.Mock).mockResolvedValue({
        ...mockShareOffer(),
        status: 'ACCEPTED',
        sharedContent: 'I felt afraid we might grow apart, and that distance was scary for me.',
        sharedAt: new Date(),
      });
      (prisma.relationshipMember.findMany as jest.Mock).mockResolvedValue([
        { userId: 'user-1' },
        { userId: 'partner-1' },
      ]);

      await respondToShareOfferHandler(req, res);

      // Should succeed using the AI-crafted suggestedContent
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            status: 'ACCEPTED',
          }),
        })
      );
    });

    it('handles missing share offer when responding', async () => {
      const req = mockRequest({
        user: { id: 'partner-1', name: 'Bob' },
        body: { accept: true },
      });
      const res = mockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.reconcilerShareOffer.findFirst as jest.Mock).mockResolvedValue(null);

      await respondToShareOfferHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
