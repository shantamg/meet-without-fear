# Stage 4 Prompts Audit (#371)

Date: 2026-05-02
Auditor: subagent (gold-transcript-aligned)
Reference: `docs/product/source-material/golden-transcripts/{adam-eve,james-catherine,core-protocol-update}.md`; `docs/backend/prompts/stage-4-repair.md`; `docs/product/stage-4-tending-technical-spec.md`

Note on missing reference: `docs/product/stage-4-gold-question-analysis.md` (named in the audit brief) does not exist in this branch. This audit was anchored directly in the gold transcripts and the #371 commit (`6e8c18f Update Stage 4 collaborative proposal prompts`).

Code audited:
- `backend/src/services/stage-prompts.ts` lines 57–61 (compatibility ProposedStrategy block) and 880–940 (`buildStage4Prompt`).
- `backend/src/services/__tests__/stage-prompts.test.ts` lines 197–240 (#371 additions).

## Per-rule verdicts

### 1. Effect over formula

- Verdict: DRIFT
- Evidence:
  - Gold MWF voice is observational and restrained. Catherine track at line 1056: "That's a fair place to land. What you've put on the table is real and it's enough to work with. Let me look at what you named as mattering to you and see what's still unaddressed that you might be able to move on your own." James track at line 814: "We're just throwing ideas out — nothing gets decided yet. What do you want to try?" The model names what is so, then asks one open question.
  - Prompt at line 892 still includes a CELEBRATING mode with the formulaic affirmation: `"That's specific, time-bounded, and low-risk — a solid experiment."` The example at line 918 repeats it verbatim. Gold MWF never says this; it acknowledges and moves to the next need.
  - The retained "MICRO-EXPERIMENT CRITERIA (good vs bad)" block (lines 894–896) plus the "FORBIDDEN" framing (line 909) push the model toward graded/labeled feedback, which conflicts with the new "Cards are receipts of the conversation. Do not force ranking, form-like proposal submission" line.
- Concerns:
  - The five-mode taxonomy (ORIENTING / INVITING / REFINING / AUDITING / CLOSING) is itself a scaffold; combined with "EXAMPLE GOOD RESPONSES," it incentivizes the model to announce mode-shaped utterances rather than produce restrained MWF voice.
  - "Solid experiment" celebrations are not in the gold; they are formulaic praise. This is the single highest-risk phrase still in the prompt.

### 2. No failure language

- Verdict: DIVERGENT (internal contradiction)
- Evidence:
  - New rule (line ~922): `"Do not describe no-overlap or no-shared-agreement as failure."` Good.
  - But line 901 still says: `"Every experiment MUST include a follow-up check-in... This is not optional — a strategy without a follow-up is incomplete."` The word "incomplete" is exactly the failure register the audit brief flags, and it is hard-stated as MUST.
  - Line 930 (early-stage dynamic block): `"Normalize that experiments can fail — the point is learning, not perfection."` Says "fail" twice in adjacent prompts; in the gold flow, MWF says "Not something either of you failed at here — just honestly named" (james-catherine line 1145). The current prompt frames failure as a thing to "normalize" rather than a thing to actively un-name.
- Concerns:
  - The TENDING TIMING block (line ~927) says "Ask for follow-up timing only when a shared proposal is becoming a mutual agreement," but the older REQUIRED-checkin block was not deleted. The two rules contradict each other; older "MUST" wording will dominate.

### 3. Shared vs. individual distinction

- Verdict: ALIGNED in framing, DRIFT in surrounding language
- Evidence:
  - Prompt: `"A shared proposal is something both people would need to agree to try. An individual commitment is something this user volunteers to do on their own. Do not turn it into a shared agreement or pressure ${partnerName} to reciprocate."` Matches gold exactly: james-catherine line 1112 separates "SHARED EXPERIMENTS (require both of you)" from "INDIVIDUAL COMMITMENTS (Catherine)."
  - Suggested wordings `"something you could choose to do" vs "something you would both need to agree to try"` track gold register.
- Concerns:
  - The leftover `UNLABELED POOL PRINCIPLE` was deleted in #371 — good — but the older `staticBlock` opening still says "Help [user] design small, testable micro-experiments" which is an experiments frame, not an inventory frame. The doc `stage-4-repair.md` still talks about "Strategies are presented without attribution" (line 18), out of date with the code.

### 4. Asking before contributing AI ideas

- Verdict: DRIFT
- Evidence:
  - Prompt: `"Ask before contributing AI ideas. If ${context.userName} declines AI ideas, accept that and keep inviting their own options."` Correct intent.
  - But the prompt does NOT supply the canonical gating phrasing the spec calls out ("I have a few ideas — want to hear them?"). Gold protocol-update treats this as a literal contract, and Catherine's track (line 1054) hinges on respecting the decline: `"If you have any others that could help me meet my needs independent of him, I'll listen."` MWF in the gold answers her requirements precisely.
  - There is no instruction not to repeat the offer if declined. "Accept that" is soft; the model can re-offer politely two turns later and still pass this rule.
- Concerns:
  - No example in `EXAMPLE GOOD RESPONSES` covers the decline path — only the "remove" path. Without an exemplar, the loop is likely to drift.

### 5. Coverage audit honesty

- Verdict: DRIFT
- Evidence:
  - Gold (james-catherine line 1145): `"These are on the record. Not forgotten. Not something either of you failed at here — just honestly named."` That is the target effect.
  - Prompt AUDITING mode: `"Name open needs honestly without failure language. If a need is not covered yet, say it is still open and invite a small next proposal."` This captures "name what's open" but loses the second half: that an uncovered need is **the user's to hold beyond this**, which is the consoling effect from the gold.
  - No example response demonstrates the "yours to hold beyond this" register. The phrase from the audit brief, "Not a failure — just yours to hold beyond this," is absent from both prompt and tests.
- Concerns:
  - Tests check only that `"individual commitments can still be carried forward"` appears. Nothing tests for the consoling/dignifying register. The loop could keep emitting clinical "this need is still open" without reaching the gold's effect.

### 6. Tending timing prompt logic

- Verdict: DIVERGENT (direct contradiction inside the same prompt)
- Evidence:
  - New rule: `"Ask for follow-up timing only when a shared proposal is becoming a mutual agreement or when the user explicitly wants to schedule a check-in. Do not ask for scheduled shared check-in timing for individual-only commitments or no-shared-agreement closure."` Correct.
  - Older rule still present: `"FOLLOW-UP CHECK-IN (REQUIRED): Every experiment MUST include a follow-up check-in... This is not optional — a strategy without a follow-up is incomplete."` This is fixed-cadence pressure on every experiment, including individual ones.
  - Examples still include `"That's specific, time-bounded, and easy to try. Solid experiment. What would you want to talk about during those check-ins?"` — embedded check-in scheduling at the moment a single experiment is named.
- Concerns:
  - The two rules will fight. Models tend to honor MUST/REQUIRED capitalized rules over softer prose. Predicted failure mode: AI continues forcing "When should we check in?" on individual commitments and on no-shared-agreement closures — exactly what tending timing was meant to fix.

### 7. ProposedStrategy compatibility constraint

- Verdict: ALIGNED (policy stated and tested), with a soft enforcement caveat
- Evidence (lines 57–61):
  - `"Structured Stage 4 capture primarily reads the user's conversation turn. StrategyProposed/ProposedStrategy is only a compatibility fallback."`
  - `"Set StrategyProposed to Y only when the user clearly volunteered, accepted, or committed to a specific actionable proposal in their own turn."`
  - `"Do NOT list AI ideas the user has not accepted, declined ideas, removed items, vague intentions like 'communicate better', or one person's willingness as if it were a shared agreement."`
  - Tests at stage-prompts.test.ts:226–239 enforce all of these strings appear in the prompt.
- Concerns:
  - Enforcement is policy-only — the model is told the rule, not gated by it. A structured-capture path (the "primary" reader) is mentioned but not shown in this prompt; if structured capture is silently lenient, the fallback policy is the only line of defense. Worth verifying the structured capture service doesn't accept Y for unaccepted AI ideas server-side.
  - The compatibility-fallback line is buried in the response-protocol section, not the main Stage 4 static block. A model under turn-pressure may still emit `ProposedStrategy:` for one-sided willingness because the SELECTION AND CLOSURE rule is in a different section.

## Cross-prompt observations

- **The static block layers new rules on top of the old micro-experiments framing without removing the old.** Result: contradictions in three places (failure language, tending timing, mode taxonomy). #371 looks like an additive patch where a rewrite was warranted.
- **`stage-4-repair.md` doc is out of date** with the code (still describes "UNLABELED POOL PRINCIPLE" and "without attribution"). This will confuse the next human editor and any doc-grounded loop.
- **No examples for the declined-AI-ideas, no-shared-agreement, or coverage-audit closure paths.** The EXAMPLE GOOD RESPONSES section adds the "Take that one off" and "no overlap" lines but not Catherine-style boundary-honoring language.
- **Voice-of-MWF residue.** `"Solid experiment"`, `"That's totally normal"`, and the CELEBRATING mode are all formulaic and absent from the gold. The gold does affirmation by *naming what was put on the table* ("That's a fair place to land. What you've put on the table is real and it's enough to work with"), not by grading.
- **`buildResponseProtocol(4)` is reached after the static block** and reintroduces the structured `ProposedStrategy` lines; the constraint there is the only place where one-sided willingness is forbidden. Ensure both the conversational static block AND the structured fallback agree on this.

## High-priority follow-ups

Best fixed by **human prompt edit** (the loop won't catch contradictions between old and new rules):
1. Delete the `FOLLOW-UP CHECK-IN (REQUIRED)` block (line 900–901). It contradicts the new TENDING TIMING rule and is the prompt's biggest source of "incomplete" failure framing.
2. Delete or rewrite CELEBRATING mode and the `"Solid experiment"` example (line 892, 918). Replace with a gold-derived exemplar: name what was put on the table, then ask the next-need question.
3. Drop the early-stage dynamic line `"Normalize that experiments can fail"` (line 930) — replace with `"If a need stays open, name it as still open and as theirs to hold beyond this — not as failure."`
4. Add the canonical gating phrasing: `"Ask 'I have a few ideas — want to hear them?' before offering AI ideas. If declined, do not re-offer in this session."`
5. Update `docs/backend/prompts/stage-4-repair.md` to match the #371 collaborative-inventory model (currently still describes the unlabeled pool).

Best handed to the **self-improvement loop**:
6. Voice/restraint drift in CELEBRATING-shaped utterances — loop can detect formulaic praise vs. observational naming via gold-anchored scoring.
7. Coverage-audit register (the "yours to hold beyond this" effect). Loop can target this with a gold-anchored eval focused on closure turns where one need is uncovered.
8. Mode-leak (the model labeling its mode in user-visible text). Loop can flag it.
9. Re-offer of AI ideas after a decline. Loop can detect with a multi-turn invariant.
10. Forced check-in scheduling on individual commitments. Loop can detect via post-individual-commitment turn checks.
