# Streaming AI Responses Design

**Date:** 2026-01-15
**Status:** Ready for Implementation

## Problem Statement

The current AI orchestrator forces Sonnet to output JSON (`{ "response": "...", "analysis": "..." }`), which cannot be streamed. Users stare at a spinner for 2-3 seconds until the entire completion finishes, adding significant perceived latency.

## Solution Overview

Switch from JSON output to **Tool Use** with **HTTP Server-Sent Events (SSE)** streaming:

1. Claude streams text naturally (no JSON wrapper)
2. Metadata (e.g., `offerFeelHeardCheck`) delivered via tool call at end of stream
3. SSE delivers tokens directly from backend to mobile (bypassing Ably for streaming)
4. First token visible in ~300ms instead of 2-3 seconds

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Metadata delivery | Tool Use | Cleaner separation, faster first-token, no JSON parsing mid-stream |
| Streaming transport | HTTP SSE | Lower latency than Ably, no per-message cost, simpler debugging |
| Connection lifecycle | Hold open | Simpler than Ably signal + SSE handoff, 2-3s is fine for HTTP |
| Mobile state | Optimistic cache entry | Maintains "cache-first" architecture principle |
| Error handling | Inline recovery | "Tap to retry" in message bubble, contextual UX |

---

## Backend Implementation

### 1. Streaming Bedrock Function

**File:** `backend/src/lib/bedrock.ts`

```typescript
import {
  ConverseStreamCommand,
  type ConverseStreamCommandInput,
} from '@aws-sdk/client-bedrock-runtime';

export interface StreamEvent {
  type: 'text' | 'tool_use' | 'done';
  content?: string;
  name?: string;
  input?: Record<string, unknown>;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface SonnetStreamOptions {
  systemPrompt: string;
  messages: SimpleMessage[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  sessionId: string;
  turnId: string;
  operation: string;
}

export async function* getSonnetStreamingResponse(
  options: SonnetStreamOptions
): AsyncGenerator<StreamEvent> {
  const client = getBedrockClient();
  if (!client) {
    throw new Error('Bedrock client not configured');
  }

  const command = new ConverseStreamCommand({
    modelId: BEDROCK_SONNET_MODEL_ID,
    messages: toBedrockMessages(options.messages),
    system: [{ text: options.systemPrompt }],
    toolConfig: options.tools ? { tools: options.tools } : undefined,
    inferenceConfig: { maxTokens: options.maxTokens ?? 2048 },
  });

  const response = await client.send(command);

  // State for accumulating tool input chunks
  let currentToolName = '';
  let toolInputBuffer = '';
  let isCollectingTool = false;

  for await (const event of response.stream || []) {
    // 1. Handle Content Block Start (Capture Tool Name)
    if (event.contentBlockStart?.start?.toolUse) {
      isCollectingTool = true;
      currentToolName = event.contentBlockStart.start.toolUse.name || '';
      toolInputBuffer = '';
    }

    // 2. Handle Deltas (Text vs Tool Input)
    if (event.contentBlockDelta?.delta) {
      // Case A: Streaming Text
      if (event.contentBlockDelta.delta.text) {
        yield { type: 'text', content: event.contentBlockDelta.delta.text };
      }

      // Case B: Streaming Tool Input Chunks
      if (event.contentBlockDelta.delta.toolUse?.input) {
        toolInputBuffer += event.contentBlockDelta.delta.toolUse.input;
      }
    }

    // 3. Handle Content Block Stop (Parse & Yield Tool)
    if (event.contentBlockStop && isCollectingTool) {
      try {
        if (toolInputBuffer) {
          const parsedInput = JSON.parse(toolInputBuffer);
          yield {
            type: 'tool_use',
            name: currentToolName,
            input: parsedInput,
          };
        }
      } catch (e) {
        console.error('Failed to parse tool input JSON:', e);
      }
      isCollectingTool = false;
      toolInputBuffer = '';
      currentToolName = '';
    }

    // 4. Handle Message Stop (Usage & Cost)
    if (event.messageStop) {
      yield { type: 'done', usage: event.metadata?.usage };
    }
  }
}
```

