---
title: External Integrations
sidebar_position: 6
description: "Analysis Date: 2026-03-11"
created: 2026-03-11
updated: 2026-03-12
status: living
---
# External Integrations

**Analysis Date:** 2026-03-11

## APIs & External Services

**Authentication & Identity:**
- Clerk - User authentication and management
  - SDK: `@clerk/express` (backend), `@clerk/clerk-expo` (mobile), `@clerk/nextjs` (website)
  - Auth: `CLERK_SECRET_KEY` (backend), `CLERK_PUBLISHABLE_KEY` (mobile/website)
  - Implementation: JWT token verification in `backend/src/middleware/auth.ts`
  - Tokens stored in Clerk; user records synced to Prisma DB with `clerkId` reference

**AI & Large Language Models:**
- AWS Bedrock - Claude models for AI responses
  - SDKs:
    - `@anthropic-ai/bedrock-sdk` (AnthropicBedrock client) — used for Claude model interactions (Sonnet, Haiku) via Messages API
    - `@aws-sdk/client-bedrock-runtime` (BedrockRuntimeClient) — used only for Titan embeddings via InvokeModelCommand
  - Models:
    - Claude Sonnet 4.5 (`global.anthropic.claude-sonnet-4-5-20250929-v1:0`) — user-facing responses, empathetic dialogue
    - Claude Haiku 4.5 (`global.anthropic.claude-haiku-4-5-20251001-v1:0`) — internal mechanics: intent detection, classification, planning
    - Amazon Titan Embed Text v2 (`amazon.titan-embed-text-v2:0`) — vector embeddings for context retrieval
  - Model overrides: `BEDROCK_SONNET_MODEL_ID`, `BEDROCK_HAIKU_MODEL_ID`, `BEDROCK_TITAN_EMBED_MODEL_ID`
  - Auth: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
  - Files: `backend/src/lib/bedrock.ts` (client setup), `backend/src/services/ai.ts` (high-level API)
  - Pricing: Sonnet 4.5 — $3.00/MTok input, $15.00/MTok output; Haiku 4.5 — $1.00/MTok input, $5.00/MTok output. Prices shown per 1M tokens (code constants in `bedrock.ts` and `brain.ts` are per 1K tokens — e.g. `{ input: 0.001, output: 0.005 }` for Haiku)
  - Prompt caching: two layers.
    1. System prompts use a 2-block architecture — a static block with `cache_control: { type: 'ephemeral' }` reused across turns within a stage, and a dynamic per-turn block that is not cached (see `stage-prompts.ts`).
    2. Conversation history prefix caching — `cache_control` is added to the second-to-last message in every Bedrock request, so each subsequent turn replays the entire prior conversation as a cache hit. See `docs/backend/prompt-caching.md` for details.
  - Circuit breakers: `bedrockCircuitBreaker` and `embeddingCircuitBreaker` are defined in `backend/src/utils/circuit-breaker.ts` and used by `backend/src/lib/bedrock.ts`. They fast-fail to `null` when OPEN, so AI callers must handle a null response. Ably has its own `ablyCircuitBreaker` (see Realtime below).
  - Titan embeddings: `getEmbedding()` hard-truncates the input at 30,000 characters (rough ~8K-token ceiling). Titan has no native batch endpoint, so `getEmbeddings()` (plural) parallelizes by mapping `getEmbedding` across the inputs.
  - Streaming: `StreamEvent` union includes `{ type: 'done'; usage: {...}; error: string }` — a non-empty `error` on the terminal `done` event means the stream failed partway, callers must check.
  - E2E fixture mode: when `E2E_FIXTURE_ID` is set, `getSonnetResponse` / `getSonnetStreamingResponse` route through `getFixtureOperationResponse()` / `getFixtureResponseByIndex()` instead of Bedrock. `MOCK_LLM=true` is the looser toggle.
  - Legacy model support: `PRICING` still includes entries for `claude-sonnet-4-6`, `claude-3-5-sonnet-20241022-v2:0`, and `claude-3-5-haiku-20241022-v1:0`, and a legacy `BEDROCK_MODEL_ID` export aliases Sonnet. Safe to reference when resurrecting old calls; new call sites should use the named constants.
  - Prompt debug logging (local dev only): every Bedrock prompt + response is written to `backend/tmp/prompts/` as paired `<stem>.txt` / `<stem>_response.txt` files unless `DISABLE_PROMPT_LOGGING=true`. Directory is gitignored.

**Real-time Communication:**
- Ably - WebSocket-based pub/sub messaging
  - SDK: `ably` (backend and mobile)
  - Auth: `ABLY_API_KEY` (backend only). Mobile fetches short-lived tokens from the backend via `GET /api/v1/auth/ably-token` (`mobile/src/services/ably.ts`).
  - Channel format: `meetwithoutfear:session:${sessionId}` and `meetwithoutfear:user:${userId}` (see `shared/src/dto/realtime.ts`)
  - 47 event types (44 SessionEventType + 3 UserEventType) across session, user, empathy, and system events (added `session.abandoned`)
  - Audit stream channel: `ai-audit-stream` (when `ENABLE_AUDIT_STREAM=true`)
  - Fire-and-forget message patterns for non-blocking event publishing
  - Circuit breaker integration: `ablyCircuitBreaker` in `publishSessionEvent()` and `publishUserEvent()` — fast-fails when Ably is in OPEN state, records success/failure for state tracking
  - Files: `backend/src/services/realtime.ts`, `shared/src/dto/realtime.ts` (channel names + event types)

