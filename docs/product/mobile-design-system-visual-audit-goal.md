# Mobile Design System Visual Audit And Refactor Goal

You are working in `/Users/shantam/Software/meet-without-fear`.

Your goal is to systematically bring the mobile app, and the responsive web version where the same React Native Web surfaces apply, into a clean, consistent design system aligned with the handoff designs in:

`/Users/shantam/Downloads/Conversation Sidebar list-handoff.zip`

Use the handoff as design direction, not as literal content. Do not copy fabricated message text, timestamps under every chat message, extra numeric badges, or chat bubbles if the existing app has a better product decision. Preserve product-specific improvements already made in the app, especially the cleaner chat lines and the 3-dot conversation row menu.

## Outcome

By the end, the app should feel like one coherent product:

- Home, sidebar, chat, settings, design-system page, drawers, sheets, modals, CTAs, cards, inputs, indicators, headers, and empty/loading states should share the same typography, spacing, color logic, radius, borders, and interaction states.
- Light and dark mode should work consistently on every audited surface.
- The design should be architected so future visual changes are simple: most tokens, component primitives, shared styles, and theme logic should live in one place with clear inheritance and reuse.
- One-off colors, one-off typography, and duplicated component styling should be reduced or eliminated unless there is a documented reason.
- The implementation should pass typecheck, lint, relevant tests, and visual verification.

## Current Design Direction

Start by studying the existing implementation and the handoff assets:

- Extract or inspect `/Users/shantam/Downloads/Conversation Sidebar list-handoff.zip`.
- Confirm the intended font stack from the handoff: Geist for UI/body, Geist Mono for labels, Instrument Serif for display/brand/quote moments.
- Inspect the current design system work in:
  - `mobile/src/theme/appearance.tsx`
  - `mobile/src/theme/colors.ts`
  - `mobile/src/theme/fonts.ts`
  - `mobile/src/theme/typography.ts`
  - `mobile/app/(auth)/design-system.tsx`
  - `mobile/src/components/GuidedActionPanel.tsx`
  - `mobile/src/components/SessionDrawer/index.tsx`
  - `mobile/src/components/SessionChatHeader.tsx`
  - `mobile/src/components/ChatInterface.tsx`
  - `mobile/src/components/ChatBubble.tsx`
  - `mobile/app/(auth)/(tabs)/index.tsx`
  - `mobile/app/(auth)/settings/index.tsx`
  - `mobile/app/(auth)/settings/_layout.tsx`
- Treat `http://localhost:8082/design-system?e2e-user-id=cmoxzkzzy009kpx4vbaobcrg4&e2e-user-email=visual-a%40e2e.test` as the first design inventory page, but improve it if it does not expose enough components/states.

## Required Workflow

Work in loops. Do not stop after a static audit. Seed data, load concrete situations, take screenshots, compare visually, refine, and repeat.

1. Inventory all meaningful app surfaces.
   Include at minimum:
   - home page
   - conversation sidebar open and closed
   - conversation row menu
   - chat surface in multiple stages
   - chat input, emotion slider, typing indicator, chat indicators, shared context cards, user messages, assistant messages, system/intervention messages
   - bottom guided CTAs: topic, revision, review, share, needs, success, waiting
   - settings main page and settings subpages
   - design-system page
   - drawers: activity, share topic, needs, partner info, empathy statement, accuracy feedback, transcription if still active
   - modal/sheet surfaces: support options, invitation ready, edit suggestion, guided draft, takeaway review, bottom-sheet-like decisions
   - loading, empty, blocked, access denied, resolved/completed, waiting, and error states
   - light mode and dark mode for each surface where feasible

2. Build or improve deterministic visual fixtures.
   Seed the database or add local E2E fixture helpers so each important situation can be loaded directly by URL with a known E2E user.
   Prefer deterministic seeded state over manual clicking.
   If a state is hard to seed, add a narrow fixture route or extend the design-system page to render the real component with representative props.
   Do not leave important states requiring private knowledge or fragile manual setup.

3. Capture screenshots for every situation.
   Use browser automation against localhost.
   Save screenshots to a durable artifacts directory such as:
   `mobile/test-results/design-audit/<date-or-run-id>/`
   Organize by surface and mode, for example:
   - `home-light.png`
   - `home-dark.png`
   - `sidebar-light.png`
   - `chat-stage-2-revision-dark.png`
   - `settings-light.png`
   - `share-topic-drawer-dark.png`
   Keep an index file describing what each screenshot represents and the URL or seed command used to create it.

