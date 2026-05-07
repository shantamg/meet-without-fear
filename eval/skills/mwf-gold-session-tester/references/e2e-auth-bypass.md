# E2E Auth Bypass

MWF can log in a local test user without Clerk. Borrow the E2E test technique instead of using Google login.

## Required Server Mode

Backend auth bypass only works when:

- `E2E_AUTH_BYPASS=true`
- `NODE_ENV !== production`

The mobile web bundle must run with:

- `EXPO_PUBLIC_E2E_MODE=true`
- `EXPO_PUBLIC_API_URL=http://localhost:3000`

The E2E configs already do this:

- `e2e/playwright.config.ts`: `E2E_AUTH_BYPASS=true`, `MOCK_LLM=true`, mobile web on `8082`
- `e2e/playwright.live-ai.config.ts`: `E2E_AUTH_BYPASS=true`, `MOCK_LLM=false`, mobile web on `8082`

Use `8082` for E2E-mode app runs so it does not collide with a user's normal `8081` dev app.

## How It Works

Backend accepts these headers in E2E mode:

- `x-e2e-user-id`
- `x-e2e-user-email`
- optional `x-e2e-fixture-id`

Relevant files:

- `backend/src/middleware/auth.ts`
- `backend/src/routes/e2e.ts`
- `e2e/helpers/auth.ts`
- `e2e/helpers/test-utils.ts`
- `e2e/helpers/two-browser-harness.ts`
- `mobile/src/providers/E2EAuthProvider.tsx`
- `mobile/src/lib/api.ts`

Mobile web reads these query params and configures its API client to send E2E auth headers:

- `?e2e-user-id=<id>&e2e-user-email=<email>`

This means the Codex in-app browser can be "logged in" simply by opening:

```text
http://localhost:8082/session/<sessionId>?e2e-user-id=<userId>&e2e-user-email=<email>
```

The email must end in `@e2e.test` for E2E seed endpoints.

## Starting Servers

When a character is known and the in-app browser is blank/no current MWF session, prefer creating a no-Clerk local session. Check server availability before asking the user for a URL.

Fast path: run the bundled script and open its `ASSIGNED_URL` in the Codex in-app browser. Do this before searching the repo.

```bash
eval/skills/mwf-gold-session-tester/scripts/create_gold_session.sh James
```

The script:

- checks `http://localhost:3000/health`
- probes `/api/e2e/seed` for `E2E_AUTH_BYPASS=true`
- chooses web app URL `http://localhost:8082` if up, otherwise `http://localhost:8081`
- seeds both gold users
- creates and accepts the invitation
- prints `ASSIGNED_URL` and `PARTNER_URL`

Open only `ASSIGNED_URL` for this one-side skill.

Quick checks:

```bash
curl -fsS http://localhost:3000/health
curl -fsS http://localhost:8082
```

Check E2E auth is enabled by probing an E2E endpoint:

```bash
curl -sS -o /tmp/mwf-e2e-probe.json -w '%{http_code}' \
  -X POST http://localhost:3000/api/e2e/seed \
  -H 'Content-Type: application/json' \
  -d '{"email":"probe@e2e.test","name":"Probe"}'
```

Expected: `201`. If it returns `403`, backend is running without `E2E_AUTH_BYPASS=true`.

For deterministic mock-LLM testing:

```bash
npm --workspace e2e run e2e:headed
```

For live-AI evaluation, follow the live config pattern:

```bash
cd <repo-root>
E2E_AUTH_BYPASS=true MOCK_LLM=false npm run dev:api
```

In a second terminal:

```bash
cd <repo-root>
npm run dev:mobile:e2e
```

If a normal user-facing app is already running on `8081`, do not restart it unless the user asks.

## Default Blank-Browser Flow

If the assigned character is known and no MWF session is open:

1. Infer scenario and partner:
   - James -> partner Catherine, scenario James/Catherine.
   - Catherine -> partner James, scenario James/Catherine.
   - Adam -> partner Eve, scenario Adam/Eve.
   - Eve -> partner Adam, scenario Adam/Eve.
2. Run `scripts/create_gold_session.sh <character>` from this skill directory. It verifies `localhost:3000` and chooses `8082` or `8081`.
3. Seed both users via `/api/e2e/seed`.
4. Create a session as the inviting side when appropriate:
   - If playing Adam or James, create the session as that character and invite Eve/Catherine.
   - If playing Eve or Catherine, create the session as Adam/James, accept as Eve/Catherine, then open the invitee URL.
5. Open the assigned character's E2E session URL in the Codex in-app browser.
6. Drive only the assigned character.

If any step fails, report the failing command/status and the likely missing env:

