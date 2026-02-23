/**
 * useRefinementChat Hook
 *
 * Manages stateless refinement chat for refining share offer content.
 * Client manages full message history — no DB writes for chat messages.
 * Uses regular POST (not SSE) since the backend returns a simple JSON response.
 */

import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageRole } from '@meet-without-fear/shared';
import { post } from '../lib/api';
import { stageKeys, notificationKeys } from './queryKeys';
import type { ChatMessage } from '../components/ChatInterface';

// ============================================================================
// Types
// ============================================================================

interface RefinementChatResponse {
  response: string;
  proposedContent: string | null;
}

interface RefinementFinalizeResponse {
  status: string;
  messageId: string;
  sharedContent: string;
}

export interface RefinementMessage extends ChatMessage {
  /** Extracted proposed content from AI response (if any) */
  proposedContent?: string | null;
}

// ============================================================================
// Hook
// ============================================================================

export function useRefinementChat(sessionId: string, offerId: string) {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<RefinementMessage[]>([]);
  const [latestProposedContent, setLatestProposedContent] = useState<string | null>(null);

  // Mutation for sending refinement chat messages
  const chatMutation = useMutation({
    mutationFn: async (content: string) => {
      // Build message history for the API (role format the server expects)
      const apiMessages = messages
        .filter((m) => m.role === MessageRole.USER || m.role === MessageRole.AI)
        .map((m) => ({
          role: m.role === MessageRole.USER ? 'user' as const : 'assistant' as const,
          content: m.content,
        }));

      // Add the new user message
      apiMessages.push({ role: 'user', content });

      return post<RefinementChatResponse>(
        `/sessions/${sessionId}/reconciler/refinement/message`,
        {
          offerId,
          messages: apiMessages,
          proposedContent: latestProposedContent,
        }
      );
    },
    onSuccess: (data) => {
      // Add AI response to local messages
      const aiMsg: RefinementMessage = {
        id: `refinement-ai-${Date.now()}`,
        sessionId,
        role: MessageRole.AI,
        content: data.response,
        timestamp: new Date().toISOString(),
        senderId: null,
        stage: 2,
        proposedContent: data.proposedContent,
      };
      setMessages((prev) => [...prev, aiMsg]);

      if (data.proposedContent) {
        setLatestProposedContent(data.proposedContent);
      }
    },
    onError: (error) => {
      console.error('[useRefinementChat] Error:', error);
      const errorMsg: RefinementMessage = {
        id: `refinement-err-${Date.now()}`,
        sessionId,
        role: MessageRole.SYSTEM,
        content: 'Sorry, I had trouble processing that. Please try again.',
        timestamp: new Date().toISOString(),
        senderId: null,
        stage: 2,
      };
      setMessages((prev) => [...prev, errorMsg]);
    },
  });

  // Mutation for finalizing the share
  const finalizeMutation = useMutation({
    mutationFn: async (content: string) => {
      return post<RefinementFinalizeResponse>(
        `/sessions/${sessionId}/reconciler/refinement/finalize`,
        { offerId, content }
      );
    },
    onSuccess: () => {
      // Invalidate relevant caches so UI updates
      queryClient.invalidateQueries({ queryKey: stageKeys.pendingActions(sessionId) });
      queryClient.invalidateQueries({ queryKey: stageKeys.empathyStatus(sessionId) });
      queryClient.invalidateQueries({ queryKey: stageKeys.shareOffer(sessionId) });
      queryClient.invalidateQueries({ queryKey: notificationKeys.badgeCount() });
    },
  });

  const sendMessage = useCallback(
    (content: string) => {
      // Add user message to local state immediately
      const userMsg: RefinementMessage = {
        id: `refinement-user-${Date.now()}`,
        sessionId,
        role: MessageRole.USER,
        content,
        timestamp: new Date().toISOString(),
        senderId: 'me',
        stage: 2,
      };
      setMessages((prev) => [...prev, userMsg]);

      // Send to API
      chatMutation.mutate(content);
    },
    [sessionId, chatMutation]
  );

  const finalizeShare = useCallback(
    (content: string) => {
      finalizeMutation.mutate(content);
    },
    [finalizeMutation]
  );

  const resetChat = useCallback(() => {
    setMessages([]);
    setLatestProposedContent(null);
  }, []);

  return {
    messages,
    latestProposedContent,
    isLoading: chatMutation.isPending,
    isFinalizing: finalizeMutation.isPending,
    isFinalized: finalizeMutation.isSuccess,
    sendMessage,
    finalizeShare,
    resetChat,
  };
}