### 2. Tool Definition

**File:** `backend/src/services/stage-tools.ts`

```typescript
export const SESSION_STATE_TOOL = {
  toolSpec: {
    name: 'update_session_state',
    description:
      'Call this after responding. Only provide fields relevant to the current stage (e.g., do not provide invitationMessage in Stage 2, do not provide offerReadyToShare in Stage 1).',
    inputSchema: {
      json: {
        type: 'object',
        properties: {
          // Stage 1: Feel-heard check
          offerFeelHeardCheck: {
            type: 'boolean',
            description: 'True if user seems ready for the "Do you feel heard?" check-in',
          },
          // Stage 2: Ready to share empathy
          offerReadyToShare: {
            type: 'boolean',
            description: 'True if user is ready to share their empathy attempt',
          },
          proposedEmpathyStatement: {
            type: 'string',
            description: 'Your suggested empathy statement summarizing their understanding',
          },
          // Stage 0: Invitation crafting
          invitationMessage: {
            type: 'string',
            description: 'The drafted invitation message for the partner',
          },
          // All stages: Internal reasoning (not shown to user)
          analysis: {
            type: 'string',
            description: 'Your internal reasoning about this response',
          },
        },
      },
    },
  },
};
```

### 3. SSE Endpoint

**File:** `backend/src/controllers/messages.ts`

```typescript
import { getSonnetStreamingResponse } from '../lib/bedrock';
import { SESSION_STATE_TOOL } from '../services/stage-tools';

export async function streamMessage(req: Request, res: Response) {
  const { id: sessionId } = req.params;
  const { content } = req.body;
  const userId = req.user.id;
  const turnId = generateTurnId();

  // Set SSE headers (disable buffering)
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Nginx
  res.flushHeaders();

  try {
    // 1. Save user message
    const userMessage = await saveUserMessage(sessionId, userId, content, turnId);
    res.write(`event: user_message\ndata: ${JSON.stringify(userMessage)}\n\n`);

    // 2. Pre-response tasks (only need user input, fire-and-forget)
    //    - Memory intent detection
    //    - Reference detection
    //    - Retrieval planning
    startPreResponseTasks(sessionId, userId, content, turnId);

    // 3. Build context (sequential, needed for Sonnet)
    const context = await buildOrchestratorContext(sessionId, userId, content, turnId);
    const systemPrompt = buildStagePrompt(context);

    // 4. Stream from Sonnet
    const stream = getSonnetStreamingResponse({
      systemPrompt,
      messages: context.conversationHistory,
      tools: [SESSION_STATE_TOOL],
      sessionId,
      turnId,
      operation: 'orchestrator-stream',
    });

    let fullResponse = '';
    let metadata: Record<string, unknown> = {};

    for await (const event of stream) {
      if (event.type === 'text') {
        fullResponse += event.content;
        res.write(`event: chunk\ndata: ${JSON.stringify({ text: event.content })}\n\n`);
      }

      if (event.type === 'tool_use' && event.name === 'update_session_state') {
        metadata = event.input || {};
      }

      if (event.type === 'done') {
        // 5a. Save AI message & process metadata (sequential, needs response)
        const aiMessage = await saveAIMessage(sessionId, userId, fullResponse, metadata, turnId);
        await processStageMetadata(sessionId, metadata);

        // 5b. Post-response tasks (need full turn, fire-and-forget)
        //     - Turn summarization
        //     - Theme classification
        //     - Partner session detection
        startPostResponseTasks(sessionId, userId, content, fullResponse, turnId);

        res.write(
          `event: complete\ndata: ${JSON.stringify({
            messageId: aiMessage.id,
            ...metadata,
          })}\n\n`
        );
      }
    }
  } catch (error) {
    console.error('[Stream] Error:', error);
    res.write(`event: error\ndata: ${JSON.stringify({ error: 'Stream failed' })}\n\n`);
  } finally {
    res.end();
  }
}
```

