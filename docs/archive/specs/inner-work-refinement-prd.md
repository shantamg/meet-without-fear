# Inner Work Section Refinement - Technical Specification

*Generated: 2026-01-11*

## Overview

Comprehensive refinement of the Inner Work section to improve accessibility (Inner Thoughts quick access from home), fix meditation timing accuracy, add custom meditation creation, implement People Tracking and Cross-Feature Intelligence, and ensure navigation completeness with no dead ends.

## Problem Statement

1. **Inner Thoughts Accessibility**: Currently buried as 4th item in Inner Work hub - users need quick, instant access
2. **Meditation Duration Inaccuracy**: Script generation promises X minutes but TTS playback time is unpredictable
3. **No Custom Meditations**: Users cannot save, create, or upload their own meditation scripts
4. **Missing Features**: People Tracking and Cross-Feature Intelligence from plan docs not implemented
5. **Navigation Gaps**: Potential dead ends, unclear back button behavior, incomplete error handling

---

## Scope

### In Scope

**Phase 1: Home Page Chat + Inner Thoughts Improvements**
- Home page chat input for instant Inner Thoughts sessions
- AI-powered action suggestions (partner session, meditation, gratitude, needs check-in)
- Inner Thoughts to Partner Session transition with context handoff
- New person invitation flow from Inner Thoughts

**Phase 2: Meditation Refinements**
- Structured timing tokens (`[PAUSE:Xs]`) with accurate duration calculation
- Custom meditation creation via chat-based composition
- Text upload/paste with AI conversion to structured format
- Saved meditations library (edit via chat only)

**Phase 3: People Tracking + Cross-Feature Intelligence**
- AI-powered people extraction from conversations (hybrid with user confirmation)
- Confidence-based auto-linking to existing session partners
- Cross-feature pattern recognition and insights
- Proactive insight cards on Inner Work hub
- Contextual insights woven into conversations

**Phase 4: Navigation Audit + Polish**
- Back button behavior verification across all screens
- Session completion flow improvements
- Error state handling
- Integration tests for all new features

### Out of Scope

- Information architecture restructuring (keeping current hub structure)
- Direct text editing of saved meditations (edit via chat only)
- Offline meditation playback (future enhancement)
- Push notification system for insights

---

## User Stories

### US-1: Home Page Chat Input

**Description:** As a user, I want to start an Inner Thoughts session by typing directly on the home page, so I can quickly capture what's on my mind without navigating to Inner Work hub.

**Acceptance Criteria:**
- [ ] Chat input component renders above action buttons on home screen
- [ ] Input uses same styling as in-session chat input (consistent design)
- [ ] Pressing send creates new Inner Thoughts session via `POST /api/inner-thoughts` with `initialMessage` parameter
- [ ] User navigates to `/inner-work/self-reflection/[new-id]` after session creation
- [ ] First message appears as user message (no AI greeting first)
- [ ] Input clears after successful submission
- [ ] Loading spinner shown while creating session
- [ ] Error toast displayed if session creation fails with retry option
- [ ] `npm run check` passes
- [ ] `npm run test` passes with new tests for home chat input

---

### US-2: AI Action Suggestions in Inner Thoughts

**Description:** As a user, I want the AI to suggest relevant actions during my Inner Thoughts session, so I can seamlessly transition to other helpful features.

**Acceptance Criteria:**
- [ ] AI response JSON schema includes optional `suggestedActions` array
- [ ] Supported action types: `start_partner_session`, `start_meditation`, `add_gratitude`, `check_need`
- [ ] Each action includes: `type`, `label`, `personName?`, `personId?`, `context`
- [ ] UI renders action buttons below AI response message when present
- [ ] Actions only appear when AI determines contextually appropriate (no rigid rules)
- [ ] Backend prompt instructs AI on when/how to suggest actions
- [ ] Tapping action button triggers appropriate navigation/flow
- [ ] `npm run check` passes
- [ ] `npm run test` passes with action suggestion tests

---

### US-3: Inner Thoughts to Partner Session Transition

**Description:** As a user, when AI suggests starting a session with someone I've been discussing, I want to transition smoothly with relevant context carried over.

