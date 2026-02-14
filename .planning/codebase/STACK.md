# Technology Stack

**Analysis Date:** 2026-02-14

## Languages

**Primary:**
- TypeScript 5.7-5.9 - All workspace projects use strict TypeScript with ES2020 target
- JavaScript (Node.js) - Backend runtime and build tooling

**Secondary:**
- JSX/TSX - React component markup (web and mobile)
- SQL - PostgreSQL queries via Prisma ORM
- Bash - Deployment and utility scripts

## Runtime

**Environment:**
- Node.js >= 20.0 (specified in `docs-site/package.json` engines)
- Expo 54.0.32 - Mobile framework for iOS/Android development
- React Native 0.81.5 - Cross-platform mobile framework
- React 19.1.0 - Web and mobile UI framework

**Package Manager:**
- npm (monorepo workspaces)
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core:**
- Express 4.21.0 - Backend HTTP server (`backend/`)
- Expo Router 6.0.22 - Mobile navigation and deep linking (`mobile/`)
- Next.js 16.1.1 - Marketing website (`website/`)
- Docusaurus 3.9.2 - Documentation site (`docs-site/`)

**Mobile UI:**
- React Navigation 7.x - Native stack navigation for mobile
- React Native Gesture Handler 2.28.0 - Gesture detection
- React Native Reanimated 4.1.1 - Animation library
- Lucide React Native 0.562.0 - Icon library for mobile

**Web UI:**
- Tailwind CSS 3.4.0 - CSS framework (website)
- Lucide React 0.469.0 - Icon library for web

**State Management:**
- React Query (TanStack Query) 5.90.12 - Server state management (`mobile/`)
- React hooks + custom hooks - Local state (no Redux/Zustand)
- AsyncLocalStorage - Request context propagation (backend)

**Realtime Communication:**
- Ably 2.16.0 - WebSocket-based pub/sub for real-time session events and messaging
  - Backend: Publishes session events, message updates
  - Mobile: Subscribes to partner events and AI message streams

**Data Layer:**
- Prisma 6.1.0 - ORM for PostgreSQL with migrations
  - Config: `backend/prisma/schema.prisma`
  - Client: `@prisma/client`
- PostgreSQL (datasource) - Primary database via `DATABASE_URL`
- Zod 3.23.8 / 4.2.1 - Runtime type validation and schema validation

**Testing:**
- Jest 29.7.0 - Unit/integration test runner
  - Backend config: `backend/jest.config.js`
  - Mobile config: `mobile/jest.config.js`
  - Shared config: `shared/jest.config.cjs`
- Playwright 1.50.0 - E2E testing (`e2e/`)
  - Config: `e2e/playwright.config.ts`
  - Runs against React Native web and backend API
- Testing Library - Component testing utilities
  - `@testing-library/react-native` for mobile
- Jest Expo - Expo-specific test configuration

**Build/Dev:**
- tsx 4.19.2 - TypeScript execution for Node scripts
- tsc (TypeScript Compiler) - Type checking
- tsc-alias - Path alias resolution for compiled output
- Expo CLI - Mobile build and deployment via EAS (Expo Application Services)
- Metro - React Native bundler
- Babel 7.25.2 - JSX/TypeScript transpilation

**Security:**
- Helmet 8.0.0 - HTTP security headers middleware
- CORS 2.8.5 - Cross-origin request handling
- Compression 1.8.1 - Gzip compression (with SSE bypass)
- Clerk 1.7.60 (backend) / 2.19.14 (mobile) / 6.12.0 (website) - Authentication provider

**Analytics & Logging:**
- Mixpanel 3.1.3 (mobile) / 2.73.0 (web) - Event analytics
- Winston 3.19.0 - Structured logging framework (backend)

**External AI Models:**
- AWS Bedrock SDK `@aws-sdk/client-bedrock-runtime` 3.958.0
  - Claude 3.5 Sonnet (user-facing, empathetic responses)
  - Claude 3.5 Haiku (internal mechanics: classification, detection, planning)
  - Amazon Titan Embedding (vector embeddings)

