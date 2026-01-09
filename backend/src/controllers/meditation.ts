/**
 * Meditation Controller ("Develop Loving Awareness")
 *
 * Handles guided and unguided meditation features:
 * - POST /meditation/sessions - Create new session
 * - PATCH /meditation/sessions/:id - Update session
 * - GET /meditation/sessions - List sessions
 * - POST /meditation/suggest - Get AI suggestion
 * - POST /meditation/generate-script - Generate meditation script
 * - GET /meditation/stats - Get aggregated stats
 * - GET /meditation/favorites - List favorites
 * - POST /meditation/favorites - Save as favorite
 * - DELETE /meditation/favorites/:id - Delete favorite
 * - GET /meditation/preferences - Get preferences
 * - PATCH /meditation/preferences - Update preferences
 */

import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { getUser } from '../middleware/auth';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errors';
import {
  ApiResponse,
  MeditationSessionDTO,
  MeditationSessionSummaryDTO,
  MeditationStatsDTO,
  MeditationFavoriteDTO,
  MeditationPreferencesDTO,
  CreateMeditationSessionRequest,
  CreateMeditationSessionResponse,
  UpdateMeditationSessionRequest,
  UpdateMeditationSessionResponse,
  ListMeditationSessionsResponse,
  GetMeditationSuggestionResponse,
  GenerateScriptRequest,
  GenerateScriptResponse,
  GetMeditationStatsResponse,
  ListMeditationFavoritesResponse,
  CreateMeditationFavoriteRequest,
  CreateMeditationFavoriteResponse,
  DeleteMeditationFavoriteResponse,
  GetMeditationPreferencesResponse,
  UpdateMeditationPreferencesRequest,
  UpdateMeditationPreferencesResponse,
  MeditationType,
  FavoriteType,
} from '@meet-without-fear/shared';
import { z } from 'zod';
import { getCompletion } from '../lib/bedrock';

// ============================================================================
// Validation Schemas
// ============================================================================

const createSessionSchema = z.object({
  type: z.enum(['GUIDED', 'UNGUIDED']),
  durationMinutes: z.number().int().min(5).max(60),
  focusArea: z.string().max(100).optional(),
  voiceId: z.string().max(50).optional(),
  backgroundSound: z.string().max(50).optional(),
});

const updateSessionSchema = z.object({
  completed: z.boolean().optional(),
  postNotes: z.string().max(2000).optional(),
  savedAsFavorite: z.boolean().optional(),
  favoriteType: z.enum(['EXACT', 'THEME']).optional(),
});

const listSessionsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
  type: z.enum(['GUIDED', 'UNGUIDED']).optional(),
});

const generateScriptSchema = z.object({
  focusArea: z.string().min(1).max(100),
  durationMinutes: z.number().int().min(5).max(60),
  context: z.object({
    preparingForConflict: z.boolean().optional(),
    recentEmotions: z.array(z.string()).optional(),
    lowNeeds: z.array(z.string()).optional(),
  }).optional(),
});

const createFavoriteSchema = z.object({
  sessionId: z.string(),
  name: z.string().max(100).optional(),
});

const updatePreferencesSchema = z.object({
  preferredVoice: z.string().max(50).optional(),
  voiceSpeed: z.number().min(0.8).max(1.2).optional(),
  defaultDuration: z.number().int().min(5).max(60).optional(),
  backgroundSound: z.string().max(50).optional(),
  reminderEnabled: z.boolean().optional(),
  reminderTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
});

// ============================================================================
// Helper Functions
// ============================================================================

