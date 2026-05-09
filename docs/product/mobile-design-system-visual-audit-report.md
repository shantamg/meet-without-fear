# Mobile Design System Visual Audit Report

Last updated: 2026-05-09

## What Was Audited

- Inspected the handoff bundle at `/Users/shantam/Downloads/Conversation Sidebar list-handoff.zip`.
- Confirmed the handoff direction: Geist for UI/body, Geist Mono for labels, Instrument Serif for display/quote moments, warm restrained light/dark palettes, 8-12px radii, compact row density, subtle borders, and calm semantic states.
- Updated the goal workflow to make seeded real sessions the primary visual fixtures for session-specific states.
- Audited current shared surfaces through the design-system page and seeded session URLs:
  - Home
  - Settings main page and settings subpages
  - Session sidebar open state and conversation row overflow menu
  - Real activity drawer opened from a seeded session header
  - Real partner info drawer opened from a seeded session header
  - Real session-route audit fixtures for empathy statement, accuracy feedback, guided feedback draft, and needs drawers
  - Design-system inventory, palette, chat, CTAs, states, overlays
  - Session route states: created, empathy shared, reconciler shown, context shared, empathy revealed, needs complete, and Stage 4 variants
  - Real invitation-ready seeded session state
  - Scrolled viewport states for shared context, needs complete, and Stage 4 proposal inventory
  - Share topic drawer from both a seeded session offer and the design-system inventory
  - Support modal, transcription drawer, edit suggestion modal, and bottom-sheet-like decision surface
  - Takeaway review sheet from a seeded distilled Inner Thoughts route

## Screenshot Artifacts

Current run:

`mobile/test-results/design-audit/2026-05-09T09-37-55-333Z/`

Index:

`mobile/test-results/design-audit/2026-05-09T09-37-55-333Z/index.md`

The index records each screenshot, light/dark mode, route type, seed target stage where applicable, exact URL, and user side. The run contains 86 screenshots:

- 22 seeded session-route screenshots across 11 target stages in light/dark mode
- 6 scrolled real-session screenshots across 3 long states in light/dark mode
- 10 session-route audit-fixture screenshots in light/dark mode: invitation ready modal, empathy statement drawer, accuracy feedback drawer, guided feedback draft modal, and needs drawer
- 2 seeded Inner Thoughts route audit-fixture screenshots in light/dark mode for takeaway review
- 10 real session interaction screenshots in light/dark mode: sidebar open, conversation row overflow menu, activity drawer, partner info drawer, and real share-topic drawer
- 36 route/component inventory screenshots in light/dark mode, including settings subpages, transcription drawer, and edit suggestion modal

## What Was Refactored

- Added semantic light/dark tokens for success, warning, info, danger, overlay, and scrim states in `mobile/src/theme/appearance.tsx`.
- Removed a stale dark-only web modal page background from `mobile/src/theme/layout.ts`.
- Moved chat indicator semantic colors from one-off hard-coded blues/greens/oranges to appearance-aware palette tokens.
- Moved shared-content delivery status colors in `ChatBubble` to appearance-aware semantic tokens.
- Updated `ShareTopicDrawer`, `SupportOptionsModal`, and `WaitingBanner` to use appearance-aware palette and handoff-aligned font roles.
- Expanded `/design-system` into a deterministic inventory with query-driven `section`, `mode`, and `overlay` params.
- Added `mobile/scripts/capture-design-audit.mjs` to seed real sessions, capture light/dark screenshots, remove the Expo web app banner, and write a durable screenshot index.
- Updated the `RECONCILER_SHOWN_B` seed target so the partner side satisfies mobile share-offer fetch eligibility and renders the real `ShareTopicPanel` in the session route.
- Added real browser interaction captures for the session sidebar open state and the conversation row overflow menu.
- Added real browser interaction captures for the activity drawer from a seeded session header.
- Added real browser interaction captures for partner info and share-topic drawers from seeded session routes.
- Added `auditFixture` query support for real session routes so seeded sessions can deterministically open otherwise hard-to-reach session-owned drawers and modals for visual review.
- Added real session-route audit-fixture captures for empathy statement, accuracy feedback, guided feedback draft, and needs surfaces.
- Added scrolled real-session viewport captures for long chat/stage screens.
- Fixed the capture harness so session-route dark screenshots persist the app appearance preference before navigation instead of relying on a design-system-only query param.
- Anchored audit artifacts to `mobile/test-results/design-audit` regardless of the current working directory.
- Moved `ActivityDrawer` and `TimelineItemCard` off static dark-only colors and onto the shared appearance palette.
- Moved `PartnerInfoDrawer` off static dark-only colors and onto the shared appearance palette.
- Moved `ViewEmpathyStatementDrawer`, `AccuracyFeedbackDrawer`, `GuidedDraftChatModal`, and `NeedsDrawer` off static dark-only colors and onto the shared appearance palette.
- Moved `TranscriptionDrawer` and `EditSuggestionModal` off static dark-only colors and onto the shared appearance palette after fixture screenshots exposed light-mode dark surfaces.
- Added an `INVITATION_READY` StateFactory target and a seeded Inner Thoughts takeaway fixture so both remaining audit cases load deterministically.
- Moved the invitation-ready modal, `TakeawayReviewSheet`, and `TakeawayRow` off static dark-only colors and onto the shared appearance palette.
- Added settings subpage screenshot coverage for account, voice, memories, privacy, and help.

