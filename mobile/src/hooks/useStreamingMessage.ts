/**
 * Streaming Message Hook
 *
 * Handles SSE streaming for AI responses with optimistic updates.
 * Uses react-native-sse for proper SSE support in React Native.
 */

import { useState, useCallback, useRef } from 'react';
import { useQueryClient, InfiniteData } from '@tanstack/react-query';
import Constants from 'expo-constants';
import EventSource from 'react-native-sse';
import { getAuthToken } from '../lib/api';
import {
  MessageDTO,
  MessageRole,
  GetMessagesResponse,
  Stage,
} from '@meet-without-fear/shared';
import { messageKeys, sessionKeys, stageKeys } from './queryKeys';

// ============================================================================
// Types
// ============================================================================

/** SSE event types from the streaming endpoint */
interface UserMessageEvent {
  id: string;
  content: string;
  timestamp: string;
}

interface ChunkEvent {
  text: string;
}

interface MetadataEvent {
  metadata: StreamMetadata;
}

interface TextCompleteEvent {
  metadata: StreamMetadata;
}

interface CompleteEvent {
  messageId: string;
  metadata: StreamMetadata;
}

/** Metadata from the AI's tool call */
export interface StreamMetadata {
  offerFeelHeardCheck?: boolean;
  offerReadyToShare?: boolean;
  invitationMessage?: string | null;
  proposedEmpathyStatement?: string | null;
  analysis?: string;
}

/** Status of a streaming message */
export type StreamStatus = 'idle' | 'sending' | 'streaming' | 'complete' | 'error';

/** Parameters for sending a streaming message */
export interface SendStreamingMessageParams {
  sessionId: string;
  content: string;
  currentStage?: Stage;
}

/** Options for the streaming hook */
export interface UseStreamingMessageOptions {
  /** Callback when metadata is received from the AI */
  onMetadata?: (sessionId: string, metadata: StreamMetadata) => void;
  /** Callback when an error occurs */
  onError?: (error: Error) => void;
  /** Callback when streaming completes successfully */
  onComplete?: () => void;
}

/** Result from the streaming hook */
export interface UseStreamingMessageResult {
  /** Current status of the stream */
  status: StreamStatus;
  /** Whether the hook is actively streaming a response */
  isStreaming: boolean;
  /** Whether the hook is in the process of sending (before streaming starts) */
  isSending: boolean;
  /** Send a message and stream the AI response */
  sendMessage: (params: SendStreamingMessageParams) => Promise<void>;
  /** Cancel the current stream */
  cancel: () => void;
  /** Error message if status is 'error' */
  errorMessage: string | null;
  /** Retry the last failed message */
  retry: () => void;
}

// ============================================================================
// Configuration
// ============================================================================

const rawApiUrl =
  Constants.expoConfig?.extra?.apiUrl ||
  process.env.EXPO_PUBLIC_API_URL ||
  'http://localhost:3000';

