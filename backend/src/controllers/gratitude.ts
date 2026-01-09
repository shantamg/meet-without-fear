/**
 * Gratitude Practice Controller ("See the Positive")
 *
 * Handles gratitude journaling and pattern recognition:
 * - POST /gratitude - Create new gratitude entry
 * - GET /gratitude - List entries
 * - GET /gratitude/:id - Get single entry
 * - DELETE /gratitude/:id - Delete entry
 * - GET /gratitude/patterns - Get aggregated patterns
 * - GET /gratitude/preferences - Get preferences
 * - PATCH /gratitude/preferences - Update preferences
 * - GET /gratitude/prompt - Get contextual prompt
 */

import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { getUser } from '../middleware/auth';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errors';
import {
  ApiResponse,
  GratitudeEntryDTO,
  GratitudeMetadataDTO,
  GratitudePreferencesDTO,
  GratitudePatternsDTO,
  CreateGratitudeRequest,
  CreateGratitudeResponse,
  ListGratitudeResponse,
  GetGratitudeResponse,
  DeleteGratitudeResponse,
  GetGratitudePatternsResponse,
  GetGratitudePreferencesResponse,
  UpdateGratitudePreferencesRequest,
  UpdateGratitudePreferencesResponse,
  GetGratitudePromptResponse,
} from '@meet-without-fear/shared';
import { z } from 'zod';
import { getHaikuJson } from '../lib/bedrock';

// ============================================================================
// Validation Schemas
// ============================================================================

const createGratitudeSchema = z.object({
  content: z.string().min(1).max(5000),
  voiceRecorded: z.boolean().optional().default(false),
});

const listGratitudeSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

const patternsQuerySchema = z.object({
  period: z.enum(['7d', '30d', '90d', 'all']).optional().default('30d'),
});

