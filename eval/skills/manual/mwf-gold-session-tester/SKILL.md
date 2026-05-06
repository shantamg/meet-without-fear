---
name: mwf-gold-session-tester
description: Drive, triage, and evaluate one side of a Meet Without Fear partner-session playthrough inside the Codex Desktop in-app browser. Use when Codex is asked to act as one MWF participant, play one golden-standard character such as Adam, Eve, James, or Catherine, continue a localhost session, diagnose broken waiting or stage states, inspect MWF Postgres/Prisma data, compare app behavior to golden transcripts, maintain a scratch issue log during live testing, or propose/fix prompt, UI, or state-machine bugs found during live MWF testing.
---

# MWF Gold Session Tester

## Purpose

Use this skill to act as one MWF participant and QA engineer at the same time. Drive one side of the session naturally inside the Codex Desktop in-app browser, detect broken product states, inspect DB/code when needed, and evaluate whether the flow matches the golden intent.

Do not treat golden transcripts as scripts. Treat them as benchmarks for effect and process fidelity: listening depth, consent, user agency, needs clarity, boundary honoring, non-agreement grace, and Tending behavior.

Default browser surface: use the Codex Desktop in-app browser through the Browser Use plugin. Do not open external Chrome, system Chrome, or a separate Playwright browser from this skill. If a browser tool offers both an in-app browser backend and an external Chrome backend, choose the in-app browser backend. This skill is scoped to playing one assigned character in one in-app browser. If the user wants both partners played by Codex, recommend a second Codex session for the other partner.

Default action policy: once the user assigns you a gold character, keep driving that character for as long as the UI provides a legitimate action for that same character. Do not ask for extra confirmation before clicking assigned-character share, validate, continue, review, confirm, skip, decline, or milestone CTAs in a local/E2E gold-session test. Those actions are part of operating the assigned side. Stop only when the next action belongs to the partner, the UI is genuinely blocked, the action would leave local/E2E test context, or the visible content would unexpectedly expose sensitive/private data outside the assigned role.

Default note policy: once the assigned role and session id are known, create or update a scratch issue log for this side of the run. Do this quietly as part of the playthrough; do not wait until the final report. The scratch log preserves evidence for later synthesis by `mwf-gold-session-reporter`.

## Minimal Invocation

Support short prompts. If the user says only:

```text
Use mwf-gold-session-tester as James.
```

infer these defaults:

- Use the current Codex Desktop in-app browser/session if one is open.
- Play only the named character.
- Discover the golden scenario that contains that character from `docs/product/source-material/golden-transcripts/README.md` and the transcript files. For bundled examples, Adam/Eve maps to the Adam/Eve benchmark and James/Catherine maps to the James/Catherine benchmark, but newly added gold sets must be inferred from their own transcripts.
- Read `references/gold-personas.md` and the relevant golden transcript.
- Extract a private gold persona model before acting: voice, tone, sentiment, default posture, defensive style, core self-protection, relational stance, non-concessions, consent/agreement boundaries, and stage-specific behavior.
- Improvise from the persona and story constraints; do not copy transcript wording.
- Continue until blocked, completed, or a serious bug appears.
- Check DB state when UI state seems suspicious.
- Maintain a scratch issue log as issues appear.
- Report prompt, UI, backend, realtime, privacy, or state-machine bugs with evidence and likely fix locations.
- If partner action is needed and there is no legitimate assigned-user action available, report what the partner must do. Do not wait by default when the assigned user's side has an available way to keep moving, such as an assigned-user CTA, share/validate/review/confirm button, optional skip/decline, refresh, status re-check, or safe local/E2E API action for the assigned user.

If the user invokes this skill without naming a character or otherwise making the role obvious from the browser/session, ask before driving:

```text
Which gold character or scenario should I play?
```

If a character is known but the in-app browser is blank or has no MWF session, default to opening or creating a no-Clerk local session for that character's golden scenario when the bundled script supports that character. First check whether the local E2E-mode backend/app are available. Prefer the dedicated E2E web bundle on `localhost:8082`; do not trust E2E query params on a normal `8081` bundle. If the E2E app is not available, report the exact missing server/env rather than asking for a URL. If the character comes from a newly added gold set that the script does not support yet, report that the transcript can be evaluated but local session seeding needs fixture/script support.

For that blank-browser no-Clerk path, do not search the repo first. Use the bundled script:

```bash
/Users/shantam/.codex/skills/mwf-gold-session-tester/scripts/create_gold_session.sh James
```

Replace `James` with another script-supported gold character as needed. The script probes backend/E2E auth, requires the E2E app on `8082`, seeds both users, creates/accepts the invitation, and prints `ASSIGNED_URL`. Open `ASSIGNED_URL` in the Codex in-app browser and drive only that character.

Only ask for a session URL when:

- the user explicitly wants an existing non-E2E session,
- local no-Clerk/E2E mode is unavailable and you cannot start it,
- or the current browser state is ambiguous enough that creating a new session may discard useful user work.

Other valid short prompts:

```text
Use mwf-gold-session-tester as Catherine on the current session.
Use mwf-gold-session-tester as Eve; open a no-Clerk session.
Use mwf-gold-session-tester as Adam and continue.
```

## Core References

In the `meet-without-fear` repo, read these when evaluating gold alignment:

- `docs/product/source-material/golden-transcripts/README.md`
- `docs/product/source-material/golden-transcripts/adam-eve.md`
- `docs/product/source-material/golden-transcripts/james-catherine.md`
- Any new transcript in `docs/product/source-material/golden-transcripts/` that contains the assigned character or requested scenario.
- `docs/product/source-material/golden-transcripts/core-protocol-update.md`
- `docs/product/gold-flow-eval-harness-spec.md`
- `docs/product/stage-3-golden-alignment-plan.md`
- `docs/product/stage-3-golden-alignment-audit.md`
- `docs/product/gold-flow-next-session-plan.md`

Read bundled references only as needed:

- `references/browser-driving.md` for in-app browser control and session-driving gotchas.
- `references/e2e-auth-bypass.md` for logging this one browser in without Clerk.
- `references/gold-personas.md` for using Adam/Eve or James/Catherine as test stories and personas.
- `references/db-triage.md` for Prisma/Postgres checks and useful session queries.
- `references/gold-evaluation.md` for rubric, bug categories, and fix framing.

Bundled scripts:

- `scripts/create_gold_session.sh <Adam|Eve|James|Catherine>` creates a local no-Clerk gold scenario session and prints the assigned character URL.

## Scratch Issue Log

Create the scratch log after you know the session id and assigned character. Use one file per Codex side. Normalize the character name to lowercase in the filename so partner sessions do not collide or create casing variants. Use this path in the `meet-without-fear` repo:

```text
docs/product/gold-session-scratch/<YYYY-MM-DD>-<session-id>-<lowercase-character>.md
```

Examples:

```text
docs/product/gold-session-scratch/2026-05-05-cmoru5afm000bpxj2e3coa3ij-adam.md
docs/product/gold-session-scratch/2026-05-05-cmoru5afm000bpxj2e3coa3ij-eve.md
```

If the directory does not exist, create it. If the file does not exist, initialize it with:

```md
# Gold Session Scratch Log

Date: <YYYY-MM-DD>
Session ID: `<session-id>`
Assigned side: <character>
Scenario: <Adam/Eve or James/Catherine>
Browser URL: `<current assigned URL>`

## Timeline

## Findings
```

Append short notes during the run whenever an issue, suspected issue, state contradiction, DB check, or gold-alignment observation appears. Keep entries concise and evidence-oriented:

```md
### <short title>

- Stage: <stage header or number>
- Type: <prompt | UI | backend state | realtime | privacy | eval coverage | gold alignment>
- Status: <suspected | confirmed | contradicted | resolved during run>
- What happened: <one to three sentences>
- Evidence: <DOM text, DB gates, URL, code path, or command summary>
- Expected: <gold-aligned or state-machine expectation>
- Likely fix: <paths if known>
```

Do not over-log every normal turn. Log only items that may matter in the final report. If you later learn a suspected issue was not real, append a correction entry rather than deleting the note. Use `apply_patch` for manual scratch-log edits.

For gold-alignment observations, note the expected beat and whether the live flow passed, partially met, failed, or was blocked. Example:

```md
### Stage 2 Adam perspective stretch reached Eve's aliveness need

- Stage: Walking in Their Shoes
- Type: gold alignment
- Status: confirmed
- Expected beat: Adam moves from "nothing is enough" toward seeing Eve as needing aliveness, visibility, and an open future.
- Live evidence: Adam named that Eve may feel trapped in a life that fits him better and may need a future not only about preservation.
- Rating: Pass
```

At the end of a run, tell the user the scratch log path and suggest using `mwf-gold-session-reporter` to turn it into the final report.

## Operating Loop

1. Establish current state:
   - Current URL, current user/persona, partner, stage header, latest MWF message, visible CTAs, whether chat input is visible.
   - Prefer DOM snapshots for text state; screenshots only when visual layout, cards, modals, or stuck UI matters.
   - If the user asks to avoid Clerk, read `references/e2e-auth-bypass.md` before opening the in-app browser.
   - If the user already has the Codex in-app browser open, keep using that browser. Do not switch to external Chrome, system Chrome, or a separate Playwright browser unless explicitly requested.

