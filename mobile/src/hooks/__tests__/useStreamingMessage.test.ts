import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stage } from '@meet-without-fear/shared';
import { useStreamingMessage } from '../useStreamingMessage';
import { messageKeys, sessionKeys, stageKeys, timelineKeys } from '../queryKeys';

jest.mock('../../lib/api', () => ({
  getAuthToken: jest.fn().mockResolvedValue('test-token'),
  isE2EAuthMode: jest.fn().mockReturnValue(false),
  getE2EAuthHeaders: jest.fn().mockReturnValue(null),
}));

const mockEventSourceInstances: Array<{ close: jest.Mock }> = [];

jest.mock('react-native-sse', () => {
  class MockEventSource {
    listeners: Record<string, Array<(event: { data?: string; message?: string }) => void>> = {};
    close = jest.fn();

    constructor() {
      mockEventSourceInstances.push(this);
    }

    addEventListener(
      eventName: string,
      listener: (event: { data?: string; message?: string }) => void
    ) {
      this.listeners[eventName] = this.listeners[eventName] || [];
      this.listeners[eventName].push(listener);
    }
  }
  return { __esModule: true, default: MockEventSource };
});

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function createWrapper(queryClient: QueryClient): React.FC<{ children: React.ReactNode }> {
  return ({ children }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useStreamingMessage', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockEventSourceInstances.length = 0;
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('recovers a stuck stream timeout by refetching persisted messages instead of entering error state', async () => {
    const queryClient = createQueryClient();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    const refetchSpy = jest.spyOn(queryClient, 'refetchQueries');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { result, unmount } = renderHook(() => useStreamingMessage(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.sendMessage({
        sessionId: 'session-123',
        content: 'This is still processing',
        currentStage: Stage.PERSPECTIVE_STRETCH,
      });
    });

    expect(result.current.status).toBe('sending');
    expect(mockEventSourceInstances).toHaveLength(1);

    await act(async () => {
      jest.advanceTimersByTime(15000);
    });

    expect(mockEventSourceInstances[0].close).toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    expect(result.current.errorMessage).toBeNull();
    expect(result.current.failedMessageContent).toBeNull();

    expect(refetchSpy).toHaveBeenCalledWith({ queryKey: messageKeys.list('session-123') });
    expect(refetchSpy).toHaveBeenCalledWith({ queryKey: messageKeys.infinite('session-123') });
    expect(refetchSpy).toHaveBeenCalledWith({ queryKey: timelineKeys.infinite('session-123') });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: sessionKeys.state('session-123') });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: stageKeys.empathyStatus('session-123') });
    expect(warnSpy).toHaveBeenCalledWith('[useStreamingMessage] 15s timeout - recovering persisted messages');

    unmount();
    queryClient.clear();
    warnSpy.mockRestore();
  });
});
