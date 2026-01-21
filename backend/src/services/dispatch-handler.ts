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

THE PROCESS (reference naturally, don't read verbatim):

**Stage 1 - WITNESS (Feel Heard)**
Each person gets dedicated time to share what's on their mind while the AI listens deeply, reflects back feelings, and helps them feel truly understood. No fixing, no advice - just witnessing. This continues until they confirm they feel heard.

**Stage 2 - PERSPECTIVE STRETCH**
Once someone feels heard, they're gently invited to consider their partner's perspective. Not to agree with it, but to understand what the other person might be feeling or experiencing. The AI helps craft an empathy statement.

**Stage 3 - NEED MAPPING**
Both people's underlying needs get identified - things like safety, respect, connection, autonomy. This moves beyond positions ("you always...") to what's really driving the conflict.

**Stage 4 - STRATEGIC REPAIR**
Together, small testable experiments are designed. Not grand solutions, but specific things to try that address the identified needs. These can be adjusted based on what works.

CONVERSATION STYLE:
- Be warm, conversational, and encouraging
- Answer questions naturally - don't lecture
- If they ask "what's next?", explain the upcoming stage
- If they want to continue the main conversation, acknowledge and let them know you're ready
- Keep responses concise (2-4 sentences usually)
- Match their energy - if they're brief, be brief

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
  const { userMessage, conversationHistory, userName, sessionId, turnId } = context;

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
  // Check if they're asking about next steps
  const lowerMessage = userMessage.toLowerCase();
  if (lowerMessage.includes('next') || lowerMessage.includes('then') || lowerMessage.includes('after')) {
    return `After you feel fully heard, we'll gently explore what your partner might be experiencing. Not to agree with them, but to understand. Then we'll look at what you both really need underneath it all, and find small ways to start repairing things together.

Ready to continue where we were?`;
  }

  // Default overview
  return `The basic idea is simple: we start by helping each of you feel truly heard, then work toward understanding each other better.

Right now we're in the first part—just sharing and listening. No fixing, no problem-solving yet. That comes later, once you both feel understood.

Would you like me to walk you through what happens next, or shall we continue where we were?`;
}
