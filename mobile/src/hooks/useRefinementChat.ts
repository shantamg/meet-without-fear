/**
 * useRefinementChat Hook
 *
 * Manages stateless refinement chat for refining share offer content.
 * Client manages full message history — no DB writes for chat messages.
 * Uses regular POST (not SSE) since the backend returns a simple JSON response.
 */

import { useState, useCallback, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageRole } from '@meet-without-fear/shared';
import { post } from '../lib/api';
import { stageKeys, notificationKeys } from './queryKeys';
import type { ChatMessage } from '../components/ChatInterface';
import {
  useRefineValidationFeedback,
  useSaveValidationFeedbackDraft,
} from './useStages';

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

export function useRefinementChat(sessionId: string, offerId: string, initialSuggestion: string) {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<RefinementMessage[]>([]);
  const initialSuggestionRef = useRef(initialSuggestion);

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

      // Derive latest proposed content from message history
      const latestProposed = [...messages].reverse().find(m => m.proposedContent)?.proposedContent ?? null;

      return post<RefinementChatResponse>(
        `/sessions/${sessionId}/reconciler/refinement/message`,
        {
          offerId,
          messages: apiMessages,
          proposedContent: latestProposed,
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
      // Optimistically clear the share offer so the Activity Drawer doesn't
      // briefly show the stale "Refine / Share as-is" UI before the refetch completes.
      queryClient.setQueryData(stageKeys.shareOffer(sessionId), { hasSuggestion: false, suggestion: null });

      // Remove the share_offer from pending actions cache immediately
      queryClient.setQueryData(stageKeys.pendingActions(sessionId), (old: any) => {
        if (!old) return old;
        return {
          ...old,
          actions: (old.actions || []).filter((a: any) => a.id !== offerId),
        };
      });

      // Invalidate to refetch authoritative data in the background
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
    setMessages([{
      id: `refinement-initial-${Date.now()}`,
      sessionId,
      role: MessageRole.AI,
      content: `I've put together a suggestion for what you could share. If it feels right, you can share it as-is. Or tell me what you'd like to adjust — I'm here to help you find the right words.`,
      timestamp: new Date().toISOString(),
      senderId: null,
      stage: 2,
      proposedContent: initialSuggestionRef.current,
    }]);
  }, [sessionId]);

  return {
    messages,
    isLoading: chatMutation.isPending,
    isFinalizing: finalizeMutation.isPending,
    isFinalized: finalizeMutation.isSuccess,
    sendMessage,
    finalizeShare,
    resetChat,
  };
}

export function useValidationFeedbackCoachChat(
  sessionId: string,
  roughFeedback: string,
  partnerEmpathyStatement: string
) {
  const [messages, setMessages] = useState<RefinementMessage[]>([]);
  const [isFinalized, setIsFinalized] = useState(false);
  const roughFeedbackRef = useRef(roughFeedback);
  const partnerStatementRef = useRef(partnerEmpathyStatement);
  const { mutate: refineFeedback, isPending: isRefining } = useRefineValidationFeedback();
  const { mutate: saveDraft, isPending: isSavingDraft } = useSaveValidationFeedbackDraft();

  const addErrorMessage = useCallback(() => {
    const errorMsg: RefinementMessage = {
      id: `feedback-err-${Date.now()}`,
      sessionId,
      role: MessageRole.SYSTEM,
      content: 'Sorry, I had trouble processing that. Please try again.',
      timestamp: new Date().toISOString(),
      senderId: null,
      stage: 2,
    };
    setMessages((prev) => [...prev, errorMsg]);
  }, [sessionId]);

  const requestRefinement = useCallback(
    (content: string, partnerStatement = partnerStatementRef.current) => {
      const message = [
        partnerStatement
          ? `Partner empathy statement:\n"${partnerStatement}"`
          : null,
        `What feels off:\n"${content}"`,
        'Help me turn this into feedback I can send.',
      ].filter(Boolean).join('\n\n');

      refineFeedback(
        { sessionId, message },
        {
          onSuccess: (data) => {
            const aiMsg: RefinementMessage = {
              id: `feedback-ai-${Date.now()}`,
              sessionId,
              role: MessageRole.AI,
              content: data.response,
              timestamp: new Date().toISOString(),
              senderId: null,
              stage: 2,
              proposedContent: data.proposedFeedback,
            };

            setMessages((prev) => [...prev, aiMsg]);

            if (data.proposedFeedback) {
              saveDraft({
                sessionId,
                content: data.proposedFeedback,
                readyToShare: false,
              });
            }
          },
          onError: (error) => {
            console.error('[useValidationFeedbackCoachChat] Error:', error);
            addErrorMessage();
          },
        }
      );
    },
    [addErrorMessage, refineFeedback, saveDraft, sessionId]
  );

  const sendMessage = useCallback(
    (content: string) => {
      const userMsg: RefinementMessage = {
        id: `feedback-user-${Date.now()}`,
        sessionId,
        role: MessageRole.USER,
        content,
        timestamp: new Date().toISOString(),
        senderId: 'me',
        stage: 2,
      };
      setMessages((prev) => [...prev, userMsg]);
      requestRefinement(content);
    },
    [requestRefinement, sessionId]
  );

  const finalizeFeedback = useCallback((content: string) => {
    setIsFinalized(true);
    saveDraft({
      sessionId,
      content,
      readyToShare: true,
    });
  }, [saveDraft, sessionId]);

  const resetChat = useCallback(() => {
    roughFeedbackRef.current = roughFeedback;
    partnerStatementRef.current = partnerEmpathyStatement;
    setIsFinalized(false);

    const initialMessages: RefinementMessage[] = [{
      id: `feedback-initial-${Date.now()}`,
      sessionId,
      role: MessageRole.AI,
      content: `Thanks for naming what felt off. I'll help you turn that into feedback ${partnerEmpathyStatement ? 'that responds to the statement you received' : 'your partner can understand'} without making it harsher than it needs to be.`,
      timestamp: new Date().toISOString(),
      senderId: null,
      stage: 2,
    }];

    if (roughFeedback.trim()) {
      initialMessages.push({
        id: `feedback-rough-${Date.now()}`,
        sessionId,
        role: MessageRole.USER,
        content: roughFeedback.trim(),
        timestamp: new Date().toISOString(),
        senderId: 'me',
        stage: 2,
      });
    }

    setMessages(initialMessages);

    if (roughFeedback.trim()) {
      requestRefinement(roughFeedback.trim(), partnerEmpathyStatement);
    }
  }, [partnerEmpathyStatement, requestRefinement, roughFeedback, sessionId]);

  return {
    messages,
    isLoading: isRefining,
    isFinalizing: isSavingDraft,
    isFinalized,
    sendMessage,
    finalizeFeedback,
    resetChat,
  };
}