## Tokens And Primitives Now Owning The Design

- `mobile/src/theme/appearance.tsx`: semantic palette ownership for app background, elevated surfaces, borders, text hierarchy, accent, success, warning, info, danger, overlays, and scrims.
- `mobile/src/theme/fonts.ts`: handoff font roles for Geist, Geist Mono, and Instrument Serif.
- `GuidedActionPanel`: shared bottom CTA structure for topic, review, share, success, and needs states.
- `ChatBubble` and `ChatIndicator`: chat message and timeline-state primitives using semantic appearance tokens.
- `ActivityDrawer` and `TimelineItemCard`: exchange-history drawer and timeline card surfaces using semantic appearance tokens.
- `PartnerInfoDrawer`: partner detail sheet using semantic appearance tokens and shared scrim color.
- `ViewEmpathyStatementDrawer`, `AccuracyFeedbackDrawer`, `GuidedDraftChatModal`, and `NeedsDrawer`: session-owned review, feedback, draft, and needs overlays using semantic appearance tokens.
- `TranscriptionDrawer`, `EditSuggestionModal`, `ShareTopicDrawer`, `SupportOptionsModal`, and design-system sheet preview: representative overlay/sheet/modal surfaces using shared palette logic.
- `TakeawayReviewSheet` and `TakeawayRow`: distilled Inner Thoughts review surface using semantic appearance tokens.
- `/design-system`: live inventory for palette, type, chat, CTAs, states, overlays, and conversation-list direction.

## Verification

- `cd mobile && npm run check` passed.
- `cd mobile && npm run lint -- --quiet` passed.
- `cd backend && npm run check` passed.
- `node --check mobile/scripts/capture-design-audit.mjs` passed.
- `node mobile/scripts/capture-design-audit.mjs` passed against localhost backend/mobile servers and wrote the current screenshot run.
- `cd mobile && npm test -- src/components/__tests__/ChatInterface.test.tsx --runInBand` passed.
- `cd mobile && npm test -- --runTestsByPath 'app/(auth)/(tabs)/__tests__/index.test.tsx' --runInBand` passed.
- `cd backend && npm test -- src/testing/__tests__/state-factory.test.ts --runInBand` passed.

## Known Issues And Follow-Ups

- Activity drawer, partner info drawer, share-topic drawer, invitation ready modal, empathy statement drawer, accuracy feedback drawer, guided draft modal, needs drawer, and takeaway review now have direct seeded-route or URL-controllable route coverage. Transcription drawer and edit suggestion modal have direct design-system fixture openings because they are component overlays not currently represented as persisted session state.
- The artifacts are ignored by git; durable review depends on the local `mobile/test-results/design-audit/...` directory unless artifact upload is added.
