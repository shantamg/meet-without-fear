import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.E2E_AUTH_BYPASS = 'true';
process.env.MOCK_LLM = 'false';

import request from 'supertest';
import AnthropicBedrock from '@anthropic-ai/bedrock-sdk';
import app from '../app';
import { prisma } from '../lib/prisma';

const TEST_TOPIC_PREFIX = '[mwf-moment-eval]';
const STAGE1_MOMENT_ID = 'stage-1-fact-reflection';
const HAIKU_MODEL_ID = process.env.BEDROCK_HAIKU_MODEL_ID || 'global.anthropic.claude-haiku-4-5-20251001-v1:0';

type SeedResult = {
  sessionId: string;
  actorUserId: string;
  partnerUserId: string;
  actorEmail: string;
  rows: Record<string, number>;
  messages: Array<{ id: string; role: string; content: string; stage: number }>;
  stageProgress: Array<{ userId: string; stage: number; status: string; gatesSatisfied: unknown }>;
};

function requireEnv(names: string[]): void {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }
}

async function seedStage1FactReflection(): Promise<SeedResult> {
  requireEnv(['DATABASE_URL']);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const actorEmail = `moment-stage1-adam-${suffix}@example.test`;
  const partnerEmail = `moment-stage1-eve-${suffix}@example.test`;

  const result = await prisma.$transaction(async (tx) => {
    const [actor, partner] = await Promise.all([
      tx.user.create({
        data: {
          email: actorEmail,
          clerkId: `e2e_moment-stage1-adam-${suffix}`,
          name: 'Adam',
          firstName: 'Adam',
        },
      }),
      tx.user.create({
        data: {
          email: partnerEmail,
          clerkId: `e2e_moment-stage1-eve-${suffix}`,
          name: 'Eve',
          firstName: 'Eve',
        },
      }),
    ]);

    const relationship = await tx.relationship.create({
      data: {
        members: {
          create: [
            { userId: actor.id, role: 'invitor', nickname: 'Eve' },
            { userId: partner.id, role: 'invitee', nickname: 'Adam' },
          ],
        },
      },
    });

    const session = await tx.session.create({
      data: {
        relationshipId: relationship.id,
        status: 'ACTIVE',
        topicFrame: `${TEST_TOPIC_PREFIX} ${STAGE1_MOMENT_ID}`,
      },
    });

    const [actorVessel, partnerVessel] = await Promise.all([
      tx.userVessel.create({
        data: {
          userId: actor.id,
          sessionId: session.id,
          notableFacts: [
            { category: 'Conflict', fact: 'Adam feels Eve keeps pushing for more experiences and change.' },
            { category: 'Emotion', fact: 'Adam is scared Eve may leave because he cannot give her enough.' },
            { category: 'Pattern', fact: 'When Eve raises travel or growth, Adam gets quiet and then feels he made things worse.' },
          ],
        },
      }),
      tx.userVessel.create({
        data: {
          userId: partner.id,
          sessionId: session.id,
          notableFacts: [
            { category: 'Conflict', fact: 'Eve wants more travel, growth, and aliveness in the relationship.' },
          ],
        },
      }),
    ]);

    await tx.emotionalReading.create({
      data: {
        vesselId: actorVessel.id,
        intensity: 7,
        stage: 1,
        context: 'Steady pressure, not a spike.',
      },
    });
    await tx.emotionalReading.create({
      data: {
        vesselId: partnerVessel.id,
        intensity: 6,
        stage: 1,
        context: 'Seeded partner baseline for completeness.',
      },
    });

    await tx.stageProgress.createMany({
      data: [
        {
          sessionId: session.id,
          userId: actor.id,
          stage: 0,
          status: 'COMPLETED',
          completedAt: new Date(),
          gatesSatisfied: { compactSigned: true, signedAt: new Date().toISOString() },
        },
        {
          sessionId: session.id,
          userId: partner.id,
          stage: 0,
          status: 'COMPLETED',
          completedAt: new Date(),
          gatesSatisfied: { compactSigned: true, signedAt: new Date().toISOString() },
        },
        {
          sessionId: session.id,
          userId: actor.id,
          stage: 1,
          status: 'IN_PROGRESS',
          gatesSatisfied: { feelHeardConfirmed: false },
        },
        {
          sessionId: session.id,
          userId: partner.id,
          stage: 1,
          status: 'IN_PROGRESS',
          gatesSatisfied: { feelHeardConfirmed: false },
        },
      ],
    });

    const history = await Promise.all([
      tx.message.create({
        data: {
          sessionId: session.id,
          senderId: actor.id,
          role: 'USER',
          stage: 1,
          content:
            "I don't even know where to begin. We have a good life, but it feels like none of that matters to her.",
        },
      }),
      tx.message.create({
        data: {
          sessionId: session.id,
          forUserId: actor.id,
          role: 'AI',
          stage: 1,
          content:
            "You've built something that feels solid to you, and you're not experiencing it as appreciated.",
        },
      }),
      tx.message.create({
        data: {
          sessionId: session.id,
          senderId: actor.id,
          role: 'USER',
          stage: 1,
          content:
            'She brings up travel and new experiences, and every time I hear that, something in me contracts.',
        },
      }),
      tx.message.create({
        data: {
          sessionId: session.id,
          forUserId: actor.id,
          role: 'AI',
          stage: 1,
          content:
            'There is a loop here: she raises something, you pull back, she gets frustrated, and then you carry the weight of that too.',
        },
      }),
      tx.message.create({
        data: {
          sessionId: session.id,
          senderId: actor.id,
          role: 'USER',
          stage: 1,
          content:
            "I love her, but I'm constantly bracing, like the next thing she says will confirm I'm not enough.",
        },
      }),
    ]);

    const stageProgress = await tx.stageProgress.findMany({
      where: { sessionId: session.id },
      orderBy: [{ userId: 'asc' }, { stage: 'asc' }],
    });

    return {
      sessionId: session.id,
      actorUserId: actor.id,
      partnerUserId: partner.id,
      actorEmail,
      rows: {
        Session: 1,
        Relationship: 1,
        RelationshipMember: 2,
        User: 2,
        UserVessel: 2,
        StageProgress: stageProgress.length,
        Message: history.length,
      },
      messages: history.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        stage: message.stage,
      })),
      stageProgress: stageProgress.map((progress) => ({
        userId: progress.userId,
        stage: progress.stage,
        status: progress.status,
        gatesSatisfied: progress.gatesSatisfied,
      })),
    };
  });

  return result;
}

