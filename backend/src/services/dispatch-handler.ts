/**
 * Dispatch Handler
 *
 * Handles off-ramp dispatch tags from the AI.
 * When the AI outputs <dispatch>TAG</dispatch>, this handler
 * hijacks the response to provide consistent, controlled answers
 * for specific scenarios.
 */

export type DispatchTag =
  | 'EXPLAIN_PROCESS'
  | 'HANDLE_MEMORY_REQUEST'
  | string; // Allow unknown tags

/**
 * Handle a dispatch tag and return the appropriate response.
 * This hijacks the AI response for controlled off-ramp scenarios.
 */
export async function handleDispatch(dispatchTag: DispatchTag): Promise<string> {
  console.log(`[Dispatch Handler] Triggered: ${dispatchTag}`);

  switch (dispatchTag) {
    case 'EXPLAIN_PROCESS':
      return `Meet Without Fear guides you through four stages:

**1. Witness Stage** - Each person shares their experience and feels fully heard. No problem-solving yet, just deep listening.

**2. Perspective Stretch** - You'll try to understand what your partner might be feeling. This builds empathy without requiring agreement.

**3. Need Mapping** - Together, you'll identify what you each truly need - not positions, but underlying needs like safety, respect, or connection.

**4. Strategic Repair** - Finally, you'll design small experiments to address both needs. Low-stakes trials you can adjust.

You move through these at your own pace. There's no rush.`;

    case 'HANDLE_MEMORY_REQUEST':
      return `I'd love to help you remember important things! You can add memories in your Profile under "Things to Remember." That way I'll always have them available when we talk.

Is there something specific you'd like to note down?`;

    default:
      console.warn(`[Dispatch Handler] Unknown tag: ${dispatchTag}`);
      return "I'm here to help. What would you like to explore?";
  }
}
