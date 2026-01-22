import type { ContextBundle } from './context-assembler';

export interface ContextFormattingOptions {
  sharedContentHistory?: string | null;
  milestoneContext?: string | null;
}

export function formatContextForPromptLegacy(bundle: ContextBundle): string {
  const parts: string[] = [];

  if (bundle.globalFacts && bundle.globalFacts.length > 0) {
    parts.push('ABOUT THIS USER (from previous sessions):');
    const byCategory = new Map<string, string[]>();
    for (const fact of bundle.globalFacts) {
      const existing = byCategory.get(fact.category) || [];
      existing.push(fact.fact);
      byCategory.set(fact.category, existing);
    }
    for (const [category, facts] of byCategory) {
      parts.push(`[${category}]`);
      for (const fact of facts) {
        parts.push(`- ${fact}`);
      }
    }
    parts.push('');
  }

  {
    const intensity = bundle.emotionalThread.currentIntensity;
    const trend = bundle.emotionalThread.trend;
    const turnCount = bundle.conversationContext.turnCount;

    const trendLabel = trend === 'stable' ? 'Stable' : trend === 'unknown' ? 'Unknown' : 'Changed';
    const intensityStr = intensity !== null ? `${intensity}/10` : 'Unknown';

    parts.push(`[Intensity: ${intensityStr} (${trendLabel}) | Turn ${turnCount}]`);
    parts.push('');
  }

  if (bundle.priorThemes && bundle.priorThemes.themes.length > 0) {
    parts.push(`FROM PRIOR SESSIONS (use for continuity only):`);
    parts.push(bundle.priorThemes.themes.join(', '));
    parts.push('');
  }

  if (bundle.sessionSummary) {
    parts.push(`SESSION SUMMARY:`);
    parts.push(`Key themes: ${bundle.sessionSummary.keyThemes.join(', ')}`);
    parts.push(`Current focus: ${bundle.sessionSummary.currentFocus}`);
    if (bundle.sessionSummary.emotionalJourney) {
      parts.push(`Emotional journey: ${bundle.sessionSummary.emotionalJourney}`);
    }
    if (bundle.sessionSummary.userStatedGoals && bundle.sessionSummary.userStatedGoals.length > 0) {
      parts.push(`Topics that may need follow-up: ${bundle.sessionSummary.userStatedGoals.join(', ')}`);
    }
    parts.push('');
  }

  if (bundle.innerThoughtsContext && bundle.innerThoughtsContext.relevantReflections.length > 0) {
    parts.push(`FROM ${bundle.userName.toUpperCase()}'S PRIVATE REFLECTIONS:`);
    parts.push(`(These are from their Inner Thoughts - private processing they've done.`);
    parts.push(`Reference gently, don't quote directly, and respect their privacy.)`);
    for (const reflection of bundle.innerThoughtsContext.relevantReflections) {
      const marker = reflection.isFromLinkedSession ? '[linked to this session]' : '';
      parts.push(`- "${reflection.content}" ${marker}`);
    }
    parts.push('');
  }

  if (bundle.userMemories) {
    const allMemories = [...bundle.userMemories.global, ...bundle.userMemories.session];
    if (allMemories.length > 0) {
      parts.push('USER MEMORIES (Always Honor These):');
      for (const memory of allMemories) {
        parts.push(`- [${memory.category}] ${memory.content}`);
      }
      parts.push('');
    }
  }

  if (bundle.notableFacts && bundle.notableFacts.length > 0) {
    parts.push('NOTED FACTS FROM THIS SESSION:');
    const byCategory = new Map<string, string[]>();
    for (const fact of bundle.notableFacts) {
      const existing = byCategory.get(fact.category) || [];
      existing.push(fact.fact);
      byCategory.set(fact.category, existing);
    }
    for (const [category, facts] of byCategory) {
      parts.push(`[${category}]`);
      for (const fact of facts) {
        parts.push(`- ${fact}`);
      }
    }
    parts.push('');
  }

  const result = parts.join('\n');
  return result;
}

export function formatContextForPrompt(
  bundle: ContextBundle,
  options?: ContextFormattingOptions
): string {
  const parts: string[] = [];

  const intensity = bundle.emotionalThread.currentIntensity;
  const trend = bundle.emotionalThread.trend;
  const intensityStr = intensity !== null ? `${intensity}/10` : 'Unknown';
  parts.push(`Intensity: ${intensityStr} (${trend}) | Turn ${bundle.conversationContext.turnCount}`);

  if (bundle.sessionSummary) {
    parts.push('--- Rolling summary ---');
    parts.push(bundle.sessionSummary.currentFocus);

    if (bundle.sessionSummary.keyThemes.length > 0) {
      parts.push(`Themes: ${bundle.sessionSummary.keyThemes.join(', ')}`);
    }

    if (bundle.sessionSummary.agreedFacts?.length) {
      parts.push(`Agreed facts: ${bundle.sessionSummary.agreedFacts.join('; ')}`);
    }

    if (bundle.sessionSummary.userNeeds?.length || bundle.sessionSummary.partnerNeeds?.length) {
      const userNeeds = bundle.sessionSummary.userNeeds?.length
        ? bundle.sessionSummary.userNeeds.join('; ')
        : 'Not yet named';
      const partnerNeeds = bundle.sessionSummary.partnerNeeds?.length
        ? bundle.sessionSummary.partnerNeeds.join('; ')
        : 'Not yet named';
      parts.push(`Needs: User → ${userNeeds}. Partner → ${partnerNeeds}.`);
    }

    if (bundle.sessionSummary.openQuestions?.length || bundle.sessionSummary.userStatedGoals?.length) {
      const openQuestions = bundle.sessionSummary.openQuestions?.length
        ? bundle.sessionSummary.openQuestions.join('; ')
        : bundle.sessionSummary.userStatedGoals.join('; ');
      if (openQuestions) {
        parts.push(`Open questions: ${openQuestions}`);
      }
    }

    if (bundle.sessionSummary.agreements?.length) {
      parts.push(`Agreements/experiments: ${bundle.sessionSummary.agreements.join('; ')}`);
    }
  }

  if (bundle.userMemories) {
    const allMemories = [...bundle.userMemories.global, ...bundle.userMemories.session];
    if (allMemories.length > 0) {
      const memoryLines = allMemories.slice(0, 5).map((memory) => `- ${memory.content}`);
      parts.push('--- User preferences to honor ---');
      parts.push(...memoryLines);
    }
  }

  if (bundle.notableFacts && bundle.notableFacts.length > 0) {
    const factLines = bundle.notableFacts.slice(0, 5).map((fact) => `- ${fact.fact}`);
    parts.push('--- Notable facts ---');
    parts.push(...factLines);
  }

  if (bundle.innerThoughtsContext?.relevantReflections?.length) {
    parts.push('--- Private reflections (gentle reference) ---');
    for (const reflection of bundle.innerThoughtsContext.relevantReflections.slice(0, 2)) {
      parts.push(`- ${reflection.content}`);
    }
  }

  if (options?.sharedContentHistory) {
    parts.push('--- Shared/consent state ---');
    parts.push(options.sharedContentHistory);
  }

  if (options?.milestoneContext) {
    parts.push('--- Milestones ---');
    parts.push(options.milestoneContext);
  }

  return parts.filter((part) => part.trim().length > 0).join('\n');
}
