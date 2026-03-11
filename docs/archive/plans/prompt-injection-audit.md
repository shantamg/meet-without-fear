# PROMPT INJECTION AUDIT REPORT

## Executive Summary

Your system injects **8,000-15,000 tokens** per message to Sonnet. Here's the breakdown:

| Component | Token Cost | Necessity |
|-----------|------------|-----------|
| **Base Guidance** (every message) | ~2,500 tokens | Mixed - some redundant |
| **Stage-Specific Prompt** | ~1,500-2,000 tokens | Necessary |
| **Conversation History** (last 10 turns) | ~1,000-2,000 tokens | Necessary |
| **Context Injection** ([Context for this turn:...]) | ~200-500 tokens | Questionable |
| **Tool Use Instructions** | ~300-500 tokens | Could simplify |

**Haiku (Partner Session Classifier)**: ~1,000-1,500 tokens per call

---

## 1. WHAT GETS INJECTED (SONNET)

### A. Base Guidance (~2,500 tokens) - INJECTED EVERY MESSAGE

From lines 1-103 of your saved prompt:

| Section | Lines | Purpose | Removable? |
|---------|-------|---------|------------|
| COMMUNICATION PRINCIPLES | 5-22 | Reading the room, matching energy | Probably not |
| LANGUAGE STYLE | 24-26 | No jargon, plain English | Keep (short) |
| PRIVACY AND CONSENT | 28-47 | Critical privacy rules | **ESSENTIAL** |
| USER MEMORIES (Always Honor) | 50-68 | Memory handling instructions | Could simplify |
| MEMORY DETECTION | 59-66 | Implicit memory request detection | **REMOVE** (per your request) |
| INVALID MEMORY HANDLING | 71-89 | Therapeutic rejection of bad requests | Could simplify |
| PROCESS OVERVIEW | 92-103 | 4-stage explanation | Keep for user questions |

**Key Finding**: The MEMORY DETECTION section (lines 59-66) is what you want to remove. It tells the AI to detect phrases like "I'll call you [name]" as implicit memory requests.

### B. Context Injection - The `[Context for this turn:]` Block

From lines 213-228 of your saved prompt, this is what gets prepended to the user's message:

```
[Context for this turn:
EMOTIONAL STATE:
Current intensity: 2/10
Trend: stable

NOTED FACTS FROM THIS SESSION:
[People]
- Manny is the user's business partner who runs a retreat center together
[Conflict]
- Manny frequently goes off on tangents during work discussions
- User is concerned Manny might be using drugs due to erratic communication
[Emotional]
- User is frustrated with Manny's communication style
[Logistics]
- Couple runs a retreat center together
]
```

**Cost**: ~200-500 tokens depending on fact count

**Questions**:
- Is the emotional intensity actually being used? (Always shows "2/10, stable" in examples)
- Are notable facts valuable or noise?

### C. Stage-Specific Instructions

Lines 106-182 contain the invitation-specific guidance:
- YOUR GOAL (~100 tokens)
- YOUR APPROACH with modes (~150 tokens)
- EXAMPLE GOOD/BAD INVITATIONS (~100 tokens)
- WHAT TO AVOID (~50 tokens)
- RESPONSE FORMAT with analysis block (~200 tokens)
- Tool call instructions (~100 tokens)

**Total stage-specific**: ~700-1,000 tokens

---

## 2. WHAT GETS INJECTED (HAIKU - Background Classifier)

Full prompt at `partner_session_classification.txt`:

```
[SYSTEM] - 9 lines
Your job is to:
1. Detect ONLY explicit memory requests and validate them
2. Extract and maintain notable facts about the user's situation

[USER] - 83 lines
- CONVERSATION CONTEXT (partner name)
- RECENT MESSAGES (last 5 messages)
- CURRENT MESSAGE
- CURRENT NOTABLE FACTS (existing facts list)
- TASK 1: Memory Intent Detection (38-45)
- TASK 2: Memory Validation (47-51)
- TASK 3: Notable Facts Extraction (53-73)
- OUTPUT JSON format (75-92)
```

**Cost**: ~1,000-1,500 tokens per message

**The Memory Intent Detection section** (lines 38-51) is what you want to remove:
```
TASK 1 - MEMORY INTENT DETECTION:
Only flag as detected=true if user EXPLICITLY asks to remember something...
- "remember", "always", "from now on", "going forward", "don't forget"
- "I want you to know that...", "Keep in mind that..."
```

