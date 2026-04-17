/**
 * Workspace Prompt Builder
 *
 * Reads the `bot-workspaces/mwf-session/` workspace files (written by humans
 * to guide Claude Code agents) and compiles them into the `{staticBlock,
 * dynamicBlock}` format that our Bedrock caching expects.
 *
 * The intent: the workspace files are the single source of truth for the
 * Process Guardian's voice and stage-specific rules, regardless of which
 * surface (mobile app or Slack) is driving the conversation.
 *
 * Caching strategy:
 * - `staticBlock` contains guardian constitution + stage-specific CONTEXT.md +
 *   response protocol. Cached in Bedrock (`cache_control: ephemeral`) so we
 *   get prompt cache hits across turns.
 * - `dynamicBlock` carries per-turn state (turn count, intensity, phase
 *   hints, user-specific context). Never cached.
 *
 * When a file is missing we fall back to the constants in `stage-prompts.ts`
 * so nothing breaks during incremental migration.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../lib/logger';
import type { PromptBlocks, PromptContext } from './stage-prompts';
import { buildStagePrompt } from './stage-prompts';

// ---------------------------------------------------------------------------
// Filesystem layout
// ---------------------------------------------------------------------------

/**
 * Resolve the workspace root. Override via MWF_WORKSPACE_ROOT for tests or
 * alternate deployment layouts. In production (compiled to dist/) we walk up
 * until we find the workspace folder at the repo root.
 */
function resolveWorkspaceRoot(): string {
  if (process.env.MWF_WORKSPACE_ROOT) return process.env.MWF_WORKSPACE_ROOT;

  // Walk upward from this file until we find bot-workspaces/mwf-session/
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, 'bot-workspaces', 'mwf-session');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // Fallback to a reasonable default; loadFile() handles missing files.
  return path.resolve(__dirname, '../../../../bot-workspaces/mwf-session');
}

const WORKSPACE_ROOT = resolveWorkspaceRoot();

// Stage CONTEXT.md files, keyed by the stage number used by the backend.
const STAGE_FILES: Record<number, string> = {
  0: 'stages/0-onboarding/CONTEXT.md',
  1: 'stages/1-witness/CONTEXT.md',
  2: 'stages/2-perspective-stretch/CONTEXT.md',
  3: 'stages/3-need-mapping/CONTEXT.md',
  4: 'stages/4-strategic-repair/CONTEXT.md',
};

const REFERENCE_FILES = {
  guardian: 'references/guardian-constitution.md',
  privacy: 'references/privacy-model.md',
  progression: 'references/stage-progression.md',
};

// ---------------------------------------------------------------------------
// File cache
// ---------------------------------------------------------------------------

interface WorkspaceCache {
  stages: Record<number, string | null>;
  guardian: string | null;
  privacy: string | null;
  progression: string | null;
  loadedAt: number;
}

let cache: WorkspaceCache | null = null;

function loadFile(relative: string): string | null {
  try {
    const full = path.join(WORKSPACE_ROOT, relative);
    if (!fs.existsSync(full)) {
      logger.warn(`[WorkspacePromptBuilder] Missing workspace file: ${relative}`);
      return null;
    }
    return fs.readFileSync(full, 'utf8');
  } catch (err) {
    logger.warn(`[WorkspacePromptBuilder] Failed to read ${relative}:`, err);
    return null;
  }
}

function loadCache(force = false): WorkspaceCache {
  if (cache && !force) return cache;

  const stages: Record<number, string | null> = {};
  for (const [stageStr, rel] of Object.entries(STAGE_FILES)) {
    stages[Number(stageStr)] = loadFile(rel);
  }

  cache = {
    stages,
    guardian: loadFile(REFERENCE_FILES.guardian),
    privacy: loadFile(REFERENCE_FILES.privacy),
    progression: loadFile(REFERENCE_FILES.progression),
    loadedAt: Date.now(),
  };

  logger.info(
    `[WorkspacePromptBuilder] Loaded workspace from ${WORKSPACE_ROOT} (stages: ${Object.keys(stages).join(',')})`
  );
  return cache;
}

/** Test helper: force the workspace to be re-read on the next build. */
export function __resetWorkspaceCache(): void {
  cache = null;
}

// ---------------------------------------------------------------------------
// Response protocol (matches buildResponseProtocol in stage-prompts.ts)
// ---------------------------------------------------------------------------

/**
 * Build the `<thinking>`/`<draft>`/`<dispatch>` response protocol. Mirrors
 * `buildResponseProtocol()` in stage-prompts.ts so the micro-tag parser can
 * consume responses from either engine identically.
 */