const updatePreferencesSchema = z.object({
  enabled: z.boolean().optional(),
  frequency: z.number().int().min(0).max(3).optional(),
  preferredTimes: z.array(z.string().regex(/^\d{2}:\d{2}$/)).optional(),
  weekdayOnly: z.boolean().optional(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
});

// ============================================================================
// Helper Functions
// ============================================================================

function mapEntryToDTO(entry: {
  id: string;
  content: string;
  voiceRecorded: boolean;
  createdAt: Date;
  aiResponse: string | null;
  extractedPeople: string[];
  extractedPlaces: string[];
  extractedActivities: string[];
  extractedEmotions: string[];
  extractedThemes: string[];
  linkedNeedIds: number[];
  sentimentScore: number | null;
}): GratitudeEntryDTO {
  const hasMetadata = entry.extractedPeople.length > 0 ||
    entry.extractedPlaces.length > 0 ||
    entry.extractedActivities.length > 0;

  return {
    id: entry.id,
    content: entry.content,
    voiceRecorded: entry.voiceRecorded,
    createdAt: entry.createdAt.toISOString(),
    aiResponse: entry.aiResponse,
    metadata: hasMetadata ? {
      people: entry.extractedPeople,
      places: entry.extractedPlaces,
      activities: entry.extractedActivities,
      emotions: entry.extractedEmotions,
      themes: entry.extractedThemes,
      linkedNeedIds: entry.linkedNeedIds,
      sentiment: entry.sentimentScore,
    } : null,
  };
}

function mapPreferencesToDTO(prefs: {
  enabled: boolean;
  frequency: number;
  preferredTimes: string[];
  weekdayOnly: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}): GratitudePreferencesDTO {
  return {
    enabled: prefs.enabled,
    frequency: prefs.frequency,
    preferredTimes: prefs.preferredTimes,
    weekdayOnly: prefs.weekdayOnly,
    quietHoursStart: prefs.quietHoursStart,
    quietHoursEnd: prefs.quietHoursEnd,
  };
}

function getPeriodDate(period: '7d' | '30d' | '90d' | 'all'): Date | null {
  const now = new Date();
  switch (period) {
    case '7d': return new Date(now.setDate(now.getDate() - 7));
    case '30d': return new Date(now.setDate(now.getDate() - 30));
    case '90d': return new Date(now.setDate(now.getDate() - 90));
    case 'all': return null;
  }
}

// ============================================================================
// AI Response Generation
// ============================================================================

async function generateGratitudeResponse(
  content: string,
  userId: string
): Promise<{ response: string; metadata: GratitudeMetadataDTO }> {
  // Get user context for richer response
  const needsState = await prisma.needsAssessmentState.findUnique({
    where: { userId },
  });

  let needsContext = '';
  if (needsState?.baselineCompleted) {
    const lowNeeds = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT DISTINCT ON (ns."needId") n.name
      FROM "NeedScore" ns
      JOIN "Need" n ON n.id = ns."needId"
      WHERE ns."userId" = ${userId}
      AND ns.score <= 1
      ORDER BY ns."needId", ns."createdAt" DESC
      LIMIT 3
    `;
    if (lowNeeds.length > 0) {
      needsContext = `User's lower-scoring needs: ${lowNeeds.map(n => n.name).join(', ')}`;
    }
  }

  const prompt = `You are responding to a gratitude entry in Inner Work.

USER'S GRATITUDE:
"${content}"

${needsContext ? `\nCONTEXT:\n${needsContext}\n` : ''}

INSTRUCTIONS:
1. Write a warm, genuine 1-3 sentence response acknowledging their gratitude
2. Notice connections to human needs if relevant
3. Don't over-process - sometimes just witness
4. Never force positivity or add toxic optimism
5. NO follow-up questions (keep it simple, they're done sharing)

ALSO EXTRACT metadata from their entry:
- people: names mentioned
- places: locations mentioned
- activities: activities mentioned
- emotions: emotions expressed
- themes: gratitude themes (nature, connection, growth, achievement, comfort, creativity, etc.)
- linkedNeeds: IDs of the 19 needs this might connect to (1-19)
- sentiment: 0.0 to 1.0 (how positive the sentiment is)

RESPOND IN JSON:
{
  "response": "Your warm acknowledgment here",
  "people": ["names"],
  "places": ["locations"],
  "activities": ["activities"],
  "emotions": ["emotions"],
  "themes": ["themes"],
  "linkedNeeds": [needIds],
  "sentiment": 0.8
}`;

  // Generate synthetic IDs for standalone feature
  const syntheticSessionId = `gratitude-${userId}`;
  const syntheticTurnId = `${syntheticSessionId}-${Date.now()}`;

  const aiResponse = await getHaikuJson<{
    response?: string;
    people?: string[];
    places?: string[];
    activities?: string[];
    emotions?: string[];
    themes?: string[];
    linkedNeeds?: number[];
    sentiment?: number;
  }>({
    systemPrompt: prompt,
    messages: [{ role: 'user', content: content }],
    operation: 'gratitude-response',
    sessionId: syntheticSessionId,
    turnId: syntheticTurnId,
  });

  const parsed = aiResponse ?? {
    response: "Thank you for sharing that. It's beautiful to notice the good, even in small moments.",
    people: [],
    places: [],
    activities: [],
    emotions: [],
    themes: [],
    linkedNeeds: [],
    sentiment: 0.5,
  };

  return {
    response: parsed.response || "Thank you for sharing that.",
    metadata: {
      people: parsed.people || [],
      places: parsed.places || [],
      activities: parsed.activities || [],
      emotions: parsed.emotions || [],
      themes: parsed.themes || [],
      linkedNeedIds: parsed.linkedNeeds || [],
      sentiment: parsed.sentiment ?? null,
    },
  };
}

// ============================================================================
// Controllers
// ============================================================================

/**
 * POST /api/v1/gratitude
 * Create a new gratitude entry.
 */
export const createGratitude = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = getUser(req);

    const parseResult = createGratitudeSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid gratitude entry', {
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    const { content, voiceRecorded } = parseResult.data;

    // Generate AI response and extract metadata
    const { response: aiResponse, metadata } = await generateGratitudeResponse(content, user.id);

    // Create the entry
    const entry = await prisma.gratitudeEntry.create({
      data: {
        userId: user.id,
        content,
        voiceRecorded,
        aiResponse,
        extractedPeople: metadata.people,
        extractedPlaces: metadata.places,
        extractedActivities: metadata.activities,
        extractedEmotions: metadata.emotions,
        extractedThemes: metadata.themes,
        linkedNeedIds: metadata.linkedNeedIds,
        sentimentScore: metadata.sentiment,
      },
    });

    const response: ApiResponse<CreateGratitudeResponse> = {
      success: true,
      data: {
        entry: mapEntryToDTO(entry),
        aiResponse,
      },
    };
    res.status(201).json(response);
  }
);

/**
 * GET /api/v1/gratitude
 * List gratitude entries.
 */