**Email & Push Notifications:**
- Resend 6.6.0 - Transactional email service
- Expo Push SDK 4.0.0 - Push notifications to mobile devices
- Expo Notifications 0.32.16 - Mobile push notification handling

**Development Tools:**
- ESLint 8.57.0 / 9.17.0 - Code linting
- Prettier 3.4.2 - Code formatting
- TypeScript ESLint - TypeScript linting rules
- Concurrently 9.2.1 - Run multiple processes in parallel

## Configuration

**Environment:**
- Backend: `.env` (git-ignored, loaded via `dotenv`)
- Mobile: `.env.local`, `.env.development`, `.env.production` (via `expo-constants`)
- Website: `.env.local`, `.env.production` (Next.js convention)
- E2E tests: `.env.test` (loaded in Playwright config)

**Key Environment Variables:**
- `DATABASE_URL` - PostgreSQL connection string (backend)
- `ABLY_API_KEY` - Realtime messaging service (backend + mobile)
- `CLERK_SECRET_KEY` - Authentication secret (backend)
- `CLERK_PUBLISHABLE_KEY` - Authentication public key (mobile/website via `EXPO_PUBLIC_` / `NEXT_PUBLIC_`)
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` - AWS Bedrock credentials
- `BEDROCK_HAIKU_MODEL_ID`, `BEDROCK_SONNET_MODEL_ID` - Model IDs for Claude versions
- `RESEND_API_KEY` - Email service API key (backend)
- `FROM_EMAIL` - Sender email address for transactional emails
- `MOCK_LLM` - Toggle for E2E testing without real AI calls (default: false)
- `EXPO_PUBLIC_API_URL` - Mobile API endpoint
- `EXPO_PUBLIC_MIXPANEL_TOKEN` - Analytics token (mobile)
- `PORT` - Backend server port (default: 3000)

**Build:**
- TypeScript: `backend/tsconfig.json`, `mobile/tsconfig.json`, `shared/tsconfig.json`
  - Target: ES2020
  - Strict mode enabled
  - Path aliases: `@/`, `@shared/`
- Prettier config: `.prettierrc` (root)
- Mobile build profiles: `mobile/eas.json` (development, preview, production, simulator variants)
- Root EAS config: `eas.json` (CLI version, app version source configuration)

## Platform Requirements

**Development:**
- Node.js >= 20.0
- npm with monorepo workspace support
- macOS, Linux, or WSL for Expo development
- Android Studio SDK (for Android development) or Xcode (for iOS development)
- PostgreSQL database instance

**Production:**
- **Mobile:** iOS 12.0+ (iPhone), Android 8.0+ via EAS Build and TestFlight/Google Play Store
- **Backend API:** Node.js 20.0+ runtime (typically AWS, Vercel, or similar)
- **Website:** Vercel (specified in `website/vercel.json`)
- **Database:** PostgreSQL with TCP connectivity
- **Realtime:** Ably account with API key
- **Email:** Resend account with API key
- **Authentication:** Clerk account with production API keys
- **AI Models:** AWS account with Bedrock service access and appropriate model permissions

## Deployment

**Mobile (Expo EAS):**
- iOS: Submitted to Apple App Store with TestFlight distribution
- Android: APK builds via EAS, distributed via Google Play Store
- Build profiles in `mobile/eas.json`: development, development-production, development-simulator, preview, production, android-apk
- Auto-versioning enabled via `expo-updates`

**Backend API:**
- Custom Express server on port 3000
- Deployment target: Containerized or Node.js hosting (Vercel, Railway, Fly.io, AWS, etc.)
- Healthcheck endpoint: `GET /health`
- API routes: `/api/` and `/api/v1/`

**Website:**
- Deployment: Vercel (see `website/vercel.json`)
- Next.js 16.1.1 with auto-scaling

**Documentation Site:**
- Deployment: Vercel via `docs-site/vercel.json`
- Docusaurus 3.9.2 with pre-build script copying docs from `../docs/mvp-planning/`

---

*Stack analysis: 2026-02-14*
