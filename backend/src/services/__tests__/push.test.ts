import { sendPushNotification, sendPushNotifications, isValidPushToken, PUSH_MESSAGES, resetExpoClient } from '../push';
import { prisma } from '../../lib/prisma';
import type { SessionEvent } from '../realtime';

// Mock Prisma
jest.mock('../../lib/prisma');

// Mock Expo SDK
const mockSendPushNotificationsAsync = jest.fn();

jest.mock('expo-server-sdk', () => ({
  Expo: jest.fn().mockImplementation(() => ({
    sendPushNotificationsAsync: mockSendPushNotificationsAsync,
  })),
}));

// Import Expo after mock
import { Expo } from 'expo-server-sdk';

// Set up isExpoPushToken mock
(Expo as unknown as { isExpoPushToken: jest.Mock }).isExpoPushToken = jest.fn();

describe('Push Notification Service', () => {
  const testUserId = 'user-123';
  const testSessionId = 'session-456';
  const validPushToken = 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]';

  beforeEach(() => {
    jest.clearAllMocks();
    resetExpoClient();
    (Expo as unknown as { isExpoPushToken: jest.Mock }).isExpoPushToken.mockReturnValue(true);
  });

  describe('PUSH_MESSAGES', () => {
    it('has messages for all session event types', () => {
      const allEvents: SessionEvent[] = [
        'partner.signed_compact',
        'partner.stage_completed',
        'partner.advanced',
        'partner.empathy_shared',
        'partner.needs_shared',
        'partner.ranking_submitted',
        'agreement.proposed',
        'agreement.confirmed',
        'session.paused',
        'session.resumed',
        'session.resolved',
      ];

      for (const event of allEvents) {
        expect(PUSH_MESSAGES[event]).toBeDefined();
        expect(PUSH_MESSAGES[event].title).toBeTruthy();
        expect(PUSH_MESSAGES[event].body).toBeTruthy();
      }
    });

    it('has appropriate messages for partner events', () => {
      expect(PUSH_MESSAGES['partner.signed_compact'].title).toContain('ready');
      expect(PUSH_MESSAGES['partner.empathy_shared'].title).toContain('empathy');
    });

    it('has appropriate messages for agreement events', () => {
      expect(PUSH_MESSAGES['agreement.proposed'].title).toContain('review');
      expect(PUSH_MESSAGES['agreement.confirmed'].title).toContain('confirmed');
    });

    it('has appropriate messages for session events', () => {
      expect(PUSH_MESSAGES['session.paused'].title).toContain('paused');
      expect(PUSH_MESSAGES['session.resumed'].title).toContain('resumed');
      expect(PUSH_MESSAGES['session.resolved'].title).toContain('complete');
    });
  });

  describe('sendPushNotification', () => {
    it('returns false when user has no push token', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ pushToken: null });

      const result = await sendPushNotification(testUserId, 'partner.signed_compact', {}, testSessionId);

      expect(result).toBe(false);
      expect(mockSendPushNotificationsAsync).not.toHaveBeenCalled();
    });

    it('returns false when user is not found', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await sendPushNotification(testUserId, 'partner.signed_compact', {}, testSessionId);

      expect(result).toBe(false);
    });

    it('returns false when push token is invalid', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        pushToken: 'invalid-token',
      });
      (Expo as unknown as { isExpoPushToken: jest.Mock }).isExpoPushToken.mockReturnValue(false);

      const result = await sendPushNotification(testUserId, 'partner.signed_compact', {}, testSessionId);

      expect(result).toBe(false);
    });

    it('sends notification with correct message template', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        pushToken: validPushToken,
      });
      mockSendPushNotificationsAsync.mockResolvedValue([{ status: 'ok' }]);

      await sendPushNotification(testUserId, 'partner.empathy_shared', { empathyId: 'emp-1' }, testSessionId);

      expect(mockSendPushNotificationsAsync).toHaveBeenCalledWith([
        expect.objectContaining({
          to: validPushToken,
          sound: 'default',
          title: 'Their empathy is ready',
          body: 'Read what They understood about your experience.',
          data: expect.objectContaining({
            screen: 'session',
            sessionId: testSessionId,
            event: 'partner.empathy_shared',
            empathyId: 'emp-1',
          }),
        }),
      ]);
    });

    it('uses the recipient nickname for the other person when available', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        pushToken: validPushToken,
      });
      (prisma.session.findUnique as jest.Mock).mockResolvedValue({
        relationship: {
          members: [
            {
              userId: testUserId,
              nickname: 'Sammy',
              user: { firstName: 'Recipient', name: 'Recipient User' },
            },
            {
              userId: 'actor-123',
              nickname: null,
              user: { firstName: 'Sam', name: 'Sam Person' },
            },
          ],
        },
      });
      mockSendPushNotificationsAsync.mockResolvedValue([{ status: 'ok' }]);

      await sendPushNotification(
        testUserId,
        'partner.stage_completed',
        { completedBy: 'actor-123', stage: 1 },
        testSessionId,
      );

      expect(mockSendPushNotificationsAsync).toHaveBeenCalledWith([
        expect.objectContaining({
          title: 'Sammy finished Your Story',
          body: 'It is your turn to continue.',
        }),
      ]);
    });

    it('uses invitation acceptance copy when the invitee starts their side', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        pushToken: validPushToken,
      });
      (prisma.invitation.findFirst as jest.Mock).mockResolvedValue({
        invitedById: testUserId,
      });
      (prisma.session.findUnique as jest.Mock).mockResolvedValue({
        relationship: {
          members: [
            {
              userId: testUserId,
              nickname: null,
              user: { firstName: 'Jason', name: 'Jason Person' },
            },
            {
              userId: 'actor-123',
              nickname: null,
              user: { firstName: 'Shantam', name: 'Shantam Person' },
            },
          ],
        },
      });
      mockSendPushNotificationsAsync.mockResolvedValue([{ status: 'ok' }]);

      await sendPushNotification(
        testUserId,
        'partner.signed_compact',
        { signedBy: 'actor-123' },
        testSessionId,
      );

      expect(mockSendPushNotificationsAsync).toHaveBeenCalledWith([
        expect.objectContaining({
          title: 'Shantam accepted your invitation',
          body: 'Shantam has started their side of the session. Open it to continue.',
        }),
      ]);
    });

    it('resolves the invitee name for session joined notifications', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        pushToken: validPushToken,
      });
      (prisma.session.findUnique as jest.Mock).mockResolvedValue({
        relationship: {
          members: [
            {
              userId: testUserId,
              nickname: null,
              user: { firstName: 'Jason', name: 'Jason Person' },
            },
            {
              userId: 'actor-123',
              nickname: null,
              user: { firstName: 'Shantam', name: 'Shantam Person' },
            },
          ],
        },
      });
      mockSendPushNotificationsAsync.mockResolvedValue([{ status: 'ok' }]);

      await sendPushNotification(
        testUserId,
        'session.joined',
        { joinedBy: 'actor-123' },
        testSessionId,
      );

      expect(mockSendPushNotificationsAsync).toHaveBeenCalledWith([
        expect.objectContaining({
          title: 'Shantam joined',
          body: 'Shantam accepted your invitation. Open the session to continue together.',
        }),
      ]);
    });

    it('returns true on successful send', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        pushToken: validPushToken,
      });
      mockSendPushNotificationsAsync.mockResolvedValue([{ status: 'ok' }]);

      const result = await sendPushNotification(testUserId, 'session.resolved', {}, testSessionId);

      expect(result).toBe(true);
    });

    it('returns false on send error', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        pushToken: validPushToken,
      });
      mockSendPushNotificationsAsync.mockResolvedValue([{ status: 'error', message: 'Push failed' }]);

      const result = await sendPushNotification(testUserId, 'session.paused', {}, testSessionId);

      expect(result).toBe(false);
    });

    it('clears invalid token when device is not registered', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        pushToken: validPushToken,
      });
      mockSendPushNotificationsAsync.mockResolvedValue([
        {
          status: 'error',
          message: 'Device not registered',
          details: { error: 'DeviceNotRegistered' },
        },
      ]);

      await sendPushNotification(testUserId, 'session.resumed', {}, testSessionId);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: testUserId },
        data: { pushToken: null },
      });
    });

    it('handles exception during send', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        pushToken: validPushToken,
      });
      mockSendPushNotificationsAsync.mockRejectedValue(new Error('Network error'));

      const result = await sendPushNotification(testUserId, 'partner.advanced', {}, testSessionId);

      expect(result).toBe(false);
    });
  });

  describe('sendPushNotifications', () => {
    it('sends notifications to multiple users', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        pushToken: validPushToken,
      });
      mockSendPushNotificationsAsync.mockResolvedValue([{ status: 'ok' }]);

      const userIds = ['user-1', 'user-2', 'user-3'];
      const result = await sendPushNotifications(userIds, 'agreement.confirmed', {}, testSessionId);

      expect(result).toBe(3);
      expect(mockSendPushNotificationsAsync).toHaveBeenCalledTimes(3);
    });

    it('counts only successful sends', async () => {
      let callCount = 0;
      (prisma.user.findUnique as jest.Mock).mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.resolve({ pushToken: null }); // Second user has no token
        }
        return Promise.resolve({ pushToken: validPushToken });
      });
      mockSendPushNotificationsAsync.mockResolvedValue([{ status: 'ok' }]);

      const userIds = ['user-1', 'user-2', 'user-3'];
      const result = await sendPushNotifications(userIds, 'partner.ranking_submitted', {}, testSessionId);

      expect(result).toBe(2); // Only 2 successful sends
    });

    it('returns 0 when all sends fail', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ pushToken: null });

      const userIds = ['user-1', 'user-2'];
      const result = await sendPushNotifications(userIds, 'partner.needs_shared', {}, testSessionId);

      expect(result).toBe(0);
    });
  });

  describe('isValidPushToken', () => {
    it('returns true for valid Expo push token', () => {
      (Expo as unknown as { isExpoPushToken: jest.Mock }).isExpoPushToken.mockReturnValue(true);
      expect(isValidPushToken(validPushToken)).toBe(true);
    });

    it('returns false for invalid token', () => {
      (Expo as unknown as { isExpoPushToken: jest.Mock }).isExpoPushToken.mockReturnValue(false);
      expect(isValidPushToken('invalid')).toBe(false);
    });
  });
});