function mapSessionToDTO(session: {
  id: string;
  type: string;
  durationMinutes: number;
  focusArea: string | null;
  completed: boolean;
  startedAt: Date;
  completedAt: Date | null;
  scriptGenerated: string | null;
  voiceId: string | null;
  backgroundSound: string | null;
  savedAsFavorite: boolean;
  favoriteType: string | null;
  postNotes: string | null;
}): MeditationSessionDTO {
  return {
    id: session.id,
    type: session.type as MeditationType,
    durationMinutes: session.durationMinutes,
    focusArea: session.focusArea,
    completed: session.completed,
    startedAt: session.startedAt.toISOString(),
    completedAt: session.completedAt?.toISOString() ?? null,
    scriptGenerated: session.scriptGenerated,
    voiceId: session.voiceId,
    backgroundSound: session.backgroundSound,
    savedAsFavorite: session.savedAsFavorite,
    favoriteType: session.favoriteType as FavoriteType | null,
    postNotes: session.postNotes,
  };
}

function mapSessionToSummaryDTO(session: {
  id: string;
  type: string;
  durationMinutes: number;
  focusArea: string | null;
  completed: boolean;
  startedAt: Date;
  completedAt: Date | null;
}): MeditationSessionSummaryDTO {
  return {
    id: session.id,
    type: session.type as MeditationType,
    durationMinutes: session.durationMinutes,
    focusArea: session.focusArea,
    completed: session.completed,
    startedAt: session.startedAt.toISOString(),
    completedAt: session.completedAt?.toISOString() ?? null,
  };
}

function mapFavoriteToDTO(fav: {
  id: string;
  name: string;
  focusArea: string;
  durationMinutes: number;
  favoriteType: string;
  script: string | null;
  savedAt: Date;
}): MeditationFavoriteDTO {
  return {
    id: fav.id,
    name: fav.name,
    focusArea: fav.focusArea,
    durationMinutes: fav.durationMinutes,
    favoriteType: fav.favoriteType as FavoriteType,
    script: fav.script,
    savedAt: fav.savedAt.toISOString(),
  };
}

function mapPreferencesToDTO(prefs: {
  preferredVoice: string;
  voiceSpeed: number;
  defaultDuration: number;
  backgroundSound: string;
  reminderEnabled: boolean;
  reminderTime: string | null;
}): MeditationPreferencesDTO {
  return prefs;
}

async function updateStats(userId: string, session: {
  type: string;
  durationMinutes: number;
  focusArea: string | null;
  completed: boolean;
  startedAt: Date;
}): Promise<void> {
  const stats = await prisma.meditationStats.findUnique({
    where: { userId },
  });

  const today = new Date().toISOString().split('T')[0];
  const sessionDate = session.startedAt.toISOString().split('T')[0];
  const lastDate = stats?.lastSessionDate?.toISOString().split('T')[0];

  // Calculate streak
  let currentStreak = stats?.currentStreak || 0;
  let longestStreak = stats?.longestStreak || 0;
  let streakStartDate = stats?.streakStartDate || null;

  if (session.completed) {
    if (!lastDate) {
      // First session ever
      currentStreak = 1;
      streakStartDate = session.startedAt;
    } else if (sessionDate === today) {
      // Session today
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      if (lastDate === yesterday) {
        // Continuing streak from yesterday
        currentStreak++;
      } else if (lastDate !== today) {
        // Streak broken, starting new
        currentStreak = 1;
        streakStartDate = session.startedAt;
      }
      // If lastDate === today, streak already counted
    }

    if (currentStreak > longestStreak) {
      longestStreak = currentStreak;
    }
  }

  // Update focus areas
  const favoriteFocusAreas = (stats?.favoriteFocusAreas as Record<string, number>) || {};
  if (session.focusArea) {
    favoriteFocusAreas[session.focusArea] = (favoriteFocusAreas[session.focusArea] || 0) + 1;
  }

  await prisma.meditationStats.upsert({
    where: { userId },
    create: {
      userId,
      totalSessions: 1,
      guidedCount: session.type === 'GUIDED' ? 1 : 0,
      unguidedCount: session.type === 'UNGUIDED' ? 1 : 0,
      totalMinutes: session.completed ? session.durationMinutes : 0,
      currentStreak,
      longestStreak,
      streakStartDate,
      lastSessionDate: session.completed ? session.startedAt : null,
      favoriteFocusAreas,
    },
    update: {
      totalSessions: { increment: 1 },
      guidedCount: session.type === 'GUIDED' ? { increment: 1 } : undefined,
      unguidedCount: session.type === 'UNGUIDED' ? { increment: 1 } : undefined,
      totalMinutes: session.completed ? { increment: session.durationMinutes } : undefined,
      currentStreak,
      longestStreak,
      streakStartDate,
      lastSessionDate: session.completed ? session.startedAt : undefined,
      favoriteFocusAreas,
    },
  });
}

