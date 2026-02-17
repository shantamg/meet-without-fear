# Phase 8: Reconciler Documentation & Edge Cases - Context

**Gathered:** 2026-02-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Document and E2E test all reconciler outcome paths (PROCEED, OFFER_OPTIONAL, OFFER_SHARING, refinement) for both users with Playwright screenshots. Build the missing guesser refinement UI and accuracy feedback panel. Fix the chat re-animation bug.

</domain>

<decisions>
## Implementation Decisions

### Guesser Refinement UI
- Build the missing refinement UI in Phase 8 (not deferred)
- Follow existing specs: three messages in chat (AI intro, SHARED_CONTEXT, AI reflection), "Refine" button on Share tab, refinement chat with AI
- Build both the REFINING flow (guesser refines after subject shares) AND the Accuracy Feedback panel (subject validates empathy post-reveal)
- All three accuracy feedback paths fully built: Accurate (proceed), Partially Accurate (optional feedback + proceed), Inaccurate (full refinement loop)
- Full acceptance check as-spec: guesser can accept ("I accept this is their experience") or decline (AI collects reason, proceeds with disagreement logged)
- Backend endpoints exist (`POST /empathy/refine`, `resubmitEmpathy`, `POST /empathy/skip-refinement`) — only mobile UI wiring is missing

### Decline/Skip Behavior
- Confirmation dialog before proceeding when subject declines to share ("No thanks")
- Same confirmation dialog for both OFFER_OPTIONAL and OFFER_SHARING (no differentiation by severity)
- After subject declines, guesser sees normal reveal flow with no indication that a share offer was made or declined (information boundary preserved)

### AI-Mediated Content
- Users never directly edit shared content. The subject asks the AI for changes, AI redrafts ensuring appropriateness, subject approves. This applies to both share context drafts and refinement feedback.
- This is a core design principle: AI is the gatekeeper for all inter-user content

### Content Persistence & Navigation
- Chat and Share pages must both serve as persistent records of what happened
- Share page shows state changes (shared content, refinement status) but nothing should disappear
- E2E tests must navigate between Chat and Share pages to verify content correctness and persistence
- It should always be clear what has happened, who has shared what

### Chat Re-Animation Bug
- Investigate and fix: sometimes entire chat history re-animates (one AI message at a time)
- Likely trigger: navigating away from chat while a message is pending or still animating
- Probable fix: mark message as "animated" when animation starts, so leaving mid-animation considers it done
- Needs investigation to confirm root cause before fixing

### State Diagrams
- Cover all paths: PROCEED, OFFER_OPTIONAL, OFFER_SHARING, refinement loop, accuracy feedback (accurate/partial/inaccurate), acceptance check
- Separate per-user diagrams for each outcome (guesser view and subject view), not unified swim lanes
- Location: Claude's discretion (based on existing documentation patterns in the project)

### E2E Test Scope
- One refinement cycle only: subject shares -> guesser refines -> reconciler re-runs -> PROCEED
- Test both reconciler outcome paths AND accuracy feedback paths
- Full inaccurate path tested: subject rates inaccurate -> crafts feedback via AI -> feedback delivered to guesser -> guesser refines or accepts (full acceptance check)
- Context-already-shared guard (RECON-EC-05) verified as inline assertion within the OFFER_SHARING test (navigate back, verify no duplicate panel)
- Tests navigate between Chat and Share to verify content persistence

### Claude's Discretion
- Documentation file location (docs/ or planning/)
- Diagram style within Mermaid
- Exact confirmation dialog copy
- Test file organization and naming
- Technical approach to fixing the re-animation bug

</decisions>

<specifics>
## Specific Ideas

- AI as gatekeeper: "The user should never be able to send their own text to the other person. The user should always be asking the AI for edits and the AI has the job of making sure it is appropriate and drafts updates"
- Both Chat and Share pages are records: "nothing should disappear. It should be clear what has happened, who has shared what"
- Re-animation bug: "sometimes the entire chat history is reanimated one AI message at a time" — possibly when navigating away during pending/animating message
- Existing specs are comprehensive — follow docs/user-flows/accuracy-feedback-flow.md, docs/specs/when-the-reconciler-responds-with-offeroptional-we-need-to-implement-this.md, and the v1.0 audit findings

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-reconciler-documentation-edge-cases*
*Context gathered: 2026-02-16*
