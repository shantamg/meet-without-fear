# Inner Work Section Refinement - Technical Specification

*Generated: 2026-01-11*

## Overview

Comprehensive refinement of the Inner Work section to improve accessibility, fix meditation timing, add custom meditation creation, implement People Tracking and Cross-Feature Intelligence, and ensure navigation completeness.

## Problem Statement

1. **Inner Thoughts Accessibility**: Currently buried as 4th item in Inner Work hub - users need quick access
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
- Inner Thoughts → Partner Session transition with context handoff
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
**Description:** As a user, I want to start an Inner Thoughts session by typing directly on the home page, so I can quickly capture what's on my mind.

**Acceptance Criteria:**
- [ ] Chat input component renders above action buttons on home screen
- [ ] Input uses same styling as in-session chat input
- [ ] Pressing send creates new Inner Thoughts session via API
- [ ] User navigates to `/inner-work/self-reflection/[new-id]`
- [ ] First message appears as user message (no AI greeting first)
- [ ] Input clears after successful submission
- [ ] Loading state shown while creating session
- [ ] Error toast if session creation fails
- [ ] `npm run check` passes
- [ ] `npm run test` passes

---

### US-2: AI Action Suggestions in Inner Thoughts
**Description:** As a user, I want the AI to suggest relevant actions during my Inner Thoughts session, so I can seamlessly transition to other helpful features.

**Acceptance Criteria:**
- [ ] AI response JSON schema includes optional `suggestedActions` array
- [ ] Supported action types: `start_partner_session`, `start_meditation`, `add_gratitude`, `check_need`
- [ ] Each action includes: `type`, `label`, `personName?`, `personId?`, `context`
- [ ] UI renders action buttons below AI response when present
- [ ] Actions appear only when AI determines contextually appropriate
- [ ] Backend prompt instructs AI on when/how to suggest actions
- [ ] `npm run check` passes
- [ ] `npm run test` passes

---

### US-3: Inner Thoughts → Partner Session Transition
**Description:** As a user, when AI suggests starting a session with someone I've been discussing, I want to transition smoothly with relevant context carried over.

**Acceptance Criteria:**
- [ ] Tapping "Start session with [Name]" action triggers transition flow
- [ ] For existing partners: navigate to `/session/new?partnerId=[id]&innerThoughtsId=[id]`
- [ ] For new people: navigate to `/session/new?personName=[name]&innerThoughtsId=[id]`
- [ ] Backend generates context summary from Inner Thoughts session when `innerThoughtsId` provided
- [ ] Context summary includes: key concerns, emotional state, relevant details
- [ ] New session's first AI message summarizes the context concisely
- [ ] Context is visible to both participants (part of conversation)
- [ ] Existing new session flow reused with extended query params
- [ ] `npm run check` passes
- [ ] Integration test for transition flow passes

---

### US-4: Structured Meditation Timing Tokens
**Description:** As a user, I want accurate meditation duration estimates, so I know approximately how long my session will take.

**Acceptance Criteria:**
- [ ] AI-generated scripts use `[PAUSE:Xs]` token format (X = seconds)
- [ ] `parseMeditationScript()` function extracts pause tokens and spoken text
- [ ] `calculateDuration()` computes: `(wordCount / 100) * 60 + totalPauseSeconds`
- [ ] Duration displayed as "approximately X minutes" after generation
- [ ] Playback respects pause tokens with actual silence
- [ ] Existing TTS chunking extended to handle pause tokens
- [ ] Unit tests for parsing and calculation functions
- [ ] `npm run check` passes

---

### US-5: Custom Meditation Creation via Chat
**Description:** As a user, I want to create custom meditations by chatting with AI, so I can get personalized scripts.