// ============================================================================
// Script Generation
// ============================================================================

async function generateMeditationScript(
  focusArea: string,
  durationMinutes: number,
  userId: string,
  context?: GenerateScriptRequest['context']
): Promise<string> {
  const totalWords = durationMinutes * 100; // ~100 wpm with pauses

  const prompt = `Generate a ${durationMinutes}-minute guided meditation script.

FOCUS: ${focusArea}

${context?.lowNeeds?.length ? `USER CONTEXT:\n- Low-scoring needs: ${context.lowNeeds.join(', ')}` : ''}
${context?.recentEmotions?.length ? `- Recent emotions: ${context.recentEmotions.join(', ')}` : ''}
${context?.preparingForConflict ? '- Preparing for a difficult conversation' : ''}

STRUCTURE (total ~${totalWords} words including pause markers):

OPENING (${Math.round(durationMinutes * 0.1)} min):
- Begin with [BELL]
- Welcome and settling
- Posture guidance
- Initial breath awareness

CORE PRACTICE (${Math.round(durationMinutes * 0.75)} min):
- Main technique/focus
- Include [PAUSE 30s] and [PAUSE 60s] markers generously
- Guided awareness with spacious silence
- Gentle redirecting for wandering mind
- More silence than words

INTEGRATION (${Math.round(durationMinutes * 0.1)} min):
- Widening awareness
- Bringing practice into daily life
${context?.preparingForConflict ? '- Connection to upcoming difficult conversations' : ''}

CLOSING (${Math.round(durationMinutes * 0.05)} min):
- Gentle return
- [BELL]
- Brief acknowledgment

TONE GUIDANCE:
${focusArea.toLowerCase().includes('rest') || focusArea.toLowerCase().includes('grounding')
    ? '- Softer, slower voice'
    : focusArea.toLowerCase().includes('courage') || focusArea.toLowerCase().includes('clarity')
    ? '- Steadier, firmer voice'
    : focusArea.toLowerCase().includes('compassion')
    ? '- Warmer, gentler voice'
    : '- Calm, neutral voice'}

REQUIREMENTS:
- Use specific sensory language (embodied, not intellectual)
- Include appropriate pauses - silence is essential
- Don't over-explain or be too wordy
- Natural pacing with room to breathe
- End with something grounding they can take forward

OUTPUT FORMAT:
- Use exactly this format for pauses: [PAUSE 30s] or [PAUSE 60s] (number followed by 's')
- Use exactly this format for bells: [BELL]
- Place pause markers on their own lines or at the end of sentences
- Include generous pauses throughout, especially during core practice
- Output ONLY the script text with these markers - no metadata, no commentary, no explanations
- Example format:
  [BELL]
  
  Welcome to this practice.
  
  [PAUSE 10s]
  
  Begin by noticing your breath.
  
  [PAUSE 30s]
  
  Let your attention settle...
  
  [PAUSE 60s]`;

  // Generate synthetic IDs for standalone feature
  const syntheticSessionId = `meditation-${userId}`;
  const syntheticTurnId = `${syntheticSessionId}-${Date.now()}`;

  const script = await getCompletion({
    systemPrompt: prompt,
    messages: [{ role: 'user', content: `Generate a ${durationMinutes}-minute meditation on ${focusArea}` }],
    maxTokens: 4000,
    operation: 'meditation-script',
    sessionId: syntheticSessionId,
    turnId: syntheticTurnId,
  });

  return script || generateFallbackScript(focusArea, durationMinutes);
}

