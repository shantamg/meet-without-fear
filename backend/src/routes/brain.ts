
import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { errorResponse, successResponse } from '../utils/response';
import { assembleContextBundle, type ContextBundle } from '../services/context-assembler';
import { determineMemoryIntent } from '../services/memory-intent';
import { resolveStageIntervalsForSessions, resolveStageForTimestamp } from '../utils/stage-resolver';

const router = Router();

// ============================================================================
// Dashboard Auth Middleware
// ============================================================================

/**
 * Authentication middleware for the Neural Monitor dashboard.
 * Accepts either:
 *   - X-Dashboard-Secret header matching DASHBOARD_API_SECRET env var
 *   - Clerk JWT Bearer token (verified via @clerk/express)
 * If neither DASHBOARD_API_SECRET nor CLERK_SECRET_KEY is configured, skips auth (dev mode).
 */
async function requireDashboardAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const dashboardSecret = process.env.DASHBOARD_API_SECRET;
  const clerkSecretKey = process.env.CLERK_SECRET_KEY;

  // Dev mode: no auth configured, skip
  if (!dashboardSecret && !clerkSecretKey) {
    next();
    return;
  }

  // Check X-Dashboard-Secret header
  if (dashboardSecret) {
    const headerSecret = req.headers['x-dashboard-secret'] as string | undefined;
    if (headerSecret === dashboardSecret) {
      next();
      return;
    }
  }

  // Check Clerk JWT Bearer token
  if (clerkSecretKey) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const { verifyToken } = await import('@clerk/express');
        const token = authHeader.slice(7);
        await verifyToken(token, { secretKey: clerkSecretKey });
        next();
        return;
      } catch {
        // Token invalid, fall through to 401
      }
    }
  }

  errorResponse(res, 'UNAUTHORIZED', 'Dashboard authentication required', 401);
}

// Apply dashboard auth to all brain routes
router.use(requireDashboardAuth);

// ============================================================================
// Helpers
// ============================================================================

function getPeriodStartDate(period: string): Date {
  const now = new Date();
  switch (period) {
    case '24h': return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case '7d': return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30d': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    default: return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
}

function normalizeModel(model: string): string {
  if (model.includes('sonnet')) return 'sonnet';
  if (model.includes('haiku')) return 'haiku';
  if (model.includes('titan')) return 'titan';
  return 'other';
}

const TOKEN_PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  sonnet: { input: 0.003 / 1000, output: 0.015 / 1000, cacheRead: 0.0003 / 1000, cacheWrite: 0.00375 / 1000 },
  haiku: { input: 0.001 / 1000, output: 0.005 / 1000, cacheRead: 0.0001 / 1000, cacheWrite: 0.00125 / 1000 },
  titan: { input: 0.00002 / 1000, output: 0, cacheRead: 0, cacheWrite: 0 },
};

function getModelPrices(model: string) {
  return TOKEN_PRICES[normalizeModel(model)] || TOKEN_PRICES.sonnet;
}

function extractCacheTokens(metadata: any): { cacheRead: number; cacheWrite: number } {
  if (!metadata || typeof metadata !== 'object') return { cacheRead: 0, cacheWrite: 0 };
  return {
    cacheRead: (metadata as any).cacheReadInputTokens ?? 0,
    cacheWrite: (metadata as any).cacheWriteInputTokens ?? 0,
  };
}

function formatDateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

// ============================================================================
// Response Types
// ============================================================================

interface ContextUserData {
  userId: string;
  userName: string;
  context: ContextBundle;
}

interface ContextResponse {
  sessionId: string;
  sessionType: 'partner' | 'inner_thoughts';
  assembledAt: string;
  users: ContextUserData[];
}

