# Implementation Plan: User-Gated Memory Architecture

**Version:** 1.0
**Objective:** Transition from "Always-On" context injection to a "Consent-Based" Handshake model without rebuilding the backend core.

---

## 1. Architecture Shift Overview

We are moving from **System-Curated** (utility-first) to **User-Gated** (safety-first).

| Component           | Current State                              | Target State                                                                                        |
| :------------------ | :----------------------------------------- | :-------------------------------------------------------------------------------------------------- |
| **Stage 1 Context** | Automatic injection of `GlobalFacts` + RAG | **Amnesiac Default.** Only strictly current session context + Explicit Handshake items.             |
| **The Handshake**   | Non-existent (Implicit)                    | **Explicit UI.** User selects specific themes/facts to "bridge" into the session.                   |
| **Summarization**   | Rolling, Auto-Injecting                    | **Write-Only / Draft.** Generated in background, held for User Review, not injected until approved. |
| **Inner Work**      | Full Access                                | Full Access (but only to _approved_ artifacts).                                                     |

---

## 2. Phase 1: The "Context Handshake" (Stage 1 Gating)

**Goal:** Modify the session start flow to allow users to select which "Global Facts" act as context.

### Backend Changes

- **Modify `POST /sessions` (or `startSession`)**
  - Accept optional `contextConfig` object:
    ```typescript
    {
      allowedGlobalFactIds: string[]; // specific fact IDs
      includeProfile: boolean;        // general user bio
    }
    ```
- **Update `Session` Model**
  - Add `activeContextConfig` (JSONB) to store the handshake selection for the duration of this session.

- **Update `context-assembler.ts`**
  - _Current:_ `loadGlobalFacts(userId)` is called unconditionally.
  - _New Logic:_

    ```typescript
    // Inside buildConversationContext()
    const session = await getSession(sessionId);

    // STAGE 1 RESTRICTION
    if (currentStage === 1) {
      if (session.activeContextConfig) {
        // Only load specific IDs requested in handshake
        contextBundle.globalFacts = await loadSpecificFacts(session.activeContextConfig.allowedGlobalFactIds);
      } else {
        // AMNESIAC MODE: Load nothing
        contextBundle.globalFacts = [];
      }
    } else {
      // STAGE 2/3/4: Default behavior (load all relevant context)
      contextBundle.globalFacts = await loadGlobalFacts(userId);
    }
    ```

### Frontend Changes

- **Pre-Mediation Modal:** Before the chat interface loads:
  1.  Call `GET /user/global-facts` (fetch grouped by People, History, etc.).
  2.  Display "Context Cards" (checkboxes).
  3.  Pass selection to `POST /sessions`.

---

## 3. Phase 2: RAG & Retrieval Constraints

**Goal:** Ensure the "Circuit Breaker" doesn't leak cross-session memory in Stage 1 unless explicitly permitted.

### Backend Changes

- **Update `context-retriever.ts`**
  - _Current:_ `detectReferences` triggers `searchAcrossSessions` on implicit patterns ("I thought...").
  - _New Logic:_
    - In **Stage 1**, force `allowCrossSession: false` in `RetrievalOptions` _unless_ the user's message explicitly references a "Handshaked" topic (advanced) or the user toggles "Deep Recall."
    - Keep `searchWithinSession` active (essential for short-term coherence).

- **Update `ai-orchestrator.ts`**
  - Ensure `determineMemoryIntent` defaults to `depth: 'light'` (no RAG) for Stage 1.

---

## 4. Phase 3: The "Draft & Review" Loop (Post-Session)

**Goal:** Stop "rolling summarization" from polluting the live session, and institute a review step.

### Backend Changes

- **Schema Update:**
  - Add `summaryStatus` enum to `Session`: `['pending', 'draft_generated', 'user_approved']`.
  - Add `draftSummary` (JSONB) column to `Session`.

- **Update `conversation-summarizer.ts`**
  - _Current:_ `updateSessionSummary` overwrites `UserVessel.conversationSummary` immediately.
  - _New Logic:_
    - Write result to `Session.draftSummary` instead.
    - Set `summaryStatus = 'draft_generated'`.
    - **Do NOT** push to `UserVessel` or `GlobalFacts` yet.

- **New Endpoint: `POST /session/:id/summary/approve`**
  - User submits edited text/themes.
  - Backend commits the data to `UserVessel.conversationSummary` and triggers `GlobalFacts` consolidation.

- **Update `context-assembler.ts`**
  - Stop injecting `SessionSummary` into the prompt _during_ Stage 1 mediation (unless it's a very long session where token limits force it—in that case, use a sanitized technical summary, not an emotional one).

---

## 5. Phase 4: Fact-Ledger Refinement (Notable Facts)

**Goal:** Ensure extracted facts are approved before becoming permanent "Global Facts."

### Backend Changes

- **Update `partner-session-classifier.ts`** (Fact Extraction)
  - Continue "fire-and-forget" extraction for speed (this is fine).
  - Store them with a flag `isVerified: false`.
- **Post-Session consolidation:**
  - When `consolidateGlobalFacts` runs (currently on Stage 1 completion):
  - Present the extracted facts to the user in the "Summary Review" screen.
  - Only promote "Kept" facts to the permanent `User.globalFacts` profile.

## Definition of Done

1.  **Default Silence:** A new Stage 1 session knows _nothing_ about the user's past unless the user checked a box.
2.  **Consent:** No summary or fact is written to the long-term `UserVessel` without a specific "Approve" API call.
3.  **Utility:** Stage 3 (Inner Work) can still recall details from approved Stage 1 sessions.
