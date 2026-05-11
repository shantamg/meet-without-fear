# MWF Context Architecture Restart Goal

Start from latest `main` after PR #552 merges. Do not resume the old context branch.

## Objective

Improve MWF prompt context architecture without weakening product gates.

The AI should receive better current-user history, topic frame, partner/share state, prior-stage context, and durable facts, but it must not use chat narration as a substitute for StageProgress, feel-heard, empathy draft/share/reveal, or validation state.

## Hard Rules

- Do not use Darryl/Shantam as a gold target or prompt-tuning reference.
- Validate only Adam/Eve and James/Catherine unless a human-approved new gold transcript is added.
- Stage 1 advances only through the feel-heard mechanism.
- Stage 2 uses the empathy draft/share/reveal/validation lifecycle.
- Message `stage`, `StageProgress`, and visible stage label must agree.
- If the AI says “next step” while backend state stays behind, treat that as a blocker.

## Work Order

1. Verify clean baseline on Adam/Eve to Stage 2.
2. Add regression coverage for the stuck-Stage-0 failure:
   - no transcript score pass when messages stay `stage=0` while the chat claims Stage 1/2,
   - gold-loop must inspect DB stage state, not just visible transcript text.
3. Reintroduce context improvements incrementally:
   - full current-user stage history,
   - topic frame,
   - consented partner/share state,
   - prior-stage summaries,
   - durable process facts only if typed/auditable and never gate-replacing.
4. After each increment, run focused tests and Adam/Eve DB verification.
5. Run James/Catherine only after Adam/Eve state/gates are clean.

## Done

- Adam/Eve and James/Catherine pass using real product gates.
- `StageProgress`, `Message.stage`, and visible stage labels align.
- No hidden thinking/control text leaks.
- No Darryl/Shantam eval target or tuning remains.
- Progress doc records commits, checks, run dirs, DB verification, and residual risks.