// ============================================================================
// Dashboard aggregate metrics
// ============================================================================
router.get('/dashboard', async (req, res) => {
  try {
    const period = (req.query.period as string) || '7d';
    const periodStart = getPeriodStartDate(period);

    // 1. Active sessions count (ACTIVE or WAITING partner sessions)
    const activeSessions = await prisma.session.count({
      where: { status: { in: ['ACTIVE', 'WAITING'] } },
    });

    // 2. Fetch all activities in period for aggregation
    const activities = await prisma.brainActivity.findMany({
      where: { createdAt: { gte: periodStart } },
      select: {
        cost: true,
        tokenCountInput: true,
        tokenCountOutput: true,
        durationMs: true,
        model: true,
        metadata: true,
        createdAt: true,
        sessionId: true,
      },
    });

    // 3. Compute aggregate metrics
    let periodCost = 0;
    let totalDurationMs = 0;
    let totalCacheRead = 0;
    let totalInput = 0;

    // Cost trend by date
    const costByDate = new Map<string, { cost: number; cacheRead: number; cacheWrite: number; uncached: number }>();
    // Model distribution
    const modelMap = new Map<string, { count: number; cost: number }>();

    for (const a of activities) {
      periodCost += a.cost;
      totalDurationMs += a.durationMs;
      totalInput += a.tokenCountInput;

      const { cacheRead, cacheWrite } = extractCacheTokens(a.metadata);
      totalCacheRead += cacheRead;

      // Cost trend
      const dateKey = formatDateKey(a.createdAt);
      const dayEntry = costByDate.get(dateKey) || { cost: 0, cacheRead: 0, cacheWrite: 0, uncached: 0 };
      dayEntry.cost += a.cost;
      dayEntry.cacheRead += cacheRead;
      dayEntry.cacheWrite += cacheWrite;
      dayEntry.uncached += Math.max(0, a.tokenCountInput - cacheRead - cacheWrite);
      costByDate.set(dateKey, dayEntry);

      // Model distribution
      const modelNorm = normalizeModel(a.model);
      const modelEntry = modelMap.get(modelNorm) || { count: 0, cost: 0 };
      modelEntry.count += 1;
      modelEntry.cost += a.cost;
      modelMap.set(modelNorm, modelEntry);
    }

    const cacheHitRate = totalInput > 0 ? (totalCacheRead / totalInput) * 100 : 0;
    const avgResponseMs = activities.length > 0 ? totalDurationMs / activities.length : 0;

    const costTrend = Array.from(costByDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));

    const modelDistribution = Array.from(modelMap.entries())
      .map(([model, data]) => ({ model, ...data }));

    // 4. Recent sessions (last 10 by updatedAt)
    const recentPartnerSessions = await prisma.session.findMany({
      take: 10,
      orderBy: { updatedAt: 'desc' },
      include: {
        relationship: {
          include: { members: { include: { user: { select: { name: true } } } } },
        },
        stageProgress: { orderBy: { stage: 'desc' }, take: 1 },
      },
    });

    // Get cost stats for recent sessions
    const recentSessionIds = recentPartnerSessions.map(s => s.id);
    let recentStats: any[] = [];
    if (recentSessionIds.length > 0) {
      recentStats = await (prisma.brainActivity.groupBy as any)({
        by: ['sessionId'],
        _sum: { cost: true },
        _count: { id: true },
        where: { sessionId: { in: recentSessionIds } },
      });
    }

    const recentSessions = recentPartnerSessions.map(session => {
      const stat = recentStats.find((s: any) => s.sessionId === session.id);
      const participants = session.relationship.members.map(m => m.user.name || 'Unknown').join(' & ');
      const maxStage = session.stageProgress[0]?.stage ?? 0;
      return {
        id: session.id,
        participants,
        status: session.status,
        stage: maxStage,
        turns: stat?._count?.id ?? 0,
        cost: stat?._sum?.cost ?? 0,
        age: session.createdAt.toISOString(),
      };
    });

    return successResponse(res, {
      activeSessions,
      periodCost,
      cacheHitRate: Math.round(cacheHitRate * 100) / 100,
      avgResponseMs: Math.round(avgResponseMs),
      costTrend,
      modelDistribution,
      recentSessions,
    });
  } catch (error) {
    console.error('[BrainRoutes] Failed to fetch dashboard:', error);
    return errorResponse(res, 'INTERNAL_ERROR', 'Failed to fetch dashboard metrics', 500);
  }
});

