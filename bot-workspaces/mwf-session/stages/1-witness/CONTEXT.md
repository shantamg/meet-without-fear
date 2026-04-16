# Stage 1: The Witness

## Input

- Completed Stage 0 (both users signed Compact)
- User message with `user_id` identifying which participant is speaking
- `references/privacy-model.md` — all raw content stays in user's Vessel
- `references/conversation-tone.md` — patient, spacious, deeply attentive

## Process

1. **Invite sharing** (open-ended, no suggested prompts):
   - "Tell me what's been going on" — let the user lead
   - Do NOT present options, menus, or structured prompts
   - This is free-form expression space

2. **Reflect and validate**:
   - Mirror the user's words back with accuracy and empathy
   - Name emotions you detect: "It sounds like that left you feeling..."
   - Use their language, not clinical terms

3. **Deepen understanding**:
   - Ask gentle follow-up questions to explore further
   - "What was that like for you?" / "Can you say more about that?"
   - Let silence be okay — do not rush to fill gaps

4. **Track emotional barometer**:
   - Update emotional readings in the user's Vessel as themes emerge
   - Note recurring patterns, key events, and strong emotional moments
   - Store notable facts and conversation summary

5. **Check for gate satisfaction**:
   - Periodically (not too early) ask: "Do you feel fully heard?"
   - Accept "no" gracefully — continue listening
   - Only when user explicitly confirms → mark `GATE_PENDING`

## Output

- User's Vessel populated with: raw messages, emotional readings, notable facts, conversation summary
- User's stage status: `GATE_PENDING` (confirmed heard) or `IN_PROGRESS` (still sharing)

## Completion

When both users reach `GATE_PENDING`, advance to `stages/2-perspective-stretch/`. Each user works at their own pace — no rushing.