**Voice Transcription:**
- AssemblyAI - Real-time voice-to-text streaming
  - SDK: None — direct HTTP and WebSocket (no npm package required)
  - Auth: `ASSEMBLYAI_API_KEY`
  - Token endpoint: `GET https://streaming.assemblyai.com/v3/token?expires_in_seconds=300` (backend fetches token)
  - Backend route: `POST /api/v1/voice/token` — proxies token request, returns `{ token, expiresInSeconds: 300 }`
  - Mobile usage (Phase 17): Mobile uses token to open WebSocket at `wss://streaming.assemblyai.com/v3/ws?token=<token>&sample_rate=16000` for real-time transcription
  - Rate limit: `authRateLimit` (30 req/min per user)
  - Implementation: `backend/src/controllers/voice.ts`, `backend/src/routes/voice.ts`
  - Error handling: 500 if `ASSEMBLYAI_API_KEY` unset, 502 if AssemblyAI returns non-200

**Email Service:**
- Resend - Transactional email delivery
  - SDK: `resend`
  - Auth: `RESEND_API_KEY`
  - Sender: `FROM_EMAIL` (default: onboarding@resend.dev in dev)
  - Use cases: Invitation emails to partners
  - Files: `backend/src/services/email.ts`

**Push Notifications:**
- Expo Push Service - Mobile push notifications
  - SDK: `expo-server-sdk`
  - Tokens: Stored in `User.pushToken` in database
  - Fallback: Ably realtime messages when push unavailable
  - File: `backend/src/services/push.ts`

**Analytics & Monitoring:**
- Mixpanel - Event analytics
  - SDK: `mixpanel-react-native` (mobile), `mixpanel-browser` (website)
  - Auth: `EXPO_PUBLIC_MIXPANEL_TOKEN` (environment variable, public token)
  - Tracking: Session events, user actions, completion milestones
  - Files:
    - Mobile: `mobile/src/services/mixpanel.ts`, `mobile/src/services/analytics.ts`
    - Website: Google Analytics via Next.js

## Data Storage

**Primary Database:**
- PostgreSQL
  - Connection: `DATABASE_URL` environment variable
  - Client: Prisma ORM (`@prisma/client`)
  - Schema: `backend/prisma/schema.prisma`
  - Migrations: Tracked in `backend/prisma/migrations/`
  - Extensions enabled: postgresqlExtensions preview feature (for future vector support)

**Key Tables:**
- `User` - User accounts with Clerk integration
- `Session` - Conversation sessions between two partners
- `Message` - Chat messages with role (USER/AI)
- `Invitation` - Session invitations sent between users
- `StageProgress` - Track which stage each user is on
- `EmpathyDraft`, `EmpathyValidation` - Empathy response drafting and validation
- `StrategyProposal`, `StrategyRanking` - Conflict resolution strategies
- `GlobalFacts` - Consolidated user knowledge (stored as JSON)
- `BrainActivity` - Telemetry on LLM usage (tokens, costs, duration)
- `NeedScore`, `NeedsAssessmentState` - Inner Work: needs assessment data
- `Person` - People tracking for relationship context
- `GratitudeEntry` - Inner Work: gratitude practice logs
- `MeditationSession`, `MeditationStats` - Inner Work: meditation tracking

**File Storage:**
- Not detected - All data stored in PostgreSQL (no S3, Cloudinary, etc.)
- Session audio and media: Likely handled via Expo FileSystem locally on device

**Caching:**
- React Query - Client-side cache on mobile
  - Query keys centralized in `mobile/src/hooks/queryKeys.ts`
  - Optimistic updates via `onMutate` in mutations
  - Cache invalidation triggers server data refetch
- No server-side caching detected (Redis, Memcached)

## Authentication & Identity

**Auth Provider:**
- Clerk (fully managed authentication)
  - Backend: JWT token verification in `backend/src/middleware/auth.ts`
  - Mobile: `@clerk/clerk-expo` with session-based auth
  - Website: `@clerk/nextjs` with Next.js middleware
  - Token flow: Mobile gets JWT from Clerk, passes in `Authorization: Bearer` header to API
  - User sync: Clerk user created/updated → Prisma User record upserted with `clerkId`

**Session Handling:**
- Mobile: Clerk session stored in Expo Secure Store
- Backend: Stateless JWT validation per request
- No separate session table (JWT-based)

## Monitoring & Observability

**Error Tracking:**
- Winston structured logger (`backend/src/lib/logger.ts`) with JSON output in production, pretty-print in development
- Automatic request context injection: turnId, sessionId, userId, requestId
- Sentry transport: error-level logs forwarded to Sentry via custom SentryTransport
- LLM telemetry: `llm-telemetry.ts` tracks token usage, cost, duration per turn
- Brain Activity: Stored in `BrainActivity` table for audit and cost analysis (brain service)
- TurnTrace: Request-scoped logging via AsyncLocalStorage captures `turnId` for correlating logs