function generateFallbackScript(focusArea: string, durationMinutes: number): string {
  return `[BELL]

Welcome. Find a comfortable position and let your body settle.
There's nowhere you need to be right now except here.

[PAUSE 10s]

Begin by noticing your breath. Not changing it, just noticing.

[PAUSE 20s]

Let your attention settle on the sensations of breathing.
The rise and fall. The natural rhythm.

[PAUSE 30s]

Now, gently bring your awareness to ${focusArea}.

[PAUSE 60s]

Whatever arises, just notice it. There's nothing to fix or change.

[PAUSE 60s]

${durationMinutes >= 10 ? `[PAUSE 60s]\n\nContinue resting in this awareness.\n\n[PAUSE 60s]\n` : ''}

Now, begin to widen your awareness. Include the sounds around you.
The feeling of your body in space.

[PAUSE 20s]

As you prepare to return, carry this sense of presence with you.

[PAUSE 10s]

When you're ready, gently open your eyes.

[BELL]`;
}

// ============================================================================
// Controllers
// ============================================================================

/**
 * POST /api/v1/meditation/sessions
 * Create a new meditation session.
 */
export const createSession = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = getUser(req);

    const parseResult = createSessionSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid session data', {
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    const { type, durationMinutes, focusArea, voiceId, backgroundSound } = parseResult.data;

    let script: string | null = null;
    if (type === 'GUIDED' && focusArea) {
      // Get user context for personalization
      const lowNeeds = await prisma.$queryRaw<Array<{ name: string }>>`
        SELECT DISTINCT ON (ns."needId") n.name
        FROM "NeedScore" ns
        JOIN "Need" n ON n.id = ns."needId"
        WHERE ns."userId" = ${user.id}
        AND ns.score <= 1
        ORDER BY ns."needId", ns."createdAt" DESC
        LIMIT 3
      `;

      script = await generateMeditationScript(focusArea, durationMinutes, user.id, {
        lowNeeds: lowNeeds.map(n => n.name),
      });
    }

    const session = await prisma.meditationSession.create({
      data: {
        userId: user.id,
        type,
        durationMinutes,
        focusArea,
        voiceId,
        backgroundSound,
        scriptGenerated: script,
      },
    });

    const response: ApiResponse<CreateMeditationSessionResponse> = {
      success: true,
      data: {
        session: mapSessionToDTO(session),
        script: script ?? undefined,
      },
    };
    res.status(201).json(response);
  }
);

/**
 * PATCH /api/v1/meditation/sessions/:id
 * Update a meditation session.
 */
export const updateSession = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = getUser(req);
    const { id } = req.params;

    const parseResult = updateSessionSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid update data', {
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    const existing = await prisma.meditationSession.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      throw new NotFoundError('Session not found');
    }

    const { completed, postNotes, savedAsFavorite, favoriteType } = parseResult.data;

    const session = await prisma.meditationSession.update({
      where: { id },
      data: {
        completed,
        completedAt: completed ? new Date() : undefined,
        postNotes,
        savedAsFavorite,
        favoriteType,
      },
    });

    // Update stats if completed
    if (completed && !existing.completed) {
      await updateStats(user.id, session);
    }

    // Create favorite if requested
    if (savedAsFavorite && favoriteType && !existing.savedAsFavorite) {
      await prisma.meditationFavorite.create({
        data: {
          userId: user.id,
          name: session.focusArea || 'Meditation',
          focusArea: session.focusArea || 'general',
          durationMinutes: session.durationMinutes,
          favoriteType,
          script: favoriteType === 'EXACT' ? session.scriptGenerated : null,
        },
      });
    }

    const response: ApiResponse<UpdateMeditationSessionResponse> = {
      success: true,
      data: { session: mapSessionToDTO(session) },
    };
    res.json(response);
  }
);

