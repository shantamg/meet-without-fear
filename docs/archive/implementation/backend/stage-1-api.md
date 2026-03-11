# Stage 1 API Implementation

## Source Documentation

- [Stage 1 API](../../docs/mvp-planning/plans/backend/api/stage-1.md)
- [Stage 1 Witness](../../docs/mvp-planning/plans/stages/stage-1-witness.md)
- [Stage 1 Prompts](../../docs/mvp-planning/plans/backend/prompts/stage-1-witnessing.md)

## Prerequisites

- [ ] `backend/stage-0-api.md` complete
- [ ] `backend/realtime.md` complete

## External Services Required

> **User action needed:** Configure AI provider for chat

1. **Set up Anthropic API:**
   - Get API key from https://console.anthropic.com
   - Add to environment:
   ```bash
   # backend/.env
   ANTHROPIC_API_KEY="sk-ant-..."
   ```

## Scope

Implement Stage 1 (Witness) chat endpoints and "feel heard" confirmation.

## Implementation Steps

### 1. Write tests first

Create `backend/src/routes/__tests__/stage1.test.ts`:

```typescript
describe('Stage 1 API', () => {
  describe('POST /sessions/:id/messages', () => {
    it('creates message and returns AI response', async () => {
      const res = await request(app)
        .post('/api/v1/sessions/test-session/messages')
        .set('Authorization', 'Bearer valid-token')
        .send({ content: 'I feel frustrated when...' });

      expect(res.status).toBe(200);
      expect(res.body.data.userMessage).toBeDefined();
      expect(res.body.data.aiResponse).toBeDefined();
    });

    it('rejects messages in wrong stage', async () => {
      // User in stage 0 trying to send stage 1 message
    });
  });

  describe('POST /sessions/:id/feel-heard', () => {
    it('marks user as feeling heard', async () => {
      const res = await request(app)
        .post('/api/v1/sessions/test-session/feel-heard')
        .set('Authorization', 'Bearer valid-token')
        .send({ confirmed: true });

      expect(res.body.data.gatesSatisfied).toContain('feelHeard');
    });
  });
});
```

### 2. Create AI service

Create `backend/src/services/ai.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export async function getWitnessResponse(
  messages: { role: 'user' | 'assistant'; content: string }[],
  context: { userName: string; sessionContext?: string }
): Promise<string> {
  const systemPrompt = buildWitnessSystemPrompt(context);

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    system: systemPrompt,
    messages
  });

  return response.content[0].type === 'text'
    ? response.content[0].text
    : '';
}

function buildWitnessSystemPrompt(context: { userName: string }) {
  // See stage-1-witnessing.md for full prompt
  return `You are a compassionate witness helping ${context.userName}
  process their feelings about a conflict...`;
}
```

### 3. Create message controller

Create `backend/src/controllers/messages.ts`:

```typescript
import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { getWitnessResponse } from '../services/ai';

export const sendMessage = async (req: Request, res: Response) => {
  const { id: sessionId } = req.params;
  const { content } = req.body;
  const userId = req.user!.id;

  // Get user's current stage
  const progress = await prisma.stageProgress.findFirst({
    where: { sessionId, userId, status: 'IN_PROGRESS' },
    orderBy: { stage: 'desc' }
  });

  const stage = progress?.stage ?? 1;

  // Save user message
  const userMessage = await prisma.message.create({
    data: {
      sessionId,
      senderId: userId,
      role: 'USER',
      content,
      stage
    }
  });

  // Get conversation history
  const history = await prisma.message.findMany({
    where: { sessionId, senderId: userId },
    orderBy: { timestamp: 'asc' },
    take: 20
  });

  // Get AI response
  const aiContent = await getWitnessResponse(
    history.map(m => ({
      role: m.role === 'USER' ? 'user' : 'assistant',
      content: m.content
    })),
    { userName: req.user!.name || 'there' }
  );

  // Save AI response
  const aiMessage = await prisma.message.create({
    data: {
      sessionId,
      senderId: null,
      role: 'AI',
      content: aiContent,
      stage
    }
  });

  res.json({
    success: true,
    data: {
      userMessage: { id: userMessage.id, content, timestamp: userMessage.timestamp },
      aiResponse: { id: aiMessage.id, content: aiContent, timestamp: aiMessage.timestamp }
    }
  });
};

export const confirmFeelHeard = async (req: Request, res: Response) => {
  const { id: sessionId } = req.params;
  const { confirmed, feedback } = req.body;
  const userId = req.user!.id;

  await prisma.stageProgress.update({
    where: { sessionId_userId_stage: { sessionId, userId, stage: 1 } },
    data: {
      gatesSatisfied: { feelHeard: confirmed, confirmedAt: new Date() },
      status: confirmed ? 'GATE_PENDING' : 'IN_PROGRESS'
    }
  });

  res.json({
    success: true,
    data: { confirmed, canAdvance: false } // Partner must also complete
  });
};
```

### 4. Install Anthropic SDK

```bash
npm install @anthropic-ai/sdk
```

### 5. Run verification

```bash
npm run check
npm run test
```

## Verification

- [ ] Messages saved to database with correct stage
- [ ] AI responds using witness prompt
- [ ] Conversation history passed to AI
- [ ] `feel-heard` updates gate status
- [ ] Stage validation prevents wrong-stage actions
- [ ] `npm run check` passes
- [ ] `npm run test` passes
