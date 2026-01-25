# Issue 1: Notable Facts Being Dropped Between Turns

## Summary
The Haiku-based notable facts classifier is inconsistently preserving facts across conversation turns. A fact extracted in one turn may be silently dropped in subsequent turns, even though the classifier is explicitly instructed to "Output the FULL list each time."

## Symptom
User said "My son is 3 now" during the conversation. The AI acknowledged this ("Three years is a significant time..."), but the fact is not present in the current notable facts stored in the database.

## Evidence

### Message Timeline
```
[15:44:44] USER: "My son is 3 now."
[15:44:50] AI: "Three years is a significant time - your whole world must have shifted..."
```

### Turn 8 Classification Output (15:44:50)
The classifier CORRECTLY extracted the fact:
```json
{
  "topicContext": "User discussing changes in a friendship after starting a family",
  "notableFacts": [
    { "category": "People", "fact": "Sarah is a person the user is discussing (relationship not specified)" },
    { "category": "Logistics", "fact": "User has a 3-year-old son" },  // <-- CORRECTLY EXTRACTED
    { "category": "History", "fact": "User and Sarah previously took long walks and talked about their lives" },
    { "category": "Conflict", "fact": "User believes reduced time availability may be upsetting Sarah" },
    { "category": "Emotional", "fact": "User perceives Sarah is no longer interested in the friendship" },
    { "category": "Emotional", "fact": "User is concerned about recent distance in friendship with Sarah" }
  ]
}
```

### Turn 9 Classification - Fact Preserved
Input included: "User has a 3-year-old son"
Output included: "User has a 3-year-old son"

### Turn 10 Classification #1 (15:46:07) - Still Present
```
Facts extracted (6):
  - Sarah is a person the user is discussing...
  - User has a 3-year-old son  // <-- STILL PRESENT
  - User and Sarah previously took long walks...
  - User feels concerned about potential loss...
  - User is afraid of being rejected...
  - User perceives reduced time availability...
```

### Turn 10 Classification #2 (15:46:47) - FACT DROPPED
```
Facts extracted (7):
  - Sarah is a person the user is discussing...
  - User and Sarah previously took long walks...  // <-- 3-year-old son GONE
  - User is afraid of being rejected...
  - User perceives a growing distance...
  - User is concerned about potential awkwardness...
  - User worries Sarah may no longer want...
  - Reduced time availability may have impacted...
```

### Final UserVessel State (15:48:15)
```json
[
  {"fact": "Sarah is a person the user is discussing (relationship not specified)", "category": "People"},
  {"fact": "User fears potential rejection from Sarah", "category": "Emotional"},
  {"fact": "User is concerned about potential awkwardness in reconnecting", "category": "Conflict"},
  {"fact": "User and Sarah previously took walks and talked together extensively", "category": "History"},
  {"fact": "User and Sarah had a friendship characterized by open, free-flowing conversations", "category": "History"},
  {"fact": "User values ability to discuss and 'bounce ideas around' with Sarah", "category": "Emotional"},
  {"fact": "User perceives growing distance in relationship with Sarah", "category": "Emotional"},
  {"fact": "User worried Sarah may no longer want same type of connection", "category": "Emotional"}
]
```
**No mention of the 3-year-old son.**

## Relevant Code

### Classifier Prompt (partner-session-classifier.ts:94-144)
```typescript
return `Extract notable facts from this conversation.

CONVERSATION CONTEXT:
${personContext}

RECENT MESSAGES:
${historyText}

CURRENT MESSAGE:
User: ${userMessage}

${existingFactsText}
${sonnetAnalysisText}
YOUR TASK - NOTABLE FACTS EXTRACTION:
Maintain a curated list of CATEGORIZED facts about the user's situation. Output the COMPLETE updated list.

CATEGORIES (use these exact names):
- People: names and ONLY explicitly stated roles/relationships (e.g., "daughter Emma is 14", "Darryl is a person the user wants to discuss")
- Logistics: scheduling, location, practical circumstances
- Conflict: specific disagreements, triggers, patterns
- Emotional: feelings, frustrations, fears, hopes
- History: past events, relationship timeline, backstory

...

RULES:
- Each fact MUST have a category and fact text
- Keep facts concise (1 sentence each)
- Update/replace outdated facts with newer information
- Soft limit: 15-20 facts. If exceeding, consolidate/merge similar facts
- Output the FULL list each time (not just new facts)  // <-- THIS IS BEING VIOLATED
`;
```

### How Classifier Saves Facts (partner-session-classifier.ts:239-268)
```typescript
// Save notable facts to UserVessel (fire-and-forget)
if (normalized.notableFacts && normalized.notableFacts.length > 0) {
  try {
    const updateResult = await prisma.userVessel.updateMany({
      where: {
        userId: input.userId,
        sessionId: input.sessionId,
      },
      data: {
        notableFacts: normalized.notableFacts as unknown as Parameters<
          typeof prisma.userVessel.update
        >['0']['data']['notableFacts'],
      },
    });
    // ...
  }
}
```

Note: This REPLACES the entire `notableFacts` array with whatever the LLM returns. If the LLM omits a fact, it's gone.

## Root Cause Analysis

1. **LLM Non-Determinism**: Haiku is not reliably following the instruction to preserve all existing facts
2. **Destructive Updates**: The code does a full replacement rather than a merge
3. **Topic Drift**: When conversation shifts to emotional topics, the LLM focuses on those and "forgets" logistical facts

## Potential Fixes

### Option A: Stronger Prompt Enforcement
Add more explicit instructions:
```
CRITICAL: You MUST include ALL facts from CURRENT NOTABLE FACTS in your output.
Never drop a fact unless it is explicitly contradicted by new information.
If unsure, KEEP the fact.
```

### Option B: Incremental Updates (Recommended)
Change classifier to only output NEW facts, then merge in code:
```typescript
// Instead of replacing, merge
const existingFacts = vessel.notableFacts || [];
const newFacts = normalized.notableFacts || [];
const mergedFacts = mergeFacts(existingFacts, newFacts); // dedup by content similarity
await prisma.userVessel.updateMany({
  where: { userId, sessionId },
  data: { notableFacts: mergedFacts }
});
```

### Option C: Validation Layer
After classification, check if any existing facts are missing from output and restore them:
```typescript
const inputFacts = input.existingFacts || [];
const outputFacts = normalized.notableFacts || [];
const missingFacts = inputFacts.filter(f =>
  !outputFacts.some(o => similarFact(f, o))
);
if (missingFacts.length > 0) {
  console.warn(`Classifier dropped ${missingFacts.length} facts, restoring...`);
  normalized.notableFacts = [...outputFacts, ...missingFacts];
}
```

## Questions for Expert
1. Is there a way to make Haiku more deterministic about preserving list items?
2. Should we switch to incremental updates instead of full replacement?
3. Is there a temperature or other parameter that would help with fact preservation?
4. Should we consider using a different model for this task?
