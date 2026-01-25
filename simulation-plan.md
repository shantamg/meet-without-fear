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
- Good ambition but too complex and fragile for initial implementation. It couples e2e testing with automated code changes, which is not realistic without strong guardrails.

---

## Improved Plan (Safer, Faster, and More Maintainable)

### Goals
1. **Reliable simulation coverage** for 20 scenarios.
2. **Deterministic test data** and stable infrastructure.
3. **High-signal failures** with actionable diagnostics.
4. **Human-in-the-loop fixes** rather than auto-patching production code.

### Strategy
**Split the problem into two phases:**
1. **Simulation execution & diagnostics**
2. **Fix workflow automation (without auto-writing code)**

This gives dependable coverage while still streamlining bug resolution.

---

## Phase 1: Deterministic Simulation Execution

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

## Phase 2: Fix Workflow Automation (Human-in-the-Loop)

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

### Step 1: Foundations
- Add a `tests/simulations` folder with:
  - `helpers/` (api client, auth mock, pubsub mock, db utilities)
  - `scenarios/` (20 deterministic fixtures)
  - `runner/` (runner + orchestrator)
  - `reports/` (JSON + markdown output)

### Step 2: Environment Control
- Add `scripts/setup-test-env.ts` to:
  - start backend
  - apply migrations to test DB
  - verify health
- Add `scripts/teardown-test-env.ts` to stop server and clean resources.

### Step 3: Mocking External Services
- Create adapters to swap real vs mock services via environment variables.
- Default to mock in CI; allow real integrations in a separate nightly run.

### Step 4: Simulation Runner
- Build a runner that:
  - authenticates users (mock)
  - creates sessions
  - progresses stages
  - validates agreements
  - asserts final state
- Ensure every step writes structured logs.

### Step 5: Reporting & Diagnostics
- Store per-scenario JSON artifacts and a summary report.
- Include failure classification and reproduction steps.

### Step 6: CI Integration
- Add npm scripts:
  - `test:simulations` (default mock)
  - `test:simulations:real` (nightly, live services)
- Add a pipeline job that runs the mock suite on each PR.

---

## Expected Benefits
- **Reliability:** Mocks reduce flakiness from external systems.
- **Speed:** Parallel execution and no auto-fix loop.
- **Safety:** No risky automatic code changes.
- **Actionable failures:** Rich artifacts and clear repro steps.
- **Scalability:** Adds more scenarios without exponential runtime growth.

---

## Success Metrics
- 95%+ scenario pass rate in CI with mock services.
- Full suite completes within 10–15 minutes.
- Clear per-scenario logs and diagnostic artifacts.
- Each failure yields a ready-to-triage issue/branch.

---

## Deliverables
1. Deterministic simulation runner and 20 scenarios.
2. Mocked services for auth, realtime, and email.
3. Report artifacts for each run.
4. CI job for mock runs and optional nightly real integrations.
5. Documentation on running and interpreting simulations.
