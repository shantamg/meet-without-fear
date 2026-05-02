import { Request, Response } from 'express';
import {
  getNeeds,
  captureNeeds,
  confirmNeeds,
  consentToShareNeeds,
  validateNeeds,
  getCommonGround,
  confirmCommonGround,
} from '../../controllers/stage3';
import { advanceStage } from '../../controllers/sessions';
import { prisma } from '../../lib/prisma';
import * as needsService from '../../services/needs';

// Mock Prisma
jest.mock('../../lib/prisma');


// Mock needs service
jest.mock('../../services/needs', () => ({
  extractNeedsFromConversation: jest.fn(),
  findCommonGround: jest.fn(),
  isExtractionRunning: jest.fn().mockReturnValue(false),
  acquireExtractionLock: jest.fn(),
  releaseExtractionLock: jest.fn(),
  runStage3SafetyNetExtraction: jest.fn(),
}));

// Mock realtime service
jest.mock('../../services/realtime');


// Helper to create mock request
function createMockRequest(options: {
  user?: { id: string; email: string; name?: string | null };
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  query?: Record<string, string>;
}): Partial<Request> {
  return {
    user: options.user,
    params: options.params || {},
    body: options.body || {},
    query: options.query || {},
  } as Partial<Request>;
}

// Helper to create mock response
function createMockResponse(): {
  res: Partial<Response>;
  statusMock: jest.Mock;
  jsonMock: jest.Mock;
} {
  const jsonMock = jest.fn();
  const statusMock = jest.fn().mockReturnValue({ json: jsonMock });

  return {
    res: {
      status: statusMock,
      json: jsonMock,
    } as Partial<Response>,
    statusMock,
    jsonMock,
  };
}

