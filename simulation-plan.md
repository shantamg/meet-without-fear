# Conflict Resolution Simulation Testing Plan

## Evaluation of Proposed Approach

**Feasibility: Medium-Low**
- **Dependencies & auth complexity:** The approach relies on live integrations (Clerk, Ably, Resend) and assumes test credentials and test-mode behavior are available and stable. This is often the largest blocker in CI/local automation without dedicated test tenants and deterministic fixtures.
- **Infrastructure assumptions:** It assumes a local PostgreSQL instance and Prisma migrations can be run repeatedly without conflicts. It also assumes the backend can be started/stopped programmatically and will be ready quickly.
- **Auto-fix scope:** Auto-generating and applying fixes across the app is risky and likely infeasible without deeper code analysis and human review.

**Efficiency: Low**
- **Serial execution:** Running 20 scenarios serially with full environment resets is expensive. It also restarts the backend after each fix, which is slow.
- **Multiple external systems:** Live realtime, email, and auth calls introduce latency and flakiness.
- **Bug fix loop:** The auto-fix and retry loop can create long cycles and may fail to converge.

**Cost: High**
- **External service usage:** Ably and Clerk usage for 20 scenarios with retries can add cost, especially for real-time events.
- **CI minutes:** Long-running, serial e2e tests (2 minutes per scenario with retries) can be expensive.
- **Engineering overhead:** Building and maintaining auto-fix automation is costly, and the risk of unsafe changes is high.

**Overall Score: 4/10**
- Good ambition but too complex and fragile for initial implementation. It couples e2e testing with automated code changes, which is not realistic without strong guardrails. It also doesn’t directly target the current blocker (mobile UI workflow gaps).

---

## Improved Plan (Safer, Faster, and More Maintainable)

### Goals
1. **Unblock manual QA quickly** for mobile workflows by providing ready-to-load database states.
2. **Reliable backend flow checks** for 20 scenarios (as a guardrail, not a replacement for UI testing).
3. **Deterministic test data** and stable infrastructure.
4. **High-signal failures** with actionable diagnostics.
5. **Human-in-the-loop fixes** rather than auto-patching production code.

### Strategy
**Split the problem into three tracks, aligned to current blockers:**
1. **Saved database states for manual mobile testing** (fastest path to unblock UI/debugging).
2. **Deterministic backend simulations** (coverage + regression protection).
3. **Fix workflow automation (without auto-writing code)** (optional, light-weight).

This prioritizes immediate value while preserving a path to broader automation.

---

## Track 1: Saved Database States for Manual Mobile Testing

### Why this matters now
- The main blockers are in the mobile UI flow. Having one-command, prebuilt DB states lets you jump to a specific session stage and debug the exact UI behavior quickly.
- This provides higher day-to-day value than full end-to-end automation at this phase.

### Implementation outline
- Add a `scripts/db-state/` directory:
  - `seed-scenarios.ts`: creates 20 scenarios with deterministic IDs.
  - `snapshot.ts`: exports DB state (SQL or JSON).
  - `restore.ts`: restores a snapshot into the test DB.
- Store snapshots by scenario and stage:
  - `snapshots/scenario-01/INTRODUCTION.sql`
  - `snapshots/scenario-01/SHARING.sql`
  - ...
- Add CLI helpers:
  - `npm run db:restore -- --scenario=scenario-01 --stage=SHARING`
  - `npm run db:seed`
- Document how to hook the mobile app to the test DB and jump directly to a stage.

---

## Track 2: Deterministic Simulation Execution

### 1) Test Harness & Environment
- **Use a dedicated test environment** with seeded data and isolated DB.
- **Mock external services** in most tests:
  - **Clerk:** Use local JWT signing keys or a mock auth provider.
  - **Ably:** Use a local in-memory pub/sub or test doubles.
  - **Resend:** Stub or disable email sending.
- **Single backend process** for the full suite, with a `/healthz` check and graceful shutdown.

### 2) Scenario Data
- Define 20 scenarios as deterministic fixtures.
- Use a **data factory** to generate consistent user/session IDs.
- Avoid random data in core scenarios; only use randomization for fuzz or property tests.