// ============================================================================
// Cost analytics
// ============================================================================
router.get('/costs', async (req, res) => {
  try {
    const period = (req.query.period as string) || '7d';
    const periodStart = getPeriodStartDate(period);
    const from = req.query.from ? new Date(req.query.from as string) : periodStart;
    const to = req.query.to ? new Date(req.query.to as string) : new Date();

    // Calculate previous period for comparison
    const periodDurationMs = to.getTime() - from.getTime();
    const previousPeriodStart = new Date(from.getTime() - periodDurationMs);
    const previousPeriodEnd = from;

    // Fetch current period activities
    const activities = await prisma.brainActivity.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: {
        cost: true,
        tokenCountInput: true,
        tokenCountOutput: true,
        durationMs: true,
        model: true,
        metadata: true,
        createdAt: true,
        sessionId: true,
        callType: true,
      },
    });

    // Fetch previous period total for comparison
    const prevAggregate = await prisma.brainActivity.aggregate({
      where: { createdAt: { gte: previousPeriodStart, lt: previousPeriodEnd } },
      _sum: { cost: true },
    });

    const periodTotal = activities.reduce((sum, a) => sum + a.cost, 0);
    const previousPeriodTotal = prevAggregate._sum.cost ?? 0;
    const changePercent = previousPeriodTotal > 0
      ? ((periodTotal - previousPeriodTotal) / previousPeriodTotal) * 100
      : 0;

    // Unique sessions for per-session average
    const uniqueSessions = new Set(activities.map(a => a.sessionId));
    const perSessionAvg = uniqueSessions.size > 0 ? periodTotal / uniqueSessions.size : 0;

    // Cost timeline by date, split by model
    const timelineMap = new Map<string, { sonnetCost: number; haikuCost: number; titanCost: number; total: number }>();
    // Model breakdown
    const modelBreakdownMap = new Map<string, { count: number; cost: number; inputTokens: number; outputTokens: number }>();
    // Call type breakdown
    const callTypeMap = new Map<string, { count: number; cost: number; totalDuration: number }>();
    // Cache metrics
    let totalCacheRead = 0;
    let totalCacheWrite = 0;
    let totalUncached = 0;

    // Session costs
    const sessionCostMap = new Map<string, { sonnetCost: number; haikuCost: number; titanCost: number; totalCost: number; turns: number }>();

    for (const a of activities) {
      const modelNorm = normalizeModel(a.model);
      const { cacheRead, cacheWrite } = extractCacheTokens(a.metadata);
      const uncached = Math.max(0, a.tokenCountInput - cacheRead - cacheWrite);

      totalCacheRead += cacheRead;
      totalCacheWrite += cacheWrite;
      totalUncached += uncached;

      // Timeline
      const dateKey = formatDateKey(a.createdAt);
      const dayEntry = timelineMap.get(dateKey) || { sonnetCost: 0, haikuCost: 0, titanCost: 0, total: 0 };
      if (modelNorm === 'sonnet') dayEntry.sonnetCost += a.cost;
      else if (modelNorm === 'haiku') dayEntry.haikuCost += a.cost;
      else if (modelNorm === 'titan') dayEntry.titanCost += a.cost;
      dayEntry.total += a.cost;
      timelineMap.set(dateKey, dayEntry);

      // Model breakdown
      const modelEntry = modelBreakdownMap.get(modelNorm) || { count: 0, cost: 0, inputTokens: 0, outputTokens: 0 };
      modelEntry.count += 1;
      modelEntry.cost += a.cost;
      modelEntry.inputTokens += a.tokenCountInput;
      modelEntry.outputTokens += a.tokenCountOutput;
      modelBreakdownMap.set(modelNorm, modelEntry);

      // Call type breakdown
      const ct = a.callType || 'UNKNOWN';
      const ctEntry = callTypeMap.get(ct) || { count: 0, cost: 0, totalDuration: 0 };
      ctEntry.count += 1;
      ctEntry.cost += a.cost;
      ctEntry.totalDuration += a.durationMs;
      callTypeMap.set(ct, ctEntry);

      // Session costs
      const sessEntry = sessionCostMap.get(a.sessionId) || { sonnetCost: 0, haikuCost: 0, titanCost: 0, totalCost: 0, turns: 0 };
      if (modelNorm === 'sonnet') sessEntry.sonnetCost += a.cost;
      else if (modelNorm === 'haiku') sessEntry.haikuCost += a.cost;
      else if (modelNorm === 'titan') sessEntry.titanCost += a.cost;
      sessEntry.totalCost += a.cost;
      sessEntry.turns += 1;
      sessionCostMap.set(a.sessionId, sessEntry);
    }

    // Estimate cache savings (what it would have cost without caching)
    // Use sonnet prices as default for estimation
    const prices = TOKEN_PRICES.sonnet;
    const cacheSavings = totalCacheRead * (prices.input - prices.cacheRead);

    const costTimeline = Array.from(timelineMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));

    const modelBreakdown = Array.from(modelBreakdownMap.entries()).map(([model, data]) => ({
      model,
      ...data,
      percentage: periodTotal > 0 ? Math.round((data.cost / periodTotal) * 10000) / 100 : 0,
    }));

    const callTypeBreakdown = Array.from(callTypeMap.entries()).map(([callType, data]) => ({
      callType,
      count: data.count,
      cost: data.cost,
      percentage: periodTotal > 0 ? Math.round((data.cost / periodTotal) * 10000) / 100 : 0,
      avgDuration: data.count > 0 ? Math.round(data.totalDuration / data.count) : 0,
    }));

    const totalInputTokens = totalCacheRead + totalCacheWrite + totalUncached;
    const cacheMetrics = {
      hitRate: totalInputTokens > 0 ? Math.round((totalCacheRead / totalInputTokens) * 10000) / 100 : 0,
      readTokens: totalCacheRead,
      writeTokens: totalCacheWrite,
      uncachedTokens: totalUncached,
      estimatedSavings: Math.round(cacheSavings * 1000000) / 1000000,
    };

    // Fetch participant info for session costs
    const sessionIds = Array.from(sessionCostMap.keys());
    let sessionParticipants = new Map<string, string>();
    if (sessionIds.length > 0) {
      const sessions = await prisma.session.findMany({
        where: { id: { in: sessionIds } },
        include: {
          relationship: {
            include: { members: { include: { user: { select: { name: true } } } } },
          },
        },
      });
      for (const s of sessions) {
        const names = s.relationship.members.map(m => m.user.name || 'Unknown').join(' & ');
        sessionParticipants.set(s.id, names);
      }
    }

    const sessionCosts = Array.from(sessionCostMap.entries())
      .sort(([, a], [, b]) => b.totalCost - a.totalCost)
      .slice(0, 20)
      .map(([sessionId, data]) => ({
        sessionId,
        participants: sessionParticipants.get(sessionId) || sessionId,
        ...data,
      }));

    return successResponse(res, {
      summary: {
        periodTotal: Math.round(periodTotal * 1000000) / 1000000,
        previousPeriodTotal: Math.round(previousPeriodTotal * 1000000) / 1000000,
        changePercent: Math.round(changePercent * 100) / 100,
        perSessionAvg: Math.round(perSessionAvg * 1000000) / 1000000,
        cacheSavings: Math.round(cacheSavings * 1000000) / 1000000,
      },
      costTimeline,
      modelBreakdown,
      callTypeBreakdown,
      cacheMetrics,
      sessionCosts,
    });
  } catch (error) {
    console.error('[BrainRoutes] Failed to fetch costs:', error);
    return errorResponse(res, 'INTERNAL_ERROR', 'Failed to fetch cost analytics', 500);
  }
});

