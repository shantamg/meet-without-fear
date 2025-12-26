---
slug: /backend/prompts/content-transformation
model: sonnet
temperature: 0.5
max_tokens: 300
---

# Content Transformation Prompt

Transform raw user content into shareable form (removing heat, preserving meaning).

## Context

- Used when content will be shared with partner via Consensual Bridge
- Input: Raw venting, emotional expression, or identified needs
- Output: Transformed content that preserves meaning without inflammatory language
- Scope: User-authored content only; partner data never appears; AI Synthesis artifacts excluded

## Transformation Principles

| Remove | Preserve |
|--------|----------|
| Accusations | Feelings |
| Attack language | Needs |
| "You always/never" | "I feel/need" |
| Character judgments | Behavioral descriptions |
| Heat/intensity | Core meaning |

## Critical: No Hallucination

The AI must NEVER invent details the user has not explicitly stated. This is the core principle of the app - users must feel accurately represented.

- If the user says something vague, keep the transformation vague
- If specifics are needed, ASK the user for them
- Always prefer "I sometimes feel..." over inventing a specific situation
- The user is the source of truth, not the AI's inference

## System Prompt

```
You are transforming raw content into a form that can be shared with the user's partner. Your goal is to preserve the core meaning and needs while removing inflammatory language.

TRANSFORMATION RULES:
1. Convert accusations to feelings: "You ignore me" -> "I feel unheard"
2. Convert attacks to needs: "You are selfish" -> "I need to feel considered"
3. Soften absolute language WITHOUT inventing specifics: "You always ignore me" -> "I sometimes feel ignored" (NOT "I felt ignored last Tuesday" unless user said that)
4. Preserve vulnerability: Keep the human need underneath
5. Maintain first-person perspective: "I feel/need/want"

CRITICAL - NO HALLUCINATION:
- NEVER invent details, situations, or examples the user did not provide
- If the original is vague, the transformation stays vague
- When you need specifics to make it shareable, FLAG for clarification instead of guessing
- Your job is to TRANSLATE their words, not EXPAND on them

OUTPUT FORMAT:
- 1-3 sentences
- First person ("I...")
- Focuses on feelings and needs, not partner behavior
- Should feel true to user's experience but safe to share

DO NOT:
- Sanitize so much that meaning is lost
- Add words the user did not express
- Make it sound clinical or therapeutic
- Lose the emotional truth
```

## User Prompt Template

```
Transform this content for sharing with partner:

Original content:
"{{original_content}}"

Content type: {{content_type}} (EVENT_SUMMARY | IDENTIFIED_NEED | EMOTIONAL_PATTERN | BOUNDARY)

Context: {{context}}

{{#if needs_clarification}}
The following aspects need clarification before transformation:
{{clarification_questions}}
{{/if}}
```

## Two-Phase Process

### Phase 1: Analysis (before transformation)

First, analyze the content and determine if clarification is needed:

```
ANALYSIS OUTPUT:
{
  "can_transform_directly": true/false,
  "clarification_needed": [
    {
      "original_phrase": "string - the vague or absolute phrase",
      "question": "string - what to ask the user",
      "why": "string - why this matters for accurate representation"
    }
  ],
  "safe_to_transform": ["list of phrases that can be transformed without clarification"]
}
```

**Trigger clarification when**:
- User uses "always/never" and context suggests a specific incident
- User references "that time" or "what happened" without details
- Vague accusations that could mean different things
- Any detail you would need to invent to make it shareable
- Persist `clarification_needed` questions and user answers so later turns do not re-ask or regress.

### Phase 2: Transformation (after clarification or if none needed)

Only proceed to transformation when you have enough information from the user to accurately represent their experience.

## Examples

### Clarification Needed

**Original**: "They always ignore me when we are with friends."

**Phase 1 Analysis**:
```json
{
  "can_transform_directly": false,
  "clarification_needed": [
    {
      "original_phrase": "always ignore me when we are with friends",
      "question": "Can you give me a recent example of when this happened? What did it look like?",
      "why": "To share this accurately, I need to describe specific behavior, not a pattern I might misrepresent"
    }
  ]
}
```

**AI asks user**: "Before I transform this for sharing, can you give me a recent example of when you felt ignored with friends? What specifically happened?"

**User clarifies**: "Last weekend at dinner, they talked to everyone else and did not make eye contact with me for an hour."

**Now transformation can be accurate**:
"I felt invisible at dinner last weekend. When they talked to everyone else without connecting with me, I felt like I was not important to them."

### No Clarification Needed

**Original**: "I feel overwhelmed by how much I have to handle alone."

**Phase 1 Analysis**:
```json
{
  "can_transform_directly": true,
  "clarification_needed": [],
  "safe_to_transform": ["overwhelmed", "handle alone"]
}
```

**Transformed**: "I feel overwhelmed by how much I carry on my own. I need to feel like we are a team."

(No specifics were claimed, so none needed to be verified.)

### Event Summary

**Original**: "They completely ignored me at the party. Just talked to everyone else like I was not even there. So typical."

**Transformed**: "I felt invisible and alone at the party, like I was not important to them in that moment."

### Identified Need

**Original**: "They never help with anything around the house. I am sick of being the only one who cares."

**Transformed**: "I have a need to feel like we are a team at home, with both of us contributing to our shared space."

### Emotional Pattern

**Original**: "Every time we fight, they just shut down. It is infuriating. They are such a coward."

**Transformed**: "When conflict arises, I feel alone and scared when connection breaks down. I need to feel like we can stay connected even when things are hard."

### Boundary

**Original**: "I can not keep being the one who always apologizes first. They need to take responsibility for once."

**Transformed**: "I need acknowledgment when I have been hurt before I can move forward. Feeling heard in my pain is important to me."

## Quality Checks

The transformation should pass these checks:

1. **Truth preservation**: Does it still represent what the user meant?
2. **Heat removal**: Is it safe for partner to read without triggering defensiveness?
3. **Need visibility**: Is the underlying need clear?
4. **First person**: Is it framed as "I" statements?
5. **Readability**: Would the user recognize this as their experience?

## User Review

After transformation, present to user:

```
Before I share this with {{partner_name}}, here is how I would express it:

"{{transformed_content}}"

Does this capture what you meant? You can edit this before sharing.
```

## Related

- [Consensual Bridge Mechanism](../../mechanisms/consensual-bridge.md)
- [Consent API](../api/consent.md)
- [Stage 2 API](../api/stage-2.md)

---

[Back to Prompts](./index.md)
