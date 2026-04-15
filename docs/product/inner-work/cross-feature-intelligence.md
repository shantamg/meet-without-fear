# Cross-Feature Intelligence Implementation Plan

## Overview

The "magic" of Inner Work: connecting data across all features to surface meaningful patterns, detect contradictions, and provide insights that no single feature could offer alone. This is what differentiates Inner Work from standalone apps.

## Core Insight Types

### 1. Contradictions
User's stated assessment conflicts with observed behavior.
```
"You scored trust as fully met, but you've mentioned feeling betrayed
in 3 conflicts this month."
```

### 2. Patterns
Recurring themes across features.
```
"I'm noticing you often feel grateful for time in nature. It seems
like nature helps you feel more present."
```

### 3. Correlations
Relationships between behaviors and states.
```
"Your meditation practice dropped off the week before your last big
conflict with [partner]."
```

### 4. Gaps
Missing expected data.
```
"You rarely express gratitude about your partner, yet you're working
through another issue with them."
```

### 5. Connections
Linking specific content to needs/people.
```
"This gratitude touches on your belonging need - which you marked
as only somewhat met."
```

---

## Data Sources

Cross-feature intelligence draws from:

| Source | Data Available |
|--------|----------------|
| **Needs Assessment** | 19 scores + history + clarifications |
| **Inner Thoughts** | Conversations + themes + emotions |
| **Gratitude** | Entries + people + themes + sentiment |
| **Meditation** | Sessions + focus areas + frequency |
| **Partner Sessions** | Conflicts + stages + outcomes |
| **People Tracking** | People + mention counts + contexts |
| **Memory System** | Intentionally saved insights |

---

## Architecture

### Option A: Real-time Analysis (Recommended for MVP)

Run analysis when prompts are built, pulling fresh context.

```typescript
// In buildInnerWorkPrompt or buildNeedsCheckInPrompt
const crossFeatureContext = await gatherCrossFeatureContext(userId);

// Pass to prompt
const prompt = buildPrompt({
  ...otherParams,
  crossFeatureContext,
});
```

**Pros:** Always fresh, simpler architecture
**Cons:** Slower prompt building, repeated queries

### Option B: Batch Analysis

Run periodic job (daily/weekly) to compute insights, store results.

```typescript
// Cron job
await computeUserInsights(userId);

// Results stored in UserInsights table
const insights = await prisma.userInsights.findUnique({ where: { userId } });
```

**Pros:** Faster prompt building, can surface proactively
**Cons:** More complex, insights may be stale

### Recommended: Hybrid

- **Real-time**: Fresh data for prompts (needs scores, recent mentions)
- **Batch**: Complex pattern analysis (weekly insight reports)

---

## Context Gathering Service

### Core Function

```typescript
// cross-feature-context.ts

interface CrossFeatureContext {
  // Needs data
  needsScores: { needId: number; name: string; score: number; lastUpdated: Date }[];
  lowNeeds: string[]; // Names of needs scored 0-1
  highNeeds: string[]; // Names of needs scored 2

  // Gratitude data
  recentGratitudeThemes: string[];
  gratitudeFrequencyByPerson: { name: string; count: number }[];
  gratitudeSentimentTrend: 'positive' | 'negative' | 'stable';

  // Meditation data
  meditationStreak: number;
  recentMeditationFocuses: string[];
  meditationFrequencyTrend: 'increasing' | 'decreasing' | 'stable';

  // Conflict data
  activeConflicts: { partnerName: string; stage: number; topic?: string }[];
  recentConflictThemes: string[];

  // People data
  frequentlyMentioned: { name: string; contexts: string[] }[];
  rarelyMentionedInGratitude: string[]; // Partners with low gratitude mentions

  // Detected patterns
  contradictions: Contradiction[];
  correlations: Correlation[];
  gaps: Gap[];
}

export async function gatherCrossFeatureContext(
  userId: string,
  options?: { includePatterns?: boolean }
): Promise<CrossFeatureContext> {
  // Parallel queries for efficiency
  const [
    needsData,
    gratitudeData,
    meditationData,
    conflictData,
    peopleData,
  ] = await Promise.all([
    fetchNeedsContext(userId),
    fetchGratitudeContext(userId),
    fetchMeditationContext(userId),
    fetchConflictContext(userId),
    fetchPeopleContext(userId),
  ]);

  const context: CrossFeatureContext = {
    ...needsData,
    ...gratitudeData,
    ...meditationData,
    ...conflictData,
    ...peopleData,
    contradictions: [],
    correlations: [],
    gaps: [],
  };

  // Optionally detect patterns (more expensive)
  if (options?.includePatterns) {
    context.contradictions = await detectContradictions(userId, context);
    context.correlations = await detectCorrelations(userId, context);
    context.gaps = await detectGaps(userId, context);
  }

  return context;
}
```