### 4. Compression Middleware Fix

**File:** `backend/src/app.ts`

```typescript
import compression from 'compression';

app.use(
  compression({
    filter: (req, res) => {
      // Disable compression for SSE endpoints
      if (req.path.includes('/messages/stream')) {
        return false;
      }
      return compression.filter(req, res);
    },
  })
);
```

### 5. Prompt Changes

**File:** `backend/src/services/stage-prompts.ts`

For each stage prompt:

1. **Remove:** All "Respond in JSON:" instructions and format specifications
2. **Remove:** "BEFORE EVERY RESPONSE, output your thinking in `<analysis>` tags"
3. **Remove:** Any JSON structure examples
4. **Add:** "When you have finished speaking, call the `update_session_state` tool. Use its `analysis` field for your reasoning and any stage-specific signals."

---

## Mobile Implementation

### 1. Polyfill Setup

**File:** `mobile/index.js` (app entry point)

```typescript
import 'fast-text-encoding'; // TextDecoder polyfill - MUST be first
import { AppRegistry } from 'react-native';
// ... rest of imports
```

**Install:**
```bash
npm install fast-text-encoding
```

### 2. Streaming Hook

**File:** `mobile/src/hooks/useStreamingMessage.ts`

```typescript
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { messageKeys, sessionKeys, empathyKeys } from './queryKeys';
import { useAuth } from './useAuth';
import { API_URL } from '../config';

interface SSEEvent {
  type: 'user_message' | 'chunk' | 'complete' | 'error';
  data: Record<string, unknown>;
}

function parseSSEEvent(raw: string): SSEEvent | null {
  const lines = raw.split('\n');
  let eventType = '';
  let data = '';

  for (const line of lines) {
    if (line.startsWith('event: ')) {
      eventType = line.slice(7);
    } else if (line.startsWith('data: ')) {
      data = line.slice(6);
    }
  }

  if (!eventType || !data) return null;

  try {
    return { type: eventType as SSEEvent['type'], data: JSON.parse(data) };
  } catch {
    return null;
  }
}

export function useStreamingMessage(sessionId: string) {
  const queryClient = useQueryClient();
  const { token } = useAuth();
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (content: string) => {
      abortControllerRef.current = new AbortController();

      // Optimistically add user message + placeholder AI message
      queryClient.setQueryData(messageKeys.list(sessionId), (old: any) => {
        if (!old) return old;
        return {
          ...old,
          messages: [
            ...old.messages,
            { id: 'temp-user', role: 'user', content, status: 'pending' },
            { id: 'temp-ai', role: 'assistant', content: '', status: 'streaming' },
          ],
        };
      });

      try {
        const response = await fetch(`${API_URL}/sessions/${sessionId}/messages/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ content }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No reader available');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() || '';

          for (const eventStr of events) {
            const event = parseSSEEvent(eventStr);
            if (!event) continue;

            // Reconcile temp user ID with real DB ID
            if (event.type === 'user_message') {
              const realUserMessage = event.data;
              queryClient.setQueryData(messageKeys.list(sessionId), (old: any) => {
                if (!old) return old;
                return {
                  ...old,
                  messages: old.messages.map((m: any) =>
                    m.id === 'temp-user' ? { ...realUserMessage, status: 'sent' } : m
                  ),
                };
              });
            }

            // Append text chunk (immutable update for re-render)
            if (event.type === 'chunk') {
              const text = event.data.text as string;
              queryClient.setQueryData(messageKeys.list(sessionId), (old: any) => {
                if (!old) return old;
                return {
                  ...old,
                  messages: old.messages.map((msg: any) =>
                    msg.status === 'streaming'
                      ? { ...msg, content: msg.content + text }
                      : msg
                  ),
                };
              });
            }

            // Finalize message & handle metadata
            if (event.type === 'complete') {
              const { messageId, ...metadata } = event.data;

              queryClient.setQueryData(messageKeys.list(sessionId), (old: any) => {
                if (!old) return old;
                return {
                  ...old,
                  messages: old.messages.map((m: any) =>
                    m.status === 'streaming'
                      ? { ...m, id: messageId, status: 'complete' }
                      : m
                  ),
                };
              });

              handleMetadata(sessionId, metadata, queryClient);
            }

            // Error handling
            if (event.type === 'error') {
              queryClient.setQueryData(messageKeys.list(sessionId), (old: any) => {
                if (!old) return old;
                return {
                  ...old,
                  messages: old.messages.map((m: any) =>
                    m.status === 'streaming' ? { ...m, status: 'error' } : m
                  ),
                };
              });
            }
          }
        }
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          console.error('[Stream] Error:', error);
          queryClient.setQueryData(messageKeys.list(sessionId), (old: any) => {
            if (!old) return old;
            return {
              ...old,
              messages: old.messages.map((m: any) =>
                m.status === 'streaming' ? { ...m, status: 'error' } : m
              ),
            };
          });
        }
      }
    },
    [sessionId, queryClient, token]
  );

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return { sendMessage, cancel };
}