function buildResponseProtocol(
  stage: number,
  options?: { includesDraft?: boolean; draftPurpose?: 'invitation' | 'empathy' }
): string {
  const flags: string[] = ['UserIntensity: [1-10]'];
  if (stage === 1) flags.push('FeelHeardCheck: [Y/N]');
  else if (stage === 2) flags.push('ReadyShare: [Y/N]');
  else if (stage === 4) flags.push('StrategyProposed: [Y/N]');

  const draftSection = options?.includesDraft
    ? `
If you prepared a ${options.draftPurpose} draft, include:
<draft>
${options.draftPurpose} text
</draft>`
    : '';

  const empathyOffRamp =
    stage === 2
      ? `\n- If asked why they're doing this / why guess partner's feelings / what's the point: <dispatch>EXPLAIN_EMPATHY_PURPOSE</dispatch>`
      : '';

  const strategySection =
    stage === 4
      ? `\nIf StrategyProposed is Y, list each concrete strategy the user committed to on its own line, prefixed with "ProposedStrategy: ". Only extract specific, actionable strategies — NOT vague ones like "communicate better".`
      : '';

  return `OUTPUT FORMAT:
<thinking>
Mode: [WITNESS|PERSPECTIVE|NEEDS|REPAIR|ONBOARDING|DISPATCH]
${flags.join('\n')}
Strategy: [brief]${strategySection}
</thinking>${draftSection}

Then write the user-facing response (plain text, no tags).
IMPORTANT: All metadata (FeelHeardCheck, ReadyShare, Mode, etc.) belongs ONLY inside <thinking>. The user-facing response must be purely conversational — no brackets, flags, or annotations.

OFF-RAMPS (only when needed):
- If asked how this works / process: <dispatch>EXPLAIN_PROCESS</dispatch>
- If asked to remember something: <dispatch>HANDLE_MEMORY_REQUEST</dispatch>${empathyOffRamp}

If you use <dispatch>, output ONLY <thinking> + <dispatch> (no visible text).`;
}

// ---------------------------------------------------------------------------
// Slack-specific formatting notes (layered on top of workspace rules)
// ---------------------------------------------------------------------------

const SLACK_FORMATTING_NOTES = `SLACK FORMATTING:
- Use Slack mrkdwn, NOT Markdown. Bold is *bold* (single asterisks). Italics are _italic_ (underscores). Bullets are "• " (literal bullet).
- Never post headers with #/##. Never use [link](url) — Slack uses <url|text>.
- Keep responses tight — Slack is a chat surface, not a document. 1–3 short sentences unless genuinely unavoidable.`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SlackStagePromptOptions {
  /** Stage 0 sub-phase: inviting a partner before they join. */
  isInvitationPhase?: boolean;
  /** User is redoing their invitation after Stage 1/2 insight. */
  isRefiningInvitation?: boolean;
  /** Onboarding (Curiosity Compact not yet signed). */
  isOnboarding?: boolean;
  /** First turn after a stage advance — add a contextual bridge. */
  isStageTransition?: boolean;
  /** Previous stage number, for transition messaging. */
  previousStage?: number;
  /**
   * When true, reuse `stage-prompts.ts` instead of reading workspace files.
   * Used during incremental migration / A-B testing.
   */
  fallbackOnly?: boolean;
}

/**
 * Build the `{staticBlock, dynamicBlock}` prompt for a Slack-driven MWF turn.
 *
 * We merge workspace CONTEXT.md text (the prose the facilitation team writes)
 * with the structured protocol and per-turn dynamic context the engine needs.
 */