**Acceptance Criteria:**
- [ ] Tapping "Start session with [Name]" action triggers transition flow
- [ ] For existing partners: navigate to `/session/new?partnerId=[id]&innerThoughtsId=[id]`
- [ ] For new people: navigate to `/session/new?personName=[name]&innerThoughtsId=[id]`
- [ ] Backend `POST /api/inner-thoughts/:id/generate-context` generates context summary
- [ ] Context summary includes: key concerns, emotional state, relevant details
- [ ] New session's first AI message summarizes the context concisely
- [ ] Context is visible to both participants (part of conversation history)
- [ ] Existing new session flow reused with extended query params
- [ ] `npm run check` passes
- [ ] Integration test for full transition flow passes

---

### US-4: Structured Meditation Timing Tokens

**Description:** As a user, I want accurate meditation duration estimates, so I know approximately how long my session will take before starting.

**Acceptance Criteria:**
- [ ] AI-generated scripts use `[PAUSE:Xs]` token format (X = seconds, e.g., `[PAUSE:30s]`)
- [ ] `parseMeditationScript()` function extracts pause tokens and spoken text
- [ ] `calculateDuration()` computes: `(wordCount / 100) * 60 + totalPauseSeconds`
- [ ] Duration displayed as "approximately X minutes" after generation (not exact promise)
- [ ] Playback respects pause tokens with actual silence between speech
- [ ] Existing TTS chunking extended to handle pause tokens correctly
- [ ] Unit tests for `parseMeditationScript()` function pass
- [ ] Unit tests for `calculateDuration()` function pass
- [ ] `npm run check` passes

---

### US-5: Custom Meditation Creation via Chat

**Description:** As a user, I want to create custom meditations by chatting with AI, so I can get personalized scripts tailored to my needs.

**Acceptance Criteria:**
- [ ] New "Create Custom" option visible on Meditation screen
- [ ] Tapping opens chat interface with meditation creation context
- [ ] AI guides user through script creation (focus, duration, specific needs)
- [ ] AI outputs structured script with timing tokens
- [ ] User can iterate: "make the breathing section longer", "add body scan"
- [ ] "Save this meditation" action available in chat after script generated
- [ ] Saved meditation stored with: title, script, durationSeconds, createdAt, conversationId
- [ ] Navigation to saved meditation plays it with TTS
- [ ] `npm run check` passes
- [ ] `npm run test` passes with meditation creation tests

---

### US-6: Text Upload/Paste Meditation

**Description:** As a user, I want to paste my own meditation text and have AI convert it to a playable format with proper timing.

**Acceptance Criteria:**
- [ ] "Import Text" option available on Meditation screen or during creation chat
- [ ] Text input modal opens for pasting meditation script
- [ ] `POST /api/meditation/parse` processes text and converts to structured format with tokens
- [ ] AI asks clarifying questions if pause timing unclear
- [ ] User confirms/edits the structured version before saving
- [ ] Save to library once finalized
- [ ] `npm run check` passes
- [ ] `npm run test` passes with text import tests

---

### US-7: Saved Meditations Library

**Description:** As a user, I want to browse and replay my saved meditations.

**Acceptance Criteria:**
- [ ] "My Meditations" section visible on Meditation screen
- [ ] Lists saved meditations with title, approximate duration, created date
- [ ] Tapping opens playback view (same as generated meditation)
- [ ] "Edit" option opens original chat conversation to refine
- [ ] Swipe-to-delete with confirmation dialog
- [ ] Empty state with CTA to create first custom meditation
- [ ] `GET /api/meditation/saved` returns user's saved meditations
- [ ] `DELETE /api/meditation/saved/:id` removes meditation
- [ ] `npm run check` passes
- [ ] `npm run test` passes with library CRUD tests

---

### US-8: People Tracking - Extraction

**Description:** As a system, I want to extract and track people mentioned across Inner Work features to build relationship context.