4. Compare against the handoff direction and the in-app design-system page.
   For every screenshot, judge:
   - typography: correct family, weight, scale, line height
   - spacing: consistent vertical rhythm and density
   - color: no overly bright or off-palette values, proper contrast in light/dark
   - hierarchy: the most important action and information are clear
   - component consistency: buttons, rows, cards, labels, icons, headers, drawers, CTAs share the same primitives
   - state clarity: selected, disabled, loading, destructive, success, waiting, and warning states are obvious without looking loud
   - layout resilience: no text overlap, cramped labels, clipped controls, or awkward empty space on mobile/web widths
   - product fit: do not add decorative marketing UI, oversized cards, or unnecessary chrome

5. Refactor the design architecture.
   After enough screenshots reveal patterns, refactor before continuing with broad visual tweaks.
   The goal is not just prettier screens; it is a design system that is easier to change.
   Expected improvements may include:
   - centralizing semantic color tokens for surface, text, border, accent, success, warning, danger, selected, disabled, overlay, scrim
   - replacing static `colors.*` usage in themed screens with appearance-aware palette or semantic components
   - creating reusable primitives for page, card, list row, segmented control, icon button, text button, primary/secondary/destructive button, bottom CTA panel, drawer header, sheet, modal, label, and avatar
   - consolidating typography helpers for serif headings, UI body, mono labels, button text, captions
   - reducing duplicated StyleSheet blocks that encode the same radii, borders, and paddings
   - making the design-system page a useful live inventory of real primitives and real product states
   - documenting any remaining intentional exceptions

6. Iterate visually.
   After refactoring, re-run the seeded visual fixtures and update screenshots.
   Continue fixing anything that looks off, confusing, inconsistent, cramped, or overly bright.
   Do not accept a surface as complete until it has been loaded and visually checked in both light and dark mode, unless the surface truly cannot appear in one mode.

7. Commit and push frequently.
   Work in small, reviewable checkpoints and push them to the remote branch often.
   Commit after meaningful slices such as:
   - adding or improving visual fixtures/seeds
   - completing a group of screenshots
   - refactoring shared tokens/primitives
   - finishing a surface group such as settings, chat, drawers, or CTAs
   - fixing a batch of visual inconsistencies
   Before each commit, run the relevant focused checks for that slice.
   Do not create one giant final commit if the work spans multiple surfaces.
   Keep commit messages specific, for example:
   - `Add design audit fixtures for chat states`
   - `Refactor themed button primitives`
   - `Align settings and drawer surfaces with design tokens`
   Push each checkpoint to the remote so progress is preserved and reviewable.

## Verification Requirements

You are done only when all of these are true:

- Every inventoried surface has a deterministic way to load it.
- Every inventoried surface has a current screenshot artifact in light and dark mode where applicable.
- The screenshot index documents URL, seed command, and notes for each surface.
- The handoff zip has been inspected and its relevant visual traits have been reflected without copying fabricated content.
- The design-system page exposes the core palette, typography, components, CTAs, drawers, sheets, and mode toggles.
- The app has a clearer design architecture than before, with shared tokens/primitives and less duplicated styling.
- No major surface still uses stale dark-only colors when in light mode.
- No major surface has obvious text overlap, cramped controls, clipped content, or inconsistent CTA colors.
- `npm run check` passes in `mobile`.
- `npm run lint -- --quiet` passes in `mobile`.
- Relevant tests pass, including current chat/home/settings tests and any visual-fixture tests added.
- The branch has been committed in meaningful checkpoints and pushed to the remote.
- A final report is written to `docs/product/mobile-design-system-visual-audit-report.md` summarizing:
  - what was audited
  - where screenshots are saved
  - what was refactored
  - what tokens/primitives now own the design
  - remaining known issues or follow-up recommendations

## Constraints

- Do not revert user changes.
- Keep product behavior intact unless a visual bug requires a small UI-only behavior adjustment.
- Prefer existing app patterns and existing components, then refactor toward shared primitives.
- Do not introduce a separate web-only design system unless unavoidable; keep React Native and React Native Web aligned.
- Do not broaden scope into backend product logic except to create deterministic fixtures/seeds.
- Use real rendered screenshots as the source of truth, not static reasoning alone.
- Avoid one-note palettes, especially overly bright green/orange accents in dark mode.
- Keep CTAs calm, clear, and consistent with the current warm restrained palette.
