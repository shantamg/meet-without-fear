/**
 * Stage 2 API Tests
 *
 * Tests for the Perspective Stretch / Empathy stage endpoints:
 * - POST /sessions/:id/empathy/draft - Save empathy draft
 * - GET /sessions/:id/empathy/draft - Get current draft
 * - POST /sessions/:id/empathy/consent - Consent to share
 * - GET /sessions/:id/empathy/partner - Get partner's empathy
 * - POST /sessions/:id/empathy/validate - Validate partner's empathy
 */

import { prisma } from '../../lib/prisma';
import { notifyPartner, publishSessionEvent } from '../../services/realtime';

// Mock prisma
jest.mock('../../lib/prisma');


// Mock realtime
jest.mock('../../services/realtime');


// Mock bedrock
jest.mock('../../lib/bedrock', () => ({
  getSonnetResponse: jest.fn().mockResolvedValue('{"response": "Test transition"}'),
  getModelCompletion: jest.fn().mockResolvedValue('{"response": "AI response", "proposedFeedback": "Refined feedback"}'),
  BrainActivityCallType: {
    ORCHESTRATED_RESPONSE: 'ORCHESTRATED_RESPONSE',
  },
}));

// Mock json-extractor
jest.mock('../../utils/json-extractor', () => ({
  extractJsonFromResponse: jest.fn().mockReturnValue({ response: 'Test transition' }),
}));

// Mock embedding service
jest.mock('../../services/embedding', () => ({
  embedSessionContent: jest.fn().mockResolvedValue(true),
}));

// Mock empathy-status service (used for Ably events with full data)
jest.mock('../../services/empathy-status', () => ({
  buildEmpathyExchangeStatus: jest.fn().mockResolvedValue({
    myAttempt: { id: 'mock-attempt', status: 'VALIDATED' },
    partnerAttempt: null,
    analyzing: false,
    readyForStage3: false,
    partnerCompletedStage1: true,
  }),
  buildEmpathyExchangeStatusForBothUsers: jest.fn().mockResolvedValue({
    'user-1': { myAttempt: { status: 'VALIDATED' }, partnerAttempt: null },
    'partner-1': { myAttempt: { status: 'VALIDATED' }, partnerAttempt: null },
  }),
}));

// Import controllers after mocks
import {
  saveDraft,
  getDraft,
  consentToShare,
  getPartnerEmpathy,
  validateEmpathy,
  saveValidationFeedbackDraft,
  refineValidationFeedback,
  skipRefinement,
} from '../../controllers/stage2';

// Explicitly mock new Prisma models that auto-mock might miss if types are stale
(prisma as any).validationFeedbackDraft = {
  upsert: jest.fn(),
};


// Mock Express request/response
function mockRequest(overrides: Record<string, unknown> = {}) {
  return {
    params: { id: 'session-123' },
    body: {},
    query: {},
    user: { id: 'user-1', name: 'Test User', email: 'test@example.com' },
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
    currentStage: 2,
    relationship: {
      members: [{ userId: 'user-1' }, { userId: 'partner-1' }],
    },
    ...overrides,
  };
}