// ============================================================================
// Cache heatmap (stage x day)
// ============================================================================
router.get('/costs/cache-heatmap', async (req, res) => {
  try {
    const period = (req.query.period as string) || '7d';
    const periodStart = getPeriodStartDate(period);

    const activities = await prisma.brainActivity.findMany({
      where: { createdAt: { gte: periodStart } },
      select: {
        sessionId: true,
        tokenCountInput: true,
        metadata: true,
        createdAt: true,
      },
    });

    // Resolve stage intervals for all sessions
    const sessionIds = [...new Set(activities.map(a => a.sessionId))];
    const stageIntervals = await resolveStageIntervalsForSessions(sessionIds);

    // Aggregate by (stage, day)
    const cellMap = new Map<string, { totalTokens: number; cacheReadTokens: number }>();

    for (const a of activities) {
      const stage = resolveStageForTimestamp(stageIntervals.get(a.sessionId), a.createdAt);
      const day = formatDateKey(a.createdAt);
      const key = `${stage}|${day}`;
      const { cacheRead } = extractCacheTokens(a.metadata);

      const entry = cellMap.get(key) || { totalTokens: 0, cacheReadTokens: 0 };
      entry.totalTokens += a.tokenCountInput;
      entry.cacheReadTokens += cacheRead;
      cellMap.set(key, entry);
    }

    const cells = Array.from(cellMap.entries()).map(([key, data]) => {
      const [stageStr, day] = key.split('|');
      return {
        stage: parseInt(stageStr, 10),
        day,
        hitRate: data.totalTokens > 0
          ? Math.round((data.cacheReadTokens / data.totalTokens) * 10000) / 100
          : 0,
        totalTokens: data.totalTokens,
        cacheReadTokens: data.cacheReadTokens,
      };
    });

    return successResponse(res, { cells });
  } catch (error) {
    console.error('[BrainRoutes] Failed to fetch cache heatmap:', error);
    return errorResponse(res, 'INTERNAL_ERROR', 'Failed to fetch cache heatmap', 500);
  }
});

// ============================================================================
// Cost by stage
// ============================================================================
router.get('/costs/by-stage', async (req, res) => {
  try {
    const period = (req.query.period as string) || '7d';
    const periodStart = getPeriodStartDate(period);

    const activities = await prisma.brainActivity.findMany({
      where: { createdAt: { gte: periodStart } },
      select: {
        sessionId: true,
        cost: true,
        model: true,
        createdAt: true,
      },
    });

    // Resolve stage intervals
    const sessionIds = [...new Set(activities.map(a => a.sessionId))];
    const stageIntervals = await resolveStageIntervalsForSessions(sessionIds);

    // Aggregate by stage
    const stageMap = new Map<number, { sonnetCost: number; haikuCost: number; titanCost: number; totalCost: number }>();

    for (const a of activities) {
      const stage = resolveStageForTimestamp(stageIntervals.get(a.sessionId), a.createdAt);
      const modelNorm = normalizeModel(a.model);

      const entry = stageMap.get(stage) || { sonnetCost: 0, haikuCost: 0, titanCost: 0, totalCost: 0 };
      if (modelNorm === 'sonnet') entry.sonnetCost += a.cost;
      else if (modelNorm === 'haiku') entry.haikuCost += a.cost;
      else if (modelNorm === 'titan') entry.titanCost += a.cost;
      entry.totalCost += a.cost;
      stageMap.set(stage, entry);
    }

    const stages = Array.from(stageMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([stage, data]) => ({
        stage,
        sonnetCost: Math.round(data.sonnetCost * 1000000) / 1000000,
        haikuCost: Math.round(data.haikuCost * 1000000) / 1000000,
        titanCost: Math.round(data.titanCost * 1000000) / 1000000,
        totalCost: Math.round(data.totalCost * 1000000) / 1000000,
      }));

    return successResponse(res, { stages });
  } catch (error) {
    console.error('[BrainRoutes] Failed to fetch cost by stage:', error);
    return errorResponse(res, 'INTERNAL_ERROR', 'Failed to fetch cost by stage', 500);
  }
});

// ============================================================================
// Cost flow (Sankey diagram data)
// ============================================================================
router.get('/costs/flow', async (req, res) => {
  try {
    const period = (req.query.period as string) || '7d';
    const periodStart = getPeriodStartDate(period);

    const activities = await prisma.brainActivity.findMany({
      where: { createdAt: { gte: periodStart } },
      select: {
        sessionId: true,
        cost: true,
        model: true,
        callType: true,
        createdAt: true,
      },
    });

    // Resolve stage intervals
    const sessionIds = [...new Set(activities.map(a => a.sessionId))];
    const stageIntervals = await resolveStageIntervalsForSessions(sessionIds);

    // Build Sankey: Stage -> Model -> Call Type
    const stageNames = new Map<number, string>([
      [0, 'Pre-Session'],
      [1, 'Feel Heard'],
      [2, 'Perspective'],
      [3, 'Needs'],
      [4, 'Resolution'],
    ]);

    const nodeSet = new Map<string, number>();
    const linkMap = new Map<string, number>();

    function getNodeIndex(name: string): number {
      if (!nodeSet.has(name)) {
        nodeSet.set(name, nodeSet.size);
      }
      return nodeSet.get(name)!;
    }

    for (const a of activities) {
      const stage = resolveStageForTimestamp(stageIntervals.get(a.sessionId), a.createdAt);
      const stageName = stageNames.get(stage) || `Stage ${stage}`;
      const modelNorm = normalizeModel(a.model);
      const modelName = modelNorm.charAt(0).toUpperCase() + modelNorm.slice(1);
      const callType = (a.callType || 'UNKNOWN').replace(/_/g, ' ');

      const stageIdx = getNodeIndex(stageName);
      const modelIdx = getNodeIndex(modelName);
      const callIdx = getNodeIndex(callType);

      // Stage -> Model link
      const smKey = `${stageIdx}-${modelIdx}`;
      linkMap.set(smKey, (linkMap.get(smKey) || 0) + a.cost);

      // Model -> Call Type link
      const mcKey = `${modelIdx}-${callIdx}`;
      linkMap.set(mcKey, (linkMap.get(mcKey) || 0) + a.cost);
    }

    const nodes = Array.from(nodeSet.keys()).map(name => ({ name }));
    const links = Array.from(linkMap.entries())
      .filter(([, value]) => value > 0)
      .map(([key, value]) => {
        const [source, target] = key.split('-').map(Number);
        return { source, target, value: Math.round(value * 1000000) / 1000000 };
      });

    return successResponse(res, { nodes, links });
  } catch (error) {
    console.error('[BrainRoutes] Failed to fetch cost flow:', error);
    return errorResponse(res, 'INTERNAL_ERROR', 'Failed to fetch cost flow', 500);
  }
});