**Acceptance Criteria:**
- [ ] AI extracts person mentions from Inner Thoughts messages
- [ ] Extraction includes: name/reference, context, sentiment
- [ ] Deduplication: "my mom", "Mom", "she" recognized as same person within session
- [ ] Confidence score assigned to each extraction (0-1)
- [ ] `Person` table in database: id, userId, name, aliases[], sessionPartnerId?, createdAt, updatedAt
- [ ] `PersonMention` table: id, personId, featureType, featureId, context, sentiment, createdAt
- [ ] Backend service processes messages and stores extractions
- [ ] High confidence matches (>0.8) auto-linked to existing session partners
- [ ] Ambiguous matches (<0.8) stored as pending for user confirmation
- [ ] `npm run check` passes
- [ ] `npm run test` passes with extraction tests

---

### US-9: People Tracking - Linking to Partners

**Description:** As a user, I want people I mention to be connected to my session partners when applicable.

**Acceptance Criteria:**
- [ ] When extracting person, system checks against user's session partners
- [ ] Exact name match with high confidence: auto-link without prompt
- [ ] Partial/nickname match: store as pending, show confirmation UI
- [ ] Confirmation UI appears in Inner Thoughts session as inline prompt
- [ ] Once linked, `Person.sessionPartnerId` populated
- [ ] Cross-feature queries can join Person to Session data
- [ ] `POST /api/people/:id/link` links person to partner
- [ ] `POST /api/people/:id/confirm` confirms AI-extracted person
- [ ] `npm run check` passes
- [ ] `npm run test` passes with linking tests

---

### US-10: Cross-Feature Intelligence - Pattern Recognition

**Description:** As a system, I want to recognize patterns across all Inner Work features to provide meaningful insights.

**Acceptance Criteria:**
- [ ] Service analyzes: needs scores, gratitude entries, meditation sessions, Inner Thoughts, partner sessions
- [ ] Detects patterns: frequency changes, mood correlations, person-need connections
- [ ] Detects contradictions: "trust is fully met" but recent session shows trust issues
- [ ] `Insight` table: id, userId, type, summary, data (JSON), priority, dismissed, expiresAt, createdAt
- [ ] Insight types: PATTERN, CONTRADICTION, SUGGESTION
- [ ] Insights refresh on configurable schedule (daily by default)
- [ ] Old insights expire after 30 days or when superseded
- [ ] `npm run check` passes
- [ ] `npm run test` passes with pattern recognition tests

---

### US-11: Cross-Feature Intelligence - Proactive Insight Cards

**Description:** As a user, I want to see relevant insights on the Inner Work hub so I can learn about my patterns.

**Acceptance Criteria:**
- [ ] Inner Work Hub fetches active insights via `GET /api/insights`
- [ ] Insights rendered as dismissible cards above feature cards
- [ ] Card shows: insight summary, "Learn more" action, dismiss button
- [ ] Maximum 2 insights shown at once (prioritized by priority field)
- [ ] `POST /api/insights/:id/dismiss` marks insight as dismissed
- [ ] Dismissed insights don't reappear (stored in insight.dismissed)
- [ ] "Learn more" navigates to relevant feature or opens detail modal
- [ ] `npm run check` passes
- [ ] `npm run test` passes with insight card tests

---

### US-12: Cross-Feature Intelligence - Conversation Integration

**Description:** As a user, I want the AI to reference cross-feature patterns naturally in my conversations.

**Acceptance Criteria:**
- [ ] Inner Thoughts prompts receive user's active insights in system context
- [ ] Partner Session prompts also receive relevant insights
- [ ] AI can reference patterns: "I notice your gratitude often mentions [person]..."
- [ ] AI weaves observations naturally, not as separate UI elements
- [ ] Insights flag in prompt indicates which patterns are contextually relevant
- [ ] AI doesn't force insights into conversation - uses judgment
- [ ] `npm run check` passes
- [ ] `npm run test` passes with conversation integration tests

---

### US-13: Navigation Audit - Back Button Behavior

**Description:** As a user, I want consistent and predictable back navigation across all Inner Work screens.