function handleMetadata(
  sessionId: string,
  metadata: Record<string, unknown>,
  queryClient: ReturnType<typeof useQueryClient>
) {
  // Stage 1: Feel-heard check
  if (metadata.offerFeelHeardCheck) {
    queryClient.setQueryData(sessionKeys.state(sessionId), (old: any) => ({
      ...old,
      showFeelHeardCheck: true,
    }));
  }

  // Stage 2: Proposed empathy statement
  if (metadata.proposedEmpathyStatement) {
    queryClient.setQueryData(empathyKeys.draft(sessionId), {
      content: metadata.proposedEmpathyStatement,
    });
  }

  // Stage 0: Invitation message
  if (metadata.invitationMessage) {
    queryClient.setQueryData(sessionKeys.invitation(sessionId), (old: any) => ({
      ...old,
      invitationMessage: metadata.invitationMessage,
    }));
  }
}
```

### 3. UI Component Changes

**File:** `mobile/src/components/ChatInterface.tsx`

```typescript
// Derive typing indicator from message status
const messages = useMessages(sessionId);
const showTypingIndicator = messages.some(
  (m) => m.status === 'streaming' && m.content === ''
);

// Render messages based on status
{messages.map((message) => {
  if (message.status === 'error') {
    return <ErrorMessage key={message.id} message={message} onRetry={handleRetry} />;
  }

  if (message.status === 'streaming') {
    return (
      <MessageBubble key={message.id} variant="assistant">
        {message.content}
        <BlinkingCursor />
      </MessageBubble>
    );
  }

  return <MessageBubble key={message.id} variant={message.role} content={message.content} />;
})}