function parseSse(raw: string): Array<{ event: string; data: unknown }> {
  return raw
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const event = block.match(/^event:\s*(.+)$/m)?.[1] || 'message';
      const dataText = block.match(/^data:\s*(.+)$/m)?.[1] || '{}';
      let data: unknown = {};
      try {
        data = JSON.parse(dataText);
      } catch {
        data = dataText;
      }
      return { event, data };
    });
}

async function invokeStage1(seed: SeedResult, content: string): Promise<Record<string, unknown>> {
  requireEnv(['DATABASE_URL', 'AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']);

  const before = await prisma.message.findMany({
    where: { sessionId: seed.sessionId },
    orderBy: { timestamp: 'asc' },
  });

  const response = await request(app)
    .post(`/api/sessions/${seed.sessionId}/messages/stream`)
    .set('x-e2e-user-id', seed.actorUserId)
    .set('x-e2e-user-email', seed.actorEmail)
    .set('Accept', 'text/event-stream')
    .buffer(true)
    .parse((res, callback) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => callback(null, raw));
    })
    .send({ content });

  if (response.status !== 200) {
    throw new Error(`Backend stream returned ${response.status}: ${response.text || JSON.stringify(response.body)}`);
  }

  const rawSse = String(response.body || response.text || '');
  const events = parseSse(rawSse);
  const aiResponse = events
    .filter((event) => event.event === 'chunk')
    .map((event) => {
      const data = event.data as { text?: string };
      return data.text || '';
    })
    .join('');

  const after = await prisma.message.findMany({
    where: { sessionId: seed.sessionId },
    orderBy: { timestamp: 'asc' },
  });
  const beforeIds = new Set(before.map((message) => message.id));
  const newMessages = after
    .filter((message) => !beforeIds.has(message.id))
    .map((message) => ({
      id: message.id,
      role: message.role,
      senderId: message.senderId,
      forUserId: message.forUserId,
      content: message.content,
      stage: message.stage,
    }));

  const stageProgress = await prisma.stageProgress.findMany({
    where: { sessionId: seed.sessionId },
    orderBy: [{ userId: 'asc' }, { stage: 'asc' }],
  });

  return {
    aiResponse,
    rawSse,
    events,
    stateDelta: {
      new_messages_in_db: newMessages,
      stage_progress: stageProgress.map((progress) => ({
        userId: progress.userId,
        stage: progress.stage,
        status: progress.status,
        gatesSatisfied: progress.gatesSatisfied,
      })),
    },
  };
}