2. Drive as the assigned participant:
   - Respond in-character with plausible emotional continuity.
   - Use the participant's known story, constraints, and previous answers.
   - If the user names a golden scenario, read `references/gold-personas.md` and the relevant golden transcript, infer the character's persona model from the transcript evidence, then improvise from that model without copying transcript wording.
   - Keep the transcript-derived voice, tone, sentiment, defenses, and non-concessions active throughout the run. Choices should emerge from the persona in the live moment, not from a predetermined outcome.
   - Do not make the assigned character more healed, cooperative, insightful, articulate, fair, or repair-oriented than the transcript supports. If the live app pushes beyond the character's behavioral range, respond in the character's voice with their resistance, caveat, refusal, ambivalence, or boundary.
   - Keep responses concise enough for realistic chat, but rich enough to advance the process.
   - Do not click/share/validate on behalf of a real user unless the user explicitly asked you to operate that side.
   - In local/E2E gold-session testing, when the user has assigned you a character, sharing, reviewing, confirming, skipping, declining, continuing, or validating that assigned character's private draft/content is part of operating that side. Do not pause for separate approval before clicking role-appropriate Stage 2/3/4 share, validate, continue, review, confirm, skip/decline, or milestone CTAs, unless the visible content would disclose unexpected sensitive data, operate the partner's side, or leave the local test context.
   - Do not operate the partner side from this skill. If partner action is needed and there is no legitimate assigned-user action available, report what is needed or ask the user/another Codex session to proceed as that partner. If the assigned user's side has a safe way to keep going, use it instead of waiting.

3. Respect flow gates:
   - If the UI is waiting on the partner, do not send filler messages.
   - If a milestone CTA appears and it matches the user's requested role and the stage intent, click it and continue without asking for separate confirmation.
   - If private/shared content boundaries appear, verify consent and role yourself from the assigned character and current local/E2E context; ask the user only if that cannot be determined or something looks unexpectedly sensitive.

4. Triage anomalies immediately:
   - If the UI says both users have done something, verify DB state when that is doubtful.
   - If input is visible while the user should be blocked, note a UI bug.
   - If AI reveals partner-specific needs/context before consent or partner completion, treat as a serious product/state bug.
   - If realtime shows another user's private message, note an isolation/realtime/cache bug and reload only if needed to continue.
   - Add or update a scratch-log finding for confirmed anomalies and important suspected anomalies.

5. Evaluate against gold:
   - Separate prompt-quality issues from product/state issues.
   - Compare the flow's effect to the golden references, not exact wording.
   - Check whether the assigned character stayed faithful to the extracted voice, tone, sentiment, defensive style, relational stance, and behavioral range. If the run became too easy-going, too polished, or too therapeutic, note that as actor drift unless the product clearly earned that exact kind of movement from this persona.
   - Record actionable findings with evidence: screen state, DB state, code path, or transcript excerpt.
   - Preserve those findings in the scratch log before context gets long.

6. Fix when asked:
   - Inspect existing implementation before editing.
   - Keep changes scoped to the failing gate, prompt, UI waiting state, or eval harness issue.
   - Add focused tests when changing stage gates, privacy boundaries, or prompt contracts.

## What To Watch For

High-priority failures:

- Partner needs shown before the partner has confirmed and consented to Stage 3 needs.
- AI-authored common-ground or overlap presented as product truth in Stage 3.
- Private AI messages, empathy drafts, context, needs, or prompts shown to the wrong user.
- Stage advancement before both users satisfy the documented gates.
- Chat input visible when the user is waiting for partner action.
- User-facing copy using internal implementation language such as "internal reconciler."
- The app forcing agreement or repair when the golden no-agreement path should close with dignity.

Useful distinction:

- Prompt bug: tone, over-synthesis, rushing, generic reflection, weak resistance handling.
- Product/state bug: wrong gates, consent leak, stale cache, wrong role data, waiting UI missing, premature stage transition.

## Common MWF Repo Paths

- Backend stage prompts: `backend/src/services/stage-prompts.ts`
- Stage 2 controller and transition: `backend/src/controllers/stage2.ts`
- Stage 3 controller: `backend/src/controllers/stage3.ts`
- Messages controller/orchestrator path: `backend/src/controllers/messages.ts`, `backend/src/services/ai-orchestrator.ts`
- Stage status helpers: `backend/src/services/empathy-status.ts`, `backend/src/utils/stage-resolver.ts`
- Prisma schema: `backend/prisma/schema.prisma`
- Mobile session screen: `mobile/src/screens/UnifiedSessionScreen.tsx`
- Mobile stage hooks: `mobile/src/hooks/useStages.ts`, `mobile/src/hooks/useUnifiedSession.ts`
- Waiting UI helpers: `mobile/src/utils/getWaitingStatus.ts`, `mobile/src/config/waitingStatusConfig.ts`
- E2E two-browser harness for separate automated eval work: `e2e/helpers/two-browser-harness.ts`
- Live two-browser test for separate automated eval work: `e2e/tests/live-ai-two-browser-full-flow.spec.ts`

## Output Style

During playthroughs, keep the user informed with concise updates:

- "I see Stage 3, Jason, latest prompt asks whether he can work with Shantam's needs. I am replying as Jason."
- "This looks blocked on Shantam. I am checking DB before assuming the UI is right."
- "DB contradicts the UI: neither user has `needsShared`; this is a state/flow bug."

When reporting findings, include:

- What happened.
- Expected gold-aligned behavior.
- Evidence.
- Likely fix location.
- Whether it is prompt, UI, backend state, realtime, or eval coverage.
- Scratch log path, if one was created.

For polished final issue reports and partner-session handoff prompts, use the separate `mwf-gold-session-reporter` skill. This tester skill should collect raw evidence while driving; the reporter skill should synthesize it.
