# MVP Gapless Delivery Plan (Stage 0 → Tending)

## Why this format

The repository's current planning pattern strongly favors a **docs + GitHub issue/PR linkage** model, not issues-only:

- Product plans repeatedly declare GitHub trackers in a **"Source Of Truth"** section while keeping operational details in repo docs.
- Execution is managed through issues/PRs, with docs as the durable plan artifact.

So the recommended sharing approach is:

1. Commit this markdown to `docs/product/`.
2. Open a GitHub issue for review that links this file.
3. Track resulting execution as issues/PRs linked back to this plan.

---

## Executive Summary

We will deliver a functional MVP for testing by running a **4-week, gate-based plan** with constrained overlap across categories:

- **A. Chat Infrastructure & Flow** (must stabilize first)
- **B. AI Context**
- **C. AI Responses**
- **D. UI/UX Polish** (only unblockers until functional gates pass)

This plan closes current execution gaps by adding:
1. Explicit category exit gates
2. Ranked ticket triage policy
3. Evidence requirements per ticket
4. Daily operating scoreboard
5. Decision rules for progression across categories

---

## 1) Remaining Gaps in Current Plan

### Gap 1 — No explicit “done” criteria per category
Current docs identify issues and goals, but we lack hard pass/fail gates for A/B/C/D.

### Gap 2 — No policy tying ticket priority to MVP blockers
We have mixed active workstreams; no strict rule that A/P0 blocks all non-critical work.

### Gap 3 — No incident-to-ticket traceability for newly reported blockers
Some blocker reports exist, but not all are cleanly filed and owned.

### Gap 4 — Quality work (C) lacks full operational scoring loop
Eval harness direction exists, but quality governance is still partially spec-level.

### Gap 5 — MVP readiness is not represented by one scoreboard
No single daily view of blocker count + completion reliability + quality floor.

---

## 2) Ranked Approaches to Close the Gaps

### Approach A (Recommended): Gate-Based, Mostly-Sequential with Constrained Overlap
**Rank: #1**

- Enforce A/P0 zero policy before broader C work
- Allow B overlap only when it directly supports A stabilization
- Require evidence bundle for “Done”
- Weekly gates determine promotion

**Pros**
- Fastest path to reliable MVP
- Minimizes false positives from unstable flow
- Works with 1 engineer capacity

**Cons**
- Defers some quality polish work that feels high-visibility

---

### Approach B: Strict Waterfall (A fully complete, then B, then C, then D)
**Rank: #2**

- No overlap at all
- Single-lane focus

**Pros**
- Very clear operationally

**Cons**
- Too rigid for real bug discovery
- Can stall if A issues expose B dependencies

---

### Approach C: Parallel Multi-Lane (A/B/C all active)
**Rank: #3 (Not recommended)**

- Continue broad concurrent workstreams

**Pros**
- High throughput feel

**Cons**
- Blurred ownership
- Hard to know if C improvements are real or artifact of A instability
- High context switching for 1 engineer

---

## 3) Recommended “Gapless” Plan

### 3.1 Scope and Success Criteria

#### MVP Scope
Two-user journey successfully completes **Stage 0 through Tending**.

#### Success Metrics (ranked)
1. **A/P0 blockers open = 0**
2. **Stage 0→Tending completion reliability meets target**
3. **Golden-inspired quality floor met on defined scenarios**

#### Starting thresholds
- A/P0 open blockers: **0**
- Completion reliability (test window): **≥80%**
- C quality floor (rubric): **no dimension <3**, average ≥3.5 on priority scenarios

(Thresholds can tighten after first stable week.)

---

### 3.2 Ownership and Decision Rights

- **Shantam (Lead Engineer):** A/B owner, incident triage lead, release gate authority
- **Darryl:** C owner (golden example quality review + transcript adjudication)
- **Product Designer:** D owner; supports A unblockers and clarity fixes
- **AI support tools:** PR review, test scripting, regression checks, transcript preparation

Decision rule:
- If A/P0 > 0, engineering focus returns to A regardless of other lane progress.

---

### 3.3 Ticket Taxonomy + Evidence Model

Each ticket must include:

- Category: A/B/C/D
- Priority: P0/P1/P2
- MVP blocker: Yes/No
- Owner
- Repro steps
- Acceptance criteria
- Verification checks
- Evidence artifacts (required before Done)

#### Evidence required before “Done”
- Repro no longer fails
- Targeted test added/updated (or explicit test debt item with owner/date)
- Run artifact (logs/screenshots/transcript snippet)
- Regression note (what could break again)

---

### 3.4 Weekly Execution Plan (4 Weeks)

#### Week 1 — A Stabilization Sprint
Goal: eliminate flow blockers and stage-progression failures.

- File/confirm ownership for all A/P0 incidents
- Reproduce and fix top blockers
- Freeze non-blocking C/D work
- Daily scoreboard review

**Gate to pass Week 1**
- A/P0 blockers = 0 or only one with approved mitigation
- No unresolved hard-stuck path in core 0→Tending journey

---

#### Week 2 — A Hardening + B Reliability
Goal: make context/state behavior robust enough for meaningful quality evaluation.

- Validate context integrity across transitions
- Close A/P1 issues that degrade test fidelity
- Add missing checks for known regressions

**Gate to pass Week 2**
- Core journey stable in repeated runs
- B-critical context checks green

---

#### Week 3 — Controlled C Quality Push
Goal: tune AI response quality with stable flow and measurable scoring.

- Run golden-inspired scenarios
- Darryl reviews transcripts with defined rubric
- Ship targeted prompt/logic adjustments only with before/after evidence

**Gate to pass Week 3**
- Quality floor achieved on selected scenarios
- No reopened A/P0 regressions from C changes

---

#### Week 4 — MVP Readiness + Minimal D Polish
Goal: readiness for functional testing cohort.

- Fix only D items that block comprehension or task completion
- Produce test-readiness package (known issues, mitigations, scripts)
- Dry run with full workflow

**Gate to pass Week 4**
- A/P0 = 0
- Reliability threshold met
- Quality threshold met
- Test handoff package complete

---

### 3.5 Daily Operating Cadence

#### Daily 20-minute standup fields
1. Open A/P0 count
2. Newly discovered blockers
3. Completion reliability trend
4. Top 1–2 risks for gate failure
5. Today’s stop-doing list (to avoid WIP sprawl)

#### Weekly gate review
- Pass / Conditional Pass / Fail
- If Fail: rollback to previous gate priorities

---

### 3.6 Prioritization Rules (Non-Negotiable)

1. **A/P0 preempts all non-emergency work**
2. **No C wins accepted if A gate is red**
3. **No ticket marked Done without evidence bundle**
4. **D is defer-first unless it blocks A/B/C testing**

---

### 3.7 Tracking Structure (Suggested Board Columns)

- Intake
- Triaged
- In Progress
- In Verification
- Done
- Blocked

Required labels:
- `cat:A|B|C|D`
- `prio:P0|P1|P2`
- `mvp-blocker`
- `evidence-attached`
- `verified-in-repo | github-only | unverified`

---

### 3.8 Immediate Next Actions (Next 48 Hours)

1. Build the category/priority label map and apply to all open items
2. File missing blocker tickets from recent reports
3. Assign owners + due dates for all A/P0
4. Publish first daily scoreboard
5. Freeze non-blocking C/D starts until A/P0 count is controlled