// ============================================================================
// Prompt detail for a single BrainActivity
// ============================================================================
router.get('/activity/:activityId/prompt', async (req, res) => {
  try {
    const { activityId } = req.params;

    const activity = await prisma.brainActivity.findUnique({
      where: { id: activityId },
    });

    if (!activity) {
      return errorResponse(res, 'NOT_FOUND', 'Activity not found', 404);
    }

    const input = activity.input as any;
    const output = activity.output as any;
    const metadata = activity.metadata as any;

    // Parse system prompt blocks
    const systemPromptBlocks: Array<{ type: string; content: string; tokenCount: number; cached: boolean }> = [];
    if (input?.systemPrompt) {
      const sysPrompt = input.systemPrompt;
      if (typeof sysPrompt === 'string') {
        systemPromptBlocks.push({
          type: 'static',
          content: sysPrompt,
          tokenCount: Math.ceil(sysPrompt.length / 4), // rough estimate
          cached: true,
        });
      } else if (sysPrompt.staticBlock || sysPrompt.dynamicBlock) {
        if (sysPrompt.staticBlock) {
          systemPromptBlocks.push({
            type: 'static',
            content: sysPrompt.staticBlock,
            tokenCount: Math.ceil(sysPrompt.staticBlock.length / 4),
            cached: true,
          });
        }
        if (sysPrompt.dynamicBlock) {
          systemPromptBlocks.push({
            type: 'dynamic',
            content: sysPrompt.dynamicBlock,
            tokenCount: Math.ceil(sysPrompt.dynamicBlock.length / 4),
            cached: false,
          });
        }
      }
    }

    // Parse messages
    const messages = Array.isArray(input?.messages)
      ? input.messages.map((m: any) => ({
          role: m.role || 'unknown',
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
          hasCacheControl: !!m.cache_control,
        }))
      : [];

    // Parse response - extract thinking/draft/dispatch tags
    const responseText = output?.text || output?.streaming ? (output?.text || '') : '';
    let thinking: string | null = null;
    let draft: string | null = null;
    let dispatch: string | null = null;

    if (typeof responseText === 'string') {
      const thinkMatch = responseText.match(/<thinking>([\s\S]*?)<\/thinking>/);
      if (thinkMatch) thinking = thinkMatch[1].trim();

      const draftMatch = responseText.match(/<draft>([\s\S]*?)<\/draft>/);
      if (draftMatch) draft = draftMatch[1].trim();

      const dispatchMatch = responseText.match(/<dispatch>([\s\S]*?)<\/dispatch>/);
      if (dispatchMatch) dispatch = dispatchMatch[1].trim();
    }

    // Token breakdown
    const { cacheRead, cacheWrite } = extractCacheTokens(metadata);
    const uncached = Math.max(0, activity.tokenCountInput - cacheRead - cacheWrite);

    // Cost breakdown
    const modelPrices = getModelPrices(activity.model);
    const inputCost = uncached * modelPrices.input;
    const outputCost = activity.tokenCountOutput * modelPrices.output;
    const cacheReadCost = cacheRead * modelPrices.cacheRead;
    const cacheWriteCost = cacheWrite * modelPrices.cacheWrite;
    const totalCost = inputCost + outputCost + cacheReadCost + cacheWriteCost;
    const savings = cacheRead * (modelPrices.input - modelPrices.cacheRead);

    return successResponse(res, {
      systemPrompt: { blocks: systemPromptBlocks },
      messages,
      response: {
        text: responseText,
        thinking,
        draft,
        dispatch,
      },
      tokens: {
        input: activity.tokenCountInput,
        output: activity.tokenCountOutput,
        cacheRead,
        cacheWrite,
        uncached,
      },
      cost: {
        inputCost: Math.round(inputCost * 1000000) / 1000000,
        outputCost: Math.round(outputCost * 1000000) / 1000000,
        cacheReadCost: Math.round(cacheReadCost * 1000000) / 1000000,
        cacheWriteCost: Math.round(cacheWriteCost * 1000000) / 1000000,
        total: Math.round(totalCost * 1000000) / 1000000,
        savings: Math.round(savings * 1000000) / 1000000,
      },
      timing: {
        durationMs: activity.durationMs,
        model: activity.model,
        callType: activity.callType,
        status: activity.status,
      },
      ...(metadata?.contextSizes ? {
        contextWindow: {
          pinnedTokens: metadata.contextSizes.pinnedTokens ?? 0,
          summaryTokens: metadata.contextSizes.summaryTokens ?? 0,
          recentTokens: metadata.contextSizes.recentTokens ?? 0,
          ragTokens: metadata.contextSizes.ragTokens ?? 0,
          totalUsed: (metadata.contextSizes.pinnedTokens ?? 0) +
            (metadata.contextSizes.summaryTokens ?? 0) +
            (metadata.contextSizes.recentTokens ?? 0) +
            (metadata.contextSizes.ragTokens ?? 0),
          budgetLimit: 150000,
          utilizationPercent: Math.round(
            (((metadata.contextSizes.pinnedTokens ?? 0) +
              (metadata.contextSizes.summaryTokens ?? 0) +
              (metadata.contextSizes.recentTokens ?? 0) +
              (metadata.contextSizes.ragTokens ?? 0)) / 150000) * 10000
          ) / 100,
        },
      } : {}),
    });
  } catch (error) {
    console.error('[BrainRoutes] Failed to fetch prompt detail:', error);
    return errorResponse(res, 'INTERNAL_ERROR', 'Failed to fetch prompt detail', 500);
  }
});

