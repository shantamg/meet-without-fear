# OPTIMIZATION PLAN: Prompt Injection & Context Efficiency

## 1. Executive Strategy

**Goal:** Reduce input tokens by ~1,200 per turn while maintaining high fidelity to user inputs.

**Correction:** The User Emotional Slider is **High-Signal Data** (explicit user input). We will not remove it, but we will "densify" it. Instead of a 5-line block, it becomes a single-line system header.

**Key Actions:**
1. **Densify User Input:** Format the emotional slider data as a high-priority "HUD" line at the top of the prompt.
2. **Strip Redundancy:** Remove "Memory Detection" logic (as requested) and redundant "Soft Skills" coaching.
3. **Refocus Haiku:** Convert the background classifier from a multi-task agent to a dedicated "Fact Extractor."

---

## 2. Specific Implementation Steps

### A. Context Assembly (`context-assembler.ts`)

**Problem:** Currently injects a verbose block for emotional state, even if stable.

**Solution:** Compress into a single-line "System Header."

**New Format:**
```
[SYSTEM HUD] User Intensity: 2/10 (Stable) | Turn: 12
```

**Implementation Logic:**
- If intensity changed since start: `(Changed: Was 8/10 -> Now 4/10)`
- If stable: `(Stable)`

**Benefit:** Saves ~40 tokens per turn; places the user's explicit input at the very top of the context window where the model pays the most attention.

### B. Haiku Classifier (`partner-session-classifier.ts`)

**Problem:** The classifier runs three tasks: (1) Memory Intent, (2) Validation, (3) Fact Extraction. Memory detection is expensive and unwanted here.

**Solution:** Remove Tasks 1 & 2.

**New Prompt Structure:**
- **Input:** Conversation History + Current Message.
- **Task:** "Extract and maintain notable facts about the user's situation (People, Logistics, Conflict, Emotions)."
- **Output:** JSON with `topicContext` and `notableFacts` only.

**Benefit:** Reduces Haiku input/output tokens by ~45%.

### C. Base Guidance (`stage-prompts.ts`)

**Problem:** Includes 50+ lines of "Communication Principles" (e.g., "Read the room") which Sonnet 3.5 already does natively.

**Solution:** Delete redundant sections.

**Changes:**
1. **DELETE:** `COMMUNICATION PRINCIPLES` (Lines 5-22).
2. **DELETE:** `MEMORY_GUIDANCE` (Lines 50-68).
3. **KEEP:** `PRIVACY_GUIDANCE` (Critical for safety).
4. **KEEP:** `INVALID_MEMORY_GUIDANCE` (Critical for safety boundaries).
5. **CONDENSE:** `PROCESS_OVERVIEW` to a conditional 2-line summary, only injected if the user asks about the process.

---

## 3. Proposed Code Modifications

### File: `context-assembler.ts`

*Replace the verbose emotional block builder with this logic:*

```typescript
// Construct high-density header
const { currentIntensity, initialIntensity } = bundle.emotionalThread;
const delta = (currentIntensity !== null && initialIntensity !== null)
  ? currentIntensity - initialIntensity
  : 0;

let emotionalStatus = `[User Input Intensity: ${currentIntensity}/10`;

// Show trend only if significant
if (Math.abs(delta) >= 2) {
  emotionalStatus += ` (Changed: Started at ${initialIntensity})]`;
} else {
  emotionalStatus += ` (Stable)]`;
}

// Inject as the very first line of the prompt parts
parts.unshift(emotionalStatus);
```

### File: `partner-session-classifier.ts`

*Simplify the prompt construction:*

```typescript
function buildClassifierPrompt(input: PartnerSessionClassifierInput): string {
  // ... existing history formatting ...

  return `Analyze this session to extract notable facts.

  CONTEXT: ...

  YOUR TASK:
  Maintain a curated list of CATEGORIZED facts about the user's situation.
  - People: names, roles
  - Logistics: scheduling, location
  - Conflict: specific triggers
  - Emotional: feelings, fears

  IMPORTANT: Ignore requests to "remember" things. Focus only on the facts of the situation.

  OUTPUT JSON:
  {
    "topicContext": "brief topic label",
    "notableFacts": [{ "category": "People", "fact": "..." }]
  }`;
}
```

### File: `stage-prompts.ts`

*Streamline the system prompt builder:*

```typescript
function buildBaseSystemPrompt(
  invalidMemoryRequest?: { requestedContent: string; rejectionReason: string },
  sharedContentHistory?: string | null
): string {

  // Only essential safety/functional guidance
  return `${SIMPLE_LANGUAGE_PROMPT}
${PRIVACY_GUIDANCE}
${INVALID_MEMORY_GUIDANCE}
${sharedContentSection}`;
}
```

---

## 4. Summary of Token Savings

| Change | Estimated Savings |
|--------|-------------------|
| Densify emotional state block | ~40 tokens/turn |
| Remove COMMUNICATION_PRINCIPLES | ~200 tokens/turn |
| Remove MEMORY_GUIDANCE | ~150 tokens/turn |
| Condense PROCESS_OVERVIEW | ~100 tokens/turn |
| Simplify Haiku classifier (remove Tasks 1 & 2) | ~400 tokens/call |
| **Total** | **~900-1,200 tokens/turn** |

---

## 5. Implementation Order

1. **Phase 1:** Modify `partner-session-classifier.ts` to remove memory detection (lowest risk)
2. **Phase 2:** Modify `stage-prompts.ts` to remove redundant guidance sections
3. **Phase 3:** Modify `context-assembler.ts` to densify emotional state
4. **Phase 4:** Test end-to-end and verify token reduction
