# Feature Landscape

**Domain:** Reconciler patterns (GAPS_FOUND/NEEDS_WORK) and Needs/Strategy stages for conflict resolution
**Researched:** 2026-02-15

## Table Stakes

Features users expect. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Share suggestion when gaps found** | Standard mediation pattern — when one party misunderstands, the subject shares clarifying context | Medium | Already partially built (asymmetric reconciler). Need UI/UX refinement |
| **Refinement loop with new context** | Users expect to incorporate shared context, not just ignore it | Medium | Backend supports REFINING status. Need mobile UI for context consumption |
| **Needs identification from conversation** | NVC/mediation framework core — surface underlying needs before solving | High | Already built (Stage 3 controller uses AI extraction). Need verification/adjustment UI |
| **Collaborative needs confirmation** | Both parties must confirm own needs before seeing common ground | Low | Already built (consent flow in Stage 3). Standard mutual consent pattern |
| **Common ground visualization** | Users expect to see overlapping needs before strategies | Low | Already built (findCommonGround service). Venn diagram or list UI needed |
| **Strategy proposal collection** | Anonymous pool prevents "my idea vs yours" dynamic | Medium | Already built (Stage 4 controller). Need "add strategy" UI |
| **Mutual ranking** | Standard mutual-gains approach — both rank independently, reveal together | Medium | Already built (ranking submission + overlap calculation). Need drag-and-drop UI |
| **Agreement formalization** | Final step must create clear commitment with follow-up | Low | Already built (Agreement model + confirmation flow). Need contract-style UI |

## Differentiators

Features that set product apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Abstract hints during refinement** | Unlike direct feedback, prevents "you missed X" blame dynamic. Guides discovery instead | High | Designed in reconciler (areaHint, promptSeed). Need conversational AI coach implementation |
| **Two-phase share flow** | Topic suggestion first ("you might want to share about X"), THEN AI helps craft message | Medium | Partially built (suggestedShareFocus + generateShareDraft). Innovative UX pattern |
| **Empathy resubmission circuit breaker** | Prevents infinite refinement loops — after N attempts, force acceptance or escalation | Medium | NOT YET BUILT. Important safeguard against stuck sessions |
| **Context already shared detection** | Prevents redundant sharing requests when subject already provided clarification | Low | Already built (hasContextAlreadyBeenShared check). Quality-of-life improvement |
| **NVC needs categorization** | 9 Marshall Rosenberg categories (Connection, Autonomy, Meaning, etc.) guide extraction | Medium | Already built (NeedCategory enum). Helps users recognize patterns |
| **Separate user/shared vessels** | Individual needs stay private until consent, then merge to common ground | Low | Already built (UserVessel + SharedVessel). Privacy-first architecture |
| **Anonymous strategy pool** | Strategies presented without author attribution until after ranking | Low | Already built (createdByUserId not exposed in GET). Reduces positional bias |
| **Ranking overlap algorithm** | Surfaces top-3 overlap, falls back to top choices when no overlap | Low | Already built (getOverlap controller). Smart conflict resolution when preferences diverge |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Direct gap disclosure to guesser** | Telling User A "you missed their sadness about X" creates shame/defensiveness | Use abstract hints (areaHint: "deeper emotional experiences") that guide discovery |
| **Unlimited refinement attempts** | Stuck sessions drain engagement. Some empathy gaps are acceptable with consent | After 2-3 refinement cycles, offer "accept difference" or "request mediated help" |
| **Showing who proposed which strategy** | Attribution bias — users favor own ideas or discount partner's ideas | Keep pool anonymous until after ranking. Attribution only matters for implementation accountability |
| **AI-only needs identification** | Users must validate/adjust AI suggestions or feel unheard | Always present as "suggested needs" with edit/add/remove controls |
| **Automatic agreement without confirmation** | Even with ranking overlap, explicit mutual consent prevents misunderstanding | Require both parties to confirm agreement text before marking AGREED |
| **Synchronous strategy collection** | Waiting for partner to finish brainstorming blocks progress | Allow independent collection, signal "ready to rank" when satisfied with pool |
| **Text-match common ground detection** | AI semantic matching prevents missing synonyms ("respect" vs "dignity") | Use embedding similarity + LLM comparison for fuzzy matching |

## Feature Dependencies