// Get all brain activities for a session
router.get('/activity/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const activities = await prisma.brainActivity.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });

    // Try fetching as partner session messages first
    let messages = await prisma.message.findMany({
      where: { sessionId, role: 'USER' },
      orderBy: { timestamp: 'asc' },
      select: { id: true, content: true, timestamp: true, senderId: true }
    });

    // If no messages found, it might be an Inner Work session
    if (messages.length === 0) {
      const innerMessages = await prisma.innerWorkMessage.findMany({
        where: { sessionId, role: 'USER' },
        orderBy: { timestamp: 'asc' },
        select: { id: true, content: true, timestamp: true }
      });

      // Map to same structure (senderId is not needed for Inner Work as it's implied)
      messages = innerMessages.map(m => ({
        ...m,
        senderId: null
      }));
    }

    // Fetch notable facts from UserVessel for this session
    const userVessels = await prisma.userVessel.findMany({
      where: { sessionId },
      select: { userId: true, notableFacts: true }
    });

    // Combine all notable facts from all users in this session
    const notableFacts = userVessels.flatMap(v => v.notableFacts);

    // Calculate summary stats
    const totalCost = activities.reduce((sum: number, a: any) => sum + (a.cost || 0), 0);
    const totalTokens = activities.reduce((sum: number, a: any) => sum + ((a.tokenCountInput || 0) + (a.tokenCountOutput || 0)), 0);

    return successResponse(res, {
      activities,
      messages,
      notableFacts,
      summary: {
        totalCost,
        totalTokens,
        count: activities.length
      }
    });

  } catch (error) {
    console.error('[BrainRoutes] Failed to fetch activities:', error);
    return errorResponse(res, 'INTERNAL_ERROR', 'Failed to fetch session activity', 500);
  }
});

// Get assembled context bundle for a session
// This endpoint assembles the full context bundle for each user in the session,
// allowing the Neural Monitor dashboard to display exactly what context the AI receives.
router.get('/sessions/:sessionId/context', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // First try as partner session
    const partnerSession = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        relationship: {
          include: {
            members: {
              include: { user: true }
            }
          }
        },
        stageProgress: {
          orderBy: { stage: 'desc' }
        }
      }
    });

    if (partnerSession) {
      // Partner session - assemble context for all users
      const users = partnerSession.relationship.members;
      const now = new Date().toISOString();

      // Get the current stage for each user (use their latest stage progress)
      const contextResults = await Promise.all(
        users.map(async (member) => {
          const userProgress = partnerSession.stageProgress.find(
            (p) => p.userId === member.userId
          );
          const stage = userProgress?.stage ?? 1;

          try {
            // Get emotional intensity from UserVessel
            const vessel = await prisma.userVessel.findUnique({
              where: { userId_sessionId: { userId: member.userId, sessionId } },
              select: { id: true },
            });

            let emotionalIntensity = 5; // Default moderate intensity
            if (vessel) {
              const latestReading = await prisma.emotionalReading.findFirst({
                where: { vesselId: vessel.id },
                orderBy: { timestamp: 'desc' },
                select: { intensity: true },
              });
              if (latestReading) {
                emotionalIntensity = latestReading.intensity;
              }
            }

            // Get turn count from messages
            const turnCount = await prisma.message.count({
              where: { sessionId, senderId: member.userId },
            });

            // Determine memory intent (required for context assembly)
            const intent = determineMemoryIntent({
              stage,
              emotionalIntensity,
              userMessage: '', // Empty - we're just assembling current context
              turnCount,
              isFirstTurnInSession: turnCount === 0,
            });

            // Assemble the context bundle
            const context = await assembleContextBundle(
              sessionId,
              member.userId,
              stage,
              intent
            );

            return {
              userId: member.userId,
              userName: member.user.name || 'Unknown',
              context,
            };
          } catch (error) {
            console.error(`[BrainRoutes] Failed to assemble context for user ${member.userId}:`, error);
            // Return placeholder for failed user
            return {
              userId: member.userId,
              userName: member.user.name || 'Unknown',
              context: null,
            };
          }
        })
      );

      const response: ContextResponse = {
        sessionId,
        sessionType: 'partner',
        assembledAt: now,
        users: contextResults.filter((r): r is ContextUserData => r.context !== null),
      };

      return successResponse(res, response);
    }

    // Try as inner work session
    const innerWorkSession = await prisma.innerWorkSession.findUnique({
      where: { id: sessionId },
      include: {
        user: true
      }
    });

    if (innerWorkSession) {
      // Inner work sessions don't use assembleContextBundle (different flow)
      // Return a simplified response indicating this is an inner thoughts session
      const response: ContextResponse = {
        sessionId,
        sessionType: 'inner_thoughts',
        assembledAt: new Date().toISOString(),
        users: [{
          userId: innerWorkSession.userId,
          userName: innerWorkSession.user.name || 'Unknown',
          // For inner work sessions, create a minimal context bundle
          // This could be enhanced later if needed
          context: {
            conversationContext: {
              recentTurns: [],
              turnCount: 0,
              sessionDurationMinutes: 0,
            },
            emotionalThread: {
              initialIntensity: null,
              currentIntensity: null,
              trend: 'unknown',
              notableShifts: [],
            },
            stageContext: {
              stage: 0,
              gatesSatisfied: {},
            },
            userName: innerWorkSession.user.name || 'Unknown',
            intent: {
              intent: 'avoid_recall',
              depth: 'none',
              allowCrossSession: false,
              surfaceStyle: 'silent',
              reason: 'Inner work sessions have different context flow',
              threshold: 0.5,
              maxCrossSession: 0,
            },
            assembledAt: new Date().toISOString(),
          },
        }],
      };

      return successResponse(res, response);
    }

    // Session not found
    return errorResponse(res, 'NOT_FOUND', 'Session not found', 404);

  } catch (error) {
    console.error('[BrainRoutes] Failed to fetch session context:', error);
    return errorResponse(res, 'INTERNAL_ERROR', 'Failed to fetch session context', 500);
  }
});

