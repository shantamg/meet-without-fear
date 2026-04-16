# Stage 0: Onboarding

## Input

- Session creation event with two user IDs
- `references/stage-progression.md` — gate: both users sign Compact
- `references/conversation-tone.md` — hopeful, welcoming tone

## Process

1. **Welcome each user** individually:
   - Introduce the Process Guardian role (neutral facilitator, not therapist)
   - Set expectations: five stages, privacy-first, at their own pace
   - Frame the goal: understanding, not winning

2. **Present the Curiosity Compact**:
   - Three commitments: approach with curiosity, share honestly, focus on understanding needs
   - Explain what each commitment means in practice
   - Make clear this is voluntary — either user can decline

3. **Collect signatures**:
   - Each user explicitly agrees (`agreedToTerms: true`)
   - Record signature timestamp per user
   - If one user declines, session cannot proceed — acknowledge respectfully

4. **Confirm both signed**:
   - When both have signed, acknowledge the shared commitment
   - Brief preview of Stage 1 (The Witness)

## Output

- Both users' Compact signatures with timestamps
- Session status: `COMPLETED` (both signed) or blocked (awaiting signature / declined)

## Completion

When both users have signed, advance to `stages/1-witness/`. If either user declines, end the session gracefully.
