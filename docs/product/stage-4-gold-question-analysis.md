# Stage 4 Open Questions — Gold Transcript Analysis

Date: 2026-05-02
Source: `docs/product/source-material/golden-transcripts/{adam-eve.md, james-catherine.md, core-protocol-update.md}`
Scope: Answers the open questions in `stage-4-tending-build-progress.md` based on the effect demonstrated in the golden examples.

## Q1: Individual commitment visibility

- **Recommendation:** Individual commitments are **fully visible to both partners inside the Stage 4 combined inventory and in the closing summary's "Held for later / individual" sections** — not privately owned. They are surfaced as labeled items (e.g. "INDIVIDUAL COMMITMENTS (Catherine)") so the partner sees both the act and the need it addresses. They remain in force regardless of the partner's choices.
- **Confidence:** High.
- **Evidence:** In the James/Catherine non-resolution path, when James opens the combined inventory, Catherine's individual commitments appear under their own labeled section directly to him:

  > #### INDIVIDUAL COMMITMENTS (Catherine)
  > Return to individual therapy — Within two weeks. Addresses: Catherine — self-trust, autonomy.
  > Journaling — Ten minutes, a few times a week. Addresses: Catherine — self-trust, autonomy.

  (james-catherine.md, lines 1141–1142, in the inventory MWF presents to James before selection.) The same labeled inventory containing both partners' individual items is shown to Catherine on her side (lines 1183–1184). On the Adam/Eve side, the same posture holds — Eve's individual items (Ceramics, Portugal research, weekly self-check-in) all appear in Adam's combined inventory (adam-eve.md line 782) and vice versa (line 798). The closing summary, by contrast, is per-track: each user sees only *their own* individual commitments restated under "Adam alone" / "Eve alone" (adam-eve.md lines 838, 872) — i.e. the *outcome doc each user reads* is per-track, but the *Stage 4 inventory* is shared.

  The core protocol confirms the principle: "All ideas — from the user, from their partner's parallel track, and from MWF — are compiled into a single labeled inventory before any selection occurs… [each item includes] Whether it is individual, shared, or both" (core-protocol-update.md lines 192–198).

- **Failure mode of the opposite choice:** If individual commitments were private until closure, James would never see that Catherine had chosen to return to therapy — and the gold ending depends on him registering that she is taking real responsibility for her own track even as she declines the shared work. Hiding her individual commitments would (a) reduce the inventory to only shared candidates, breaking the "first-class outcome, not a consolation prize" framing, and (b) make the partner's no-shared-experiment exit feel like pure refusal rather than a choice paired with self-directed work. It would also remove information the partner can legitimately use to recalibrate their own selections.

## Q2: Passive Tending re-entry — when is the partner notified?

- **Recommendation:** **Notify the partner only after the user chooses a partner-involving path** (or completes a check-in whose choices require coordination). Re-entry itself is private. MWF holds choices until both tracks have made decisions; only overlapping/coordination-requiring choices surface to the partner, and even then only with consent.
- **Confidence:** High.
- **Evidence:** The protocol is explicit that the between-period and re-entry are individual and asymmetric:

  > MWF is available to both users individually during the period between Stage 4 and the scheduled check-in. This window is open but app-passive — MWF does not initiate contact or prompt reflection unless a user has explicitly requested a reminder. Users come when they want to.
  > … Nothing shared during The Tending is passed to the other user without explicit consent.
  > (core-protocol-update.md lines 248, 295)

  And re-entry after closure:
  > When they do, MWF begins with a brief check — not a full stage, just a conversation — to understand what's present now… From there, the user chooses whether to move into another Tending cycle, begin a new full process from Stage 1, or something lighter.
  > (core-protocol-update.md line 289)

  The check-in flow demonstrates the timing of partner notification: after Adam completes choices, MWF tells him "We'll hold your choices until Eve's check-in is complete. Where they overlap or require coordination, we'll come back to you both before anything proceeds" (adam-eve.md line 1039). Eve only learns Adam re-entered when there is something coordinated to share — not at his entry.

- **Failure mode of the opposite choice:** Notifying the partner at re-entry would (a) violate the consent boundary — the user has not yet decided whether anything they share or do should reach the partner; (b) create implicit pressure on the returning user, who may have come back only to think individually; (c) risk the partner inferring conflict-resumption when none is intended. Gold posture: each user retains full control over what crosses tracks, and crossings happen only when there is curated, consented content to deliver.

## Q3: Old `/strategies` ranking endpoints — keep or deprecate?