describe('Stage 3 API', () => {
  const mockUser = { id: 'cluser0001aaaaaaaaa', email: 'test@example.com', name: 'Test User' };
  const mockPartnerId = 'cluser0002aaaaaaaaa';
  const mockSessionId = 'clsess0001aaaaaaaaa';
  const mockVesselId = 'clvess0001aaaaaaaaa';
  const mockNeedId1 = 'clneed0001aaaaaaaaa';
  const mockNeedId2 = 'clneed0002aaaaaaaaa';

  beforeEach(() => {
    jest.clearAllMocks();
    (needsService.isExtractionRunning as jest.Mock).mockReturnValue(false);
    (prisma.commonGround.findMany as jest.Mock).mockReset();
  });

  describe('GET /sessions/:id/needs (getNeeds)', () => {
    it('returns AI-synthesized needs for the user', async () => {
      const mockNeeds = [
        {
          id: mockNeedId1,
          vesselId: mockVesselId,
          need: 'To feel emotionally connected with partner',
          category: 'CONNECTION',
          evidence: ['I feel disconnected'],
          aiConfidence: 0.85,
          confirmed: false,
          createdAt: new Date(),
        },
        {
          id: mockNeedId2,
          vesselId: mockVesselId,
          need: 'To have contributions acknowledged',
          category: 'RECOGNITION',
          evidence: ['No one notices what I do'],
          aiConfidence: 0.78,
          confirmed: false,
          createdAt: new Date(),
        },
      ];

      const mockStageProgress = {
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 3,
        status: 'IN_PROGRESS',
        gatesSatisfied: {},
      };

      (prisma.session.findFirst as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }, { userId: mockPartnerId }],
        },
      });

      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(mockStageProgress);
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue({ id: mockVesselId });
      (prisma.identifiedNeed.findMany as jest.Mock).mockResolvedValue(mockNeeds);

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await getNeeds(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            needs: expect.arrayContaining([
              expect.objectContaining({
                id: mockNeedId1,
                category: 'CONNECTION',
                need: 'To feel emotionally connected with partner',
              }),
              expect.objectContaining({
                id: mockNeedId2,
                category: 'RECOGNITION',
              }),
            ]),
          }),
        })
      );
    });

    it('triggers AI extraction if no needs exist yet', async () => {
      const mockExtractedNeeds = [
        {
          id: 'clneed0003aaaaaaaaa',
          vesselId: mockVesselId,
          need: 'To feel secure in the relationship',
          category: 'SAFETY',
          evidence: ['I need stability'],
          aiConfidence: 0.9,
          confirmed: false,
          createdAt: new Date(),
        },
      ];

      const mockStageProgress = {
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 3,
        status: 'IN_PROGRESS',
        gatesSatisfied: {},
      };

      (prisma.session.findFirst as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }, { userId: mockPartnerId }],
        },
      });

      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(mockStageProgress);
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue({ id: mockVesselId });
      (prisma.identifiedNeed.findMany as jest.Mock).mockResolvedValue([]); // No needs yet
      (prisma.message.count as jest.Mock).mockResolvedValue(1); // User has sent Stage 3 messages

      (needsService.extractNeedsFromConversation as jest.Mock).mockResolvedValue(mockExtractedNeeds);

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await getNeeds(req as Request, res as Response);

      expect(needsService.extractNeedsFromConversation).toHaveBeenCalledWith(
        mockSessionId,
        mockUser.id
      );
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            needs: expect.arrayContaining([
              expect.objectContaining({
                id: 'clneed0003aaaaaaaaa',
                category: 'SAFETY',
              }),
            ]),
          }),
        })
      );
    });

    it('requires authentication', async () => {
      const req = createMockRequest({
        params: { id: mockSessionId },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await getNeeds(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
        })
      );
    });

    it('returns 404 when session not found', async () => {
      (prisma.session.findFirst as jest.Mock).mockResolvedValue(null);

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'non-existent' },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await getNeeds(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'NOT_FOUND' }),
        })
      );
    });

    it('returns empty data when user not in stage 3', async () => {
      const mockStageProgress = {
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 2, // Still in stage 2
        status: 'IN_PROGRESS',
        gatesSatisfied: {},
      };

      (prisma.session.findFirst as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }],
        },
      });

      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(mockStageProgress);

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await getNeeds(req as Request, res as Response);

      // Returns empty data instead of error to allow parallel fetching
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: {
            needs: [],
            synthesizedAt: null,
            isDirty: false,
          },
        })
      );
    });
  });

  describe('POST /sessions/:id/needs/capture (captureNeeds)', () => {
    it('captures needs from a summary card without confirming them', async () => {
      const mockStageProgress = {
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 3,
        status: 'IN_PROGRESS',
        gatesSatisfied: {},
      };

      (prisma.session.findFirst as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        status: 'ACTIVE',
      });
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(mockStageProgress);
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue({ id: mockVesselId });
      (prisma.identifiedNeed.create as jest.Mock).mockResolvedValue({
        id: mockNeedId1,
        vesselId: mockVesselId,
        need: 'To feel heard before problem solving',
        category: 'CONNECTION',
        evidence: ['I just want you to listen first'],
        confirmed: false,
        aiConfidence: 0.85,
        createdAt: new Date(),
      });

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: {
          needs: [
            {
              need: 'Connection',
              category: 'CONNECTION',
              description: 'To feel heard before problem solving',
              evidence: ['I just want you to listen first'],
            },
          ],
        },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await captureNeeds(req as Request, res as Response);

      expect(prisma.identifiedNeed.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vesselId: mockVesselId,
            need: 'To feel heard before problem solving',
            category: 'CONNECTION',
            confirmed: false,
          }),
        })
      );
      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            needs: [expect.objectContaining({ id: mockNeedId1, confirmed: false })],
            capturedAt: expect.any(String),
          }),
        })
      );
    });
  });

  describe('POST /sessions/:id/needs/confirm (confirmNeeds)', () => {
    it('confirms user needs and marks them as confirmed', async () => {
      const mockStageProgress = {
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 3,
        status: 'IN_PROGRESS',
        gatesSatisfied: {},
      };

      const mockNeed = {
        id: mockNeedId1,
        vesselId: mockVesselId,
        need: 'To feel emotionally connected',
        category: 'CONNECTION',
        evidence: [],
        aiConfidence: 0.85,
        confirmed: false,
        createdAt: new Date(),
      };

      (prisma.session.findFirst as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }, { userId: mockPartnerId }],
        },
      });

      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(mockStageProgress);
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue(null); // Partner not shared
      (prisma.session.findUnique as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        relationship: { members: [{ userId: mockUser.id }, { userId: mockPartnerId }] },
      });
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue({ id: mockVesselId });
      (prisma.identifiedNeed.findMany as jest.Mock).mockResolvedValue([mockNeed]);
      (prisma.identifiedNeed.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.stageProgress.update as jest.Mock).mockResolvedValue({
        ...mockStageProgress,
        gatesSatisfied: { needsConfirmed: true },
      });

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: {
          needIds: [mockNeedId1],
        },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await confirmNeeds(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            confirmed: true,
            confirmedAt: expect.any(String),
          }),
        })
      );

      expect(prisma.identifiedNeed.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: { in: [mockNeedId1] },
            vesselId: mockVesselId,
          },
          data: { confirmed: true },
        })
      );
    });

    it('allows adjustments to need descriptions', async () => {
      const mockStageProgress = {
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 3,
        status: 'IN_PROGRESS',
        gatesSatisfied: {},
      };

      const mockNeed = {
        id: mockNeedId1,
        vesselId: mockVesselId,
        need: 'To feel emotionally connected',
        category: 'CONNECTION',
        evidence: [],
        aiConfidence: 0.85,
        confirmed: false,
        createdAt: new Date(),
      };

      (prisma.session.findFirst as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }, { userId: mockPartnerId }],
        },
      });

      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(mockStageProgress);
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.session.findUnique as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        relationship: { members: [{ userId: mockUser.id }, { userId: mockPartnerId }] },
      });
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue({ id: mockVesselId });
      (prisma.identifiedNeed.findMany as jest.Mock).mockResolvedValue([mockNeed]);
      (prisma.identifiedNeed.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.identifiedNeed.update as jest.Mock).mockResolvedValue({
        ...mockNeed,
        need: 'To feel deeply heard and understood',
        confirmed: true,
      });
      (prisma.stageProgress.update as jest.Mock).mockResolvedValue({
        ...mockStageProgress,
        gatesSatisfied: { needsConfirmed: true },
      });

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: {
          needIds: [mockNeedId1],
          adjustments: [
            {
              needId: mockNeedId1,
              confirmed: true,
              correction: 'To feel deeply heard and understood',
            },
          ],
        },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await confirmNeeds(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(prisma.identifiedNeed.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockNeedId1 },
          data: expect.objectContaining({
            need: 'To feel deeply heard and understood',
            confirmed: true,
          }),
        })
      );
    });

    it('requires authentication', async () => {
      const req = createMockRequest({
        params: { id: mockSessionId },
        body: { needIds: [mockNeedId1] },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await confirmNeeds(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
        })
      );
    });

    it('validates needIds are provided', async () => {
      const mockStageProgress = {
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 3,
        status: 'IN_PROGRESS',
        gatesSatisfied: {},
      };

      (prisma.session.findFirst as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }],
        },
      });

      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(mockStageProgress);

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: {}, // Missing needIds
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await confirmNeeds(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
        })
      );
    });
  });

  describe('POST /sessions/:id/needs/consent (consentToShareNeeds)', () => {
    it('records consent to share needs with partner', async () => {
      const mockStageProgress = {
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 3,
        status: 'IN_PROGRESS',
        gatesSatisfied: { needsConfirmed: true },
      };

      const mockNeeds = [
        {
          id: mockNeedId1,
          vesselId: mockVesselId,
          need: 'To feel connected',
          category: 'CONNECTION',
          evidence: [],
          confirmed: true,
        },
      ];

      (prisma.session.findFirst as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }, { userId: mockPartnerId }],
        },
      });

      (prisma.session.findUnique as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }, { userId: mockPartnerId }],
        },
      });

      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(mockStageProgress);
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue(null); // Partner hasn't consented
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue({ id: mockVesselId });
      (prisma.identifiedNeed.findMany as jest.Mock).mockResolvedValue(mockNeeds);
      (prisma.consentRecord.create as jest.Mock).mockResolvedValue({
        id: 'consent-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        targetType: 'IDENTIFIED_NEED',
        targetId: mockNeedId1,
        decision: 'GRANTED',
        createdAt: new Date(),
      });

      (prisma.stageProgress.update as jest.Mock).mockResolvedValue({
        ...mockStageProgress,
        gatesSatisfied: { needsConfirmed: true, needsShared: true },
      });

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: { needIds: [mockNeedId1] },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await consentToShareNeeds(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            consented: true,
            sharedAt: expect.any(String),
            waitingForPartner: true,
          }),
        })
      );
    });

    it('indicates when both partners have consented', async () => {
      const mockStageProgress = {
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 3,
        status: 'IN_PROGRESS',
        gatesSatisfied: { needsConfirmed: true },
      };

      const partnerProgress = {
        id: 'progress-2',
        sessionId: mockSessionId,
        userId: mockPartnerId,
        stage: 3,
        status: 'IN_PROGRESS',
        gatesSatisfied: { needsConfirmed: true, needsShared: true },
      };

      const mockSession = {
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }, { userId: mockPartnerId }],
        },
      };

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession);
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(mockSession);
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(mockStageProgress);
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue(partnerProgress);
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue({ id: mockVesselId });
      (prisma.identifiedNeed.findMany as jest.Mock).mockResolvedValue([
        { id: mockNeedId1, vesselId: mockVesselId, confirmed: true },
      ]);
      (prisma.consentRecord.create as jest.Mock).mockResolvedValue({
        id: 'consent-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        targetType: 'IDENTIFIED_NEED',
        targetId: mockNeedId1,
        decision: 'GRANTED',
      });

      (prisma.stageProgress.update as jest.Mock).mockResolvedValue({
        ...mockStageProgress,
        gatesSatisfied: { needsConfirmed: true, needsShared: true },
      });

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: { needIds: [mockNeedId1] },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await consentToShareNeeds(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            consented: true,
            waitingForPartner: false,
            commonGroundReady: true,
          }),
        })
      );
    });

    it('requires authentication', async () => {
      const req = createMockRequest({
        params: { id: mockSessionId },
        body: { needIds: [mockNeedId1] },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await consentToShareNeeds(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
        })
      );
    });
  });

  describe('POST /sessions/:id/needs/validate (validateNeeds)', () => {
    it('validates revealed needs and opens Stage 4 when partner already validated', async () => {
      const mockStageProgress = {
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 3,
        status: 'IN_PROGRESS',
        gatesSatisfied: { needsConfirmed: true, needsShared: true },
      };

      const partnerProgress = {
        id: 'progress-2',
        sessionId: mockSessionId,
        userId: mockPartnerId,
        stage: 3,
        status: 'GATE_PENDING',
        gatesSatisfied: {
          needsConfirmed: true,
          needsShared: true,
          commonGroundConfirmed: true,
        },
      };

      const mockCommonGround = [
        {
          id: 'clcomm0001aaaaaaaaa',
          sharedVesselId: 'shared-vessel-1',
          need: 'Both need calm repair',
          category: 'SAFETY',
          confirmedByA: false,
          confirmedByB: true,
          confirmedAt: null,
        },
      ];

      (prisma.session.findFirst as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }, { userId: mockPartnerId }],
        },
      });
      (prisma.session.findUnique as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        relationship: { members: [{ userId: mockUser.id }, { userId: mockPartnerId }] },
      });
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(mockStageProgress);
      (prisma.stageProgress.findUnique as jest.Mock)
        .mockResolvedValueOnce(partnerProgress)
        .mockResolvedValueOnce(partnerProgress);
      (prisma.sharedVessel.findUnique as jest.Mock).mockResolvedValue({
        id: 'shared-vessel-1',
        sessionId: mockSessionId,
      });
      (prisma.commonGround.findMany as jest.Mock)
        .mockResolvedValueOnce(mockCommonGround)
        .mockResolvedValueOnce([{ ...mockCommonGround[0], confirmedByA: true }]);
      (prisma.commonGround.update as jest.Mock).mockResolvedValue({
        ...mockCommonGround[0],
        confirmedByA: true,
      });
      (prisma.commonGround.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.stageProgress.update as jest.Mock).mockResolvedValue({
        ...mockStageProgress,
        status: 'GATE_PENDING',
      });

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await validateNeeds(req as Request, res as Response);

      expect(prisma.stageProgress.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'GATE_PENDING',
            completedAt: null,
          }),
        })
      );
      expect(prisma.stageProgress.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.message.create).toHaveBeenCalledTimes(2);
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            validated: true,
            partnerValidated: true,
            canAdvance: true,
          }),
        })
      );
    });
  });

  describe('POST /sessions/:id/common-ground/confirm (confirmCommonGround)', () => {
    it('satisfies the Stage 3 gate without auto-advancing to Stage 4', async () => {
      const mockStageProgress = {
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 3,
        status: 'IN_PROGRESS',
        gatesSatisfied: { needsConfirmed: true, needsShared: true },
      };

      const mockCommonGround = [
        {
          id: 'clcomm0001aaaaaaaaa',
          sharedVesselId: 'shared-vessel-1',
          need: 'Both need reliable follow-through',
          category: 'RECOGNITION',
          confirmedByA: true,
          confirmedByB: true,
          confirmedAt: new Date(),
        },
      ];

      (prisma.session.findFirst as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }, { userId: mockPartnerId }],
        },
      });
      (prisma.session.findUnique as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        relationship: { members: [{ userId: mockUser.id }, { userId: mockPartnerId }] },
      });
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(mockStageProgress);
      (prisma.sharedVessel.findUnique as jest.Mock).mockResolvedValue({
        id: 'shared-vessel-1',
        sessionId: mockSessionId,
      });
      (prisma.commonGround.findMany as jest.Mock)
        .mockResolvedValueOnce(mockCommonGround)
        .mockResolvedValueOnce(mockCommonGround);
      (prisma.commonGround.findUnique as jest.Mock).mockResolvedValue(mockCommonGround[0]);
      (prisma.commonGround.update as jest.Mock).mockResolvedValue(mockCommonGround[0]);
      (prisma.stageProgress.update as jest.Mock).mockResolvedValue({
        ...mockStageProgress,
        status: 'GATE_PENDING',
      });

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: { commonGroundIds: ['clcomm0001aaaaaaaaa'] },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await confirmCommonGround(req as Request, res as Response);

      expect(prisma.stageProgress.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'GATE_PENDING',
            completedAt: null,
          }),
        })
      );
      expect(prisma.stageProgress.upsert).not.toHaveBeenCalled();
      expect(prisma.message.create).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            confirmed: true,
            allConfirmedByBoth: true,
            canAdvance: true,
          }),
        })
      );
    });
  });

  describe('POST /sessions/:id/stages/advance from Stage 3', () => {
    it('allows explicit Stage 4 advancement after both users satisfy Stage 3 gates', async () => {
      const currentProgress = {
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 3,
        status: 'GATE_PENDING',
        gatesSatisfied: {
          needsConfirmed: true,
          needsShared: true,
          commonGroundConfirmed: true,
        },
      };
      const partnerProgress = {
        id: 'progress-2',
        sessionId: mockSessionId,
        userId: mockPartnerId,
        stage: 3,
        status: 'GATE_PENDING',
        gatesSatisfied: {
          needsConfirmed: true,
          needsShared: true,
          commonGroundConfirmed: true,
        },
      };

      (prisma.session.findFirst as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        status: 'ACTIVE',
        stageProgress: [currentProgress, partnerProgress],
        relationship: {
          members: [{ userId: mockUser.id }, { userId: mockPartnerId }],
        },
      });
      (prisma.session.findUnique as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        relationship: { members: [{ userId: mockUser.id }, { userId: mockPartnerId }] },
      });
      (prisma.stageProgress.update as jest.Mock).mockResolvedValue({
        ...currentProgress,
        status: 'COMPLETED',
      });
      (prisma.stageProgress.create as jest.Mock).mockResolvedValue({
        id: 'progress-4',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 4,
        status: 'IN_PROGRESS',
      });

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await advanceStage(req as Request, res as Response);

      expect(prisma.stageProgress.update).toHaveBeenCalledWith({
        where: { id: 'progress-1' },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      });
      expect(prisma.stageProgress.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sessionId: mockSessionId,
            userId: mockUser.id,
            stage: 4,
            status: 'IN_PROGRESS',
          }),
        })
      );
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            advanced: true,
            newStage: 4,
          }),
        })
      );
    });
  });

  describe('GET /sessions/:id/common-ground (getCommonGround)', () => {
    it('returns common ground analysis when both partners have shared', async () => {
      const mockStageProgress = {
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 3,
        status: 'IN_PROGRESS',
        gatesSatisfied: { needsConfirmed: true, needsShared: true },
      };

      const partnerProgress = {
        id: 'progress-2',
        sessionId: mockSessionId,
        userId: mockPartnerId,
        stage: 3,
        status: 'IN_PROGRESS',
        gatesSatisfied: { needsConfirmed: true, needsShared: true },
      };

      const mockCommonGround = [
        {
          id: 'clcomm0001aaaaaaaaa',
          sharedVesselId: 'shared-vessel-1',
          need: 'Both partners need to feel emotionally connected',
          category: 'CONNECTION',
          confirmedByA: true,
          confirmedByB: true,
          confirmedAt: new Date(),
        },
      ];

      const mockSession = {
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }, { userId: mockPartnerId }],
        },
      };

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession);
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(mockSession);
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(mockStageProgress);
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue(partnerProgress);
      (prisma.sharedVessel.findUnique as jest.Mock).mockResolvedValue({ id: 'shared-vessel-1', sessionId: mockSessionId });
      (prisma.commonGround.findMany as jest.Mock).mockResolvedValue(mockCommonGround);

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await getCommonGround(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            commonGround: expect.arrayContaining([
              expect.objectContaining({
                id: 'clcomm0001aaaaaaaaa',
                category: 'CONNECTION',
                need: 'Both partners need to feel emotionally connected',
              }),
            ]),
            analysisComplete: true,
            bothConfirmed: true,
          }),
        })
      );
    });

    it('triggers common ground analysis when both have shared but no analysis exists', async () => {
      const mockStageProgress = {
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 3,
        status: 'IN_PROGRESS',
        gatesSatisfied: { needsConfirmed: true, needsShared: true },
      };

      const partnerProgress = {
        id: 'progress-2',
        sessionId: mockSessionId,
        userId: mockPartnerId,
        stage: 3,
        status: 'IN_PROGRESS',
        gatesSatisfied: { needsConfirmed: true, needsShared: true },
      };

      const mockNewCommonGround = [
        {
          id: 'clcomm0002aaaaaaaaa',
          sharedVesselId: 'shared-vessel-1',
          need: 'Both value feeling safe in discussions',
          category: 'SAFETY',
          confirmedByA: false,
          confirmedByB: false,
          confirmedAt: null,
        },
      ];

      const mockSession = {
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }, { userId: mockPartnerId }],
        },
      };

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession);
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(mockSession);
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(mockStageProgress);
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue(partnerProgress);
      (prisma.sharedVessel.findUnique as jest.Mock).mockResolvedValue({ id: 'shared-vessel-1', sessionId: mockSessionId });
      (prisma.commonGround.findMany as jest.Mock).mockResolvedValue([]); // No common ground exists

      (needsService.findCommonGround as jest.Mock).mockResolvedValue(mockNewCommonGround);

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await getCommonGround(req as Request, res as Response);

      expect(needsService.findCommonGround).toHaveBeenCalledWith(
        mockSessionId,
        mockUser.id,
        mockPartnerId
      );
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            commonGround: expect.arrayContaining([
              expect.objectContaining({
                id: 'clcomm0002aaaaaaaaa',
                category: 'SAFETY',
              }),
            ]),
          }),
        })
      );
    });

    it('returns waiting state when partner has not shared yet', async () => {
      const mockStageProgress = {
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 3,
        status: 'IN_PROGRESS',
        gatesSatisfied: { needsConfirmed: true, needsShared: true },
      };

      const partnerProgress = {
        id: 'progress-2',
        sessionId: mockSessionId,
        userId: mockPartnerId,
        stage: 3,
        status: 'IN_PROGRESS',
        gatesSatisfied: { needsConfirmed: true }, // Partner hasn't shared
      };

      const mockSession = {
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }, { userId: mockPartnerId }],
        },
      };

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession);
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(mockSession);
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(mockStageProgress);
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue(partnerProgress);

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await getCommonGround(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            commonGround: [],
            analysisComplete: false,
            bothConfirmed: false,
          }),
        })
      );
    });

    it('requires authentication', async () => {
      const req = createMockRequest({
        params: { id: mockSessionId },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await getCommonGround(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
        })
      );
    });

    it('returns 404 when session not found', async () => {
      (prisma.session.findFirst as jest.Mock).mockResolvedValue(null);

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'non-existent' },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await getCommonGround(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'NOT_FOUND' }),
        })
      );
    });
  });
});