{showTypingIndicator && <TypingIndicator />}
```

### 4. Remove Typewriter Animation

1. Delete `TypewriterText` component or disable animation logic
2. Replace `onTypewriterComplete` callbacks with logic that triggers when message `status` changes to `'complete'`

---

## Migration Strategy

### Phase 1: Backend (No Breaking Changes)
1. Add `getSonnetStreamingResponse()` to bedrock.ts
2. Add `SESSION_STATE_TOOL` definition
3. Add new `/sessions/:id/messages/stream` endpoint
4. Keep existing `/sessions/:id/messages` endpoint working

### Phase 2: Mobile Updates
1. Add polyfill
2. Add `useStreamingMessage` hook
3. Update ChatInterface to use new hook
4. Remove typewriter animation
5. Add message status handling

### Phase 3: Prompt Migration
1. Update stage prompts to remove JSON instructions
2. Add tool call instructions
3. Test each stage thoroughly

### Phase 4: Cleanup
1. Remove old non-streaming code path (after validation)
2. Remove JSON extraction utilities if no longer needed
3. Update tests

---

## Testing Checklist

### Backend
- [ ] SSE headers are correct
- [ ] Compression is disabled for stream endpoint
- [ ] Tool input chunks accumulate correctly
- [ ] Pre-response tasks run in parallel
- [ ] Post-response tasks run after stream completes
- [ ] Error events are sent on failure
- [ ] Token usage is tracked for cost attribution

### Mobile
- [ ] TextDecoder polyfill works on iOS and Android
- [ ] Streaming fetch works (if not, switch to react-native-sse)
- [ ] Optimistic updates appear immediately
- [ ] Chunks append without flicker
- [ ] Temp IDs reconcile with real IDs
- [ ] Error state shows retry button
- [ ] Cancel works on navigation

### UX
- [ ] 3 dots show until first token
- [ ] Text streams smoothly
- [ ] Blinking cursor visible during stream
- [ ] Feel-heard button appears after complete
- [ ] Empathy draft populates after complete
- [ ] No typewriter animation remains

---

## Rollback Plan

If issues arise in production:

1. Mobile can fall back to existing Ably-based message delivery
2. Backend can serve both endpoints simultaneously
3. Feature flag can switch between streaming and non-streaming paths

---

## Appendix: Android Fetch Fallback

If Android buffers the entire response before delivering chunks, install:

```bash
npm install react-native-sse
```

And replace the fetch-based streaming with:

```typescript
import EventSource from 'react-native-sse';

const es = new EventSource(`${API_URL}/sessions/${sessionId}/messages/stream`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ content }),
});

es.addEventListener('chunk', (event) => {
  const data = JSON.parse(event.data);
  // Update cache...
});

es.addEventListener('complete', (event) => {
  const data = JSON.parse(event.data);
  // Finalize...
  es.close();
});
```

---

## Appendix B: Reconciler Signal-to-Noise Filtering

### Problem

The Reconciler treats **Process Friction** (annoyance with the AI) as **Relational Content** (feelings about the partner).

This happens because `reconciler.ts` fetches all Stage 1 messages and feeds them into analysis. The LLM then "helpfully" tries to reconcile everything the user said, including complaints like "You sound like a robot" or "Stop asking me that."

**Result:** The partner receives suggestions that misattribute frustration, e.g., "They seem angry and dismissive" when the user was actually just annoyed at the bot.

### Solution

Add a **Critical Filtering Rule** to the Reconciler system prompt. No new classifier needed - Claude Sonnet excels at understanding sentiment direction when explicitly instructed.

**File:** `backend/src/services/stage-prompts.ts`

Update `buildReconcilerPrompt`:

```typescript
export function buildReconcilerPrompt(context: ReconcilerContext): string {
  // ... existing setup ...

  return `You are the Empathy Reconciler...

CONTEXT:
You are analyzing the empathy exchange between ${context.guesserName} and ${context.subjectName}.

[What ${context.subjectName} Actually Expressed]
"${context.witnessingContent}"

---

CRITICAL FILTERING RULE:

The input text contains raw chat logs. You MUST distinguish between "Relational Content" and "Process Noise".

1. **IGNORE "Process Noise":**
   - Complaints about the AI or app ("You sound like a robot", "Stop asking me that")
   - Confusion about UI or steps ("What do I do next?", "I don't understand this")
   - Resistance to the format ("This is stupid", "I want to skip")
   - Meta-commentary about the conversation itself

2. **FOCUS ONLY on "Relational Content":**
   - Feelings about the partner or relationship
   - Reactions to the partner's behavior (past or present)
   - Fears, needs, or hopes regarding the conflict
   - Emotional themes directed at the other person

**WARNING:** If ${context.subjectName} expressed anger at *you* (the AI), do NOT interpret this as anger at ${context.guesserName}. Treat all AI-directed sentiment as noise and discard it from your analysis.

---

// ... rest of prompt ...
`;
}
```

### Why This Works

| Benefit | Explanation |
|---------|-------------|
| **Semantic Distinction** | Claude Sonnet excels at understanding sentiment direction. Explicit instruction is sufficient. |
| **Zero Latency Cost** | Adds ~50 tokens to prompt, no additional API calls. |
| **Robustness** | Handles anger, confusion, frustration - any sentiment misdirected at the medium. |

### Testing

- [ ] User complains about AI → Reconciler ignores it
- [ ] User expresses confusion about steps → Not reflected in empathy gap
- [ ] User expresses genuine frustration with partner → Correctly identified
- [ ] Mixed messages (AI complaint + partner feeling) → Only partner feeling extracted

---

## Appendix C: Lateral Probing - From Passive Mirror to Active Guide

### Problem

The AI becomes an annoying "Passive Mirror" when users give brief or resistant answers. It drills into closed doors ("I hear you think everything is fine") instead of opening windows (expanding context).

### Solution

Introduce **Lateral Probing Mode** - when the front door is locked, try a side window.

### 1. Stage 1 Prompt Update

**File:** `backend/src/services/stage-prompts.ts`
**Function:** `buildStage1Prompt`

Replace the existing `WITNESS MODE` block with:

```typescript
YOU HAVE TWO MODES:

WITNESS MODE (Standard)
- Use this when the user is sharing freely.
- Reflect back their feelings and needs.
- Validate their experience.

LATERAL PROBING MODE (Use when user is brief, resistant, or claims "everything is fine")
- GOAL: If the front door (the immediate issue) is locked, try a side window (context).
- RULE: Do not drill down into a "closed" topic. Do not repeat their resistance.
- STRATEGY: Expand the context. Pivot to an adjacent area of their experience:

  1. EXPAND TIME: Move away from "now."
     - Ask about history: "How did this dynamic start?"
     - Ask about future: "What are you hoping to build toward?"

  2. EXPAND SCOPE: Move away from the specific issue.
     - Ask about relationship culture: "Is this how you two usually solve things?"
     - Ask about values: "What matters most to you in this relationship?"

  3. EXPAND STAKES: Ask about the motivation.
     - "You showed up here for a reason—what part of this matters enough to spend your time on?"

CRITICAL ANTI-LOOPING RULE:
- If a user gives a short/resistant answer, NEVER reflect it back.
- BAD: "I hear you think everything is fine." (Parroting)
- GOOD: "It sounds like things are stable right now. I'm curious—how does this compare to how things usually are between you two?" (Validating autonomy + Lateral Pivot)
```

### 2. Global Persona Update

**File:** `backend/src/services/stage-prompts.ts`
**Location:** `BASE_GUIDANCE` constant, add to `COMMUNICATION PRINCIPLES`

```typescript
Reading the Room:
- If the user is open, go deep.
- If the user is closed or brief, go wide (Lateral Probing).
- If a door is closed, try a window. Don't keep knocking on the same closed door.

Persistence via Variety:
- If you need to probe, never ask the same question twice.
- Change the angle: Time, Scope, or Stakes.
- Each question should feel like genuine curiosity, not repetition.
```

### Why This Works

| Issue | Old Behavior | New Behavior |
|-------|--------------|--------------|
| User says "I'm fine" | "I hear you're fine. Can you tell me more about that?" | "It sounds stable. How does this compare to how things usually are?" |
| User gives one-word answers | Keeps asking about the same topic | Pivots to time/scope/stakes |
| User is resistant | Reflects resistance back (annoying) | Validates autonomy, opens adjacent topic |

### Testing

- [ ] User gives brief answer → AI expands context (time/scope/stakes)
- [ ] User says "everything is fine" → AI pivots, doesn't parrot
- [ ] User is openly sharing → AI stays in Witness Mode
- [ ] AI never asks the same question twice in different words
- [ ] Lateral probes feel curious, not pushy