### 3) Simulation Runner
- **Parallelize where possible** (e.g., 4 workers) while maintaining DB isolation.
- **Reset state between scenarios** using transactions or DB reset helper.
- **Capture structured logs** (JSON): API calls, events, timing, and state transitions.

### 4) Error Detection & Diagnostics
- **Categorize failures** into:
  - test infrastructure (env, DB, auth)
  - application logic
  - flaky external integrations
- **Generate artifacts**:
  - scenario transcript
  - API request/response logs
  - DB snapshot (select tables)
  - stack traces

### 5) Reporting
- Produce `reports/simulation-results.json` and `reports/simulation-summary.md` with:
  - pass/fail counts
  - per-scenario duration
  - top error categories
  - links to artifacts

---

## Track 3: Fix Workflow Automation (Human-in-the-Loop)

### 1) Automated Issue Creation (No Auto-Fix)
- When a scenario fails, automatically:
  - create a **Git branch** for investigation
  - open a structured **issue** (or ticket) with logs and repro steps
  - tag severity and suspected subsystem

### 2) Safe Code Change Loop
- Developers apply fixes on the created branch.
- CI runs the relevant failed scenario(s) first, then the full suite.
- Require code review before merging.

### 3) Optional Assisted Fix Suggestions
- Provide **suggested fix hints** (not code writes), based on known error patterns.

---

## Implementation Plan

### Step 1: Saved DB States (Immediate Value)
- Add `scripts/db-state/` with seed/restore/snapshot utilities.
- Create 20 scenarios with deterministic IDs.
- Capture snapshots for each workflow stage (or at least key stages: INTRODUCTION, SHARING, AGREEMENT, RESOLUTION).
- Document a short mobile QA loop: restore → run app → debug UI → iterate.

### Step 2: Foundations for Simulations
- Add a `tests/simulations` folder with:
  - `helpers/` (api client, auth mock, pubsub mock, db utilities)
  - `scenarios/` (20 deterministic fixtures)
  - `runner/` (runner + orchestrator)
  - `reports/` (JSON + markdown output)

### Step 3: Environment Control
- Add `scripts/setup-test-env.ts` to:
  - start backend
  - apply migrations to test DB
  - verify health
- Add `scripts/teardown-test-env.ts` to stop server and clean resources.

### Step 4: Mocking External Services
- Create adapters to swap real vs mock services via environment variables.
- Default to mock in CI; allow real integrations in a separate nightly run.

### Step 5: Simulation Runner
- Build a runner that:
  - authenticates users (mock)
  - creates sessions
  - progresses stages
  - validates agreements
  - asserts final state
- Ensure every step writes structured logs.

### Step 6: Reporting & Diagnostics
- Store per-scenario JSON artifacts and a summary report.
- Include failure classification and reproduction steps.

### Step 7: CI Integration
- Add npm scripts:
  - `test:simulations` (default mock)
  - `test:simulations:real` (nightly, live services)
- Add a pipeline job that runs the mock suite on each PR.

---

## Expected Benefits
- **Faster UI debugging:** One-command DB restores to jump into any scenario stage.
- **Reliability:** Mocks reduce flakiness from external systems.
- **Speed:** Parallel execution and no auto-fix loop.
- **Safety:** No risky automatic code changes.
- **Actionable failures:** Rich artifacts and clear repro steps.
- **Scalability:** Adds more scenarios without exponential runtime growth.

---

## Success Metrics
- Saved DB states can be restored in under 1 minute for any scenario/stage.
- 95%+ scenario pass rate in CI with mock services.
- Full suite completes within 10–15 minutes.
- Clear per-scenario logs and diagnostic artifacts.
- Each failure yields a ready-to-triage issue/branch.

---

## Deliverables
1. DB seed/restore/snapshot tooling with per-scenario stage snapshots.
2. Deterministic simulation runner and 20 scenarios.
3. Mocked services for auth, realtime, and email.
4. Report artifacts for each run.
5. CI job for mock runs and optional nightly real integrations.
6. Documentation on running and interpreting simulations.

---

## Notes on MCP vs Existing Architecture
- The plan above **does not require an MCP server**. Existing memory/knowledge architecture can support the same improvements (relationship tracking, notable facts, milestones, etc.) without extra infrastructure.
- MCP could be revisited later if there is a clear integration need, but it is not a prerequisite for the simulation or database-state workflows described here.
