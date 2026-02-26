import {
  sendPushNotification,
  sendPushNotifications,
  isValidPushToken,
  PUSH_MESSAGES,
  resetExpoClient,
} from '../push';
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
    ((Expo as unknown as { isExpoPushToken: jest.Mock }).isExpoPushToken).mockReturnValue(true);
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
      expect(PUSH_MESSAGES['partner.empathy_shared'].title).toContain('Empathy');
    });

    it('has appropriate messages for agreement events', () => {
      expect(PUSH_MESSAGES['agreement.proposed'].title).toContain('proposed');
      expect(PUSH_MESSAGES['agreement.confirmed'].title).toContain('review');
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

      const result = await sendPushNotification(
        testUserId,
        'partner.signed_compact',
        {},
        testSessionId
      );

      expect(result).toBe(false);
      expect(mockSendPushNotificationsAsync).not.toHaveBeenCalled();
    });

    it('returns false when user is not found', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await sendPushNotification(
        testUserId,
        'partner.signed_compact',
        {},
        testSessionId
      );

      expect(result).toBe(false);
    });

    it('returns false when push token is invalid', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        pushToken: 'invalid-token',
      });
      ((Expo as unknown as { isExpoPushToken: jest.Mock }).isExpoPushToken).mockReturnValue(false);

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await sendPushNotification(
        testUserId,
        'partner.signed_compact',
        {},
        testSessionId
      );

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid push token')
      );

      consoleSpy.mockRestore();
    });

    it('sends notification with correct message template', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        pushToken: validPushToken,
      });
      mockSendPushNotificationsAsync.mockResolvedValue([{ status: 'ok' }]);

      await sendPushNotification(
        testUserId,
        'partner.empathy_shared',
        { empathyId: 'emp-1' },
        testSessionId
      );

      expect(mockSendPushNotificationsAsync).toHaveBeenCalledWith([
        expect.objectContaining({
          to: validPushToken,
          sound: 'default',
          title: PUSH_MESSAGES['partner.empathy_shared'].title,
          body: PUSH_MESSAGES['partner.empathy_shared'].body,
          data: expect.objectContaining({
            sessionId: testSessionId,
            event: 'partner.empathy_shared',
            empathyId: 'emp-1',
          }),
        }),
      ]);
    });

    it('returns true on successful send', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        pushToken: validPushToken,
      });
      mockSendPushNotificationsAsync.mockResolvedValue([{ status: 'ok' }]);

      const result = await sendPushNotification(
        testUserId,
        'session.resolved',
        {},
        testSessionId
      );

      expect(result).toBe(true);
    });

    it('returns false on send error', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        pushToken: validPushToken,
      });
      mockSendPushNotificationsAsync.mockResolvedValue([
        { status: 'error', message: 'Push failed' },
      ]);

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await sendPushNotification(
        testUserId,
        'session.paused',
        {},
        testSessionId
      );

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
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

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      jest.spyOn(console, 'error').mockImplementation();

      await sendPushNotification(testUserId, 'session.resumed', {}, testSessionId);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: testUserId },
        data: { pushToken: null },
      });

      consoleSpy.mockRestore();
    });

    it('handles exception during send', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        pushToken: validPushToken,
      });
      mockSendPushNotificationsAsync.mockRejectedValue(new Error('Network error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await sendPushNotification(
        testUserId,
        'partner.advanced',
        {},
        testSessionId
      );

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error sending notification'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('sendPushNotifications', () => {
    it('sends notifications to multiple users', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        pushToken: validPushToken,
      });
      mockSendPushNotificationsAsync.mockResolvedValue([{ status: 'ok' }]);

      const userIds = ['user-1', 'user-2', 'user-3'];
      const result = await sendPushNotifications(
        userIds,
        'agreement.confirmed',
        {},
        testSessionId
      );

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
      const result = await sendPushNotifications(
        userIds,
        'partner.ranking_submitted',
        {},
        testSessionId
      );

      expect(result).toBe(2); // Only 2 successful sends
    });

    it('returns 0 when all sends fail', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ pushToken: null });

      const userIds = ['user-1', 'user-2'];
      const result = await sendPushNotifications(
        userIds,
        'partner.needs_shared',
        {},
        testSessionId
      );

      expect(result).toBe(0);
    });
  });

  describe('isValidPushToken', () => {
    it('returns true for valid Expo push token', () => {
      ((Expo as unknown as { isExpoPushToken: jest.Mock }).isExpoPushToken).mockReturnValue(true);
      expect(isValidPushToken(validPushToken)).toBe(true);
    });

    it('returns false for invalid token', () => {
      ((Expo as unknown as { isExpoPushToken: jest.Mock }).isExpoPushToken).mockReturnValue(false);
      expect(isValidPushToken('invalid')).toBe(false);
    });
  });
});