### Needs Context

```typescript
async function fetchNeedsContext(userId: string) {
  const state = await prisma.needsAssessmentState.findUnique({
    where: { userId },
  });

  if (!state?.baselineCompleted) {
    return { needsScores: [], lowNeeds: [], highNeeds: [] };
  }

  // Get latest scores for each need
  const latestScores = await prisma.$queryRaw`
    SELECT DISTINCT ON (need_id)
      ns.need_id as "needId",
      n.name,
      ns.score,
      ns.created_at as "lastUpdated"
    FROM need_scores ns
    JOIN needs n ON n.id = ns.need_id
    WHERE ns.user_id = ${userId}
    ORDER BY ns.need_id, ns.created_at DESC
  `;

  return {
    needsScores: latestScores,
    lowNeeds: latestScores.filter(s => s.score <= 1).map(s => s.name),
    highNeeds: latestScores.filter(s => s.score === 2).map(s => s.name),
  };
}
```

### Gratitude Context

```typescript
async function fetchGratitudeContext(userId: string) {
  const thirtyDaysAgo = subDays(new Date(), 30);

  const entries = await prisma.gratitudeEntry.findMany({
    where: {
      userId,
      createdAt: { gte: thirtyDaysAgo },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  // Aggregate themes
  const themeCounts = new Map<string, number>();
  entries.forEach(e => {
    e.extractedThemes.forEach(t => {
      themeCounts.set(t, (themeCounts.get(t) || 0) + 1);
    });
  });

  // Aggregate people
  const personCounts = new Map<string, number>();
  entries.forEach(e => {
    e.extractedPeople.forEach(p => {
      personCounts.set(p, (personCounts.get(p) || 0) + 1);
    });
  });

  // Calculate sentiment trend
  const sentiments = entries
    .filter(e => e.sentimentScore !== null)
    .map(e => e.sentimentScore!);
  const avgSentiment = sentiments.length > 0
    ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length
    : 0;

  return {
    recentGratitudeThemes: Array.from(themeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([theme]) => theme),
    gratitudeFrequencyByPerson: Array.from(personCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count })),
    gratitudeSentimentTrend: avgSentiment > 0.3 ? 'positive' :
      avgSentiment < -0.3 ? 'negative' : 'stable',
  };
}
```

---

## Pattern Detection

### Contradiction Detection

