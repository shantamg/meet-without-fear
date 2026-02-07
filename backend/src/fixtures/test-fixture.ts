import { E2EFixture } from './types';

/**
 * Test fixture for unit tests (legacy storyline format)
 */
export const testFixture: E2EFixture = {
  name: 'Test Fixture',
  description: 'A test fixture for unit tests',

  seed: {
    users: [
      {
        id: 'user-a',
        email: 'user-a@e2e.test',
        clerkId: 'e2e_clerk_user_a',
        name: 'Alice Test',
      },
    ],
  },

  storyline: {
    'user-a': [
      {
        user: 'Hello',
        ai: `<thinking>
Mode: ONBOARDING
Intensity: 2
FeelHeardCheck: N
Strategy: Greet user
</thinking>

Hi there! How can I help you today?
`,
      },
      {
        user: 'How are you?',
        ai: `<thinking>
Mode: ONBOARDING
Intensity: 2
FeelHeardCheck: N
Strategy: Respond warmly
</thinking>

I'm doing well, thank you for asking!
`,
      },
    ],
  },
};