describe('Stage 2 API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /sessions/:id/empathy/draft (saveDraft)', () => {
    it('saves a new empathy draft', async () => {
      const req = mockRequest({
        body: { content: 'I think you felt frustrated because...', readyToShare: false },
      });
      const res = mockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue({
        stage: 2,
        status: 'IN_PROGRESS',
      });
      (prisma.empathyDraft.upsert as jest.Mock).mockResolvedValue({
        id: 'draft-1',
        content: 'I think you felt frustrated because...',
        readyToShare: false,
        version: 1,
        updatedAt: new Date(),
      });

      await saveDraft(req, res);

      expect(res.status).not.toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            draftId: 'draft-1',
            readyToShare: false,
          }),
        })
      );
    });

    it('increments version on update', async () => {
      const req = mockRequest({
        body: { content: 'Updated draft content', readyToShare: true },
      });
      const res = mockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue({
        stage: 2,
        status: 'IN_PROGRESS',
      });
      (prisma.empathyDraft.upsert as jest.Mock).mockResolvedValue({
        id: 'draft-1',
        content: 'Updated draft content',
        readyToShare: true,
        version: 2,
        updatedAt: new Date(),
      });

      await saveDraft(req, res);

      expect(prisma.empathyDraft.upsert).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            readyToShare: true,
          }),
        })
      );
    });

    it('rejects empty content', async () => {
      const req = mockRequest({
        body: { content: '', readyToShare: false },
      });
      const res = mockResponse();

      await saveDraft(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
        })
      );
    });

    it('rejects if user not in stage 2', async () => {
      const req = mockRequest({
        body: { content: 'Some content', readyToShare: false },
      });
      const res = mockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue({
        stage: 1,
        status: 'IN_PROGRESS',
      });

      await saveDraft(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
        })
      );
    });
  });

  describe('GET /sessions/:id/empathy/draft (getDraft)', () => {
    it('returns existing draft', async () => {
      const req = mockRequest();
      const res = mockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.empathyDraft.findUnique as jest.Mock).mockResolvedValue({
        id: 'draft-1',
        content: 'My draft content',
        readyToShare: false,
        version: 1,
        updatedAt: new Date(),
      });
      (prisma.consentRecord.findFirst as jest.Mock).mockResolvedValue(null);

      await getDraft(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            draft: expect.objectContaining({
              id: 'draft-1',
              content: 'My draft content',
            }),
            canConsent: false, // readyToShare is false
            alreadyConsented: false,
          }),
        })
      );
    });

    it('returns null if no draft exists', async () => {
      const req = mockRequest();
      const res = mockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.empathyDraft.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.consentRecord.findFirst as jest.Mock).mockResolvedValue(null);

      await getDraft(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            draft: null,
            canConsent: false,
            alreadyConsented: false,
          }),
        })
      );
    });
  });

  describe('POST /sessions/:id/empathy/consent (consentToShare)', () => {
    it('requires draft to be marked ready before consent', async () => {
      const req = mockRequest({
        body: { consent: true },
      });
      const res = mockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue({
        stage: 2,
        status: 'IN_PROGRESS',
      });
      (prisma.empathyDraft.findUnique as jest.Mock).mockResolvedValue({
        id: 'draft-1',
        content: 'Content',
        readyToShare: false, // Not ready
      });

      await consentToShare(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
        })
      );
    });

    it('creates consent record and empathy attempt when draft is ready', async () => {
      const req = mockRequest({
        body: { consent: true },
      });
      const res = mockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue({
        stage: 2,
        status: 'IN_PROGRESS',
      });
      (prisma.empathyDraft.findUnique as jest.Mock).mockResolvedValue({
        id: 'draft-1',
        content: 'Ready content',
        readyToShare: true,
      });
      (prisma.consentRecord.create as jest.Mock).mockResolvedValue({
        id: 'consent-1',
      });
      (prisma.empathyAttempt.create as jest.Mock).mockResolvedValue({
        id: 'attempt-1',
        sharedAt: new Date(),
      });
      (prisma.message.create as jest.Mock).mockResolvedValue({
        id: 'msg-1',
        timestamp: new Date(),
      });
      // Mock partner consent check
      (prisma.empathyAttempt.findFirst as jest.Mock).mockResolvedValue(null);

      await consentToShare(req, res);

      expect(prisma.consentRecord.create).toHaveBeenCalled();
      expect(prisma.empathyAttempt.create).toHaveBeenCalled();
      expect(notifyPartner).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            consented: true,
          }),
        })
      );
    });
  });

  describe('GET /sessions/:id/empathy/partner (getPartnerEmpathy)', () => {
    it('returns null if partner has not consented/shared', async () => {
      const req = mockRequest();
      const res = mockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.empathyAttempt.findFirst as jest.Mock).mockResolvedValue(null);

      await getPartnerEmpathy(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            attempt: null,
            waitingForPartner: true,
          }),
        })
      );
    });

    it('returns partner empathy after they consent', async () => {
      const req = mockRequest();
      const res = mockResponse();

      const sharedAt = new Date();
      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.empathyAttempt.findFirst as jest.Mock).mockResolvedValue({
        id: 'attempt-1',
        content: 'Partner thinks I felt...',
        sharedAt,
        sourceUserId: 'partner-1',
        consentRecordId: 'consent-1',
        status: 'REVEALED', // Must be REVEALED or VALIDATED to be visible
        revealedAt: sharedAt,
        revisionCount: 0,
      });
      // Mock empathyValidation.findUnique for the validation lookup
      (prisma.empathyValidation.findUnique as jest.Mock).mockResolvedValue(null);

      await getPartnerEmpathy(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            attempt: expect.objectContaining({
              id: 'attempt-1',
              content: 'Partner thinks I felt...',
            }),
            waitingForPartner: false,
          }),
        })
      );
    });
  });

  describe('POST /sessions/:id/empathy/validate (validateEmpathy)', () => {
    it('records validation and updates gate status', async () => {
      const req = mockRequest({
        body: { validated: true, feedback: 'You understood me well' },
      });
      const res = mockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue({
        stage: 2,
        status: 'IN_PROGRESS',
        gatesSatisfied: {},
      });
      (prisma.empathyAttempt.findFirst as jest.Mock).mockResolvedValue({
        id: 'attempt-1',
        sourceUserId: 'partner-1',
        status: 'REVEALED',
      });
      // Mock empathyAttempt.update for setting status to VALIDATED
      (prisma.empathyAttempt.update as jest.Mock).mockResolvedValue({ id: 'attempt-1', status: 'VALIDATED' });
      // Mock empathyValidation.upsert
      (prisma.empathyValidation.upsert as jest.Mock).mockResolvedValue({
        id: 'validation-1',
        validated: true,
        validatedAt: new Date(),
        feedbackShared: false,
      });
      (prisma.empathyValidation.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.stageProgress.update as jest.Mock).mockResolvedValue({
        gatesSatisfied: { empathyValidated: true },
      });
      // Mock user lookup for notifications
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        firstName: 'Partner',
        name: 'Partner User',
      });
      // Re-mock findFirst for the second call to get my attempt
      (prisma.empathyAttempt.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 'attempt-1',
        sourceUserId: 'partner-1',
        status: 'REVEALED',
      }).mockResolvedValueOnce({
        id: 'my-attempt-1',
        sourceUserId: 'user-1',
      });

      await validateEmpathy(req, res);

      expect(prisma.empathyValidation.upsert).toHaveBeenCalled();
      expect(prisma.stageProgress.update).toHaveBeenCalled();
      expect(notifyPartner).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            validated: true,
            canAdvance: true,
          }),
        })
      );
    });

    it('returns 404 if no partner empathy attempt found', async () => {
      const req = mockRequest({
        body: { validated: true },
      });
      const res = mockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue({
        stage: 2,
        status: 'IN_PROGRESS',
      });
      (prisma.empathyAttempt.findFirst as jest.Mock).mockResolvedValue(null);

      await validateEmpathy(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'NOT_FOUND' }),
        })
      );
    });
  });
});