```typescript
interface Contradiction {
  type: 'needs_vs_behavior' | 'stated_vs_observed';
  needId?: number;
  needName?: string;
  description: string;
  evidence: string[];
  confidence: number; // 0-1
}

async function detectContradictions(
  userId: string,
  context: CrossFeatureContext
): Promise<Contradiction[]> {
  const contradictions: Contradiction[] = [];

  // Check each high-scoring need against conversation content
  for (const need of context.needsScores.filter(n => n.score === 2)) {
    // Search Inner Thoughts for contradicting statements
    const contradictingMessages = await searchForContradictions(
      userId,
      need.name,
      need.needId
    );

    if (contradictingMessages.length >= 2) {
      contradictions.push({
        type: 'needs_vs_behavior',
        needId: need.needId,
        needName: need.name,
        description: `User scored ${need.name} as fully met, but conversations suggest otherwise`,
        evidence: contradictingMessages.map(m => m.snippet),
        confidence: Math.min(contradictingMessages.length / 5, 1),
      });
    }
  }

  // Check gratitude patterns vs partner sessions
  for (const conflict of context.activeConflicts) {
    const gratitudeCount = context.gratitudeFrequencyByPerson
      .find(p => p.name.toLowerCase().includes(conflict.partnerName.toLowerCase()))
      ?.count || 0;

    if (gratitudeCount < 2 && context.gratitudeFrequencyByPerson.length > 3) {
      contradictions.push({
        type: 'stated_vs_observed',
        description: `Rarely expresses gratitude about ${conflict.partnerName} despite ongoing relationship work`,
        evidence: [`${gratitudeCount} gratitudes about ${conflict.partnerName} in 30 days`],
        confidence: 0.7,
      });
    }
  }

  return contradictions;
}

async function searchForContradictions(
  userId: string,
  needName: string,
  needId: number
): Promise<{ messageId: string; snippet: string }[]> {
  // Use embeddings to find messages about this need
  const queryText = `feeling ${needName} is not met, struggling with ${needName}`;

  const similarMessages = await prisma.$queryRaw`
    SELECT id, content,
           1 - (embedding <=> ${await generateEmbedding(queryText)}::vector) as similarity
    FROM inner_work_messages
    WHERE user_id = ${userId}
      AND role = 'USER'
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ${await generateEmbedding(queryText)}::vector
    LIMIT 10
  `;

  // Filter by similarity threshold
  return similarMessages
    .filter(m => m.similarity > 0.7)
    .map(m => ({
      messageId: m.id,
      snippet: m.content.substring(0, 100) + '...',
    }));
}
```

### Correlation Detection

```typescript
interface Correlation {
  type: 'meditation_conflict' | 'gratitude_needs' | 'theme_pattern';
  description: string;
  dataPoints: { x: string; y: string }[];
  strength: number; // 0-1
}

async function detectCorrelations(
  userId: string,
  context: CrossFeatureContext
): Promise<Correlation[]> {
  const correlations: Correlation[] = [];

  // Meditation frequency vs conflict occurrence
  const meditationConflictCorrelation = await analyzeMeditationConflictPattern(userId);
  if (meditationConflictCorrelation) {
    correlations.push(meditationConflictCorrelation);
  }

  // Gratitude themes vs high needs
  for (const highNeed of context.highNeeds) {
    const relatedGratitudes = context.recentGratitudeThemes.filter(
      theme => needThemeMapping[highNeed]?.includes(theme)
    );
    if (relatedGratitudes.length >= 2) {
      correlations.push({
        type: 'gratitude_needs',
        description: `Gratitude themes connect to ${highNeed} being met`,
        dataPoints: relatedGratitudes.map(t => ({ x: t, y: highNeed })),
        strength: relatedGratitudes.length / 5,
      });
    }
  }

  return correlations;
}

async function analyzeMeditationConflictPattern(userId: string): Promise<Correlation | null> {
  // Get meditation sessions and conflict starts
  const meditations = await prisma.meditationSession.findMany({
    where: { userId, completed: true },
    orderBy: { startedAt: 'asc' },
    select: { startedAt: true },
  });

  const conflicts = await prisma.session.findMany({
    where: { OR: [{ user1Id: userId }, { user2Id: userId }] },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });

  if (meditations.length < 5 || conflicts.length < 2) {
    return null;
  }

  // Analyze: did meditation drop before conflicts?
  let correlationCount = 0;
  for (const conflict of conflicts) {
    const weekBefore = subDays(conflict.createdAt, 7);
    const twoWeeksBefore = subDays(conflict.createdAt, 14);

    const meditationsWeekBefore = meditations.filter(
      m => m.startedAt >= weekBefore && m.startedAt < conflict.createdAt
    ).length;
    const meditationsTwoWeeksBefore = meditations.filter(
      m => m.startedAt >= twoWeeksBefore && m.startedAt < weekBefore
    ).length;

    if (meditationsWeekBefore < meditationsTwoWeeksBefore * 0.5) {
      correlationCount++;
    }
  }

  if (correlationCount >= 2) {
    return {
      type: 'meditation_conflict',
      description: 'Meditation practice tends to drop before conflicts arise',
      dataPoints: conflicts.map(c => ({
        x: format(c.createdAt, 'MMM d'),
        y: 'conflict',
      })),
      strength: correlationCount / conflicts.length,
    };
  }

  return null;
}
```