**Acceptance Criteria:**
- [ ] Document expected back behavior for each Inner Work screen
- [ ] Meditation: active playback -> confirm exit modal; other states -> previous screen
- [ ] Needs Assessment: baseline flow -> confirm exit with "progress will be saved"; check-in -> overview
- [ ] Gratitude: entry form with unsaved changes -> confirm discard; otherwise -> home
- [ ] Inner Thoughts: chat -> session list -> hub -> home (consistent hierarchy)
- [ ] All screens implement consistent back navigation pattern
- [ ] No orphaned screens (every screen has back path to hub or home)
- [ ] Manual verification checklist for all back flows
- [ ] `npm run check` passes

---

### US-14: Navigation Audit - Completion Flows

**Description:** As a user, after completing an activity, I want clear next steps so I'm never stuck.

**Acceptance Criteria:**
- [ ] Needs baseline complete: show summary, "View Results" and "Back to Hub" buttons
- [ ] Meditation complete: show stats, optional rating prompt, "Done" returns to meditation home
- [ ] Gratitude entry saved: show confirmation animation, entry appears in list immediately
- [ ] Inner Thoughts session: can always continue; "End Session" option visible
- [ ] No dead ends: every completion screen has at least one forward action
- [ ] All completion screens tested for presence of navigation options
- [ ] `npm run check` passes

---

### US-15: Navigation Audit - Error Handling

**Description:** As a user, when something fails, I want to understand what happened and how to proceed.

**Acceptance Criteria:**
- [ ] API errors show user-friendly toast/alert (not raw error messages)
- [ ] Retry option available for transient failures (network, timeout)
- [ ] Form validation errors shown inline next to relevant field
- [ ] Network offline: show offline indicator, queue actions where possible
- [ ] Session creation failure: stays on current screen, shows error with retry
- [ ] Meditation generation failure: "Try Again" button visible
- [ ] No blank screens on error - always show error state UI
- [ ] `npm run check` passes

---

## Functional Requirements

| ID | Requirement | Related User Stories |
|----|-------------|---------------------|
| FR-1 | Home screen displays chat input component for instant Inner Thoughts access | US-1 |
| FR-2 | `POST /api/inner-thoughts` accepts optional `initialMessage` parameter | US-1, US-3 |
| FR-3 | AI responses include optional `suggestedActions` array with action metadata | US-2 |
| FR-4 | `POST /api/inner-thoughts/:id/generate-context` creates session transition summary | US-3 |
| FR-5 | New session flow accepts `innerThoughtsId` and `personName` query parameters | US-3 |
| FR-6 | Meditation scripts use `[PAUSE:Xs]` token format for pause timing | US-4 |
| FR-7 | `parseMeditationScript()` and `calculateDuration()` utilities exist and are tested | US-4 |
| FR-8 | TTS playback respects pause tokens with actual silence | US-4 |
| FR-9 | Meditation creation chat flow guides users through script composition | US-5 |
| FR-10 | `POST /api/meditation/parse` converts user text to structured format | US-6 |
| FR-11 | `SavedMeditation` model stores user's custom meditations | US-5, US-6, US-7 |
| FR-12 | Saved meditations CRUD API: GET, POST, DELETE endpoints | US-7 |
| FR-13 | `Person` and `PersonMention` models track people across features | US-8, US-9 |
| FR-14 | People extraction service processes messages with confidence scoring | US-8 |
| FR-15 | `Insight` model stores cross-feature patterns and suggestions | US-10, US-11 |
| FR-16 | Pattern recognition service analyzes user data for insights | US-10 |
| FR-17 | Inner Work Hub displays insight cards with dismiss functionality | US-11 |
| FR-18 | AI prompts include user's active insights for contextual integration | US-12 |
| FR-19 | All Inner Work screens have consistent back navigation to hub/home | US-13 |
| FR-20 | All completion screens have clear next-step actions | US-14 |
| FR-21 | Error states display user-friendly messages with retry options | US-15 |

---

## Non-Functional Requirements

| ID | Requirement | Metric |
|----|-------------|--------|
| NFR-1 | Home chat input responds within 300ms of keystroke | Latency < 300ms |
| NFR-2 | Inner Thoughts session creation completes within 2 seconds | API response < 2s |
| NFR-3 | Meditation script generation completes within 3 seconds | AI response < 3s |
| NFR-4 | Meditation duration estimate within 20% of actual playback time | Accuracy > 80% |
| NFR-5 | Insight generation does not block user interactions | Background processing |
| NFR-6 | All new features pass TypeScript strict mode | `npm run check` passes |
| NFR-7 | All new features have unit/integration tests | `npm run test` passes |
| NFR-8 | Mobile build succeeds after changes | `expo export` passes |