**Acceptance Criteria:**
- [ ] New "Create Custom" option on Meditation screen
- [ ] Opens chat interface with meditation creation context
- [ ] AI guides user through script creation (focus, duration, specific needs)
- [ ] AI outputs structured script with timing tokens
- [ ] User can iterate: "make the breathing section longer", "add body scan"
- [ ] "Save this meditation" action available in chat
- [ ] Saved meditation stored with: title, script, createdAt, conversationId
- [ ] Navigation to saved meditation plays it with TTS
- [ ] `npm run check` passes
- [ ] `npm run test` passes

---

### US-6: Text Upload/Paste Meditation
**Description:** As a user, I want to paste my own meditation text and have AI convert it to a playable format.

**Acceptance Criteria:**
- [ ] "Import Text" option on Meditation screen or during creation chat
- [ ] Text input modal for pasting meditation script
- [ ] AI processes text and converts to structured format with tokens
- [ ] AI asks clarifying questions if pause timing unclear
- [ ] User confirms/edits the structured version
- [ ] Save to library once finalized
- [ ] `npm run check` passes
- [ ] `npm run test` passes

---

### US-7: Saved Meditations Library
**Description:** As a user, I want to browse and replay my saved meditations.

**Acceptance Criteria:**
- [ ] "My Meditations" section on Meditation screen
- [ ] Lists saved meditations with title, approximate duration, created date
- [ ] Tapping opens playback view (same as generated meditation)
- [ ] "Edit" option opens original chat conversation to refine
- [ ] Swipe-to-delete with confirmation
- [ ] Empty state with CTA to create first custom meditation
- [ ] `npm run check` passes
- [ ] `npm run test` passes

---

### US-8: People Tracking - Extraction
**Description:** As a system, I want to extract and track people mentioned across Inner Work features.

**Acceptance Criteria:**
- [ ] AI extracts person mentions from Inner Thoughts messages
- [ ] Extraction includes: name/reference, context, sentiment
- [ ] Deduplication: "my mom", "Mom", "she" recognized as same person
- [ ] Confidence score assigned to each extraction
- [ ] `Person` table in database: id, userId, name, aliases[], createdAt
- [ ] `PersonMention` table: id, personId, featureType, featureId, context, sentiment, createdAt
- [ ] Backend service processes messages and stores extractions
- [ ] High confidence matches auto-linked to existing session partners
- [ ] Ambiguous matches prompt user confirmation
- [ ] `npm run check` passes
- [ ] `npm run test` passes

---

### US-9: People Tracking - Linking to Partners
**Description:** As a user, I want people I mention to be connected to my session partners when applicable.

**Acceptance Criteria:**
- [ ] When extracting person, check against user's session partners
- [ ] Exact name match with high confidence: auto-link
- [ ] Partial/nickname match: store as pending, ask user to confirm
- [ ] Confirmation UI appears in Inner Thoughts or as hub notification
- [ ] Once linked, `Person.sessionPartnerId` populated
- [ ] Cross-feature queries can join to session data
- [ ] `npm run check` passes
- [ ] `npm run test` passes

---

### US-10: Cross-Feature Intelligence - Pattern Recognition
**Description:** As a system, I want to recognize patterns across all Inner Work features.

**Acceptance Criteria:**
- [ ] Service analyzes: needs scores, gratitude entries, meditation sessions, Inner Thoughts, partner sessions
- [ ] Detects patterns: frequency changes, mood correlations, person-need connections
- [ ] Detects contradictions: "trust is fully met" but recent session shows trust issues
- [ ] Stores insights in `Insight` table: id, userId, type, summary, data, createdAt
- [ ] Insights expire/refresh on configurable schedule
- [ ] `npm run check` passes
- [ ] `npm run test` passes

---

### US-11: Cross-Feature Intelligence - Proactive Insight Cards
**Description:** As a user, I want to see relevant insights on the Inner Work hub.

**Acceptance Criteria:**
- [ ] Inner Work Hub fetches active insights for user
- [ ] Insights rendered as dismissible cards above feature cards
- [ ] Card shows: insight summary, "Learn more" action, dismiss button
- [ ] Maximum 2 insights shown at once (prioritized by relevance)
- [ ] Dismissed insights don't reappear (stored in user preferences)
- [ ] "Learn more" navigates to relevant feature or opens detail modal
- [ ] `npm run check` passes
- [ ] `npm run test` passes