### Gap Detection

```typescript
interface Gap {
  type: 'missing_gratitude' | 'missing_checkin' | 'missing_meditation';
  description: string;
  suggestion: string;
}

async function detectGaps(
  userId: string,
  context: CrossFeatureContext
): Promise<Gap[]> {
  const gaps: Gap[] = [];

  // Partner with conflicts but no gratitude
  for (const conflict of context.activeConflicts) {
    const hasGratitude = context.gratitudeFrequencyByPerson
      .some(p => p.name.toLowerCase().includes(conflict.partnerName.toLowerCase()));

    if (!hasGratitude) {
      gaps.push({
        type: 'missing_gratitude',
        description: `No gratitudes expressed about ${conflict.partnerName}`,
        suggestion: `Consider: is there anything you appreciate about ${conflict.partnerName}, even amid the difficulty?`,
      });
    }
  }

  // Low need without recent check-in
  const twoWeeksAgo = subDays(new Date(), 14);
  for (const need of context.needsScores.filter(n => n.score <= 1)) {
    if (need.lastUpdated < twoWeeksAgo) {
      gaps.push({
        type: 'missing_checkin',
        description: `${need.name} scored low but hasn't been checked in 2+ weeks`,
        suggestion: `Would you like to check in on how ${need.name} is feeling?`,
      });
    }
  }

  return gaps;
}
```

---

## Using Context in Prompts

### Enhanced Inner Thoughts Prompt

```typescript
function buildInnerWorkPromptWithCrossFeature(
  baseParams: InnerWorkPromptParams,
  crossFeature: CrossFeatureContext
): string {
  let contextSection = '';

  // Add needs context
  if (crossFeature.needsScores.length > 0) {
    contextSection += `
USER'S NEEDS LANDSCAPE:
- Low (struggling): ${crossFeature.lowNeeds.join(', ') || 'None'}
- High (thriving): ${crossFeature.highNeeds.join(', ') || 'None'}
`;
  }

  // Add recent gratitude themes
  if (crossFeature.recentGratitudeThemes.length > 0) {
    contextSection += `
RECENT GRATITUDE THEMES: ${crossFeature.recentGratitudeThemes.join(', ')}
`;
  }

  // Add active conflicts
  if (crossFeature.activeConflicts.length > 0) {
    contextSection += `
ACTIVE CONFLICTS:
${crossFeature.activeConflicts.map(c =>
  `- Working through something with ${c.partnerName} (Stage ${c.stage})`
).join('\n')}
`;
  }

  // Add detected contradictions (use carefully)
  if (crossFeature.contradictions.length > 0) {
    contextSection += `
PATTERNS TO POTENTIALLY EXPLORE (use judgment on when to surface):
${crossFeature.contradictions.map(c =>
  `- ${c.description}`
).join('\n')}
`;
  }

  return `
${buildBaseInnerWorkPrompt(baseParams)}

---
CROSS-FEATURE CONTEXT:
${contextSection}

Use this context to:
- Notice connections between what user says and their needs
- Gently surface patterns when appropriate
- Recognize when gratitude themes or conflicts are relevant
- Do NOT dump all this context on the user - weave it in naturally
`;
}
```

### When to Surface Insights

Not every conversation should bring up patterns. Guidelines:

| Insight Type | When to Surface |
|--------------|-----------------|
| Contradictions | When user is discussing the relevant topic, not out of the blue |
| Gratitude patterns | During gratitude practice or when user mentions the theme |
| Meditation correlations | When discussing regulation or preparing for conflict |
| Gaps | As gentle suggestions, not criticisms |

---

## Proactive Insights (Future)

### Weekly Insight Digest

Batch job that surfaces notable patterns:

```typescript
async function generateWeeklyInsights(userId: string): Promise<string> {
  const context = await gatherCrossFeatureContext(userId, { includePatterns: true });

  const prompt = `
Based on this user's data, write a brief (2-3 paragraph) insight summary
for their week. Be warm, not clinical. Highlight:
- What's going well (high needs, gratitude patterns)
- Gentle observations (not criticisms)
- Suggestions for the coming week

DATA:
${JSON.stringify(context, null, 2)}

Write as if you're their supportive Inner Work companion.
`;

  return await callClaude(prompt);
}
```

### Push Notification Insights

When significant pattern detected:
```
"I noticed something that might be worth exploring in Inner Work
when you have a moment."
```

---

## Testing Strategy

### Unit Tests
- Context gathering functions
- Pattern detection algorithms
- Threshold validation

### Integration Tests
- Full context gathering with real data
- Contradiction detection accuracy
- Correlation detection accuracy

### Manual Testing
- Verify insights feel helpful, not creepy
- Test edge cases (new users, sparse data)

---

## Implementation Phases

### Phase 1: Context Gathering (1-2 days)
- [ ] Create CrossFeatureContext interface
- [ ] Implement gatherCrossFeatureContext
- [ ] Add individual fetch functions (needs, gratitude, etc.)
- [ ] Test with existing data

### Phase 2: Integrate into Prompts (1 day)
- [ ] Update buildInnerWorkPrompt to include context
- [ ] Update buildNeedsCheckInPrompt to include context
- [ ] Update buildGratitudeResponsePrompt to include context
- [ ] Test AI responses use context appropriately

### Phase 3: Pattern Detection (2-3 days)
- [ ] Implement contradiction detection
- [ ] Implement correlation detection
- [ ] Implement gap detection
- [ ] Tune thresholds and confidence levels

### Phase 4: Proactive Insights (Future)
- [ ] Weekly insight generation
- [ ] Notification triggers
- [ ] Insight history storage

---

## Open Questions

1. **How Aggressive with Contradictions?**
   - Should AI always mention contradictions?
   - Recommendation: Only when directly relevant and confidence > 0.7

2. **User Consent for Pattern Analysis?**
   - Should users opt-in to cross-feature analysis?
   - Recommendation: On by default, allow opt-out in settings

3. **Insight Delivery Channel?**
   - In-context (during conversations)?
   - Dedicated insights screen?
   - Push notifications?
   - Recommendation: All three, phased rollout

4. **Data Retention for Pattern Analysis**
   - How far back to analyze?
   - Recommendation: 90 days default, user can adjust

---

## Leveraging Existing Memory System

The existing memory system can complement cross-feature intelligence:

### Auto-save Insights as Memories
When significant pattern detected:
```typescript
await createMemory({
  userId,
  category: 'PATTERN',
  content: 'Trust issues tend to come up with Sarah',
  source: 'cross-feature-analysis',
});
```

### RAG Retrieval in Prompts
When building prompts, include relevant memories:
```typescript
const relevantMemories = await retrieveRelevantMemories(
  userId,
  currentConversationContext
);
// Add to prompt context
```

### User-Initiated Pattern Saves
When AI surfaces a pattern, offer to save:
```
AI: "I'm noticing you often feel grateful for time in nature."
User: "That's true!"
AI: "Would you like me to remember that nature helps you feel grounded?"
[Save Memory button]
```

---

[Back to Inner Work Plans](./index.md)