const API_BASE_URL = rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl}/api`;

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for sending messages with SSE streaming responses.
 *
 * Features:
 * - Optimistic updates for user message
 * - Real-time text chunk updates for AI message
 * - Metadata handling from AI tool calls
 * - Error handling with retry support
 * - EventSource for cancellation
 *
 * @param options - Optional callbacks for metadata, error, and completion
 */
export function useStreamingMessage(
  options: UseStreamingMessageOptions = {}
): UseStreamingMessageResult {
  const { onMetadata, onError, onComplete } = options;
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StreamStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Refs for cleanup and retry
  const eventSourceRef = useRef<EventSource | null>(null);
  const lastParamsRef = useRef<SendStreamingMessageParams | null>(null);

  // Ref to track accumulated text for AI message updates
  const accumulatedTextRef = useRef<string>('');
  const aiMessageIdRef = useRef<string>('');

  // Ref to track optimistic user message ID for replacement
  const optimisticUserIdRef = useRef<string>('');

  // Refs for throttled cache updates (reduces stuttering)
  const lastCacheUpdateRef = useRef<number>(0);
  const pendingUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const CACHE_UPDATE_INTERVAL = 50; // Update cache every 50ms max

  // Ref to track if text_complete was received (for complete event fallback)
  const textCompleteReceivedRef = useRef<boolean>(false);

  /**
   * Add a message to the cache
   */
  const addMessageToCache = useCallback(
    (sessionId: string, message: MessageDTO, stage?: Stage) => {
      const updateCache = (old: GetMessagesResponse | undefined) => {
        if (!old) {
          return { messages: [message], hasMore: false };
        }
        // Check for duplicates
        const existingIds = new Set((old.messages || []).map((m) => m.id));
        if (existingIds.has(message.id)) {
          // Update existing message (for streaming updates)
          return {
            ...old,
            messages: (old.messages || []).map((m) =>
              m.id === message.id ? message : m
            ),
          };
        }
        return {
          ...old,
          messages: [...(old.messages || []), message],
        };
      };

      const updateInfiniteCache = (
        old: InfiniteData<GetMessagesResponse> | undefined
      ): InfiniteData<GetMessagesResponse> | undefined => {
        if (!old || old.pages.length === 0) {
          return {
            pages: [{ messages: [message], hasMore: false }],
            pageParams: [undefined],
          };
        }
        const updatedPages = [...old.pages];
        const firstPage = updatedPages[0];
        const existingIds = new Set((firstPage.messages || []).map((m) => m.id));

        if (existingIds.has(message.id)) {
          // Update existing message (for streaming updates)
          updatedPages[0] = {
            ...firstPage,
            messages: (firstPage.messages || []).map((m) =>
              m.id === message.id ? message : m
            ),
          };
        } else {
          updatedPages[0] = {
            ...firstPage,
            messages: [...(firstPage.messages || []), message],
          };
        }
        return { ...old, pages: updatedPages };
      };

      // Update caches
      queryClient.setQueryData<GetMessagesResponse>(
        messageKeys.list(sessionId),
        updateCache
      );
      queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
        messageKeys.infinite(sessionId),
        updateInfiniteCache
      );

      if (stage !== undefined) {
        queryClient.setQueryData<GetMessagesResponse>(
          messageKeys.list(sessionId, stage),
          updateCache
        );
        queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
          messageKeys.infinite(sessionId, stage),
          updateInfiniteCache
        );
      }
    },
    [queryClient]
  );

  /**
   * Replace a message in cache by removing old ID and adding new message
   * Used to swap optimistic messages with real server messages
   */
  const replaceMessageInCache = useCallback(
    (sessionId: string, oldId: string, newMessage: MessageDTO, stage?: Stage) => {
      const updateCache = (old: GetMessagesResponse | undefined) => {
        if (!old) {
          return { messages: [newMessage], hasMore: false };
        }
        // Remove old message and add new one in its place
        const messages = old.messages || [];
        const oldIndex = messages.findIndex((m) => m.id === oldId);
        if (oldIndex !== -1) {
          // Replace in place
          const updatedMessages = [...messages];
          updatedMessages[oldIndex] = newMessage;
          return { ...old, messages: updatedMessages };
        }
        // Old message not found, just add the new one
        return { ...old, messages: [...messages, newMessage] };
      };

      const updateInfiniteCache = (
        old: InfiniteData<GetMessagesResponse> | undefined
      ): InfiniteData<GetMessagesResponse> | undefined => {
        if (!old || old.pages.length === 0) {
          return {
            pages: [{ messages: [newMessage], hasMore: false }],
            pageParams: [undefined],
          };
        }

        // Search all pages for the old message
        const updatedPages = old.pages.map((page) => {
          const oldIndex = (page.messages || []).findIndex((m) => m.id === oldId);
          if (oldIndex !== -1) {
            const updatedMessages = [...(page.messages || [])];
            updatedMessages[oldIndex] = newMessage;
            return { ...page, messages: updatedMessages };
          }
          return page;
        });

        // If we didn't find the old message in any page, add to first page
        const foundInAnyPage = old.pages.some((page) =>
          (page.messages || []).some((m) => m.id === oldId)
        );
        if (!foundInAnyPage) {
          updatedPages[0] = {
            ...updatedPages[0],
            messages: [...(updatedPages[0].messages || []), newMessage],
          };
        }

        return { ...old, pages: updatedPages };
      };

      // Update caches
      queryClient.setQueryData<GetMessagesResponse>(
        messageKeys.list(sessionId),
        updateCache
      );
      queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
        messageKeys.infinite(sessionId),
        updateInfiniteCache
      );

      if (stage !== undefined) {
        queryClient.setQueryData<GetMessagesResponse>(
          messageKeys.list(sessionId, stage),
          updateCache
        );
        queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
          messageKeys.infinite(sessionId, stage),
          updateInfiniteCache
        );
      }
    },
    [queryClient]
  );

  /**
   * Handle metadata from the AI response
   */
  const handleMetadata = useCallback(
    (sessionId: string, metadata: StreamMetadata) => {
      // Update session state cache for feel-heard check
      if (metadata.offerFeelHeardCheck) {
        queryClient.setQueryData(
          sessionKeys.state(sessionId),
          (old: Record<string, unknown> | undefined) => ({
            ...old,
            showFeelHeardCheck: true,
          })
        );
      }

      // Update empathy draft cache
      if (metadata.proposedEmpathyStatement) {
        queryClient.setQueryData(
          sessionKeys.empathyDraft(sessionId),
          (old: Record<string, unknown> | undefined) => ({
            ...old,
            content: metadata.proposedEmpathyStatement,
            offerReadyToShare: metadata.offerReadyToShare,
          })
        );
      }

      // Update invitation cache
      if (metadata.invitationMessage) {
        queryClient.setQueryData(
          sessionKeys.sessionInvitation(sessionId),
          (old: Record<string, unknown> | undefined) => ({
            ...old,
            invitationMessage: metadata.invitationMessage,
          })
        );
      }

      // Invalidate related queries to ensure fresh data
      queryClient.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) });
      queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
      queryClient.invalidateQueries({ queryKey: sessionKeys.state(sessionId) });

      // Call the onMetadata callback if provided
      onMetadata?.(sessionId, metadata);
    },
    [queryClient, onMetadata]
  );

  /**
   * Send a message with SSE streaming using react-native-sse
   */
  const sendMessage = useCallback(
    async (params: SendStreamingMessageParams) => {
      const { sessionId, content, currentStage } = params;

      // Store params for retry
      lastParamsRef.current = params;

      // Close any existing EventSource
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      // Reset state
      setStatus('sending');
      setErrorMessage(null);
      accumulatedTextRef.current = '';
      aiMessageIdRef.current = `streaming-${Date.now()}`;
      optimisticUserIdRef.current = `optimistic-user-${Date.now()}`;
      textCompleteReceivedRef.current = false;

      // Create optimistic user message
      const optimisticUserMessage: MessageDTO = {
        id: optimisticUserIdRef.current,
        sessionId,
        senderId: null,
        role: MessageRole.USER,
        content,
        stage: currentStage ?? Stage.ONBOARDING,
        timestamp: new Date().toISOString(),
      };

      // Add optimistic user message to cache
      addMessageToCache(sessionId, optimisticUserMessage, currentStage);

      try {
        // Get auth token
        const token = await getAuthToken();
        if (!token) {
          throw new Error('Not authenticated');
        }

        const url = `${API_BASE_URL}/sessions/${sessionId}/messages/stream`;

        // Create EventSource with POST method
        const es = new EventSource<'user_message' | 'chunk' | 'metadata' | 'text_complete' | 'complete' | 'error'>(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ content }),
          pollingInterval: 0, // Disable polling, use SSE
        });

        eventSourceRef.current = es;

        // Create placeholder AI message once streaming starts
        let placeholderCreated = false;
        const createPlaceholder = () => {
          if (placeholderCreated) return;
          placeholderCreated = true;
          setStatus('streaming');
          const placeholderAIMessage: MessageDTO = {
            id: aiMessageIdRef.current,
            sessionId,
            senderId: null,
            role: MessageRole.AI,
            content: '',
            stage: currentStage ?? Stage.ONBOARDING,
            timestamp: new Date().toISOString(),
          };
          addMessageToCache(sessionId, placeholderAIMessage, currentStage);
        };

        // Handle user_message event - replace optimistic message with real one
        es.addEventListener('user_message', (event) => {
          if (!event.data) return;
          try {
            const data = JSON.parse(event.data) as UserMessageEvent;
            const realUserMessage: MessageDTO = {
              id: data.id,
              sessionId,
              senderId: null,
              role: MessageRole.USER,
              content: data.content,
              stage: currentStage ?? Stage.ONBOARDING,
              timestamp: data.timestamp,
            };
            // Replace optimistic message with real server message
            if (optimisticUserIdRef.current) {
              replaceMessageInCache(sessionId, optimisticUserIdRef.current, realUserMessage, currentStage);
              optimisticUserIdRef.current = ''; // Clear after replacement
            } else {
              addMessageToCache(sessionId, realUserMessage, currentStage);
            }
          } catch (e) {
            console.error('[useStreamingMessage] Error parsing user_message:', e);
          }
        });

        // Handle chunk event with throttled cache updates
        es.addEventListener('chunk', (event) => {
          if (!event.data) return;
          createPlaceholder();
          try {
            const data = JSON.parse(event.data) as ChunkEvent;
            accumulatedTextRef.current += data.text;

            // Throttle cache updates to reduce stuttering
            const now = Date.now();
            const timeSinceLastUpdate = now - lastCacheUpdateRef.current;

            // Clear any pending update
            if (pendingUpdateRef.current) {
              clearTimeout(pendingUpdateRef.current);
              pendingUpdateRef.current = null;
            }

            const updateCache = () => {
              const updatedAIMessage: MessageDTO = {
                id: aiMessageIdRef.current,
                sessionId,
                senderId: null,
                role: MessageRole.AI,
                content: accumulatedTextRef.current,
                stage: currentStage ?? Stage.ONBOARDING,
                timestamp: new Date().toISOString(),
              };
              addMessageToCache(sessionId, updatedAIMessage, currentStage);
              lastCacheUpdateRef.current = Date.now();
            };

            if (timeSinceLastUpdate >= CACHE_UPDATE_INTERVAL) {
              // Enough time has passed, update immediately
              updateCache();
            } else {
              // Schedule update for when the interval is reached
              pendingUpdateRef.current = setTimeout(
                updateCache,
                CACHE_UPDATE_INTERVAL - timeSinceLastUpdate
              );
            }
          } catch (e) {
            console.error('[useStreamingMessage] Error parsing chunk:', e);
          }
        });

        // Handle metadata event - tool call received during streaming
        // This allows UI to show panels (invitation, empathy) immediately while text continues
        es.addEventListener('metadata', (event) => {
          if (!event.data) return;

          try {
            const data = JSON.parse(event.data) as MetadataEvent;
            console.log(`[useStreamingMessage] [TIMING] metadata event received at ${Date.now()}, has invitationMessage:`,
              !!data.metadata?.invitationMessage);

            // Handle metadata for UI panels immediately
            if (data.metadata) {
              handleMetadata(sessionId, data.metadata);
            }
          } catch (e) {
            console.error('[useStreamingMessage] Error parsing metadata:', e);
          }
        });

        // Handle text_complete event - streaming text is done (before DB saves)
        // This allows the UI to stop showing the blinking cursor immediately
        es.addEventListener('text_complete', (event) => {
          const receiveTime = Date.now();
          console.log(`[useStreamingMessage] [TIMING] text_complete received at ${receiveTime}`);
          if (!event.data) return;

          // Clear any pending throttled update
          if (pendingUpdateRef.current) {
            clearTimeout(pendingUpdateRef.current);
            pendingUpdateRef.current = null;
          }

          try {
            const data = JSON.parse(event.data) as TextCompleteEvent;
            console.log(`[useStreamingMessage] [TIMING] text_complete parsed, has invitationMessage:`,
              !!data.metadata?.invitationMessage);

            // Update cache with final content
            const finalAIMessage: MessageDTO = {
              id: aiMessageIdRef.current,
              sessionId,
              senderId: null,
              role: MessageRole.AI,
              content: accumulatedTextRef.current,
              stage: currentStage ?? Stage.ONBOARDING,
              timestamp: new Date().toISOString(),
            };
            addMessageToCache(sessionId, finalAIMessage, currentStage);

            // Handle metadata for UI panels (invitation, empathy, etc.)
            if (data.metadata) {
              console.log(`[useStreamingMessage] [TIMING] Calling handleMetadata at ${Date.now()}`);
              handleMetadata(sessionId, data.metadata);
              console.log(`[useStreamingMessage] [TIMING] handleMetadata returned at ${Date.now()}`);
            }

            // Mark streaming as complete - cursor stops immediately
            textCompleteReceivedRef.current = true;
            setStatus('complete');
            onComplete?.();
            console.log(`[useStreamingMessage] [TIMING] text_complete handler done at ${Date.now()}`);
          } catch (e) {
            console.error('[useStreamingMessage] Error parsing text_complete:', e);
          }
        });

        // Handle complete event - DB saves finished, close connection
        // The streaming UI has already stopped via text_complete
        es.addEventListener('complete', (event) => {
          // Clear any pending throttled update (in case text_complete wasn't received)
          if (pendingUpdateRef.current) {
            clearTimeout(pendingUpdateRef.current);
            pendingUpdateRef.current = null;
          }

          // If text_complete wasn't received (fallback), handle completion here
          if (!textCompleteReceivedRef.current) {
            if (event.data) {
              try {
                const data = JSON.parse(event.data) as CompleteEvent;

                const finalAIMessage: MessageDTO = {
                  id: aiMessageIdRef.current,
                  sessionId,
                  senderId: null,
                  role: MessageRole.AI,
                  content: accumulatedTextRef.current,
                  stage: currentStage ?? Stage.ONBOARDING,
                  timestamp: new Date().toISOString(),
                };
                addMessageToCache(sessionId, finalAIMessage, currentStage);

                if (data.metadata) {
                  handleMetadata(sessionId, data.metadata);
                }

                setStatus('complete');
                onComplete?.();
              } catch (e) {
                console.error('[useStreamingMessage] Error parsing complete:', e);
              }
            }
          }

          // Close the EventSource
          es.close();
          eventSourceRef.current = null;
        });

        // Handle error event from SSE
        // react-native-sse error events have: ErrorEvent (message, xhrState, xhrStatus),
        // TimeoutEvent (type only), or ExceptionEvent (message, error)
        es.addEventListener('error', (event) => {
          // Clear any pending throttled update
          if (pendingUpdateRef.current) {
            clearTimeout(pendingUpdateRef.current);
            pendingUpdateRef.current = null;
          }

          const errorMsg = 'message' in event ? event.message : 'Connection error';
          console.error('[useStreamingMessage] SSE error:', errorMsg);
          setErrorMessage(errorMsg);
          setStatus('error');
          onError?.(new Error(errorMsg));
          es.close();
          eventSourceRef.current = null;
        });

        // Handle open event
        es.addEventListener('open', () => {
          // Connection opened, waiting for events
        });

      } catch (error) {
        console.error('[useStreamingMessage] Error:', error);
        setErrorMessage((error as Error).message || 'Failed to send message');
        setStatus('error');
        onError?.(error as Error);
      }
    },
    [addMessageToCache, replaceMessageInCache, handleMetadata, queryClient, onComplete, onError]
  );

  /**
   * Cancel the current stream
   */
  const cancel = useCallback(() => {
    // Clear any pending throttled update
    if (pendingUpdateRef.current) {
      clearTimeout(pendingUpdateRef.current);
      pendingUpdateRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setStatus('idle');
  }, []);

  /**
   * Retry the last failed message
   */
  const retry = useCallback(() => {
    if (lastParamsRef.current) {
      sendMessage(lastParamsRef.current);
    }
  }, [sendMessage]);

  return {
    status,
    isStreaming: status === 'streaming',
    isSending: status === 'sending',
    sendMessage,
    cancel,
    errorMessage,
    retry,
  };
}
