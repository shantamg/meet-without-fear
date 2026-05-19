# Stages 3 & 4 Rework — Implementation Spec

> **Status: DRAFT.** Companion to `stages-3-4-rework-spec.md` (the product
> conversation). This doc maps that conversation onto the current codebase
> and lays out concrete deltas. Living docs for current behavior live at
> `stage-3-what-matters.md` and `stage-4-strategic-repair.md` in this
> directory.

## How to read this doc

For each area: **Current state** (cited to code) → **Target state** (from
the working spec) → **Delta / work to do**. Decision points where the new
direction conflicts with existing intentional design are flagged as
**⚠ DECISION NEEDED**.

---

## 0. Big-picture findings

1. **Stage 4 is already much more built out than I expected.** The
   "redesigned" flow has data models, controllers, an API surface, and a
   mobile panel. The rework is therefore mostly a **UX/flow re-shaping**
   on top of existing primitives — not a from-scratch rebuild.
2. **One major design tension to resolve up front.** The current Stage 4
   deliberately **hides which partner authored each proposal** (server-side
   shuffle, unlabeled pool — `backend/src/controllers/stage4.ts` +
   `docs/backend/api/stage-4.md:22-23`). The new spec wants the **opposite**:
   the AI explicitly walks the user through "this one is one *you* put up"
   vs options from the other person. This is a deliberate product reversal
   and needs sign-off before implementation. See §3.A.
3. **The 10-day check-in already has a home** — `Agreement.followUpDate`
   exists, and `TendingEntry` is scaffolded for the post-Stage-4 loop. So
   "check-ins" piece is mostly wiring, not new schema.
4. **Stage 5 / tending is out of scope but partially scaffolded** (the
   `TendingEntry` model exists). Good — when we get to that phase we won't
   be starting from zero.

---

## 1. Stage 3 — Identifying needs

### 1.A Edit-the-needs-back-and-forth (priority fix)

**Current state**
- `mobile/src/components/NeedsDrawer.tsx:305-316` — only affordance to
  refine a proposed need is a "Chat to refine" button that closes the
  drawer and dumps the user back into the main chat thread.
- No inline edit, no per-need modal, no "regenerate this one" loop.
- Backend supports per-need adjustment via `POST /sessions/:id/needs/confirm`
  with `adjustments[]` containing `{ needId, confirmed, correction? }`
  (`backend/src/controllers/stage3.ts:312` and `:403-414`) — the
  `correction` field is wired but the mobile UI doesn't drive it.

**Target state** (from working spec §"Stage 3 done")
- User can comfortably iterate on the proposed list: confirm, tweak
  wording, remove, add — without dropping back to freeform chat.
- "Yeah, can we edit that?" → smooth in-UI experience.

**Delta**
- **Mobile (primary work):**
  - Add inline edit affordance on each `NeedCard` inside `NeedsDrawer.tsx`
    (`mobile/src/components/NeedCard.tsx`, `NeedsDrawer.tsx`).
  - Wire that edit to call `useConfirmNeeds` with the `correction` field
    populated (`mobile/src/hooks/useStages.ts:1525`). The backend already
    accepts this — no new endpoint needed.
  - Add "remove" affordance: backend doesn't currently expose a per-need
    delete for confirmed needs (only the bulk replace via `/needs/capture`
    delete-where-`confirmed=false`); we'll need a small backend change
    for removing confirmed needs, or use confirm-with-empty-list semantics.
    Likely cleanest: add `DELETE /sessions/:id/needs/:needId`.
  - Add "add custom need" affordance: backend already supports this via
    `POST /sessions/:id/needs` (`backend/src/routes/stage3.ts`); wire it
    into the drawer.
  - **Cache-First rule:** edits should `setQueryData` on
    `stageKeys.needs(sessionId)` optimistically per CLAUDE.md state rules.
    No `invalidateQueries` during in-flight edits.
- **Backend:**
  - Add `DELETE /sessions/:id/needs/:needId` (or similar) for confirmed-need
    removal. Enforce: caller is current user, need belongs to caller's
    vessel, stage == 3, gate `needsShared` not yet set (don't allow
    removing after consent).

**Risk**
- The bulk `/needs/capture` flow deletes all unconfirmed needs every time
  the AI re-emits a `<needs>` block (`backend/src/services/needs.ts:67-75`).
  If a user is mid-edit and the AI re-captures, their work could be
  wiped. Need a guard: don't auto-capture while user has the drawer open
  in edit mode, OR merge instead of replace once any need is confirmed.

