---
name: mwf-gold-session-reporter
description: Write final Meet Without Fear gold-session issue reports after one or two Codex browser playthroughs. Use when asked to document what happened in a gold session, synthesize scratch logs, compare against previous gold-session reports, inspect MWF DB state, assess live conversation flow against gold-standard transcripts, create a new docs/product issue handoff file, append one side of a report, or output a prompt for the other Codex session to fill in its side.
---

# MWF Gold Session Reporter

## Purpose

Use this skill after or near the end of a Meet Without Fear gold-session playthrough. It turns live-session evidence into a durable report that matches the existing `docs/product/*gold-session*issues*.md` style.

This skill is for synthesis and handoff, not for driving the browser. If the user wants you to keep playing Adam, Eve, James, or Catherine, use `mwf-gold-session-tester` instead.

## Inputs To Gather

Prefer available local evidence over memory:

- Current browser URL and assigned side, if the in-app browser is available.
- Session id and both E2E user ids/emails.
- Scratch logs under `docs/product/gold-session-scratch/`, especially files matching the session id and lowercase side name, e.g. `<date>-<session-id>-adam.md`.
- Prior reports:
  - `docs/product/adam-eve-gold-session-issues.md`
  - `docs/product/james-catherine-gold-session-issues.md`
  - `docs/product/james-catherine-gold-session-bug-handoff-2026-05-04.md`
- Planning/spec context as relevant:
  - `docs/product/gold-flow-next-session-plan.md`
  - `docs/product/stage-3-golden-alignment-plan.md`
  - `docs/product/stage-4-tending-technical-spec.md`
  - `docs/product/gold-flow-eval-harness-spec.md`
- Gold alignment rubric:
  - `references/gold-alignment-rubric.md`
- DB state for stage progress, gates, needs, strategies, rankings, recent messages, and session status.

For DB queries, use the safe Prisma pattern from:

```text
eval/skills/mwf-gold-session-tester/references/db-triage.md
```

## Report Location

Create final reports in `docs/product/` with a descriptive dated filename, for example:

```text
docs/product/adam-eve-gold-session-stage4-issues-2026-05-05.md
docs/product/james-catherine-gold-session-stage3-issues-2026-05-05.md
```

If the user asks to append to an existing report, preserve existing content and add only the requested side or section.

## Workflow

1. Identify scenario and side:
   - Adam/Eve -> successful-resolution benchmark.
   - James/Catherine -> no-shared-agreement benchmark.
   - If the side is unclear, infer from URL/user id if possible; otherwise ask once.

2. Read prior reports and relevant scratch logs:
   - Extract what was fixed or improved.
   - Extract still-open issues.
   - Avoid reporting an old issue as new unless this run newly reproduces it.

3. Query DB state:
   - StageProgress for both users.
   - `gatesSatisfied` for each stage.
   - `IdentifiedNeed` rows and confirmation state.
   - Stage 4 `StrategyProposal`, `StrategyRanking`, agreement/overlap state if relevant.
   - Recent messages only as needed for evidence. Summarize; do not paste long transcripts.

4. Write the assigned side first:
   - Use a section title like `## Adam Side: Invitor` or `## Eve Side: Invitation Acceptor`.
   - Include browser URL, role, partner, and session id.
   - Include `Summary`, `Comparison Against Previous Gold-Run Notes`, `Current DB State At Stop` when DB evidence matters, issue sections, `Gold Standard Alignment Review`, and `Gold Alignment Notes`.
   - Use issue sections with:
     - Type
     - Severity
     - What happened
     - Evidence
     - Expected
     - Impact when useful
     - Likely fix locations
   - For `Gold Standard Alignment Review`, use the rubric reference and add a stage-by-stage table:
     - `Stage`
     - `Expected gold beat`
     - `Live evidence`
     - `Rating`
     - `Notes / fix`

5. Leave room for the other side:
   - Add a partner-side heading and `To be appended by the <side>-side Codex session.`
   - Include the partner direct E2E URL if known.

6. Final response:
   - Link the report file.
   - State whether DB/browser checks were used.
   - Provide a copy/paste prompt for the other Codex session.

## Other-Session Prompt Template

At the end, output a prompt like this, filled with exact values:

```text
Use mwf-gold-session-reporter. Append the <Other Side> section to:
<absolute path to report>

You were driving <Other Character> in session <SESSION_ID>. Use your browser state, any scratch log for this session, and DB evidence to document only your side. Preserve the existing Adam/Eve or James/Catherine section. Compare against prior gold-session reports, note what is fixed vs still open vs new, and include issue evidence plus likely fix locations. Do not rewrite the other side's section.
```

## Style Rules

- Match the existing report style in `docs/product/*gold-session*issues*.md`.
- Be concrete and evidence-led.
- Separate prompt quality, UI, backend state, realtime, privacy, and eval coverage.
- Distinguish usability/state bugs from gold-flow failures. A usable UI can still fail the gold standard.
- Do not overclaim from one side of the run.
- If an issue was suspected but contradicted by DB/browser evidence, say that or omit it.
- Keep long transcript content summarized.