// ============================================================================
// Turn trace (pipeline timing)
// ============================================================================
router.get('/turn/:turnId/trace', async (req, res) => {
  try {
    const { turnId } = req.params;

    const activity = await prisma.brainActivity.findFirst({
      where: {
        turnId,
        callType: 'ORCHESTRATED_RESPONSE',
      },
      orderBy: { createdAt: 'desc' },
      select: { metadata: true },
    });

    if (!activity) {
      return errorResponse(res, 'NOT_FOUND', 'No orchestrated response found for this turn', 404);
    }

    const metadata = activity.metadata as any;
    const turnTrace = metadata?.turnTrace ?? null;

    if (!turnTrace) {
      return errorResponse(res, 'NOT_FOUND', 'No trace data available for this turn', 404);
    }

    return successResponse(res, turnTrace);
  } catch (error) {
    console.error('[BrainRoutes] Failed to fetch turn trace:', error);
    return errorResponse(res, 'INTERNAL_ERROR', 'Failed to fetch turn trace', 500);
  }
});

// Get sessions list with filter/search/sort support
router.get('/sessions', async (req, res) => {
  try {
    const cursor = req.query.cursor as string | undefined;
    const limit = parseInt(req.query.limit as string || '20', 10);
    const fetchLimit = limit + 1; // Fetch one extra to detect next page

    // Filter params
    const statusFilter = req.query.status as string | undefined; // comma-separated
    const typeFilter = req.query.type as string | undefined; // PARTNER or INNER_WORK
    const stageFilter = req.query.stage as string | undefined; // comma-separated stage numbers
    const search = req.query.search as string | undefined;
    const fromDate = req.query.from ? new Date(req.query.from as string) : undefined;
    const toDate = req.query.to ? new Date(req.query.to as string) : undefined;
    const sort = (req.query.sort as string) || 'age';
    const order = (req.query.order as string) || 'desc';

    const statusValues = statusFilter ? statusFilter.split(',').map(s => s.trim()) : undefined;
    const stageValues = stageFilter ? stageFilter.split(',').map(s => parseInt(s, 10)).filter(n => !isNaN(n)) : undefined;

    // Determine which session types to fetch
    const fetchPartner = !typeFilter || typeFilter === 'PARTNER';
    const fetchInnerWork = !typeFilter || typeFilter === 'INNER_WORK';

    // Build partner session where clause
    const partnerWhere: any = {};
    if (cursor) partnerWhere.updatedAt = { lt: new Date(cursor) };
    if (fromDate || toDate) {
      partnerWhere.createdAt = {};
      if (fromDate) partnerWhere.createdAt.gte = fromDate;
      if (toDate) partnerWhere.createdAt.lte = toDate;
    }
    if (statusValues) partnerWhere.status = { in: statusValues };

    // Build inner work session where clause
    const innerWhere: any = {};
    if (cursor) innerWhere.updatedAt = { lt: new Date(cursor) };
    if (fromDate || toDate) {
      innerWhere.createdAt = {};
      if (fromDate) innerWhere.createdAt.gte = fromDate;
      if (toDate) innerWhere.createdAt.lte = toDate;
    }
    if (statusValues) innerWhere.status = { in: statusValues };

    // Search filter - for partner sessions, search by user names/emails or session ID
    if (search) {
      partnerWhere.OR = [
        { id: { contains: search } },
        { relationship: { members: { some: { user: { name: { contains: search, mode: 'insensitive' } } } } } },
        { relationship: { members: { some: { user: { email: { contains: search, mode: 'insensitive' } } } } } },
      ];
      innerWhere.OR = [
        { id: { contains: search } },
        { user: { name: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { title: { contains: search, mode: 'insensitive' } },
      ];
    }

    // 1. Fetch Partner Sessions
    let partnerSessions: any[] = [];
    if (fetchPartner) {
      partnerSessions = await prisma.session.findMany({
        take: fetchLimit,
        where: partnerWhere,
        orderBy: { updatedAt: 'desc' },
        include: {
          relationship: {
            include: { members: { include: { user: true } } },
          },
          stageProgress: { orderBy: { stage: 'desc' } },
        },
      });

      // Post-filter by stage if needed (stage is per-user, so check max stage)
      if (stageValues && stageValues.length > 0) {
        partnerSessions = partnerSessions.filter(s => {
          const maxStage = s.stageProgress.length > 0
            ? Math.max(...s.stageProgress.map((p: any) => p.stage))
            : 0;
          return stageValues.includes(maxStage);
        });
      }
    }

    // 2. Fetch Inner Work Sessions
    let innerWorkSessions: any[] = [];
    if (fetchInnerWork) {
      innerWorkSessions = await prisma.innerWorkSession.findMany({
        take: fetchLimit,
        where: innerWhere,
        orderBy: { updatedAt: 'desc' },
        include: { user: true },
      });
    }

    // 3. Aggregate stats for ALL sessions
    const partnerSessionIds = partnerSessions.map((s: any) => s.id);
    const innerSessionIds = innerWorkSessions.map((s: any) => s.id);
    const allSessionIds = [...partnerSessionIds, ...innerSessionIds];

    let stats: any[] = [];
    if (allSessionIds.length > 0) {
      stats = await (prisma.brainActivity.groupBy as any)({
        by: ['sessionId'],
        _sum: { cost: true, tokenCountInput: true, tokenCountOutput: true },
        _count: { id: true },
        where: { sessionId: { in: allSessionIds } },
      });
    }

    // 4. Estimate user turns (Partner Sessions)
    let partnerTurnCounts: any[] = [];
    if (partnerSessionIds.length > 0) {
      partnerTurnCounts = await (prisma.message.groupBy as any)({
        by: ['sessionId'],
        _count: { id: true },
        where: { sessionId: { in: partnerSessionIds }, role: 'USER' },
      });
    }

    // 5. Estimate user turns (Inner Work Sessions)
    let innerTurnCounts: any[] = [];
    if (innerSessionIds.length > 0) {
      innerTurnCounts = await (prisma.innerWorkMessage.groupBy as any)({
        by: ['sessionId'],
        _count: { id: true },
        where: { sessionId: { in: innerSessionIds }, role: 'USER' },
      });
    }

    // 6. Map and Merge
    const mappedPartnerSessions = partnerSessions.map((session: any) => {
      const stat = stats.find((s: any) => s.sessionId === session.id);
      const turns = partnerTurnCounts.find((t: any) => t.sessionId === session.id);
      const maxStage = session.stageProgress?.length > 0
        ? Math.max(...session.stageProgress.map((p: any) => p.stage))
        : 0;
      const participants = session.relationship.members
        .map((m: any) => m.user.name || 'Unknown')
        .join(' & ');
      return {
        id: session.id,
        type: 'PARTNER' as const,
        status: session.status,
        stage: maxStage,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        title: null,
        participants,
        relationship: session.relationship,
        stats: {
          totalCost: stat?._sum.cost || 0,
          totalTokens: (stat?._sum.tokenCountInput || 0) + (stat?._sum.tokenCountOutput || 0),
          activityCount: stat?._count.id || 0,
          turnCount: turns?._count.id || 0,
        },
      };
    });

    const mappedInnerSessions = innerWorkSessions.map((session: any) => {
      const stat = stats.find((s: any) => s.sessionId === session.id);
      const turns = innerTurnCounts.find((t: any) => t.sessionId === session.id);
      return {
        id: session.id,
        type: 'INNER_WORK' as const,
        status: session.status,
        stage: 0, // Inner work doesn't have stages
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        title: session.title || 'Untitled Session',
        participants: session.user?.name || 'Unknown',
        relationship: null,
        user: session.user,
        stats: {
          totalCost: stat?._sum.cost || 0,
          totalTokens: (stat?._sum.tokenCountInput || 0) + (stat?._sum.tokenCountOutput || 0),
          activityCount: stat?._count.id || 0,
          turnCount: turns?._count.id || 0,
        },
      };
    });

    // Combine
    let allSessions = [...mappedPartnerSessions, ...mappedInnerSessions];

    // Apply sort
    const sortOrder = order === 'asc' ? 1 : -1;
    allSessions.sort((a, b) => {
      switch (sort) {
        case 'participants':
          return sortOrder * (a.participants || '').localeCompare(b.participants || '');
        case 'status':
          return sortOrder * a.status.localeCompare(b.status);
        case 'stage':
          return sortOrder * (a.stage - b.stage);
        case 'turns':
          return sortOrder * (a.stats.turnCount - b.stats.turnCount);
        case 'cost':
          return sortOrder * (a.stats.totalCost - b.stats.totalCost);
        case 'age':
        default:
          return sortOrder * (b.updatedAt.getTime() - a.updatedAt.getTime());
      }
    });

    // Paginate
    const hasNextPage = allSessions.length > limit;
    if (hasNextPage) {
      allSessions = allSessions.slice(0, limit);
    }

    const nextCursor = hasNextPage && allSessions.length > 0
      ? allSessions[allSessions.length - 1].updatedAt.toISOString()
      : null;

    return successResponse(res, {
      sessions: allSessions,
      nextCursor,
    });
  } catch (error) {
    console.error('[BrainRoutes] Failed to fetch sessions:', error);
    return errorResponse(res, 'INTERNAL_ERROR', 'Failed to fetch sessions', 500);
  }
});

// ============================================================================
// Ably Token Auth (for dashboard realtime)
// ============================================================================
router.get('/ably-token', async (_req, res) => {
  try {
    const ablyApiKey = process.env.ABLY_API_KEY;
    if (!ablyApiKey) {
      return errorResponse(res, 'NOT_CONFIGURED', 'Ably not configured', 503);
    }

    const Ably = await import('ably');
    const rest = new Ably.default.Rest(ablyApiKey);

    const tokenRequest = await rest.auth.createTokenRequest({
      capability: { 'ai-audit-stream': ['subscribe'] },
      ttl: 60 * 60 * 1000, // 1 hour
    });

    return successResponse(res, tokenRequest);
  } catch (error) {
    console.error('[BrainRoutes] Failed to create Ably token:', error);
    return errorResponse(res, 'INTERNAL_ERROR', 'Failed to create Ably token', 500);
  }
});

export default router;