export const listGratitude = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = getUser(req);

    const parseResult = listGratitudeSchema.safeParse(req.query);
    if (!parseResult.success) {
      throw new ValidationError('Invalid query parameters', {
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    const { limit, offset, startDate, endDate } = parseResult.data;

    const where = {
      userId: user.id,
      ...(startDate && { createdAt: { gte: new Date(startDate) } }),
      ...(endDate && { createdAt: { lte: new Date(endDate) } }),
    };

    const [entries, total] = await Promise.all([
      prisma.gratitudeEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.gratitudeEntry.count({ where }),
    ]);

    const response: ApiResponse<ListGratitudeResponse> = {
      success: true,
      data: {
        entries: entries.map(mapEntryToDTO),
        total,
        hasMore: offset + entries.length < total,
      },
    };
    res.json(response);
  }
);

/**
 * GET /api/v1/gratitude/:id
 * Get a single gratitude entry.
 */
export const getGratitude = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = getUser(req);
    const { id } = req.params;

    const entry = await prisma.gratitudeEntry.findFirst({
      where: { id, userId: user.id },
    });

    if (!entry) {
      throw new NotFoundError('Gratitude entry not found');
    }

    const response: ApiResponse<GetGratitudeResponse> = {
      success: true,
      data: { entry: mapEntryToDTO(entry) },
    };
    res.json(response);
  }
);

/**
 * DELETE /api/v1/gratitude/:id
 * Delete a gratitude entry.
 */
export const deleteGratitude = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = getUser(req);
    const { id } = req.params;

    const entry = await prisma.gratitudeEntry.findFirst({
      where: { id, userId: user.id },
    });

    if (!entry) {
      throw new NotFoundError('Gratitude entry not found');
    }

    await prisma.gratitudeEntry.delete({ where: { id } });

    const response: ApiResponse<DeleteGratitudeResponse> = {
      success: true,
      data: { success: true },
    };
    res.json(response);
  }
);

/**
 * GET /api/v1/gratitude/patterns
 * Get aggregated patterns from gratitude entries.
 */
export const getPatterns = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = getUser(req);

    const parseResult = patternsQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      throw new ValidationError('Invalid query parameters', {
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    const { period } = parseResult.data;
    const periodDate = getPeriodDate(period);

    const where = {
      userId: user.id,
      ...(periodDate && { createdAt: { gte: periodDate } }),
    };

    const entries = await prisma.gratitudeEntry.findMany({
      where,
      select: {
        extractedPeople: true,
        extractedPlaces: true,
        extractedActivities: true,
        extractedThemes: true,
        linkedNeedIds: true,
        sentimentScore: true,
        createdAt: true,
      },
    });

    // Aggregate patterns
    const peopleCounts = new Map<string, number>();
    const placeCounts = new Map<string, number>();
    const activityCounts = new Map<string, number>();
    const themeCounts = new Map<string, number>();
    const needCounts = new Map<number, number>();
    const sentimentByDate = new Map<string, number[]>();

    for (const entry of entries) {
      entry.extractedPeople.forEach(p => peopleCounts.set(p, (peopleCounts.get(p) || 0) + 1));
      entry.extractedPlaces.forEach(p => placeCounts.set(p, (placeCounts.get(p) || 0) + 1));
      entry.extractedActivities.forEach(a => activityCounts.set(a, (activityCounts.get(a) || 0) + 1));
      entry.extractedThemes.forEach(t => themeCounts.set(t, (themeCounts.get(t) || 0) + 1));
      entry.linkedNeedIds.forEach(n => needCounts.set(n, (needCounts.get(n) || 0) + 1));

      if (entry.sentimentScore !== null) {
        const dateKey = entry.createdAt.toISOString().split('T')[0];
        const scores = sentimentByDate.get(dateKey) || [];
        scores.push(entry.sentimentScore);
        sentimentByDate.set(dateKey, scores);
      }
    }

    // Get need names
    const needIds = Array.from(needCounts.keys());
    const needs = needIds.length > 0
      ? await prisma.need.findMany({ where: { id: { in: needIds } } })
      : [];
    const needNameMap = new Map(needs.map(n => [n.id, n.name]));

    // Calculate streak
    const sortedDates = entries
      .map(e => e.createdAt.toISOString().split('T')[0])
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort()
      .reverse();

    let streakDays = 0;
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    if (sortedDates[0] === today || sortedDates[0] === yesterday) {
      streakDays = 1;
      for (let i = 1; i < sortedDates.length; i++) {
        const current = new Date(sortedDates[i - 1]);
        const prev = new Date(sortedDates[i]);
        const diffDays = Math.floor((current.getTime() - prev.getTime()) / 86400000);
        if (diffDays === 1) {
          streakDays++;
        } else {
          break;
        }
      }
    }

    const patterns: GratitudePatternsDTO = {
      topPeople: Array.from(peopleCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ name, count })),
      topPlaces: Array.from(placeCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ name, count })),
      topActivities: Array.from(activityCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ name, count })),
      topThemes: Array.from(themeCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([theme, count]) => ({ theme, count })),
      needsConnections: Array.from(needCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([needId, count]) => ({
          needId,
          needName: needNameMap.get(needId) || `Need ${needId}`,
          count,
        })),
      sentimentTrend: Array.from(sentimentByDate.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, scores]) => ({
          date,
          avgScore: scores.reduce((a, b) => a + b, 0) / scores.length,
        })),
      totalEntries: entries.length,
      streakDays,
    };

    const response: ApiResponse<GetGratitudePatternsResponse> = {
      success: true,
      data: { patterns },
    };
    res.json(response);
  }
);