async function cleanup(olderThanMs: number): Promise<Record<string, number>> {
  requireEnv(['DATABASE_URL']);
  const cutoff = new Date(Date.now() - olderThanMs);
  const sessions = await prisma.session.findMany({
    where: {
      topicFrame: { startsWith: TEST_TOPIC_PREFIX },
      createdAt: { lt: cutoff },
    },
    select: { id: true, relationshipId: true },
  });
  const relationshipIds = Array.from(new Set(sessions.map((session) => session.relationshipId)));
  const userIds = await prisma.relationshipMember.findMany({
    where: { relationshipId: { in: relationshipIds } },
    select: { userId: true },
  });
  await prisma.relationship.deleteMany({ where: { id: { in: relationshipIds } } });
  await prisma.user.deleteMany({
    where: {
      id: { in: userIds.map((user) => user.userId) },
      email: { contains: '@example.test' },
    },
  });
  return { sessions: sessions.length, relationships: relationshipIds.length, users: userIds.length };
}

async function judge(input: {
  systemPrompt: string;
  template: string;
  response: string;
  momentId: string;
}): Promise<Record<string, unknown>> {
  requireEnv(['AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']);
  const client = new AnthropicBedrock({ awsRegion: process.env.AWS_REGION });
  const startedAt = Date.now();
  const result = await client.messages.create({
    model: HAIKU_MODEL_ID,
    max_tokens: 900,
    temperature: 0,
    system: [
      { type: 'text', text: input.systemPrompt, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: input.template, cache_control: { type: 'ephemeral' } },
    ],
    messages: [
      {
        role: 'user',
        content: `AI response under evaluation:\n\n${input.response}\n\nReturn only JSON.`,
      },
    ],
  });
  const textBlock = result.content.find((block) => block.type === 'text');
  const text = textBlock && textBlock.type === 'text' ? textBlock.text : '{}';
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim());
  } catch {
    parsed = { parse_error: true, raw: text };
  }
  return {
    model: HAIKU_MODEL_ID,
    durationMs: Date.now() - startedAt,
    usage: result.usage,
    parsed,
    raw: text,
  };
}

function parseOlderThan(value: string): number {
  const match = value.match(/^(\d+)([hd])$/);
  if (!match) throw new Error('--older-than must look like 1h or 1d');
  const amount = Number(match[1]);
  return amount * (match[2] === 'd' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000);
}

async function main(): Promise<void> {
  const [command, payloadText] = process.argv.slice(2);
  try {
    if (command === 'seed') {
      const seed = await seedStage1FactReflection();
      console.log(JSON.stringify(seed));
      return;
    }
    if (command === 'run') {
      const payload = JSON.parse(payloadText || '{}') as { content?: string };
      const seed = await seedStage1FactReflection();
      const run = await invokeStage1(
        seed,
        payload.content ||
          "The thing I haven't said out loud is that I am scared she might be right about me. That I have held us back and I don't know how to be different.",
      );
      console.log(JSON.stringify({ seed, ...run }));
      return;
    }
    if (command === 'cleanup') {
      const result = await cleanup(parseOlderThan(payloadText || '1d'));
      console.log(JSON.stringify(result));
      return;
    }
    if (command === 'judge') {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      console.log(JSON.stringify(await judge(payload)));
      return;
    }
    throw new Error(`Unknown command: ${command}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  await prisma.$disconnect();
  process.exit(2);
});