---

## 3. THE MEMORY SYSTEM (What You Want to Remove)

### Current Flow

```
User sends message
    |
Sonnet responds (with MEMORY DETECTION instructions in base guidance)
    |
Haiku runs async (partner-session-classifier):
    - TASK 1: Memory Intent Detection <-- REMOVE THIS
    - TASK 2: Memory Validation <-- REMOVE THIS
    - TASK 3: Notable Facts Extraction <-- KEEP THIS
    |
If memory detected & valid -> saved to UserMemory table
    |
Next message: memories injected in "USER MEMORIES (Always Honor These)" section
```

### Files to Modify

1. **`stage-prompts.ts`** - Remove MEMORY_GUIDANCE section (~280 chars)
2. **`partner-session-classifier.ts`** - Remove TASK 1 & TASK 2 from prompt (~600 chars)
3. **`memory-intent.ts`** - Keep for depth/retrieval decisions, but remove detection patterns

### What to Keep

- **Notable Facts Extraction**: This is valuable context that reduces need for long conversation history
- **User Memories Table**: Users can still manually create memories (just no auto-detection)
- **Memory Honoring**: When memories exist, still apply them (AI_NAME, LANGUAGE, etc.)

---

## 4. VERBOSE SECTIONS THAT COULD BE REDUCED

### A. INVALID MEMORY HANDLING (lines 71-89)
**Current**: 280 characters of detailed instructions + example
**Could be**: 50 characters - "If user requests conflict with therapeutic values, redirect kindly."

### B. MEMORY DETECTION (lines 59-66)
**Current**: 150 characters of detection patterns
**Proposed**: REMOVE ENTIRELY

### C. PROCESS OVERVIEW (lines 92-103)
**Current**: 250 characters explaining all 4 stages
**Could be**: Only include when stage transitions or user asks

### D. EXAMPLE GOOD/BAD INVITATIONS (stage 0)
**Current**: 200 characters of examples
**Could be**: 100 characters - fewer examples

### E. RESPONSE FORMAT INSTRUCTIONS
**Current**: ~300 characters per stage with analysis block format
**Issue**: Nearly identical across stages, repeated each time

---

## 5. TOKEN SAVINGS OPPORTUNITIES

| Change | Savings | Risk |
|--------|---------|------|
| Remove MEMORY DETECTION from base guidance | ~150 tokens | None (your request) |
| Remove TASK 1 & 2 from Haiku classifier | ~400 tokens | None (your request) |
| Simplify INVALID MEMORY HANDLING | ~200 tokens | Slightly less guidance on edge cases |
| Move PROCESS OVERVIEW to on-demand | ~250 tokens | User questions might get worse answers |
| Consolidate RESPONSE FORMAT across stages | ~200 tokens | More complexity in code |
| **TOTAL POTENTIAL SAVINGS** | **~1,200 tokens/message** | |

---

## 6. FILES INVOLVED

| File | Purpose | Lines |
|------|---------|-------|
| `stage-prompts.ts` | Base guidance + stage prompts | 2,252 |
| `partner-session-classifier.ts` | Haiku prompt for facts/memory | 382 |
| `memory-intent.ts` | Intent detection patterns | 432 |
| `context-assembler.ts` | Context bundle assembly | 747 |
| `ai-orchestrator.ts` | Main pipeline | 608 |

---

## 7. CONCRETE EXAMPLES FROM SAVED PROMPTS

### Orchestrated Response (Sonnet) - 11,707 characters
- System prompt: ~10,000 chars
- Conversation history: ~1,700 chars

### Partner Session Classification (Haiku) - 4,585 characters
- System prompt: ~300 chars
- User prompt with tasks: ~4,200 chars

---

## 8. RECOMMENDATIONS FOR EXPERT REVIEW

1. **Is the context injection (`[Context for this turn:]`) actually helping?** The notable facts seem useful, but emotional intensity always shows "2/10 stable" in examples.

2. **Are the base guidance sections redundant?** Privacy guidance is critical, but communication principles and process overview might be model knowledge already.

3. **Should notable facts be in system prompt vs user message?** Currently prepended to user message, could be in system prompt for consistency.

4. **Is the analysis block format worth the token cost?** ~200 tokens per message for hidden reasoning.