**Logs:**
- Backend: Winston structured logger outputs JSON to stdout in production (container/platform capture), pretty-print in development
- Mobile: Mixpanel events for user actions; optional debug logs in development
- No centralized log aggregation detected (beyond container stdout capture)

**Telemetry:**
- LLM Call Telemetry: `backend/src/services/llm-telemetry.ts` tracks token usage, cost, duration per turn
- Brain Activity: Stored in `BrainActivity` table for audit and cost analysis
- No APM (Application Performance Monitoring) detected

## CI/CD & Deployment

**Hosting:**
- Backend: Flexible (Node.js 20+), commonly Vercel, Railway, or AWS
- Mobile: Expo EAS (Expo Application Services)
  - iOS distribution: TestFlight → App Store
  - Android distribution: Google Play Store
- Website: Vercel (see `website/vercel.json`)
- Docs Site: Vercel

**Mobile Build Service:**
- EAS Build (Expo cloud build infrastructure)
  - Config: `mobile/eas.json` with profiles for development, simulator, preview, production, APK
  - Versioning: Controlled by `mobile/app.json` with auto-increment support
  - Environment-specific config: API URLs and tokens injected per build profile

**Build & Deploy Scripts:**
- `npm run deploy:mobile:ios` - iOS production build and TestFlight submission
- `npm run deploy:mobile:android` - Android APK build
- `npm run deploy:ios:prepare` / `deploy:ios:release` - Manual iOS release workflow
- `npm run deploy:android:prepare` / `deploy:android:release` - Manual Android release workflow
- Files: `scripts/deploy-*.js`, `scripts/update-build-number.js`

**CI Pipeline:**
- GitHub Actions workflows configured in `.github/workflows/`
- E2E tests: Manual via `npm run e2e` (Playwright against live backend/mobile)
- Test & type check via `npm run test` and `npm run check` (monorepo-wide)

## Environment Configuration

**Required env vars (Backend):**
- `DATABASE_URL` - PostgreSQL connection
- `ABLY_API_KEY` - Real-time messaging
- `CLERK_SECRET_KEY` - Auth verification
- `AWS_REGION` - AWS region for Bedrock (default: us-east-1)
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` - AWS credentials
- `BEDROCK_HAIKU_MODEL_ID`, `BEDROCK_SONNET_MODEL_ID` - Claude model IDs
- `RESEND_API_KEY` - Email service
- `FROM_EMAIL` - Sender email address
- `PORT` - Server port (default: 3000)

**Optional env vars (Backend):**
- `ASSEMBLYAI_API_KEY` - AssemblyAI key for voice transcription (required for `/voice/token` endpoint)
- `MOCK_LLM=true` - Toggle mock LLM responses for E2E testing
- `E2E_AUTH_BYPASS=true` - Bypass auth for E2E tests
- `E2E_FIXTURE_ID` - Use pre-canned responses for E2E tests
- `DISABLE_PROMPT_LOGGING` - Disable prompt debug logging
- `ENABLE_AUDIT_STREAM` - Enable AI audit stream channel for monitoring
- `BEDROCK_TITAN_EMBED_MODEL_ID` - Override Titan embedding model ID
- `OPENAI_API_KEY` - OpenAI API key (for voice preview generation in `tts.ts` and `generate-voice-previews.ts`)
- `TWILIO_ACCOUNT_SID` - **Planned / Not yet implemented** — no code references exist
- `TWILIO_AUTH_TOKEN` - **Planned / Not yet implemented** — no code references exist
- `TWILIO_PHONE_NUMBER` - **Planned / Not yet implemented** — no code references exist
- `FIELD_ENCRYPTION_KEY` - AES-256 key for application-level field encryption (optional, graceful degradation if not set)

**Required env vars (Mobile):**
- `EXPO_PUBLIC_API_URL` - Backend API base URL
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk public key
- `EXPO_PUBLIC_MIXPANEL_TOKEN` - Mixpanel token

**Required env vars (Website):**
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk public key
- `CLERK_SECRET_KEY` - Clerk secret key
- `NEXT_PUBLIC_MIXPANEL_TOKEN` - Mixpanel token (optional for web)

**Secrets location:**
- `.env` files (git-ignored, not committed)
- EAS secrets for mobile builds (stored in Expo cloud)
- Environment variables in Vercel project settings for deployments

## Webhooks & Callbacks

**Incoming Webhooks:**
- Not detected - No webhook receivers implemented for Clerk, Stripe, or other services

**Outgoing Webhooks:**
- Not detected - No outbound webhooks to external services

**Realtime Event Subscriptions:**
- Ably channels subscribe on mobile and backend
- Event types: Partner session events, message updates, empathy submissions, stage completions
- Consumers: `mobile/src/hooks/useSessionEventHandler.ts` handles Ably events with cache updates (extracted from useUnifiedSession)

---

*Integration audit: 2026-03-12*