---

## Technical Design

### Data Model Additions

```prisma
model Person {
  id               String   @id @default(cuid())
  userId           String
  name             String
  aliases          String[]
  sessionPartnerId String?  // Link to Partner if matched
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  user             User     @relation(fields: [userId], references: [id])
  sessionPartner   Partner? @relation(fields: [sessionPartnerId], references: [id])
  mentions         PersonMention[]
}

model PersonMention {
  id          String   @id @default(cuid())
  personId    String
  featureType String   // INNER_THOUGHTS, GRATITUDE, NEEDS, MEDITATION, SESSION
  featureId   String
  context     String
  sentiment   String?  // POSITIVE, NEGATIVE, NEUTRAL
  createdAt   DateTime @default(now())

  person      Person   @relation(fields: [personId], references: [id])
}

model Insight {
  id        String   @id @default(cuid())
  userId    String
  type      String   // PATTERN, CONTRADICTION, SUGGESTION
  summary   String
  data      Json
  priority  Int      @default(0)
  dismissed Boolean  @default(false)
  expiresAt DateTime?
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id])
}

model SavedMeditation {
  id             String   @id @default(cuid())
  userId         String
  title          String
  script         String   // Includes [PAUSE:Xs] tokens
  durationSeconds Int
  conversationId String?  // Link to chat that created it
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  user           User     @relation(fields: [userId], references: [id])
}
```

### API Endpoints

**Inner Thoughts Enhancements:**
- `POST /api/inner-thoughts` - Extended to accept `initialMessage` for home page flow
- `POST /api/inner-thoughts/:id/generate-context` - Generate context summary for session transition

**Meditation:**
- `GET /api/meditation/saved` - List user's saved meditations
- `POST /api/meditation/saved` - Save a custom meditation
- `DELETE /api/meditation/saved/:id` - Delete saved meditation
- `POST /api/meditation/parse` - Parse uploaded text into structured format

**People Tracking:**
- `GET /api/people` - List tracked people
- `POST /api/people/:id/link` - Link to session partner
- `POST /api/people/:id/confirm` - Confirm AI-extracted person

**Insights:**
- `GET /api/insights` - Get user's active insights
- `POST /api/insights/:id/dismiss` - Dismiss an insight

---

## Implementation Phases

### Phase 1: Home Page Chat + Inner Thoughts Improvements
**Priority: FIRST**

Tasks:
- [ ] Create `HomePageChatInput` component in `mobile/app/(auth)/(tabs)/index.tsx`
- [ ] Extend `POST /api/inner-thoughts` to accept `initialMessage`
- [ ] Add AI action suggestion schema to Inner Thoughts response
- [ ] Create action button UI components
- [ ] Implement `POST /api/inner-thoughts/:id/generate-context` endpoint
- [ ] Modify new session flow to accept `innerThoughtsId`
- [ ] Write integration tests for chat input and transition flow

**Verification:**
```bash
npm run check
npm run test -- --grep "inner-thoughts"
```

### Phase 2: Meditation Refinements
**Priority: SECOND**

Tasks:
- [ ] Define `[PAUSE:Xs]` token specification in shared types
- [ ] Implement `parseMeditationScript()` utility
- [ ] Implement `calculateDuration()` utility
- [ ] Update TTS playback to respect pause tokens
- [ ] Add "approximately X min" display post-generation
- [ ] Create meditation creation chat flow
- [ ] Implement text upload/paste with AI conversion
- [ ] Create `SavedMeditation` model and migrations
- [ ] Implement saved meditations API and UI
- [ ] Write unit tests for parsing/calculation
- [ ] Write integration tests for save/load flow

**Verification:**
```bash
npm run check
npm run test -- --grep "meditation"
```

### Phase 3: People Tracking + Cross-Feature Intelligence
**Priority: THIRD**

