# Master Plan: "Fact-Ledger" Memory Architecture

**Context:**
We have fixed the background classification triggers and limited retrieval scope. We are now shifting the memory strategy from "Retrieve Raw Messages" to "Maintain Fact Ledgers." This reduces token costs and improves reasoning.

We need to implement an "Open Schema" for facts, a maintenance strategy for the Global Fact list, and a smarter Embedding strategy.

## Phase 1: Implement "Open Schema" Fact Extraction

**Target File:** `backend/src/services/partner-session-classifier.ts`

1.  **Update Haiku Prompt:** Change the prompt from extracting specific fields to a "Librarian" approach.
    - _Input:_ Recent conversation history + Existing Session Facts.
    - _Instruction:_ "Update the list of 'Notable Facts' for this session. A Fact is an enduring truth (context, active conflict, emotional constraint). Return a JSON array: `[{ category: string, fact: string, confidence: 'high' }]`. You define the categories (e.g., 'Conflict Roots', 'Logistics', 'Emotional State')."
2.  **Update Storage:** Ensure these facts overwrite/update `UserVessel.sessionFacts`.

## Phase 2: Implement "Global Fact Gardening" (The Consolidator)

**Target File:** `backend/src/services/global-memory.ts` (New or Existing)

_Problem:_ The global user fact list will grow indefinitely and contain duplicates.

1.  **Create `consolidateGlobalFacts` Job:** A function that runs periodically (e.g., end of session).
2.  **Haiku Prompt:**
    - _Input:_ The current `UserVessel.globalFacts` + New `sessionFacts` from the just-finished session.
    - _Instruction:_ "Merge these two lists into a single 'User Profile.' Deduplicate facts. Resolve conflicts (trust the newer session). Group by category. Prune temporary info. Keep the total list concise (under 100 items)."
3.  **Trigger:** Call this when a session is archived or explicitly "ended."

## Phase 3: Optimize Embedding Strategy (Smart Archival)

**Target File:** `backend/src/services/chat-router/session-processor.ts` & `conversation-summarizer.ts`

1.  **Stop Embedding Raw Messages:** Disable the automatic embedding of every `UserMessage` and `AIMessage` in the vector store.
    - _Reason:_ Individual messages lack context and create noise in semantic search.
2.  **Embed Summaries Only:** Ensure that when `conversation-summarizer.ts` generates a 20-turn summary, that **Summary Text** is embedded into `pgvector`.
    - _Reason:_ Summaries are semantically dense. Searching for "father issues" will hit the Summary vector much more reliably than a random message vector.
3.  **Embed Facts (Optional):** Consider embedding the `UserVessel.notableFacts` blob as a single vector document representing the session's "State."

## Phase 4: Verify Prompt Construction

**Target File:** `backend/src/services/context-assembler.ts`

1.  **Inject Global Facts:** Ensure `UserVessel.globalFacts` is formatted clearly (`[Category]: Fact`) and placed at the top of the System Prompt context.
2.  **Inject Session Facts:** Ensure `UserVessel.sessionFacts` is injected as the primary "Current Context."
3.  **Remove Redundancy:** Verify we aren't sending _both_ the Raw History _and_ the Facts _and_ a Narrative Summary of the same events. (Prefer Facts + Recent Raw Buffer).