```
Stage 2 (Empathy) completion → Stage 3 (Needs) starts
Both users consent to share empathy → Reconciler runs
Reconciler result = GAPS_FOUND → Subject receives share suggestion
Subject shares context → Guesser status = REFINING
Guesser resubmits empathy → Reconciler re-runs
Reconciler result = NO_GAPS or READY → Both empathy attempts REVEALED
Both empathy VALIDATED → Stage 3 starts

Both users confirm needs → Both consent to share
Both consent to share needs → Common ground analysis runs
Common ground confirmed → Stage 4 (Strategy) starts

Stage 4 starts → Users propose strategies
User marks "ready to rank" → Waits for partner
Both ready → Rankings submitted independently
Both rankings submitted → Overlap revealed
Agreement created → Awaits partner confirmation
Both confirm agreement → Session RESOLVED
```

## MVP Recommendation

**Already built (verify functionality):**
1. GAPS_FOUND flow: Share suggestion generation, context sharing, status transitions
2. NEEDS_WORK flow: Empathy attempt status = NEEDS_WORK (same as GAPS_FOUND with higher severity)
3. Stage 3 needs: AI extraction, confirmation, consent, common ground
4. Stage 4 strategies: Proposal, ranking, overlap, agreement

**Build next (missing mobile UI or incomplete flows):**
1. **Share suggestion panels** (reconciler edge cases)
   - ShareTopicDrawer: "You might want to share about [topic]"
   - ShareDraftReview: Review AI-generated draft, refine, send
   - ContextSharedConfirmation: "Context sent to [partner]"

2. **Refinement conversation UI** (REFINING status)
   - "New context from [partner]" notification
   - Context display panel before empathy resubmit
   - Refinement chat interface with abstract hints (if gaps still present)

3. **Needs panels** (Stage 3)
   - NeedsReview: AI-suggested needs with edit/add/remove
   - NeedsConfirmation: Confirm before sharing
   - CommonGroundVisualization: Overlapping needs display
   - CommonGroundConfirmation: Mutual agreement on shared needs

4. **Strategy panels** (Stage 4)
   - StrategyCollection: Add/edit proposals
   - ReadyToRankSignal: Signal completion to partner
   - StrategyRanking: Drag-and-drop preference ordering
   - OverlapReveal: Show top-3 overlaps
   - AgreementDrafting: Create binding agreement from strategy
   - AgreementConfirmation: Mutual consent to final agreement

**Defer:**
- Refinement circuit breaker (after 3+ attempts)
- Mediated help escalation (when acceptance fails)
- Follow-up scheduling (post-agreement check-ins)

## Reconciler Flow States

### NO_GAPS (already verified in E2E)
```
Reconciler analyzes A's empathy about B
alignment.score >= 80% AND gaps.severity = "none"
→ A's attempt status = READY
(Wait for B's attempt to also be READY)
→ Both READY → Both REVEALED simultaneously
```

### GAPS_FOUND (needs verification)
```
Reconciler analyzes A's empathy about B
alignment.score 60-79% AND gaps.severity = "moderate"
recommendedAction = "OFFER_OPTIONAL"
→ A's attempt status = AWAITING_SHARING
→ Generate share suggestion for B (subject) to help A (guesser)
→ B sees ShareTopicDrawer with suggestedShareFocus
→ B chooses: Accept (share context) or Decline (skip)

IF B accepts:
  → Generate AI draft from B's conversation history
  → B reviews/edits draft
  → B sends refined content
  → A's attempt status = REFINING
  → A sees "New context from B" notification
  → A can resubmit empathy attempt
  → Reconciler re-runs for A→B direction
  LOOP until NO_GAPS or circuit breaker

IF B declines:
  → A's attempt status = READY (proceed despite gaps)
```

### NEEDS_WORK (needs verification)
```
Reconciler analyzes A's empathy about B
alignment.score < 60% AND gaps.severity = "significant"
recommendedAction = "OFFER_SHARING" (stronger language)
→ A's attempt status = NEEDS_WORK (same flow as GAPS_FOUND but different UI tone)
→ Generate share suggestion for B (subject)
→ B sees ShareTopicDrawer with urgent framing
→ Same accept/decline flow as GAPS_FOUND
```

**Key insight from research:** The distinction between GAPS_FOUND and NEEDS_WORK is severity/tone, not different flows. Both use the same refinement loop pattern.