Tasks:
- [ ] Create `Person`, `PersonMention`, `Insight` models and migrations
- [ ] Implement people extraction service (AI-powered)
- [ ] Implement confidence-based partner linking
- [ ] Create confirmation UI for ambiguous matches
- [ ] Implement pattern recognition service
- [ ] Implement contradiction detection service
- [ ] Create insight cards on Inner Work hub
- [ ] Extend conversation prompts to include insights
- [ ] Write integration tests for extraction and insights

**Verification:**
```bash
npm run check
npm run test -- --grep "people|insight"
```

### Phase 4: Navigation Audit + Polish
**Priority: FOURTH**

Tasks:
- [ ] Document all screen back behaviors in implementation notes
- [ ] Fix any inconsistent back navigation
- [ ] Improve completion flow UI for all features
- [ ] Add error handling for all API calls
- [ ] Add retry mechanisms for transient failures
- [ ] Write E2E navigation tests
- [ ] Complete manual testing of all flows

**Verification:**
```bash
npm run check
npm run test
# Manual QA checklist completion
```

---

## Definition of Done

This feature is complete when:

- [ ] All 15 user stories pass acceptance criteria
- [ ] All 4 phases verified with `npm run check` and `npm run test`
- [ ] Types/lint check passes: `npm run check`
- [ ] All tests pass: `npm run test`
- [ ] Build succeeds: mobile `expo export` and backend build
- [ ] Manual QA: all navigation flows verified, no dead ends found
- [ ] Integration tests added for all new features
- [ ] No TypeScript errors in strict mode

---

## Verification Commands

```bash
# Type checking
npm run check

# All tests
npm run test

# Backend tests only
cd backend && npm run test

# Mobile build verification
cd mobile && npx expo export --platform ios

# Specific test suites
npm run test -- --grep "inner-thoughts"
npm run test -- --grep "meditation"
npm run test -- --grep "people"
npm run test -- --grep "insight"
```

---

## Implementation Notes

**Key Files to Modify:**

1. `mobile/app/(auth)/(tabs)/index.tsx` - Add home page chat input
2. `mobile/src/screens/InnerThoughtsScreen.tsx` - Add action button rendering
3. `mobile/src/screens/MeditationScreen.tsx` - Add custom creation and saved library
4. `mobile/src/screens/InnerWorkHubScreen.tsx` - Add insight cards
5. `backend/src/controllers/inner-work.ts` - Add context generation
6. `backend/src/routes/inner-thoughts.ts` - Extend for initial message
7. `backend/src/routes/meditation.ts` - Add saved meditation endpoints
8. `backend/prisma/schema.prisma` - Add new models

**Existing Assets to Leverage:**

- Chat input component already exists (reuse styling)
- TTS chunking for meditation already implemented (extend for pause tokens)
- Session creation flow already exists (extend with query params)
- AI prompt patterns established (extend for action suggestions)

---

## Ralph Loop Command

```bash
/ralph-loop "Implement Inner Work Refinement per spec at docs/specs/inner-work-refinement-prd.md

PHASES:
- Phase 1: Home Page Chat + Inner Thoughts (US-1, US-2, US-3)
  Verification: npm run check && npm run test -- --grep inner-thoughts
- Phase 2: Meditation Refinements (US-4, US-5, US-6, US-7)
  Verification: npm run check && npm run test -- --grep meditation
- Phase 3: People Tracking + Intelligence (US-8, US-9, US-10, US-11, US-12)
  Verification: npm run check && npm run test -- --grep 'people|insight'
- Phase 4: Navigation Audit (US-13, US-14, US-15)
  Verification: npm run check && npm run test

VERIFICATION (after each phase):
npm run check
npm run test

ESCAPE HATCH:
After 20 iterations without progress:
1. Document what's blocking in the spec file under Implementation Notes
2. List approaches attempted
3. Stop and ask for human guidance

Output <promise>INNER WORK COMPLETE</promise> when all user stories pass acceptance criteria and all verification commands succeed." --max-iterations 30 --completion-promise "INNER WORK COMPLETE"
```

---

## Open Questions

None - all questions resolved during interview.