---

### US-12: Cross-Feature Intelligence - Conversation Integration
**Description:** As a user, I want the AI to reference cross-feature patterns naturally in my conversations.

**Acceptance Criteria:**
- [ ] Inner Thoughts and Partner Session prompts receive user's active insights
- [ ] AI can reference patterns: "I notice your gratitude often mentions [person]..."
- [ ] AI weaves observations naturally, not as separate UI elements
- [ ] Insights flag in prompt indicates which patterns are relevant
- [ ] `npm run check` passes
- [ ] `npm run test` passes

---

### US-13: Navigation Audit - Back Button Behavior
**Description:** As a user, I want consistent and predictable back navigation across all Inner Work screens.

**Acceptance Criteria:**
- [ ] Document expected back behavior for each screen
- [ ] Meditation: active session → confirm exit modal; other modes → previous screen
- [ ] Needs Assessment: baseline flow → confirm exit; check-in → overview
- [ ] Gratitude: entry form → confirm discard if unsaved; otherwise → home
- [ ] Inner Thoughts: chat → session list → hub → home
- [ ] All screens implement consistent pattern
- [ ] No orphaned screens (every screen has back path to hub or home)
- [ ] `npm run check` passes

---

### US-14: Navigation Audit - Completion Flows
**Description:** As a user, after completing an activity, I want clear next steps.

**Acceptance Criteria:**
- [ ] Needs baseline complete: show summary, "View Results" and "Back to Hub" options
- [ ] Meditation complete: show stats, rating prompt, "Done" returns to meditation home
- [ ] Gratitude entry saved: show confirmation, entry appears in list immediately
- [ ] Inner Thoughts session: can always continue; "End Session" option available
- [ ] No dead ends: every completion screen has at least one forward action
- [ ] `npm run check` passes

---

### US-15: Navigation Audit - Error Handling
**Description:** As a user, when something fails, I want to understand what happened and how to proceed.

**Acceptance Criteria:**
- [ ] API errors show user-friendly toast/alert
- [ ] Retry option available for transient failures
- [ ] Form validation errors shown inline
- [ ] Network offline: show offline indicator, queue actions where possible
- [ ] Session creation failure: stays on current screen, shows error
- [ ] Meditation generation failure: "Try Again" button
- [ ] No blank screens on error
- [ ] `npm run check` passes

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

### New Session Flow Extension

Modify `/session/new` to accept:
- `innerThoughtsId` - If provided, generate context summary
- `personName` - For new person (not existing partner)

Context summary injected into session initialization prompt.

---

## Implementation Phases

### Phase 1: Home Page Chat + Inner Thoughts Improvements
**Priority: FIRST**

- [ ] Create `HomePageChatInput` component
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

- [ ] Define `[PAUSE:Xs]` token specification
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

- [ ] Document all screen back behaviors
- [ ] Fix any inconsistent back navigation
- [ ] Improve completion flow UI for all features
- [ ] Add error handling for all API calls
- [ ] Add retry mechanisms for transient failures
- [ ] Write E2E navigation tests
- [ ] Manual testing of all flows

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
- [ ] All 4 phases verified
- [ ] Tests pass: `npm run test`
- [ ] Types/lint check: `npm run check`
- [ ] Build succeeds: `npm run build` (mobile and backend)
- [ ] Manual QA: all navigation flows verified, no dead ends
- [ ] Integration tests added for new features

---

## Verification Commands

```bash
# Type checking
npm run check

# All tests
npm run test

# Backend tests only
cd backend && npm run test

# Mobile build
cd mobile && npx expo export --platform ios

# Specific test suites
npm run test -- --grep "inner-thoughts"
npm run test -- --grep "meditation"
npm run test -- --grep "people"
npm run test -- --grep "insight"
```

---

## Open Questions

None - all questions resolved during interview.

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
