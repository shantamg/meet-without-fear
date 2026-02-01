import { E2EFixture } from './types';

export const reconcilerNoGaps: E2EFixture = {
  name: 'Reconciler No Gaps',
  description:
    'Partner journey where reconciler finds no significant gaps - empathy proceeds without sharing suggestion',

  seed: {
    users: [
      {
        id: 'user-b',
        email: 'user-b@e2e.test',
        clerkId: 'e2e_clerk_user_b',
        name: 'Darryl Test',
      },
    ],
  },

  responses: [
    // Response 0: First witnessing exchange (response to first user message)
    // Note: The initial greeting uses a fallback message, so this is the first fixture response
    {
      user: 'Things have been tense lately',
      ai: `<thinking>
Mode: WITNESSING
Intensity: 4
FeelHeardCheck: N
Strategy: Acknowledge and encourage sharing
</thinking>

I hear you - tension can be really draining. It takes courage to step into this conversation.

Can you tell me more about what's been happening? What does the tension feel like for you?
`,
    },

    // Response 1: Second witnessing exchange - deeper exploration
    {
      user: "I feel like we've just been miscommunicating",
      ai: `<thinking>
Mode: WITNESSING
Intensity: 5
FeelHeardCheck: N
Strategy: Reflect feelings and validate
</thinking>

Miscommunication can be really frustrating - like you're speaking different languages even though you want the same things.

What do you wish they could understand about how you're feeling?
`,
    },

    // Response 2: Third witnessing exchange
    {
      user: "I want them to know I still care, even when I'm stressed",
      ai: `<thinking>
Mode: WITNESSING
Intensity: 5
FeelHeardCheck: N
Strategy: Deep acknowledgment of care beneath stress
</thinking>

That's such an important feeling to name - that underneath the stress and tension, there's real care. Sometimes that gets lost in the day-to-day.

It sounds like you want them to see the love that's still there, even when things are hard.
`,
    },

    // Response 3: Feel-heard check trigger
    // This response triggers the feel-heard check UI
    {
      user: 'Exactly. I just want us to be on the same page again',
      ai: `<thinking>
Mode: WITNESSING
Intensity: 6
FeelHeardCheck: Y
Strategy: Reflect deep understanding and check in
</thinking>

You're longing to reconnect - to get back to that sense of being a team. The care is there, and you want both of you to feel it again.

Before we continue, I want to check in with you: Do you feel like I understand what you've been going through?
`,
    },
  ],

  // Operation-specific mock responses for non-streaming AI calls
  // These are used by the reconciler and other JSON-response operations
  operations: {
    // Reconciler analysis - finds NO significant gaps, empathy proceeds normally
    'reconciler-analysis': {
      response: {
        alignment: {
          score: 85,
          summary:
            "Shantam's empathy accurately captures Darryl's feelings of wanting to reconnect and be understood despite the stress.",
          correctlyIdentified: [
            'desire to reconnect with partner',
            'frustration with miscommunication',
            'underlying care for the relationship',
            'wanting to be on the same team',
          ],
        },
        gaps: {
          severity: 'none',
          summary:
            "Shantam has demonstrated a strong understanding of Darryl's perspective. No significant gaps were identified.",
          missedFeelings: [],
          misattributions: [],
          mostImportantGap: null,
        },
        recommendation: {
          action: 'PROCEED',
          rationale:
            'The empathy attempt shows sufficient understanding. Both partners can proceed to reveal their perspectives to each other.',
          sharingWouldHelp: false,
          suggestedShareFocus: null,
        },
      },
    },
  },
};
