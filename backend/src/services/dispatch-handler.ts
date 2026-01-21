/**
 * Dispatch Handler
 *
 * Handles off-ramp dispatch tags from the AI.
 * When the AI outputs <dispatch>TAG</dispatch>, this handler
 * hijacks the response to provide specialized, contextual answers
 * for specific scenarios like explaining the process.
 */

import { getSonnetResponse, BrainActivityCallType } from '../lib/bedrock';

export type DispatchTag =
  | 'EXPLAIN_PROCESS'
  | 'HANDLE_MEMORY_REQUEST'
  | string; // Allow unknown tags

export interface DispatchContext {
  /** The user's current message */
  userMessage: string;
  /** Recent conversation history */
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** User's first name */
  userName?: string;
  /** Partner's name */
  partnerName?: string;
  /** Session ID for logging */
  sessionId: string;
  /** Turn ID for logging */
  turnId: string;
}

/**
 * System prompt for process explanation conversations.
 * This prompt allows the AI to have a natural conversation about how the process works.
 */
const PROCESS_EXPLAINER_PROMPT = `You are a warm, knowledgeable guide helping someone understand how this relationship conversation process works.

THE PROCESS:

**Getting Started**
First, you craft a brief invitation message and share a link with the other person. When they accept, they join the conversation and go through the same process on their side.

**Stage 1 - Feel Heard**
Each person gets private time to share what's on their mind. I listen deeply, reflect back feelings, and help you feel truly understood. No fixing or advice - just witnessing. This continues until you confirm you feel heard.

**Stage 2 - Perspective Stretch**
You imagine what the other person might be experiencing - not to agree, but to understand. You craft an empathy statement, which gets shared with them (with your consent). They do the same for you.

**Stage 3 - Need Mapping**
We identify what you each truly need underneath the conflict - things like safety, respect, connection, autonomy. This moves beyond positions to underlying needs.

**Stage 4 - Strategic Repair**
Together, you design small testable experiments - specific things to try that address both people's needs. Not grand promises, but steps you can adjust based on what works.

HOW COMMUNICATION WORKS:
- Both people participate in the process
- You share things with each other at certain points (always with consent)
- I guide each person's journey and facilitate the sharing
- The process is private and structured - you're not chatting directly

CONVERSATION STYLE:
- Be warm, conversational, and encouraging
- Answer questions naturally - don't lecture
- Keep responses concise (2-4 sentences usually)
- Match their energy - if they're brief, be brief
- If they want to continue the main conversation, let them know you're ready

Remember: You're having a conversation about the process, not delivering a presentation.`;

/**
 * Handle a dispatch tag with full conversation context.
 * Returns a contextual AI response for the specific scenario.
 */
export async function handleDispatch(
  dispatchTag: DispatchTag,
  context: DispatchContext
): Promise<string> {
  console.log(`[Dispatch Handler] Triggered: ${dispatchTag}`);

  switch (dispatchTag) {
    case 'EXPLAIN_PROCESS':
      return handleProcessExplanation(context);

    case 'HANDLE_MEMORY_REQUEST':
      // Memory request is simpler - static response is fine
      return `I'd love to help you remember important things! You can add memories in your Profile under "Things to Remember." That way I'll always have them available when we talk.

Is there something specific you'd like to note down?`;

    default:
      console.warn(`[Dispatch Handler] Unknown tag: ${dispatchTag}`);
      return "I'm here to help. What would you like to explore?";
  }
}

/**
 * Handle process explanation with full AI conversation capability.
 */
async function handleProcessExplanation(context: DispatchContext): Promise<string> {
  const { userMessage, conversationHistory, sessionId, turnId } = context;

  try {
    // Build messages for the AI - include recent conversation for context
    const messages = [
      ...conversationHistory.slice(-6), // Last few exchanges for context
      { role: 'user' as const, content: userMessage },
    ];

    const response = await getSonnetResponse({
      systemPrompt: PROCESS_EXPLAINER_PROMPT,
      messages,
      maxTokens: 512,
      sessionId,
      turnId,
      operation: 'dispatch-process-explainer',
      callType: BrainActivityCallType.ORCHESTRATED_RESPONSE,
    });

    if (response) {
      return response.trim();
    }

    // Fallback if AI fails
    return getFallbackProcessResponse(userMessage);
  } catch (error) {
    console.error('[Dispatch Handler] Process explanation failed:', error);
    return getFallbackProcessResponse(userMessage);
  }
}

/**
 * Fallback response if AI call fails.
 */
function getFallbackProcessResponse(userMessage: string): string {
  const lowerMessage = userMessage.toLowerCase();

  // Check if they're asking about talking to/connecting with the other person
  if (lowerMessage.includes('talk to') || lowerMessage.includes('connect') || lowerMessage.includes('when do i')) {
    return `You'll invite them to join by sharing a link. Once they accept, they go through the same process on their side. At certain points - like empathy statements - you'll share things with each other (always with your consent).

Ready to continue?`;
  }

  // Check if they're asking about next steps
  if (lowerMessage.includes('next') || lowerMessage.includes('then') || lowerMessage.includes('after')) {
    return `After you feel fully heard, you'll craft an empathy statement imagining their perspective - that gets shared with them. Then we identify underlying needs for both of you, and design small experiments to try together.

Ready to continue where we were?`;
  }

  // Default overview
  return `The process has four stages: first each person gets to feel truly heard, then you craft empathy statements that get shared with each other, then we identify underlying needs, and finally you design small experiments to try together.

Would you like me to explain more, or shall we continue?`;
}