/**
 * GET /api/v1/meditation/sessions
 * List meditation sessions.
 */
export const listSessions = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = getUser(req);

    const parseResult = listSessionsSchema.safeParse(req.query);
    if (!parseResult.success) {
      throw new ValidationError('Invalid query parameters', {
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    const { limit, offset, type } = parseResult.data;

    const where = {
      userId: user.id,
      ...(type && { type }),
    };

    const [sessions, total] = await Promise.all([
      prisma.meditationSession.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.meditationSession.count({ where }),
    ]);

    const response: ApiResponse<ListMeditationSessionsResponse> = {
      success: true,
      data: {
        sessions: sessions.map(mapSessionToSummaryDTO),
        total,
        hasMore: offset + sessions.length < total,
      },
    };
    res.json(response);
  }
);

/**
 * POST /api/v1/meditation/suggest
 * Get AI suggestion for meditation.
 */
export const getSuggestion = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = getUser(req);

    // Get user's needs state
    const lowNeeds = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT DISTINCT ON (ns."needId") n.name
      FROM "NeedScore" ns
      JOIN "Need" n ON n.id = ns."needId"
      WHERE ns."userId" = ${user.id}
      AND ns.score <= 1
      ORDER BY ns."needId", ns."createdAt" DESC
      LIMIT 3
    `;

    // Check for recent conflicts
    const recentConflict = await prisma.session.findFirst({
      where: {
        relationship: { members: { some: { userId: user.id } } },
        status: 'ACTIVE',
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    });

    let suggestedFocus = 'grounding and presence';
    let reasoning = 'A practice to help you feel centered and connected to the present moment.';
    let suggestedDuration = 10;

    if (recentConflict) {
      suggestedFocus = 'grounding and inner steadiness';
      reasoning = "Given you're working through something with someone, a grounding practice could help you feel more steady and clear.";
      suggestedDuration = 15;
    } else if (lowNeeds.length > 0) {
      const needNames = lowNeeds.map(n => n.name.toLowerCase());
      if (needNames.some(n => n.includes('rest') || n.includes('calm'))) {
        suggestedFocus = 'rest and restoration';
        reasoning = `I notice rest and calm feel unmet right now. A restful practice might offer some ease.`;
        suggestedDuration = 15;
      } else if (needNames.some(n => n.includes('compassion'))) {
        suggestedFocus = 'self-compassion';
        reasoning = `Self-compassion seems like it could use some attention. A loving-kindness practice might feel supportive.`;
        suggestedDuration = 15;
      }
    }

    const response: ApiResponse<GetMeditationSuggestionResponse> = {
      success: true,
      data: {
        suggestedFocus,
        reasoning,
        suggestedDuration,
      },
    };
    res.json(response);
  }
);

/**
 * POST /api/v1/meditation/generate-script
 * Generate a meditation script.
 */
export const generateScript = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = getUser(req);

    const parseResult = generateScriptSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid request', {
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    const { focusArea, durationMinutes, context } = parseResult.data;

    const script = await generateMeditationScript(focusArea, durationMinutes, user.id, context);

    const response: ApiResponse<GenerateScriptResponse> = {
      success: true,
      data: {
        script,
        estimatedMinutes: durationMinutes,
      },
    };
    res.json(response);
  }
);

/**
 * GET /api/v1/meditation/stats
 * Get meditation stats.
 */
export const getStats = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = getUser(req);

    let stats = await prisma.meditationStats.findUnique({
      where: { userId: user.id },
    });

    if (!stats) {
      stats = await prisma.meditationStats.create({
        data: { userId: user.id },
      });
    }

    const favoriteFocusAreas = stats.favoriteFocusAreas as Record<string, number>;
    const sortedAreas = Object.entries(favoriteFocusAreas)
      .sort((a, b) => b[1] - a[1])
      .map(([focusArea, count]) => ({ focusArea, count }));

    const statsDTO: MeditationStatsDTO = {
      totalSessions: stats.totalSessions,
      guidedCount: stats.guidedCount,
      unguidedCount: stats.unguidedCount,
      totalMinutes: stats.totalMinutes,
      currentStreak: stats.currentStreak,
      longestStreak: stats.longestStreak,
      streakStartDate: stats.streakStartDate?.toISOString() ?? null,
      lastSessionDate: stats.lastSessionDate?.toISOString() ?? null,
      favoriteFocusAreas: sortedAreas,
    };

    const response: ApiResponse<GetMeditationStatsResponse> = {
      success: true,
      data: { stats: statsDTO },
    };
    res.json(response);
  }
);

/**
 * GET /api/v1/meditation/favorites
 * List meditation favorites.
 */
export const listFavorites = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = getUser(req);

    const favorites = await prisma.meditationFavorite.findMany({
      where: { userId: user.id },
      orderBy: { savedAt: 'desc' },
    });

    const response: ApiResponse<ListMeditationFavoritesResponse> = {
      success: true,
      data: { favorites: favorites.map(mapFavoriteToDTO) },
    };
    res.json(response);
  }
);

/**
 * POST /api/v1/meditation/favorites
 * Save a session as favorite.
 */
export const createFavorite = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = getUser(req);

    const parseResult = createFavoriteSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid request', {
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    const { sessionId, name } = parseResult.data;

    const session = await prisma.meditationSession.findFirst({
      where: { id: sessionId, userId: user.id },
    });

    if (!session) {
      throw new NotFoundError('Session not found');
    }

    const favorite = await prisma.meditationFavorite.create({
      data: {
        userId: user.id,
        name: name || session.focusArea || 'Meditation',
        focusArea: session.focusArea || 'general',
        durationMinutes: session.durationMinutes,
        favoriteType: session.favoriteType || 'THEME',
        script: session.favoriteType === 'EXACT' ? session.scriptGenerated : null,
      },
    });

    const response: ApiResponse<CreateMeditationFavoriteResponse> = {
      success: true,
      data: { favorite: mapFavoriteToDTO(favorite) },
    };
    res.status(201).json(response);
  }
);

/**
 * DELETE /api/v1/meditation/favorites/:id
 * Delete a favorite.
 */
export const deleteFavorite = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = getUser(req);
    const { id } = req.params;

    const favorite = await prisma.meditationFavorite.findFirst({
      where: { id, userId: user.id },
    });

    if (!favorite) {
      throw new NotFoundError('Favorite not found');
    }

    await prisma.meditationFavorite.delete({ where: { id } });

    const response: ApiResponse<DeleteMeditationFavoriteResponse> = {
      success: true,
      data: { success: true },
    };
    res.json(response);
  }
);

/**
 * GET /api/v1/meditation/preferences
 * Get meditation preferences.
 */
export const getPreferences = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = getUser(req);

    let prefs = await prisma.meditationPreferences.findUnique({
      where: { userId: user.id },
    });

    if (!prefs) {
      prefs = await prisma.meditationPreferences.create({
        data: { userId: user.id },
      });
    }

    const response: ApiResponse<GetMeditationPreferencesResponse> = {
      success: true,
      data: { preferences: mapPreferencesToDTO(prefs) },
    };
    res.json(response);
  }
);

/**
 * PATCH /api/v1/meditation/preferences
 * Update meditation preferences.
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

    const prefs = await prisma.meditationPreferences.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        ...parseResult.data,
      },
      update: parseResult.data,
    });

    const response: ApiResponse<UpdateMeditationPreferencesResponse> = {
      success: true,
      data: { preferences: mapPreferencesToDTO(prefs) },
    };
    res.json(response);
  }
);
