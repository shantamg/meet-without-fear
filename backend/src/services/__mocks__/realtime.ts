import { jest } from '@jest/globals';

export const getAbly = jest.fn(() => ({
  channels: {
    get: jest.fn(() => ({
      publish: jest.fn(() => Promise.resolve()),
      presence: {
        get: jest.fn(() => Promise.resolve({ items: [] })),
      },
    })),
  },
})) as any;

export const publishSessionEvent = jest.fn(() => Promise.resolve()) as any;
export const isUserPresent = jest.fn(() => Promise.resolve(false)) as any;
export const getSessionPresence = jest.fn(() => Promise.resolve([])) as any;
export const publishPresenceUpdate = jest.fn(() => Promise.resolve()) as any;
export const publishTypingIndicator = jest.fn(() => Promise.resolve()) as any;
export const getTypingState = jest.fn(() => null) as any;
export const clearTypingState = jest.fn() as any;
export const clearSessionTypingStates = jest.fn() as any;
export const publishStageProgress = jest.fn(() => Promise.resolve()) as any;
export const publishStageWaiting = jest.fn(() => Promise.resolve()) as any;
export const publishSessionPaused = jest.fn(() => Promise.resolve()) as any;
export const publishSessionResumed = jest.fn(() => Promise.resolve()) as any;
export const publishSessionResolved = jest.fn(() => Promise.resolve()) as any;
export const notifyPartner = jest.fn(() => Promise.resolve()) as any;
export const notifyPartnerWithFallback = jest.fn(() => Promise.resolve()) as any;
export const getSessionChannelName = jest.fn((id: string) => `session:${id}`) as any;
export const getUserChannelName = jest.fn((id: string) => `user:${id}`) as any;
export const publishSessionCreated = jest.fn(() => Promise.resolve()) as any;
export const resetAblyClient = jest.fn() as any;