- `localhost:3000` down -> backend dev server not running.
- `/api/e2e/seed` returns `403` -> `E2E_AUTH_BYPASS=true` missing.
- `localhost:8082` down -> mobile web E2E app not running with `EXPO_PUBLIC_E2E_MODE=true`.

## Seeding Users

Seed the assigned user through the E2E endpoint. If another Codex session or the user will play the partner, seed the partner too.

```bash
curl -sS -X POST http://localhost:3000/api/e2e/seed \
  -H 'Content-Type: application/json' \
  -d '{"email":"shantam@e2e.test","name":"Shantam"}'

curl -sS -X POST http://localhost:3000/api/e2e/seed \
  -H 'Content-Type: application/json' \
  -d '{"email":"jason@e2e.test","name":"Jason"}'
```

The response returns each DB user id. Use those ids in headers and URLs.

## Creating And Accepting A Session By API

Create as User A:

```bash
curl -sS -X POST http://localhost:3000/api/sessions \
  -H 'Content-Type: application/json' \
  -H 'x-e2e-user-id: <userAId>' \
  -H 'x-e2e-user-email: shantam@e2e.test' \
  -d '{"inviteName":"Jason"}'
```

The response includes `session.id` and `invitationId`.

Accept as User B:

```bash
curl -sS -X POST http://localhost:3000/api/invitations/<invitationId>/accept \
  -H 'Content-Type: application/json' \
  -H 'x-e2e-user-id: <userBId>' \
  -H 'x-e2e-user-email: jason@e2e.test'
```

Open each user's browser to:

```text
http://localhost:8082/session/<sessionId>?e2e-user-id=<userAId>&e2e-user-email=shantam@e2e.test
http://localhost:8082/session/<sessionId>?e2e-user-id=<userBId>&e2e-user-email=jason@e2e.test
```

## Seed A Prebuilt State

For tests that should start at a particular stage, use:

```bash
curl -sS -X POST http://localhost:3000/api/e2e/seed-session \
  -H 'Content-Type: application/json' \
  -d '{
    "userA": {"email":"shantam@e2e.test","name":"Shantam"},
    "userB": {"email":"jason@e2e.test","name":"Jason"},
    "targetStage": "CREATED"
  }'
```

The response includes `pageUrls.userA` and `pageUrls.userB` with E2E query params already attached.

Check `backend/src/testing/state-factory.ts` for supported `TargetStage` values before assuming a stage exists.

## Browser Surface Decision

Default for Codex Desktop interactive testing:

- Use the in-app browser via Browser Use.
- Open the E2E URL directly in that browser:

```text
http://localhost:8082/session/<sessionId>?e2e-user-id=<userId>&e2e-user-email=<email>
```

For two-user manual testing:

- Best: start two separate Codex Desktop sessions, one per user. Each session controls its own in-app browser and navigates to its own E2E URL.
- Acceptable: user controls one side and Codex controls the other through the in-app browser.
- Avoid relying on two tabs in one in-app browser unless you have verified app auth state is isolated per tab. The E2E provider caches user info in the web runtime, so one browser context can bleed identity across tabs.

Do not use external Playwright/Chrome from this skill. If the user asks for one Codex session to run both sides in isolated contexts, treat that as a separate automated eval-harness task.

## Automated Two-Context Reference

For a separate automated eval-harness workflow, use Playwright two isolated contexts, exactly like `e2e/helpers/two-browser-harness.ts`.

```ts
const contextA = await browser.newContext({
  ...devices['iPhone 12'],
  extraHTTPHeaders: {
    'x-e2e-user-id': userAId,
    'x-e2e-user-email': 'shantam@e2e.test',
  },
});
const pageA = await contextA.newPage();
await pageA.goto(`http://localhost:8082/session/${sessionId}?e2e-user-id=${userAId}&e2e-user-email=shantam@e2e.test`);

const contextB = await browser.newContext({
  ...devices['iPhone 12'],
  extraHTTPHeaders: {
    'x-e2e-user-id': userBId,
    'x-e2e-user-email': 'jason@e2e.test',
  },
});
const pageB = await contextB.newPage();
await pageB.goto(`http://localhost:8082/session/${sessionId}?e2e-user-id=${userBId}&e2e-user-email=jason@e2e.test`);
```

## Fixture IDs

For mocked LLM runs, pass `x-e2e-fixture-id` in API/browser context headers. For live-AI gold evaluation, omit fixture ids and run `MOCK_LLM=false`.

## Safety

Never enable `E2E_AUTH_BYPASS=true` in production. `backend/src/server.ts` fails fast if it sees that combination.