/**
 * GET /api/v1/gratitude/preferences
 * Get gratitude preferences.
 */
export const getPreferences = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = getUser(req);

    let prefs = await prisma.gratitudePreferences.findUnique({
      where: { userId: user.id },
    });

    if (!prefs) {
      prefs = await prisma.gratitudePreferences.create({
        data: { userId: user.id },
      });
    }

    const response: ApiResponse<GetGratitudePreferencesResponse> = {
      success: true,
      data: { preferences: mapPreferencesToDTO(prefs) },
    };
    res.json(response);
  }
);

/**
 * PATCH /api/v1/gratitude/preferences
 * Update gratitude preferences.
 */
export const updatePreferences = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = getUser(req);

    const parseResult = updatePreferencesSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid preferences', {
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    const prefs = await prisma.gratitudePreferences.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        ...parseResult.data,
      },
      update: parseResult.data,
    });

    const response: ApiResponse<UpdateGratitudePreferencesResponse> = {
      success: true,
      data: { preferences: mapPreferencesToDTO(prefs) },
    };
    res.json(response);
  }
);

/**
 * GET /api/v1/gratitude/prompt
 * Get a contextual prompt for gratitude entry.
 */
export const getPrompt = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = getUser(req);

    // Check if this is first entry
    const entryCount = await prisma.gratitudeEntry.count({
      where: { userId: user.id },
    });

    if (entryCount === 0) {
      const response: ApiResponse<GetGratitudePromptResponse> = {
        success: true,
        data: {
          prompt: "What's one thing you're grateful for today?",
          context: 'first_entry',
        },
      };
      res.json(response);
      return;
    }

    // Check needs scores
    const needsState = await prisma.needsAssessmentState.findUnique({
      where: { userId: user.id },
    });

    let context: GetGratitudePromptResponse['context'] = 'general';
    let prompt = "What are you grateful for today?";

    if (needsState?.baselineCompleted) {
      const scores = await prisma.$queryRaw<Array<{ score: number }>>`
        SELECT DISTINCT ON ("needId") score
        FROM "NeedScore"
        WHERE "userId" = ${user.id}
        ORDER BY "needId", "createdAt" DESC
      `;

      const avgScore = scores.reduce((a, b) => a + b.score, 0) / scores.length;

      if (avgScore >= 1.5) {
        context = 'high_needs';
        prompt = "What's bringing you joy lately?";
      } else if (avgScore <= 0.5) {
        context = 'low_needs';
        prompt = "How are you doing today? If there's anything - however small - that brought even a moment of ease, I'd love to hear it. But no pressure if that's not where you are.";
      } else {
        context = 'mixed_needs';
        prompt = "What are you grateful for today, even amid the hard stuff?";
      }
    }

    // Check for recent conflicts
    const recentConflict = await prisma.session.findFirst({
      where: {
        OR: [
          { relationship: { members: { some: { userId: user.id } } } },
        ],
        status: 'ACTIVE',
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      include: {
        relationship: {
          include: {
            members: {
              where: { userId: { not: user.id } },
              include: { user: true },
            },
          },
        },
      },
    });

    if (recentConflict) {
      const partnerName = recentConflict.relationship.members[0]?.user?.name ||
        recentConflict.relationship.members[0]?.nickname ||
        'your partner';
      context = 'recent_conflict';
      prompt = `I know things have been hard with ${partnerName}. Is there anything about them - or about yourself in this situation - you can appreciate, even while working through the difficulty?`;
    }

    const response: ApiResponse<GetGratitudePromptResponse> = {
      success: true,
      data: { prompt, context },
    };
    res.json(response);
  }
);
