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
  - Design-system inventory, palette, chat, CTAs, states, overlays
  - Session route states: created, empathy shared, reconciler shown, context shared, empathy revealed, needs complete, and Stage 4 variants
  - Scrolled viewport states for shared context, needs complete, and Stage 4 proposal inventory
  - Share topic drawer, support modal, and bottom-sheet-like decision surface

## Screenshot Artifacts

Current run:

`mobile/test-results/design-audit/2026-05-09T08-45-14-057Z/`

Index:

`mobile/test-results/design-audit/2026-05-09T08-45-14-057Z/index.md`

The index records each screenshot, light/dark mode, route type, seed target stage where applicable, exact URL, and user side. The run contains 64 screenshots:

- 20 seeded session-route screenshots across 10 target stages in light/dark mode
- 6 scrolled real-session screenshots across 3 long states in light/dark mode
- 6 real session interaction screenshots in light/dark mode: sidebar open, conversation row overflow menu, and activity drawer
- 32 route/component inventory screenshots in light/dark mode, including settings subpages

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
- Added scrolled real-session viewport captures for long chat/stage screens.
- Fixed the capture harness so session-route dark screenshots persist the app appearance preference before navigation instead of relying on a design-system-only query param.
- Anchored audit artifacts to `mobile/test-results/design-audit` regardless of the current working directory.
- Moved `ActivityDrawer` and `TimelineItemCard` off static dark-only colors and onto the shared appearance palette.
- Added settings subpage screenshot coverage for account, voice, memories, privacy, and help.

## Tokens And Primitives Now Owning The Design

- `mobile/src/theme/appearance.tsx`: semantic palette ownership for app background, elevated surfaces, borders, text hierarchy, accent, success, warning, info, danger, overlays, and scrims.
- `mobile/src/theme/fonts.ts`: handoff font roles for Geist, Geist Mono, and Instrument Serif.
- `GuidedActionPanel`: shared bottom CTA structure for topic, review, share, success, and needs states.
- `ChatBubble` and `ChatIndicator`: chat message and timeline-state primitives using semantic appearance tokens.
- `ActivityDrawer` and `TimelineItemCard`: exchange-history drawer and timeline card surfaces using semantic appearance tokens.
- `ShareTopicDrawer`, `SupportOptionsModal`, and design-system sheet preview: representative overlay/sheet/modal surfaces using shared palette logic.
- `/design-system`: live inventory for palette, type, chat, CTAs, states, overlays, and conversation-list direction.

## Verification

- `cd mobile && npm run check` passed.
- `cd mobile && npm run lint -- --quiet` passed.
- `cd backend && npm run check` passed.
- `node --check mobile/scripts/capture-design-audit.mjs` passed.
- `node mobile/scripts/capture-design-audit.mjs` passed against localhost backend/mobile servers and wrote the current screenshot run.

## Known Issues And Follow-Ups

- Activity drawer now has direct seeded-session interaction coverage; needs, partner info, empathy statement, accuracy feedback, transcription, invitation ready, edit suggestion, guided draft, and takeaway review still need direct seeded-session or URL-controllable fixture openings.
- The artifacts are ignored by git; durable review depends on the local `mobile/test-results/design-audit/...` directory unless artifact upload is added.
