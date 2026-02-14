# External Integrations

**Analysis Date:** 2026-02-14

## APIs & External Services

**Authentication & Identity:**
- Clerk - User authentication and management
  - SDK: `@clerk/express` (backend), `@clerk/clerk-expo` (mobile), `@clerk/nextjs` (website)
  - Auth: `CLERK_SECRET_KEY` (backend), `CLERK_PUBLISHABLE_KEY` (mobile/website)
  - Implementation: JWT token verification in `backend/src/middleware/auth.ts`
  - Tokens stored in Clerk; user records synced to Prisma DB with `clerkId` reference

**AI & Large Language Models:**
- AWS Bedrock - Claude models for AI responses
  - SDK: `@aws-sdk/client-bedrock-runtime`
  - Models:
    - Claude 3.5 Sonnet (user-facing responses, empathetic dialogue)
    - Claude 3.5 Haiku (internal mechanics: intent detection, classification, planning)
    - Amazon Titan Embeddings (vector embeddings for context retrieval)
  - Auth: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
  - Files: `backend/src/lib/bedrock.ts` (client setup), `backend/src/services/ai.ts` (high-level API)
  - Pricing tracked: $0.001-$0.003 per 1K input tokens, $0.005-$0.015 per 1K output tokens

**Real-time Communication:**
- Ably - WebSocket-based pub/sub messaging
  - SDK: `ably` (backend and mobile)
  - Auth: `ABLY_API_KEY`
  - Channels: Session-specific for real-time event broadcasting
    - Message stream updates via SSE with Ably fallback
    - Partner presence and stage progression updates
    - Invitation notifications
  - Files: `backend/src/services/realtime.ts`

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
- Not detected - No Sentry, Rollbar, or similar error tracking service configured
- Console logging only in `backend/src/app.ts` (request/response logging)
- Stacktrace via `stacktrace-js` (mobile debugging)

**Logs:**
- Backend: Console output (logs to stdout for container/platform capture)
- Mobile: Mixpanel events for user actions; optional debug logs in development
- No centralized log aggregation detected

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
- Not detected - No GitHub Actions, GitLab CI, CircleCI, or Travis CI configuration
- E2E tests: Manual via `npm run e2e` (Playwright against live backend/mobile)
- Test & type check via `npm run test` and `npm run check` (monorepo-wide)

## Environment Configuration

**Required env vars (Backend):**
- `DATABASE_URL` - PostgreSQL connection
- `ABLY_API_KEY` - Real-time messaging
- `CLERK_SECRET_KEY` - Auth verification
- `AWS_REGION` - AWS region for Bedrock (e.g., us-west-2)
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` - AWS credentials
- `BEDROCK_HAIKU_MODEL_ID`, `BEDROCK_SONNET_MODEL_ID` - Claude model IDs
- `RESEND_API_KEY` - Email service
- `FROM_EMAIL` - Sender email address
- `PORT` - Server port (default: 3000)

**Optional env vars (Backend):**
- `MOCK_LLM=true` - Toggle mock LLM responses for E2E testing
- `E2E_AUTH_BYPASS=true` - Bypass auth for E2E tests
- `E2E_FIXTURE_ID` - Use pre-canned responses for E2E tests
- `DISABLE_PROMPT_LOGGING` - Disable prompt debug logging

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
- Consumers: `mobile/src/hooks/useUnifiedSession.ts` subscribes to Ably for UI updates

---

*Integration audit: 2026-02-14*
