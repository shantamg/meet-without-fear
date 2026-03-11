# Validation Schemas Implementation

## Source Documentation

- [API Index](../../docs/mvp-planning/plans/backend/api/index.md)
- [Session Types](./session-types.md)

## Prerequisites

- [ ] `shared/session-types.md` complete

## External Services Required

> **None.**

## Scope

Create Zod validation schemas for all API request/response validation with reusable error messages.

## Implementation Steps

### 1. Install dependencies

```bash
cd shared
npm install zod
```

### 2. Create base validation utilities

Create `shared/src/validation/utils.ts`:

```typescript
import { z } from 'zod';

// Common validation patterns
export const uuid = z.string().uuid('Invalid ID format');

export const nonEmptyString = (field: string) =>
  z.string().min(1, `${field} is required`).max(10000, `${field} is too long`);

export const email = z.string().email('Invalid email format');

export const timestamp = z.string().datetime({ message: 'Invalid timestamp format' });

// Pagination
export const paginationParams = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

// Common error response
export const errorResponse = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
});

// Wrap schema for API response format
export function apiResponse<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    data: dataSchema,
  });
}
```

### 3. Create session validation schemas

Create `shared/src/validation/sessions.ts`:

```typescript
import { z } from 'zod';
import { uuid, nonEmptyString, paginationParams } from './utils';
import { Stage } from '../dto/session';

// Create session
export const createSessionRequest = z.object({
  partnerEmail: z.string().email('Valid email required').optional(),
  partnerPhone: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Valid phone number required').optional(),
  topic: nonEmptyString('Topic').max(500, 'Topic is too long').optional(),
}).refine(
  (data) => data.partnerEmail || data.partnerPhone,
  { message: 'Either email or phone is required' }
);

export const createSessionResponse = z.object({
  session: z.object({
    id: uuid,
    invitationId: uuid,
  }),
});

// Get sessions list
export const getSessionsParams = paginationParams.extend({
  status: z.enum(['active', 'completed', 'all']).default('active'),
});

// Update session (general)
export const updateSessionRequest = z.object({
  topic: nonEmptyString('Topic').max(500).optional(),
});

// Stage-specific validations
export const stageSchema = z.nativeEnum(Stage);
```

### 4. Create message validation schemas

Create `shared/src/validation/messages.ts`:

```typescript
import { z } from 'zod';
import { uuid, nonEmptyString } from './utils';

// Send message
export const sendMessageRequest = z.object({
  content: nonEmptyString('Message').max(5000, 'Message is too long'),
});

export const sendMessageResponse = z.object({
  message: z.object({
    id: uuid,
    content: z.string(),
    role: z.enum(['USER', 'AI']),
    timestamp: z.string(),
  }),
  aiResponse: z.object({
    id: uuid,
    content: z.string(),
    role: z.literal('AI'),
    timestamp: z.string(),
  }).optional(),
});

// Get messages
export const getMessagesParams = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: uuid.optional(),
  after: uuid.optional(),
});
```

### 5. Create stage-specific validation schemas

Create `shared/src/validation/stages.ts`:

```typescript
import { z } from 'zod';
import { uuid, nonEmptyString } from './utils';

// Stage 0: Compact signing
export const signCompactRequest = z.object({
  // No body needed, user ID from auth
});

export const signCompactResponse = z.object({
  signed: z.boolean(),
  bothSigned: z.boolean(),
  canAdvance: z.boolean(),
});

// Stage 1: Feel heard
export const confirmFeelHeardRequest = z.object({
  // No body needed
});

export const confirmFeelHeardResponse = z.object({
  confirmed: z.boolean(),
  canAdvance: z.boolean(),
});

// Stage 2: Empathy
export const consentToShareRequest = z.object({
  consent: z.boolean(),
});

export const submitFeedbackRequest = z.object({
  accuracy: z.enum(['accurate', 'partial', 'inaccurate']),
  feedback: nonEmptyString('Feedback').max(2000).optional(),
});

export const confirmUnderstoodRequest = z.object({
  understood: z.boolean(),
});

// Stage 3: Needs
export const confirmNeedsRequest = z.object({
  confirmed: z.boolean(),
  adjustments: nonEmptyString('Adjustments').max(1000).optional(),
});

export const needsMappingResponse = z.object({
  phase: z.enum(['exploration', 'review', 'waiting', 'complete']),
  myNeeds: z.array(z.object({
    id: uuid,
    category: z.string(),
    description: z.string(),
  })),
  sharedNeeds: z.array(z.object({
    category: z.string(),
    description: z.string(),
  })),
  sharedNeedIds: z.array(uuid),
  insight: z.string().optional(),
});

// Stage 4: Strategies
export const submitRankingRequest = z.object({
  ready: z.boolean().optional(),
  rankings: z.array(uuid).max(3).optional(),
}).refine(
  (data) => data.ready || (data.rankings && data.rankings.length > 0),
  { message: 'Either ready flag or rankings required' }
);

export const confirmAgreementRequest = z.object({
  confirmed: z.boolean(),
});

export const strategiesResponse = z.object({
  phase: z.enum(['pool', 'ranking', 'waiting', 'reveal', 'agreement', 'complete']),
  strategies: z.array(z.object({
    id: uuid,
    description: z.string(),
    duration: z.string().optional(),
  })),
  overlapping: z.array(z.object({
    id: uuid,
    description: z.string(),
  })).optional(),
  uniqueToMe: z.array(z.object({
    id: uuid,
    description: z.string(),
  })).optional(),
  uniqueToPartner: z.array(z.object({
    id: uuid,
    description: z.string(),
  })).optional(),
  agreement: z.object({
    experiment: z.string(),
    duration: z.string(),
    successMeasure: z.string(),
    checkInDate: z.string().optional(),
  }).optional(),
});
```

