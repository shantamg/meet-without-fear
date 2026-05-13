/**
 * Tests for Stage 4 sub-chat hooks (Phase 3).
 */

import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useOpenStage4SubChat,
  useSendStage4SubChatMessage,
  useResolveStage4SubChat,
} from '../useStages';
import { stageKeys } from '../queryKeys';
import {
  Stage4SubChatAnchor,
  Stage4SubChatStatus,
  MessageRole,
} from '@meet-without-fear/shared';

import * as api from '../../lib/api';

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

jest.mock('../useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', name: 'Test User' },
    isAuthenticated: true,
  }),
}));

const mockPost = api.post as jest.MockedFunction<typeof api.post>;

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const sessionId = 'session-1';

const subChat = {
  id: 'sub-1',
  sessionId,
  userId: 'user-1',
  anchorKind: Stage4SubChatAnchor.NEEDS_BRAINSTORM,
  anchorId: 'need-1',
  status: Stage4SubChatStatus.ACTIVE,
  createdAt: '2026-05-12T00:00:00.000Z',
  resolvedAt: null,
  messages: [],
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useOpenStage4SubChat', () => {
  it('POSTs to the open endpoint and returns the sub-chat', async () => {
    mockPost.mockResolvedValueOnce({ subChat });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useOpenStage4SubChat(), {
      wrapper: createWrapper(qc),
    });

    let resp: any;
    await act(async () => {
      resp = await result.current.mutateAsync({
        sessionId,
        anchorKind: Stage4SubChatAnchor.NEEDS_BRAINSTORM,
        anchorId: 'need-1',
      });
    });

    expect(mockPost).toHaveBeenCalledWith(
      `/sessions/${sessionId}/stage4/subchat`,
      { anchorKind: Stage4SubChatAnchor.NEEDS_BRAINSTORM, anchorId: 'need-1' }
    );
    expect(resp.subChat.id).toBe('sub-1');
  });
});

describe('useSendStage4SubChatMessage', () => {
  it('optimistically appends the user message and rolls back on error', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(stageKeys.stage4SubChat(sessionId, subChat.id), subChat);
    mockPost.mockRejectedValueOnce(new (api as any).ApiClientError(
      { code: 'OOPS', message: 'oops' },
      500
    ));

    const { result } = renderHook(() => useSendStage4SubChatMessage(), {
      wrapper: createWrapper(qc),
    });

    await act(async () => {
      try {
        await result.current.mutateAsync({
          sessionId,
          subChatId: subChat.id,
          content: 'hello',
        });
      } catch {
        /* expected */
      }
    });

    const rolledBack = qc.getQueryData<any>(stageKeys.stage4SubChat(sessionId, subChat.id));
    expect(rolledBack?.messages).toEqual([]);
  });

  it('updates cache with the server response on success', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(stageKeys.stage4SubChat(sessionId, subChat.id), subChat);
    const updated = {
      ...subChat,
      messages: [
        { id: 'm1', role: MessageRole.USER, content: 'hello', createdAt: '2026-05-12T00:01:00Z' },
        {
          id: 'm2',
          role: MessageRole.AI,
          content: 'hi there',
          createdAt: '2026-05-12T00:01:01Z',
        },
      ],
    };
    mockPost.mockResolvedValueOnce({ subChat: updated });

    const { result } = renderHook(() => useSendStage4SubChatMessage(), {
      wrapper: createWrapper(qc),
    });

    await act(async () => {
      await result.current.mutateAsync({
        sessionId,
        subChatId: subChat.id,
        content: 'hello',
      });
    });

    await waitFor(() => {
      const cached = qc.getQueryData<any>(stageKeys.stage4SubChat(sessionId, subChat.id));
      expect(cached?.messages.length).toBe(2);
    });
  });
});

describe('useResolveStage4SubChat', () => {
  it('POSTs the structured payload and refreshes Stage 4 caches', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mockPost.mockResolvedValueOnce({
      subChat: { ...subChat, status: Stage4SubChatStatus.RESOLVED, resolvedAt: 'x' },
      createdProposalIds: ['p-new'],
      updatedProposalIds: [],
    });

    const { result } = renderHook(() => useResolveStage4SubChat(), {
      wrapper: createWrapper(qc),
    });

    await act(async () => {
      await result.current.mutateAsync({
        sessionId,
        subChatId: subChat.id,
        acceptedProposals: [{ description: 'walk together each evening' }],
      });
    });

    expect(mockPost).toHaveBeenCalledWith(
      `/sessions/${sessionId}/stage4/subchat/${subChat.id}/resolve`,
      {
        acceptedProposals: [{ description: 'walk together each evening' }],
        updatedProposals: undefined,
      }
    );
  });
});