### 1.B Universal / NVC reframing (separate need from strategy)

**Current state**
- The prompt **tells** the model to do this
  (`backend/src/services/stage-prompts.ts:866-909`, REDIRECTING mode plus
  "'I need them to stop yelling' is a position. 'I need to feel safe' is
  a need." at `:886`).
- Living doc `docs/backend/prompts/stage-3-needs.md:61-65` has a
  "REFRAMING TECHNIQUE" table with examples.
- There is **no code-level detection** of blame-shaped or strategy-shaped
  needs. The existing `backend/src/services/attacking-language.ts` is
  Stage 2 only.
- Net result the user describes: "right now it's pulling [needs] out and
  still very much having a bunch of blame on the other person."

**Target state** (working spec §"Stage 3 — what's broken / what to fix #2")
- Needs always end up framed in universal, self-referential terms.
- Strategy belongs to Stage 4. Stage 3 is need-only.

**Delta** — two layers, both useful:
1. **Prompt-side (cheaper, ships first):**
   - Strengthen REDIRECTING mode in `buildStage3Prompt()`
     (`backend/src/services/stage-prompts.ts:866-909`) with more concrete
     reframing examples and a stronger rule that needs in the `<needs>`
     block must not reference the other person's actions.
   - Add a self-check step inside the prompt: before emitting a `<needs>`
     block, the model should verify each need is universal. If any
     references the other person, re-phrase or stay in DEEPENING mode.
   - Be mindful of cache breakpoint: Stage 3 static block is 1,219 tokens,
     only ~195 tokens above the 1,024-token Bedrock cache threshold
     (`docs/backend/prompt-caching.md:143-155`). Don't bloat the static
     block uncontrollably; if the new guidance is long, see if any
     existing redundant content can be tightened. Test cache reads after
     changes (`cache_read_input_tokens`).
2. **Code-side validator (catches misses):**
   - Add a `validateNeedIsUniversal(need: string): { ok, reason? }`
     check in `backend/src/services/needs.ts`, run during
     `captureProposedNeedsForUser()` (`:59-131`). Heuristic v1: flag if
     the need contains second-person pronouns referencing the partner
     ("he/she/they/him/her/them" + partner-name), or modal-negative
     patterns ("stop", "not", "doesn't").
   - On flag: either reject the capture and ask the AI to retry (cleaner
     but adds latency), or capture but mark with a `needsReframing:
     true` annotation surfaced in the UI so the user can edit.
   - Decision needed: reject-and-retry vs. capture-and-surface. **Lean
     toward capture-and-surface** so users aren't stuck in a loop.

⚠ **DECISION NEEDED:** how aggressive should reframing be?
   - Option A: model rephrases silently into universal form.
   - Option B: model asks "I notice this is phrased around what they do.
     What's the underlying thing you need?" — and *the user* picks the
     reframe.
   - Working spec leans B (it's the NVC-true move). Either way the
     validator catches misses.

### 1.C Stage 3 "done" / send

**Current state**
- "Send" is a two-step gate: `needsConfirmed` (via `/needs/confirm`) then
  `needsShared` (via `/needs/consent`)
  (`backend/src/controllers/stage3.ts:312, 476`).
- Mobile triggers both via `useConfirmNeeds` then `useConsentShareNeeds`
  (`mobile/src/hooks/useStages.ts:1525, 1616`).
- Partner is notified via `partner.needs_shared` event; when both have
  shared, `session.needs_reveal_ready` fires
  (`backend/src/controllers/stage3.ts:611, 620`).

**Target state**
- "Boom, I send my needs" — should feel like one decisive action after
  the edit loop is comfortable.

**Delta**
- Possibly collapse the confirm + consent steps into a single "Send my
  needs" UX moment, while keeping the two backend gates as the
  underlying mechanism. The intermediate "you've confirmed but not
  shared" state isn't doing useful UX work today.
- If we keep them separate, make the second step (share) more affirming
  — "Send these to [partner]" as a clear send action.

---

## 2. Stage 3 → Stage 4 boundary (largely unchanged)

**Current state** — already aligned with the working spec:
- Partner-A's needs become visible to partner-B only after both call
  `/needs/consent` (`backend/src/controllers/stage3.ts:611-620`).
- Stage 4 only starts after **both** partners validate the revealed
  needs (`backend/src/controllers/stage3.ts:668-880`, dual validation
  block at `:774`).
- Sessions advance partners independently through Stages 0–3; Stage 4
  requires both to have completed Stage 3
  (`backend/src/controllers/sessions.ts:652-681`).

**Delta:** none for now. Boundary semantics are right; the work is in
what happens *inside* Stage 4.

---

## 3. Stage 4 — Working toward agreements

This is the bigger rework. Existing primitives are mostly there; the
delta is **flow shape + authorship surfacing + AI option generation**.

### 3.A Authorship: "this one is one YOU put up" ⚠

**Current state — deliberately the opposite of the spec**
- Proposals are stored with `StrategyProposal.createdByUserId`
  (`backend/prisma/schema.prisma:730-770`) so authorship is tracked in
  the DB.
- **But** the API server-shuffles proposals before returning them and
  treats the pool as unlabeled (`docs/backend/api/stage-4.md:22-23`).
- The Stage 4 prompt explicitly instructs the AI: "never reveal source"
  (`docs/backend/prompts/stage-4-repair.md:20-71`).
- This is intentional — the design hypothesis was that hiding authorship
  reduces tribal/reactive responses ("if it's their idea I hate it").

**Target state (working spec)**
- Opposite: the AI explicitly names authorship — "this one is one *you*
  put up, do you want to go ahead and read it?" The user is anchored on
  their own contributions first.

⚠ **DECISION NEEDED — this is a real product fork.**
- **Option A (working spec as written):** surface authorship; walk
  user-authored options first, then partner-authored, with explicit
  labeling.
- **Option B:** keep the unlabeled pool but reshape the conversational
  flow around user-needs-first / partner-needs-second (the *ordering*
  change in §3.B), without exposing authorship.
- **Option C (hybrid):** keep authorship hidden in the inventory view,
  but the AI privately knows authorship and surfaces it conversationally
  ("there's an option here you put up earlier — want to read it?").

Implementation difficulty is similar across A/B/C; the question is
purely product. **Working spec leans A.** Confirm with Shantam before
building.

### 3.B One need at a time, user's needs first

**Current state**
- The Stage 4 prompt says "Name one need at a time"
  (`backend/src/services/stage-prompts.ts:967-1029`, ORIENTING mode).
- But the mobile UI shows **everything at once**: the
  `Stage4RedesignPanel` (`mobile/src/components/Stage4RedesignPanel.tsx`,
  678 lines) renders the entire proposal inventory + needs coverage in
  one scrollable panel.
- No notion of "we're currently working on need #1; need #2 is next."

**Target state**
- AI walks user through their own needs **one at a time**: present
  options for need 1 → user reacts → confirm peace or want more → next
  need.
- Switch to other person's needs only after user's needs are walked.

**Delta** — substantial UI rework + backend state addition:
- **Backend:**
  - Add a notion of "current focused need" per user in Stage 4. Two
    options:
    1. **Stateless / derived:** compute "next need to walk" from
       coverage + selections each request.
    2. **Stateful:** add `Stage4WalkthroughState` (or extend
       `StageProgress.gatesSatisfied` JSON) tracking
       `{ phase: "MY_NEEDS" | "PARTNER_NEEDS", currentNeedId,
       walkedNeedIds[] }`.
  - Lean stateful — it lets the user pause and resume and lets the AI
    reliably anchor "we're on need #2 right now."
  - Coverage table `Stage4NeedCoverage`
    (`backend/prisma/schema.prisma:910-925`) is already there to feed
    "what's left to walk through."
- **Mobile:**
  - Restructure `Stage4RedesignPanel` from "all at once panel" to a
    **stepper / focused view** showing one need + its options at a time,
    with a "you're on 1 of 3" indicator.
  - Keep an "expand to see all" affordance for users who want it (per
    working spec: "you can check on your list of things while
    working"). Default view is focused.
  - New cache key: `stageKeys.stage4Walkthrough(sessionId)` or include
    walkthrough state in `stageKeys.stage4(sessionId)` response.
- **Prompt:**
  - Stage 4 prompt gains awareness of `currentNeedId` and walks
    accordingly. Dynamic block (uncached, cheap to change per turn)
    injects "current need = X" each turn.

### 3.C Per-need options handled three ways

The walk for the user's own needs splits options into:

1. **Options the user themselves proposed.**
2. **Options the partner proposed.** (Subject to §3.A decision.)
3. **No options on either side** — AI offers to generate some, or user
   can skip.

**Current state**
- (1) and (2) both exist as `StrategyProposal` rows with
  `createdByUserId`. The data is there — surfacing is the gap.
- (3): `POST /strategies/suggest` is a **placeholder returning empty**
  (`docs/backend/api/stage-4.md:562-599`). No AI option generation
  currently works.

**Delta**
- **AI option generation (real, not placeholder):**
  - Implement `POST /sessions/:id/stage4/proposals/suggest` (or whatever
    name aligns) — takes `{ needId, count: 1-3 }`, calls the model with
    Stage 4 prompt biased to "propose options for this need," returns
    structured proposals.
  - Retrieval contract: confirmed needs + Global Micro-Experiments
    Library only; **never** user memory
    (`docs/backend/state-machine/retrieval-contracts.md:401-455`). The
    validator `validateStage4Retrieval()` is already there to enforce.
  - Persistence: created with `source = AI_SUGGESTED` and
    `createdByUserId = null` (or a sentinel) so we can distinguish
    AI-generated from user-authored. Schema already supports `source`
    (`StrategyProposal.source` in `schema.prisma:730-770`).
  - UX hook: when the walkthrough hits a need with zero proposals, AI
    asks "Want me to suggest some, or leave this for later?"
- **Per-option commit / "feel at peace":**
  - The Stage4ProposalSelection model
    (`backend/prisma/schema.prisma:784-804`) already stores
    WILLING/NOT_WILLING per user per proposal. Wire the per-need
    walkthrough UI to call `POST /stage4/proposals/:id/selection` as the
    user reacts.
  - Add a per-need "I feel at peace, this is enough" affordance — at
    minimum stored as `StageProgress.gatesSatisfied.peaceByNeedId[]` or
    a small new table. Tells the AI "stop offering more options for
    this one."

### 3.D Switch to the partner's needs — three buckets

After user's own needs are walked, AI moves to partner's needs and
splits them into:

1. **Things only the partner does** — explained to the user, not asked
   to commit. (Read-only context.)
2. **Shared things you could do together** — ask user to commit.
3. **Things the user already suggested for the partner's need** —
   played back: "you said you'd do this — still willing?"

**Current state**
- Schema already supports this split:
  - `StrategyProposal.kind` is `SHARED_PROPOSAL | INDIVIDUAL_COMMITMENT`
    (`schema.prisma:730-770`).
  - `INDIVIDUAL_COMMITMENT` + `createdByUserId == partnerId` → bucket 1.
  - `SHARED_PROPOSAL` linked to one of partner's needs → bucket 2.
  - Proposals with `createdByUserId == currentUserId` linked to
    partner's needs → bucket 3.
- But there's no UI or AI logic that splits and presents them this way.

**Delta**
- Backend: extend `GET /sessions/:id/stage4` response (or the
  walkthrough state endpoint) to expose this split per partner-need.
- Prompt: Stage 4 prompt gains explicit handling — "for partner-need X,
  here are bucket 1 / 2 / 3, narrate accordingly."
- Mobile: walkthrough UI shows the three buckets clearly when on a
  partner-need.

### 3.E Final summary + "feasible / measurable / checkable"

**Current state**
- A summary is produced at close-time via `POST /stage4/close`
  (`backend/src/controllers/stage4.ts:865-1131`), creating
  `Agreement` rows and `Stage4Closure`.
- The Stage 4 prompt has the quality bar in text ("specific,
  time-bounded, reversible, measurable" —
  `backend/src/services/stage-prompts.ts:987-990`).
- But the quality bar is **not enforced** anywhere in code or schema
  — proposals don't have to be measurable to become Agreements.
- `Agreement.followUpDate` exists for the check-in cadence
  (`schema.prisma:39-63`). **The 10-day check-in already has a home.**

**Target state**
- Before declaring agreements final, AI explicitly checks:
  - What did they commit to?
  - Is it feasible?
  - Is it measurable / checkable?

**Delta**
- **AI-side (prompt + structured check):**
  - Add an explicit "agreement quality review" pass to Stage 4 just
    before close. Either:
    - A new conversational mode `REVIEWING` in
      `buildStage4Prompt()` that walks each pending agreement: "this
      one says X — how will you know it happened?"
    - Or a structured check after `POST /stage4/close` is requested:
      block close if any agreement lacks a `measureOfSuccess`, ask AI
      to surface the gap.
  - Lean towards the prompt-side conversational mode — fits the
    "user is part of building it" principle.
- **Schema:** `measureOfSuccess` and `duration` already exist on
  `StrategyProposal`. We could make them required on any proposal
  becoming an Agreement (validation at `POST /stage4/close`).
- **Mobile:** add a "final summary" review screen before close that
  shows each agreement + its measure-of-success + check-in date in a
  co-built feel.

### 3.F The 10-day check-in piece

**Current state**
- `Agreement.followUpDate` exists. `TendingEntry` model exists for the
  post-close check-in loop.
- `POST /stage4/close` accepts a `checkInDate`
  (`docs/backend/api/stage-4.md:167-215`) and schedules `TendingEntry`
  rows.
- Mobile already collects a check-in date in the close controls inside
  `Stage4RedesignPanel.tsx`.

**Target state**
- The check-in is a first-class part of the summary the user co-builds
  — not a buried field on the close screen.

**Delta**
- Mostly UX: surface the check-in cadence as a prominent part of the
  final summary review (§3.E). Default to ~10 days (per golden example)
  but let the user adjust.
- No new schema work for current scope.

---

## 4. Cross-cutting concerns

### 4.A Prompt-caching constraints

- Stage 3 static block: ~1,219 tokens (close to the 1,024 floor).
- Stage 4 static block: ~1,269 tokens.
- All these reworks add prompt content. Track static-block size after
  every change. Tighten redundant content where needed. Test cache
  reads via `cache_read_input_tokens` after edits
  (`docs/backend/prompt-caching.md`).

### 4.B Structured output via XML micro-tags

- We emit `<needs>` and `<stage4_proposals>` JSON inside XML tags;
  parsed by `backend/src/utils/micro-tag-parser.ts:63-100` and
  `backend/src/services/stage4-capture.service.ts`.
- Any new structured output we add (e.g. "current need focus,"
  "agreement quality verdict") should follow the same pattern, not
  introduce tool_calls (response protocol explicitly forbids unknown
  tags — `stage-prompts.ts:115`).

### 4.C Cache-First UI rules

- Per CLAUDE.md: never `invalidateQueries` on a key with optimistic
  updates in flight. Use `setQueryData` for all the new mutations
  (per-need edit, per-option willingness during walkthrough, etc.).
- New query keys go in `mobile/src/hooks/queryKeys.ts`.

### 4.D Cross-doc consistency

- Update `docs/product/stages/stage-3-what-matters.md` and
  `stage-4-strategic-repair.md` when the rework lands.
- `docs/canonical-facts.json` may not need touching unless stage names
  change.
- `docs/code-to-docs-mapping.json` maps Stage 3/4 code paths → docs;
  ensure mappings still hold after refactors.

---

## 5. Suggested sequencing

A possible order that lets us ship value incrementally:

1. **Stage 3 edit affordance** (§1.A). Pure UX win, no model changes,
   short loop. **Unblocks the "boom, I send my needs" feel.**
2. **NVC reframing — prompt strengthening + validator** (§1.B). Ships
   independently; testable in isolation against transcripts.
3. **⚠ Resolve the authorship decision** (§3.A). Blocks parts of §3.B-D.
4. **Stage 4 walkthrough state + one-need-at-a-time UI** (§3.B). The
   biggest single piece of work. Skeleton first (focused view of one
   need with existing data), then per-need actions.
5. **AI option generation for empty needs** (§3.C). Real
   `/proposals/suggest` endpoint, retrieval-contract enforced.
6. **Partner-needs three-bucket split** (§3.D). Layered on top of #4.
7. **Quality-review pass before close** (§3.E). Final polish.
8. **Surface 10-day check-in in the summary review** (§3.F). UX-only.

Each chunk should be its own PR with type-check + tests green per
CLAUDE.md ("Each commit should pass check and test").

---

## 6. Open questions

- **§3.A authorship decision** — A vs B vs C. *Blocking §3.B-D.*
- **§1.B aggressiveness of reframing** — silent rephrase vs user-led
  reframe. Lean user-led but worth confirming.
- **§3.B walkthrough state model** — stateless derivation vs stored
  walkthrough state. Lean stored.
- **§3.E quality review enforcement** — conversational mode vs
  hard-block at close. Lean conversational.
- **Scope of "you can check your list while working"** (working spec
  guiding principle) — how far do we go on letting the user jump around
  vs. enforcing linear walkthrough? Default linear, with a peek-at-all
  view, and revisit after first usability test.
- **Removing confirmed needs in Stage 3** — should we allow removal
  after `needsShared` is set? Today we don't (the gate is set). Worth a
  product call.