### 6. Create emotional barometer validation

Create `shared/src/validation/barometer.ts`:

```typescript
import { z } from 'zod';
import { uuid } from './utils';

export const recordBarometerRequest = z.object({
  intensity: z.number().int().min(1).max(10),
  context: z.string().max(500).optional(),
});

export const recordBarometerResponse = z.object({
  id: uuid,
  intensity: z.number(),
  suggestion: z.string().optional(),
  requiresCooling: z.boolean(),
});

export const exerciseCompleteRequest = z.object({
  exerciseType: z.enum(['breathing', 'grounding', 'pause']),
  intensityAfter: z.number().int().min(1).max(10),
  durationSeconds: z.number().int().min(0),
});
```

### 7. Create invitation validation

Create `shared/src/validation/invitations.ts`:

```typescript
import { z } from 'zod';
import { uuid, email } from './utils';

export const acceptInvitationRequest = z.object({
  // Invitation ID comes from URL param
});

export const acceptInvitationResponse = z.object({
  sessionId: uuid,
  status: z.enum(['accepted', 'already_accepted', 'expired']),
});

export const resendInvitationRequest = z.object({
  invitationId: uuid,
});

export const invitationStatusResponse = z.object({
  id: uuid,
  status: z.enum(['pending', 'accepted', 'expired']),
  expiresAt: z.string(),
  recipientContact: z.string(),
});
```

### 8. Create auth validation

Create `shared/src/validation/auth.ts`:

```typescript
import { z } from 'zod';
import { uuid, email } from './utils';

export const updatePushTokenRequest = z.object({
  pushToken: z.string().min(1, 'Push token required'),
  platform: z.enum(['ios', 'android']),
});

export const getMeResponse = z.object({
  id: uuid,
  email: email,
  name: z.string().nullable(),
  createdAt: z.string(),
});
```

### 9. Create validation index

Create `shared/src/validation/index.ts`:

```typescript
// Utils
export * from './utils';

// Domain validations
export * from './auth';
export * from './sessions';
export * from './messages';
export * from './stages';
export * from './barometer';
export * from './invitations';

// Re-export zod for convenience
export { z } from 'zod';
```

### 10. Write tests

Create `shared/src/validation/__tests__/sessions.test.ts`:

```typescript
import { createSessionRequest, stageSchema } from '../sessions';
import { Stage } from '../../dto/session';

describe('createSessionRequest', () => {
  it('validates with email', () => {
    const result = createSessionRequest.safeParse({
      partnerEmail: 'test@example.com',
    });
    expect(result.success).toBe(true);
  });

  it('validates with phone', () => {
    const result = createSessionRequest.safeParse({
      partnerPhone: '+14155551234',
    });
    expect(result.success).toBe(true);
  });

  it('fails without email or phone', () => {
    const result = createSessionRequest.safeParse({
      topic: 'Something to discuss',
    });
    expect(result.success).toBe(false);
  });

  it('fails with invalid email', () => {
    const result = createSessionRequest.safeParse({
      partnerEmail: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });
});

describe('stageSchema', () => {
  it('validates valid stages', () => {
    expect(stageSchema.parse(Stage.STAGE_0)).toBe(Stage.STAGE_0);
    expect(stageSchema.parse(Stage.STAGE_4)).toBe(Stage.STAGE_4);
  });

  it('fails on invalid stage', () => {
    expect(() => stageSchema.parse('STAGE_99')).toThrow();
  });
});
```

### 11. Run verification

```bash
npm run check
npm run test
```

## Verification

- [ ] All validation schemas export correctly
- [ ] Error messages are user-friendly
- [ ] Refinements work (e.g., email OR phone)
- [ ] Pagination params coerce strings to numbers
- [ ] API response wrapper works
- [ ] Tests pass for all schemas
- [ ] `npm run check` passes
- [ ] `npm run test` passes