- **Recommendation:** **Not transcript-answerable.** This is an engineering-compatibility decision, not a product-effect decision, and the transcripts give no signal that ranking-as-a-mechanism is either a UX path users should retain or one they should be steered away from. The transcripts show selection-then-overlap-reveal, not ranking. If anything, the gold flow uses *willingness selection* over a labeled inventory — not ranked preference — which suggests the ranking model isn't the protocol-aligned mechanic and could be retired once `/stage4` is stable on mobile. But that is a weak inference, not transcript evidence.
- **Confidence:** Low (no direct evidence).
- **Evidence:** No direct evidence in transcript. Indirect: the gold flow consistently uses "Which of these are you willing to try?" as the selection mechanism (adam-eve.md lines 788, 804; james-catherine.md line 1153 "Which of these do you want to take forward?") — not "rank these in order of preference." The protocol describes selection as "Each user privately selects their preferred options. Only after both choose does the AI reveal overlap" (core-protocol-update.md lines 215–216), again non-ordinal.
- **Failure mode of the opposite choice:** If the transcripts were taken as authority for retiring `/strategies` immediately, mobile clients still on the old contract would break with no compat window. Conversely, keeping ranking endpoints indefinitely costs maintenance burden but doesn't violate the gold posture. Recommendation: decide on engineering grounds (deprecation window after mobile cutover); the gold posture mildly favors retirement but does not require it.

## Q4: Are mutual WILLING selections on shared proposals already an agreement?

- **Recommendation:** **Yes — mutual willingness on a shared proposal IS the agreement.** Closure should treat mutual-WILLING items as already-AGREED. There is no separate consent moment between "willing" and "agreed" in the gold flow. Codex's V1 call (#367) is correct.
- **Confidence:** High.
- **Evidence:** In Adam/Eve, the flow goes directly from willingness → overlap → agreement document, with no intermediate "do you both confirm?" beat:

  > **MWF:** Which of these are you willing to try?
  > … [Overlap identified: weekly walk and weekly structured conversation.]
  > … [Overlap revealed to Adam.]
  > **MWF:** Here's what you've agreed to. Together: Weekly walk… Weekly structured conversation…
  > (adam-eve.md lines 788, 810, 814, 838)

  No confirmation prompt sits between "willing" and "agreed." The willingness selection, made privately by both users over the same shared proposal, *is* the consent. The protocol confirms the same shape: "Each user privately selects their preferred options. Only after both choose does the AI reveal overlap. If overlap exists → that becomes the starting agreement" (core-protocol-update.md lines 215–217). "That becomes the starting agreement" — not "that becomes a candidate that both must then ratify."

  The James/Catherine non-resolution path corroborates by negative space: when there is no overlap, MWF says "There is no overlap" and the shared process closes (lines 1257, 1306). There is no fallback "but maybe you'd both still agree to one of these?" — the willingness selection was the binding act.

- **Failure mode of the opposite choice:** If a confirmation step were inserted between willingness and agreement, the gold flow would feel doubled-up and ceremonial — the user already deliberated when selecting "willing" (Catherine's long deliberation at lines 1199–1235 makes this vivid: selection is *itself* the heavy moment). Worse, a second-stage opt-out would create a path where one user backs out after seeing the overlap, which (a) is not how the gold transcripts close — neither resolution nor non-resolution shows a post-overlap retraction — and (b) would re-introduce the asymmetric "I said yes but only because they said yes first, and now I want out" dynamic the parallel-private structure is designed to prevent. The willingness moment must carry real weight; the system should not soften it with a redundant confirm.

## Cross-cutting observations

A consistent posture cuts across all four questions: **the user retains full agency over what crosses tracks, and crossings are deliberate, consented, and curated — but once a cross has happened (a willingness selection over a shared proposal, an inventory item visible to both), it is real, not provisional.** MWF is private-by-default but binding-on-cross. This argues for:

- **Strong consent gates at the moment of crossing** (the "are you willing to share this?" beats in Stages 2/3, the willingness selection in Stage 4, the curated check-in carry-across).
- **Minimal re-confirmation after a crossing has occurred** — gold MWF does not pile on second confirmations once a user has already consented. Q4 follows directly from this.
- **Visibility of individual commitments inside the shared inventory** is itself a deliberate cross — the user proposing them implicitly consents to them being labeled and shown. This is consistent with Q1.
- **Re-entry is pre-crossing**, so it stays private until the user produces something crossable. This is Q2.

The shared thread: trust the moments of consent the gold flow already builds in; don't add belt-and-suspenders gates that would dilute their weight.
