# Codex Goal Supplement — Gold-Loop Stage 4 Course Correction

**Read this BEFORE the referenced goal file.** If anything below conflicts
with the original goal, this supplement wins.

Reference goal (one of):

- `docs/product/mwf-truly-autonomous-alignment-goal.md` (most likely)
- `docs/product/mwf-gold-alignment-system-goal.md`

Branch context: `codex/fix-ai-rendering-stage1-verbal-gate`. The previous
loop on this branch ran for ~3 hours doing the wrong thing. This
supplement redirects the work.

---

## What the previous loop did wrong

It overfit `backend/src/services/stage4-capture.service.ts` to two gold
scenarios (`adam-eve`, `james-catherine`) by adding per-utterance regex
carve-outs and proposal-family allowlists keyed on scenario nouns
("adam", "eve", "saturday", "brother", "volunteer shift", etc.). The
file is now ~1245 lines with ~297 string-match operations, and each
new gold scenario will surface new fragments that demand more rules.
That is a dead end.

It also pursued the wrong failure dimension. The most recent
`score.json` on this branch reads:

| dimension                  | score | owner          | status     |
|----------------------------|-------|----------------|------------|
| actor_fidelity             | 4/4   | actor_skill    | pass       |
| mwf_handling               | 4/4   | mwf_prompts    | pass       |
| eval_harness_completion    | 1/4   | eval_harness   | HARD FAIL  |

Verdict: `eval_fail`. The hard fail is **eval_harness_completion** —
Stage 4 transcripts truncate after ~2 user turns (Adam) or 0 user
turns (Eve). No selection submitted, no closure captured, all needs
still OPEN. Tweaking the capture classifier cannot move that gate.

## Permission to revert prior stage-4 capture commits

The following commits on this branch are the regex carve-out chain.
You are explicitly authorized — and encouraged — to revert them
before doing new work. They are not load-bearing.

```
42cf88f1  Tighten stage 4 proposal capture fragments
bb3cd7a2  Filter additional stage 4 capture fragments
59061fe1  Filter live stage 4 steadiness fragments
47076303  Filter slow-down stage 4 fragment
8eb1e648  Filter monthly stage 4 capture fragments
33dc9dfa  Classify stage 4 steadiness captures
3393fcff  Deduplicate stage 4 weekly conversation captures
a717408b  Filter stage 4 pause detail fragments
34bb9bd7  Deduplicate stage 4 volunteer commitments
e0ec17fe  Filter stage 4 need fragments
e74af01f  Filter stage 4 bracing fragments
7a86c171  Classify stage 4 personal time commitments
```

Recommended approach: `git revert` the range as a single commit, or
reset the branch to `c5e3d04a` ("Checkpoint gold-loop stage 3 and 4
fixes") and cherry-pick anything still wanted. Do **not** lose:

- `5f5e19f6` (gitignore for generated gold-loop artifacts) — keep.
- `7247c1c1` ("Measure needs drawer host height") — unrelated mobile
  fix, keep.
- `c5e3d04a` and earlier — keep as the working base.

If you find that 1–2 of the reverted regex commits actually
addressed a *non-scenario-specific* fragment-classification bug (i.e.
the rule does not mention names, days of the week, or other gold-set
nouns), you may cherry-pick those individually with justification in
the commit message. Default is to drop them all.

## Real blocker — diagnose before fixing

Before writing any code, do this:

1. Read the most recent run under
   `eval/runs/*adam-eve-iter*/` and `eval/runs/*james-catherine-iter*/`,
   specifically:
   - `transcripts/{adam,eve}-stage4.md`
   - `run.json`
   - `invariants.json`
   - `score.json`

2. Determine whether Stage 4 truncation is:
   - **(a) actor-side** — the actor LLMs (Codex/Claude playing
     Adam/Eve) stop producing turns after the AI's first Stage 4
     prompt.
   - **(b) MWF-side** — the app fails to advance Stage 4 (no
     proposal selection prompt rendered, no closure CTA, state stuck,
     turns dropped).
   - **(c) harness-side** — turns exist in raw run output but the
     transcript extractor or stop-condition cuts them off.

3. State the diagnosis in your first commit message after the revert.
   The fix lives wherever (a/b/c) actually is. Do not start fixing
   before naming which one.

## Hard constraints

- **Do NOT add per-utterance regex rules**, blacklist
  `if (/^...\b/.test(normalized)) return false;` lines, or
  proposal-family allowlists keyed on scenario-specific nouns to
  `backend/src/services/stage4-capture.service.ts` or its test file.
  Treat any addition there as a code smell that needs explicit
  justification in the commit body.

- If a proposal is misclassified (kind/ownership wrong, e.g. an
  individual proposal labeled "shared"), **fix it upstream**: change
  the LLM extraction prompt or the structured-output schema so the
  LLM emits `kind: INDIVIDUAL | SHARED` and `ownerUserId` directly.
  Do not post-hoc regex-classify free text the LLM has already
  laundered the ownership marker out of.

- **Every change must be validated against BOTH `adam-eve` and
  `james-catherine` in the same iter.** A change that improves one
  and regresses the other does not land. Run both before each commit.

- Do not commit generated `eval/runs/` artifacts.

- Run `npm run check` and `npm run test` before each commit, per
  `CLAUDE.md`.

## Budget

Hard cap: **20 iterations or 4 hours**, whichever comes first. If
neither gold scenario reaches `verdict: eval_pass` (or at least
`eval_harness_completion: pass`) by then, stop and write a one-page
diagnostic at `.planning/stage4-loop-diagnostic.md` covering:

- Which truncation cause (a/b/c) was confirmed.
- What was tried, what moved the needle, what didn't.
- A recommended next step for a human to take.

Do not grind past the cap.

## Definition of done

1. Both `adam-eve` and `james-catherine` produce Stage 4 transcripts
   that include user turns through proposal selection AND closure
   capture.

2. `invariants.json` shows
   `transcript_side_stage_complete: pass` and
   `stage4_score_critical_content_transcribed: pass` for both
   scenarios.

3. No new per-utterance regex carve-outs in
   `stage4-capture.service.ts`.

4. `npm run check` and `npm run test` pass across all workspaces.

5. The branch is in a state where the original goal's loop can
   resume normal autonomous operation against it without further
   manual intervention.
