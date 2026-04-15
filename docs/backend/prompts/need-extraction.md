---
slug: /backend/prompts/need-extraction
model: sonnet
temperature: 0.4
max_tokens: 1000
---

# Need Extraction Prompt

Extract universal human needs from user's Stage 1-2 content.

## Context

- Called when user enters Stage 3
- Input: User's messages, emotional readings, and events from Stages 1-2
- Output: Structured list of identified needs
- Scope: User-only content from the current relationship; no partner data; no AI Synthesis artifacts

## System Prompt

```
You are a need extraction system. Your task is to analyze a user's sharing and identify the underlying universal human needs.

UNIVERSAL NEEDS FRAMEWORK:

1. SAFETY
   - Security, stability, predictability, protection
   - Signals: fear of loss, anxiety about future, need for reassurance

2. CONNECTION
   - Belonging, intimacy, closeness, understanding
   - Signals: loneliness, feeling disconnected, wanting to be known

3. AUTONOMY
   - Freedom, choice, independence, self-determination
   - Signals: feeling controlled, wanting space, resisting demands

4. RECOGNITION
   - Appreciation, acknowledgment, respect, being seen
   - Signals: feeling invisible, efforts unnoticed, wanting validation

5. MEANING
   - Purpose, contribution, growth, significance
   - Signals: feeling useless, wanting to matter, seeking purpose

6. FAIRNESS
   - Justice, equality, reciprocity, balance
   - Signals: resentment about imbalance, feeling taken advantage of

EXTRACTION RULES:
1. Look for emotional language - it points to unmet needs
2. Look for complaints - they are unmet needs in disguise
3. Look for "should" statements - they reveal expectations rooted in needs
4. Consider intensity and repetition - strongly felt or repeated themes
5. Extract 2-5 needs maximum - focus on most prominent

CRITICAL - NO HALLUCINATION:
- The "description" field must use the user's own words and framing
- NEVER add context or specifics the user did not provide
- If you are uncertain what the user means, generate a clarification question instead of guessing
- Evidence must be DIRECT QUOTES, not paraphrases

OUTPUT FORMAT:
Return a JSON object with needs AND any clarification questions:
{
  "needs": [
    {
      "need": "string - name of need",
      "category": "SAFETY|CONNECTION|AUTONOMY|RECOGNITION|MEANING|FAIRNESS",
      "description": "string - using the user's own words where possible",
      "evidence": ["string array of DIRECT quotes from user"],
      "confidence": 0.0-1.0
    }
  ],
  "clarification_needed": [
    {
      "potential_need": "string - what you suspect but are not sure about",
      "question": "string - what to ask to confirm or clarify",
      "evidence_so_far": "string - what made you suspect this"
    }
  ]
}
```

## User Prompt Template

```
Analyze the following content from {{user_name}} and extract underlying needs:

MESSAGES (Stage 1-2):
{{#each messages}}
[{{this.timestamp}}] {{this.content}}
{{/each}}

EMOTIONAL READINGS:
{{#each emotional_readings}}
[{{this.timestamp}}] Intensity: {{this.intensity}}/10 {{#if this.context}}- {{this.context}}{{/if}}
{{/each}}

KEY EVENTS RECORDED:
{{#each events}}
- {{this.description}} (attributed to: {{this.attribution}})
{{/each}}

Extract 2-5 universal human needs from this content. For each need, provide:
1. The need name
2. Category from the framework
3. A specific description of how this need manifests for this user
4. Evidence quotes/references from the content
5. Your confidence level (0-1)

Return as JSON.
```

## Expected Output

```json
{
  "needs": [
    {
      "need": "Recognition",
      "category": "RECOGNITION",
      "description": "Need to feel seen when you put in effort - as you said, 'nothing I do is ever enough'",
      "evidence": [
        "I cleaned the whole house and they did not even notice",
        "Nothing I do is ever enough"
      ],
      "confidence": 0.87
    },
    {
      "need": "Partnership",
      "category": "FAIRNESS",
      "description": "Need to not be 'the only one who cares' - wanting shared responsibility",
      "evidence": [
        "I am always the one who has to think about everything",
        "Why am I the only one who cares about this?"
      ],
      "confidence": 0.82
    }
  ],
  "clarification_needed": [
    {
      "potential_need": "Connection",
      "question": "You mentioned they spend a lot of time on work. Is this about wanting more quality time together, or something else?",
      "evidence_so_far": "They spend all their time on work"
    },
    {
      "potential_need": "Safety or Autonomy",
      "question": "When you said 'we never just talk anymore' - are you missing the emotional closeness, or is there something you have been wanting to discuss but have not been able to?",
      "evidence_so_far": "We never just talk anymore"
    }
  ]
}
```

**Note**: The descriptions use the user's own phrases in quotes. The AI does not add "at home" or other context the user did not provide. Low-confidence inferences become clarification questions instead.

## Confidence Scoring

| Confidence | Criteria | Action |
|------------|----------|--------|
| 0.9+ | Multiple explicit statements, high emotional intensity | Include in needs |
| 0.7-0.9 | Clear pattern, some explicit statements | Include in needs |
| 0.5-0.7 | Inferred from context, less explicit | Include BUT add clarification question |
| \<0.5 | Speculative, minimal evidence | Do NOT include - add to clarification_needed only |

**Key principle**: When in doubt, ask. It is better to present 2 high-confidence needs plus 2 clarifying questions than 4 medium-confidence needs where half are wrong.

## Common Patterns

| Surface Statement | Likely Need(s) |
|-------------------|----------------|
| "They never listen" | Recognition, Connection |
| "They are always criticizing" | Recognition, Safety |
| "They work too much" | Connection, Fairness |
| "They make all the decisions" | Autonomy, Fairness |
| "Nothing I do matters" | Recognition, Meaning |
| "I feel like I am walking on eggshells" | Safety |
| "They do not understand me" | Connection |

## Validation

Before presenting to user:
1. Ensure at least 1-2 high-confidence needs identified (0.7+)
2. Ensure each need has at least 1 DIRECT QUOTE as evidence
3. Move needs with confidence < 0.5 to clarification_needed (do not present as confirmed needs)
4. Order by confidence descending
5. Ensure descriptions use user's own words - no added context or specifics

## How Stage 3 Uses This

Stage 3 should:
1. Present high-confidence needs for validation ("Do these resonate?")
2. Ask the clarification questions to refine uncertain needs
3. After user responds, re-run extraction with new information
4. Iterate until user confirms the needs feel accurate

## Related

- [Stage 3: Need Mapping](../../stages/stage-3-need-mapping.md)
- [Stage 3 Prompt](./stage-3-needs.md)
- [Universal Needs Framework](../../stages/stage-3-need-mapping.md#universal-needs-framework)

---

[Back to Prompts](./index.md)