## Stage 3 Flow States

### Needs Identification
```
User enters Stage 3
→ AI extracts needs from conversation (extractNeedsFromConversation)
→ Categorizes by NVC framework (Connection, Autonomy, Meaning, etc.)
→ User reviews, edits, adds custom needs
→ User confirms selected needs
→ User consents to share with partner
```

### Common Ground
```
Both users consent to share needs
→ AI runs findCommonGround (semantic matching + LLM comparison)
→ Identifies overlapping/compatible needs
→ Both users review common ground independently
→ Both users confirm common ground
→ Stage 3 complete → Stage 4 starts
```

## Stage 4 Flow States

### Strategy Collection (Asynchronous)
```
User enters Stage 4
→ Sees empty strategy pool (or AI suggestions)
→ Adds proposed strategies addressing common ground
→ Partner independently adds strategies
→ Strategies added to anonymous pool (no attribution)
→ User marks "ready to rank" when satisfied
→ Waits for partner to mark ready
```

### Ranking (Independent then Reveal)
```
Both users ready
→ Each user sees full anonymous pool
→ Each user drag-and-drop ranks preferences
→ Rankings submitted independently
→ Both submit → Overlap calculated
→ Top-3 overlap revealed (or top choices if no overlap)
```

### Agreement (Mutual Consent)
```
User selects strategy from overlap
→ Drafts agreement with specifics (type, duration, follow-up)
→ Partner receives agreement proposal
→ Partner confirms or declines
→ Both confirm → Agreement AGREED, session RESOLVED
```

## Complexity Notes

**Low complexity:**
- UI flows for existing backend (needs, strategies, ranking)
- State transitions already built
- Consent patterns established

**Medium complexity:**
- Share suggestion UX (two-phase: topic → draft)
- Refinement conversation with abstract hints
- Common ground visualization with semantic grouping
- Drag-and-drop ranking interface

**High complexity:**
- Abstract hint generation (avoid direct disclosure)
- Refinement circuit breaker logic (when to stop loop)
- AI needs extraction accuracy (must feel representative)
- Semantic needs matching (avoid false negatives)

## Research Confidence

| Area | Confidence | Reason |
|------|------------|--------|
| Reconciler patterns | HIGH | Mediation literature + NVC looping techniques well-documented. Existing codebase has strong foundation |
| Needs identification | HIGH | NVC framework widely adopted. Marshall Rosenberg's 9 categories standard. AI extraction feasible with conversation context |
| Strategy collection | MEDIUM | Mutual gains approach well-researched. Anonymous pool pattern less common but logical. Ranking overlap algorithm straightforward |
| Refinement loop | MEDIUM | Empathy loop technique documented (mirror → validate → refine). Abstract hints pattern from therapist training, less common in apps |

## Sources

**Mediation patterns:**
- [Imago Couple's Dialogue: Mirroring, Validation, and Empathy](https://www.mergemediation.com/imago-technique-in-mediation-mirroring-validation-and-empathy/)
- [PON Empathy Loop](https://www.pon.harvard.edu/glossary/empathy-loop/)
- [Looping: Listening to Understand](https://understandinginconflict.org/looping/)

**Needs identification:**
- [NVC Feelings and Needs List — Sociocracy For All](https://www.sociocracyforall.org/nvc-feelings-and-needs-list/)
- [Categorizing Needs — Rhys Lindmark](https://www.rhyslindmark.com/personal-wednesday-categorizing-needs/)
- [iGrok NVC App](https://apps.apple.com/us/app/igrok/id352477754)

**Strategy generation:**
- [Mutual Gains Approach — CBI](https://www.cbi.org/article/mutual-gains-approach/)
- [Mutual Gains Approach — Wikipedia](https://en.wikipedia.org/wiki/Mutual_Gains_Approach)
- [Conflict Resolution and Mutual Gains — PON](https://www.pon.harvard.edu/daily/conflict-resolution/conflict-resolution-and-opportunities-for-mutual-gains-in-negotiation-key-concepts-from-getting-to-yes/)

**Perspective-taking:**
- [The Effect of Perspective-Taking on Trust and Understanding in Mediation](https://link.springer.com/article/10.1007/s10726-020-09698-8)
- [I-language and Communicating Perspective During Conflict](https://pmc.ncbi.nlm.nih.gov/articles/PMC5961625/)