describe('Validation Feedback Routes', () => {
  describe('POST /sessions/:id/empathy/feedback/draft', () => {
    it('saves validation feedback draft', async () => {
      const req = mockRequest({
        body: { content: 'This is feedback', readyToShare: false },
      });
      const res = mockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.validationFeedbackDraft.upsert as jest.Mock).mockResolvedValue({
        id: 'draft-1',
        content: 'This is feedback',
        readyToShare: false,
        updatedAt: new Date(),
      });


      await saveValidationFeedbackDraft(req, res);

      expect(prisma.validationFeedbackDraft.upsert).toHaveBeenCalled();

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ draftId: 'draft-1' }),
        })
      );
    });
  });

  describe('POST /sessions/:id/empathy/feedback/refine', () => {
    it('returns refined feedback from AI', async () => {
      const req = mockRequest({
        body: { message: 'Raw feedback' },
      });
      const res = mockResponse();

      // Mocks already set up for bedrock/getSonnetResponse top of file
      // But we need to ensure json-extractor returns what we want
      const { extractJsonFromResponse } = require('../../utils/json-extractor');
      extractJsonFromResponse.mockReturnValueOnce({
        response: 'AI response',
        proposedFeedback: 'Refined feedback',
      });

      await refineValidationFeedback(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            response: 'AI response',
            proposedFeedback: 'Refined feedback',
          }),
        })
      );
    });
  });

  describe('POST /sessions/:id/empathy/skip-refinement', () => {
    it('records acceptance (Agreement to Disagree)', async () => {
      const req = mockRequest({
        body: { willingToAccept: true },
      });
      const res = mockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(mockSession()); // Fix: controller uses findUnique

      (prisma.empathyAttempt.findFirst as jest.Mock).mockResolvedValue({ id: 'attempt-1' });
      (prisma.empathyAttempt.update as jest.Mock).mockResolvedValue({});
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue({
        gatesSatisfied: {},
      });
      (prisma.empathyValidation.upsert as jest.Mock).mockResolvedValue({});
      (prisma.stageProgress.update as jest.Mock).mockResolvedValue({});


      await skipRefinement(req, res);

      expect(prisma.empathyValidation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ feedback: 'ACCEPTED_DIFFERENCE', validated: true })
        })
      );
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('records refusal', async () => {
      const req = mockRequest({
        body: { willingToAccept: false, reason: 'I just cant' },
      });
      const res = mockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(mockSession());

      (prisma.empathyAttempt.findFirst as jest.Mock).mockResolvedValue({ id: 'attempt-1' });
      (prisma.empathyAttempt.update as jest.Mock).mockResolvedValue({});
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue({
        gatesSatisfied: {},
      });
      (prisma.empathyValidation.upsert as jest.Mock).mockResolvedValue({});


      await skipRefinement(req, res);

      expect(prisma.empathyValidation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            feedback: expect.stringContaining('REJECTED_OTHER_EXPERIENCE'),
            validated: true
          })
        })
      );
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });
});