export function buildSlackStagePrompt(
  stage: number,
  context: PromptContext,
  options: SlackStagePromptOptions = {}
): PromptBlocks {
  // Fallback path: use the existing stage-prompts.ts builder verbatim. Useful
  // when workspace files are missing, or when we want to A/B compare.
  if (options.fallbackOnly) {
    return buildStagePrompt(stage, context, {
      isInvitationPhase: options.isInvitationPhase,
      isRefiningInvitation: options.isRefiningInvitation,
      isOnboarding: options.isOnboarding,
      isStageTransition: options.isStageTransition,
      previousStage: options.previousStage,
    });
  }

  const ws = loadCache();

  const stageText = ws.stages[stage];
  if (!stageText || !ws.guardian) {
    // Missing source of truth — fall back cleanly rather than shipping a
    // half-formed prompt.
    logger.warn(
      `[WorkspacePromptBuilder] Falling back to stage-prompts.ts for stage ${stage} (missing workspace files)`
    );
    return buildStagePrompt(stage, context, {
      isInvitationPhase: options.isInvitationPhase,
      isRefiningInvitation: options.isRefiningInvitation,
      isOnboarding: options.isOnboarding,
      isStageTransition: options.isStageTransition,
      previousStage: options.previousStage,
    });
  }

  const userName = context.userName || 'there';
  const partnerName = context.partnerName || 'your partner';

  // ----- Static block -----
  const includesDraft = stage === 2 || (stage === 0 && options.isInvitationPhase);
  const draftPurpose = stage === 2 ? 'empathy' : 'invitation';
  const protocol = buildResponseProtocol(stage, {
    includesDraft,
    draftPurpose: draftPurpose as 'invitation' | 'empathy',
  });

  const staticParts: string[] = [
    `You are Meet Without Fear. You are currently facilitating a conversation for ${userName} (partner: ${partnerName}).`,
    '',
    '# Process Guardian Constitution',
    ws.guardian.trim(),
    '',
    `# Stage ${stage} Rules`,
    stageText.trim(),
  ];

  if (ws.privacy) {
    staticParts.push('', '# Privacy Model', ws.privacy.trim());
  }
  if (ws.progression) {
    staticParts.push('', '# Stage Progression', ws.progression.trim());
  }

  staticParts.push('', SLACK_FORMATTING_NOTES, '', protocol);

  const staticBlock = staticParts.join('\n');

  // ----- Dynamic block -----
  const dynamicParts: string[] = [];

  dynamicParts.push(`User: ${userName}`);
  if (context.partnerName) dynamicParts.push(`Partner: ${context.partnerName}`);
  dynamicParts.push(`Turn: ${context.turnCount}`);
  dynamicParts.push(`Emotional intensity: ${context.emotionalIntensity}/10`);

  if (context.emotionalIntensity >= 8) {
    dynamicParts.push(
      'HIGH INTENSITY — be calm and present. Short responses. Give them space.'
    );
  }

  // Stage-specific pacing hints
  if (stage === 1) {
    const isGathering = context.turnCount < 5 && context.emotionalIntensity < 8;
    const isTooEarlyForFeelHeard = context.turnCount < 3;
    if (isGathering) {
      dynamicParts.push(
        'RIGHT NOW: Still gathering. Acknowledge briefly, then one focused question. Do not reflect or summarize yet.'
      );
    } else {
      dynamicParts.push(
        `RIGHT NOW: You have enough picture to reflect using ${userName}'s own words. Check if you got it right. Keep asking from understanding.`
      );
    }
    if (isTooEarlyForFeelHeard) {
      dynamicParts.push(
        "Feel-heard guard: Too early (turn < 3) — do not set FeelHeardCheck:Y yet."
      );
    }
  }

  if (stage === 0 && options.isInvitationPhase) {
    const urgency =
      context.turnCount >= 3
        ? 'Draft the invitation NOW — do not ask another question.'
        : context.turnCount >= 2
          ? 'You should have the gist. Draft the invitation — do not wait for a perfect picture.'
          : 'LISTENING mode: one focused question per turn. Draft by turn 2–3.';
    dynamicParts.push(`Invitation pacing: ${urgency}`);
    if (context.invitationMessage) {
      dynamicParts.push(`Current invitation draft: ${context.invitationMessage}`);
    }
  }

  if (options.isStageTransition && options.previousStage !== undefined) {
    dynamicParts.push(
      `STAGE TRANSITION: You just moved from stage ${options.previousStage} to stage ${stage}. Weave a brief, conversational bridge into your first response — see the "Stage Transition Guidance" table in the Guardian Constitution.`
    );
  }

  if (context.justSharedWithPartner) {
    dynamicParts.push(
      `CONTEXT JUST SHARED: ${userName} just shared this with ${partnerName}: "${context.justSharedWithPartner.sharedContent}". Briefly acknowledge, then continue with your stage work.`
    );
  }

  if (context.innerThoughtsContext) {
    dynamicParts.push(
      `INNER THOUGHTS BACKGROUND (from a prior solo reflection): ${context.innerThoughtsContext.summary}`
    );
    if (context.innerThoughtsContext.themes?.length) {
      dynamicParts.push(
        `Themes: ${context.innerThoughtsContext.themes.join(', ')}`
      );
    }
  }

  const dynamicBlock = dynamicParts.join('\n');

  return { staticBlock, dynamicBlock };
}

/**
 * Diagnostic helper — returns a summary of which workspace files were loaded.
 * Useful for the `/api/slack/health` endpoint and for test assertions.
 */
export function getWorkspaceStatus(): {
  root: string;
  stagesLoaded: number[];
  guardianLoaded: boolean;
  privacyLoaded: boolean;
  progressionLoaded: boolean;
} {
  const ws = loadCache();
  return {
    root: WORKSPACE_ROOT,
    stagesLoaded: Object.entries(ws.stages)
      .filter(([, v]) => v !== null)
      .map(([k]) => Number(k)),
    guardianLoaded: ws.guardian !== null,
    privacyLoaded: ws.privacy !== null,
    progressionLoaded: ws.progression !== null,
  };
}
