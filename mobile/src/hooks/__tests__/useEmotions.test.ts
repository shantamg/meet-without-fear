import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useEmotions } from '../useEmotions';

// Import mocked functions
import * as api from '../../lib/api';

// Mock the API module
jest.mock('../../lib/api', () => ({
  get: jest.fn(),
  post: jest.fn(),
  ApiClientError: class ApiClientError extends Error {
    code: string;
    status: number;
    constructor(error: { code: string; message: string }, status: number) {
      super(error.message);
      this.code = error.code;
      this.status = status;
    }
  },
}));

const mockGet = api.get as jest.MockedFunction<typeof api.get>;
const mockPost = api.post as jest.MockedFunction<typeof api.post>;

// Create a wrapper with QueryClient
function createWrapper(): React.FC<{ children: React.ReactNode }> {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useEmotions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Silence console.log from stub API
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Default mock implementations for successful API calls
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/emotions')) {
        return Promise.resolve({ readings: [] });
      }
      if (url.includes('/exercises')) {
        return Promise.resolve({ exercises: [] });
      }
      return Promise.resolve({});
    });

    mockPost.mockImplementation((url: string, data?: unknown) => {
      if (url.includes('/emotions')) {
        const input = data as { intensity: number; context?: string };
        return Promise.resolve({
          reading: {
            id: `emotion-${Date.now()}`,
            intensity: input.intensity,
            context: input.context,
            timestamp: new Date().toISOString(),
          },
        });
      }
      if (url.includes('/exercises')) {
        return Promise.resolve({
          success: true,
        });
      }
      return Promise.resolve({});
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('without sessionId', () => {
    it('returns empty arrays when no sessionId provided', () => {
      const { result } = renderHook(() => useEmotions(), {
        wrapper: createWrapper(),
      });

      expect(result.current.emotions).toEqual([]);
      expect(result.current.exercises).toEqual([]);
    });

    it('throws error when recording emotion without sessionId', async () => {
      const { result } = renderHook(() => useEmotions(), {
        wrapper: createWrapper(),
      });

      await expect(result.current.recordEmotion(5)).rejects.toThrow(
        'Session ID is required to record emotion'
      );
    });

    it('throws error when completing exercise without sessionId', async () => {
      const { result } = renderHook(() => useEmotions(), {
        wrapper: createWrapper(),
      });

      await expect(result.current.completeExercise('breathing', 7, 4, 60)).rejects.toThrow(
        'Session ID is required to complete exercise'
      );
    });
  });

  describe('with sessionId', () => {
    const sessionId = 'test-session-123';

    it('fetches emotions for session', async () => {
      const { result } = renderHook(() => useEmotions(sessionId), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoadingEmotions).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoadingEmotions).toBe(false);
      });

      expect(result.current.emotions).toEqual([]);
    });

    it('fetches exercises for session', async () => {
      const { result } = renderHook(() => useEmotions(sessionId), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoadingExercises).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoadingExercises).toBe(false);
      });

      expect(result.current.exercises).toEqual([]);
    });

    it('records emotion successfully', async () => {
      const { result } = renderHook(() => useEmotions(sessionId), {
        wrapper: createWrapper(),
      });

      let recordedEmotion: Awaited<ReturnType<typeof result.current.recordEmotion>> | undefined;

      await act(async () => {
        recordedEmotion = await result.current.recordEmotion(7, 'Feeling stressed');
      });

      expect(recordedEmotion).toBeDefined();
      expect(recordedEmotion?.intensity).toBe(7);
      expect(recordedEmotion?.context).toBe('Feeling stressed');
      expect(recordedEmotion?.sessionId).toBe(sessionId);
    });

    it('records emotion without context', async () => {
      const { result } = renderHook(() => useEmotions(sessionId), {
        wrapper: createWrapper(),
      });

      let recordedEmotion: Awaited<ReturnType<typeof result.current.recordEmotion>> | undefined;

      await act(async () => {
        recordedEmotion = await result.current.recordEmotion(3);
      });

      expect(recordedEmotion).toBeDefined();
      expect(recordedEmotion?.intensity).toBe(3);
      expect(recordedEmotion?.context).toBeUndefined();
    });

    it('completes exercise successfully', async () => {
      const { result } = renderHook(() => useEmotions(sessionId), {
        wrapper: createWrapper(),
      });

      let completedExercise:
        | Awaited<ReturnType<typeof result.current.completeExercise>>
        | undefined;

      await act(async () => {
        completedExercise = await result.current.completeExercise('breathing', 8, 4, 120);
      });

      expect(completedExercise).toBeDefined();
      expect(completedExercise?.exerciseType).toBe('breathing');
      expect(completedExercise?.intensityBefore).toBe(8);
      expect(completedExercise?.intensityAfter).toBe(4);
      expect(completedExercise?.durationSeconds).toBe(120);
      expect(completedExercise?.sessionId).toBe(sessionId);
    });

    it('tracks recording state', async () => {
      const { result } = renderHook(() => useEmotions(sessionId), {
        wrapper: createWrapper(),
      });

      // Initial state should be false
      expect(result.current.isRecordingEmotion).toBe(false);

      // After mutation completes, state should return to false
      await act(async () => {
        await result.current.recordEmotion(5);
      });

      expect(result.current.isRecordingEmotion).toBe(false);
    });

    it('tracks completing exercise state', async () => {
      const { result } = renderHook(() => useEmotions(sessionId), {
        wrapper: createWrapper(),
      });

      // Initial state should be false
      expect(result.current.isCompletingExercise).toBe(false);

      // After mutation completes, state should return to false
      await act(async () => {
        await result.current.completeExercise('breathing', 7, 5, 60);
      });

      expect(result.current.isCompletingExercise).toBe(false);
    });

    it('provides refetch functions', () => {
      const { result } = renderHook(() => useEmotions(sessionId), {
        wrapper: createWrapper(),
      });

      expect(typeof result.current.refetchEmotions).toBe('function');
      expect(typeof result.current.refetchExercises).toBe('function');
    });
  });

  describe('exercise types', () => {
    const sessionId = 'test-session-123';

    it('supports breathing exercise type', async () => {
      const { result } = renderHook(() => useEmotions(sessionId), {
        wrapper: createWrapper(),
      });

      let exercise: Awaited<ReturnType<typeof result.current.completeExercise>> | undefined;

      await act(async () => {
        exercise = await result.current.completeExercise('breathing', 6, 3, 90);
      });

      expect(exercise?.exerciseType).toBe('breathing');
    });

    it('supports grounding exercise type', async () => {
      const { result } = renderHook(() => useEmotions(sessionId), {
        wrapper: createWrapper(),
      });

      let exercise: Awaited<ReturnType<typeof result.current.completeExercise>> | undefined;

      await act(async () => {
        exercise = await result.current.completeExercise('grounding', 5, 2, 60);
      });

      expect(exercise?.exerciseType).toBe('grounding');
    });

    it('supports other exercise type', async () => {
      const { result } = renderHook(() => useEmotions(sessionId), {
        wrapper: createWrapper(),
      });

      let exercise: Awaited<ReturnType<typeof result.current.completeExercise>> | undefined;

      await act(async () => {
        exercise = await result.current.completeExercise('other', 7, 4, 45);
      });

      expect(exercise?.exerciseType).toBe('other');
    });
  });
});
