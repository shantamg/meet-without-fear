# Privacy Model — Vessel Rules

The Vessel model ensures each user's raw content stays private unless they give explicit consent to share. Every stage has specific sharing rules.

## Transport-Level Isolation

Each user's conversation happens in a **private DM** between the user and the bot. Slack enforces this — no other user can see the DM. The `#mwf-sessions` channel is a lobby for starting/joining sessions only; no session content is ever posted there.

## Core Principle

Raw user content (quotes, stories, venting) is stored in the user's Vessel and **never** shared directly with the other user. The AI synthesizes, summarizes, or translates content into safe forms before any cross-user exchange.

## Per-Stage Sharing Rules

| Stage | What Stays Private | What Can Be Shared | Consent Required? |
|---|---|---|---|
| 0 — Onboarding | N/A (no personal content yet) | Compact signing status | No (structural) |
| 1 — Witness | All raw content, emotions, stories | Nothing crosses to partner | N/A |
| 2 — Perspective Stretch | Raw content from Stage 1 | Empathy *attempts* (partner's guess at your experience) | Yes — explicit opt-in per attempt |
| 3 — Need Mapping | Raw quotes, specific stories | Synthesized universal needs (e.g., "Need for Recognition") | No (already abstracted) |
| 4 — Strategic Repair | Who proposed which strategy | Unlabeled strategy pool, ranking overlap | No (anonymous by design) |

## Consent Mechanism (Consensual Bridge)

Used in Stage 2 when sharing empathy attempts:

1. Partner drafts an empathy attempt ("I imagine you might feel...")
2. AI presents it to the recipient privately
3. Recipient chooses: **accept**, **revise**, or **decline**
4. Only accepted/revised attempts are confirmed; declined attempts are discarded
5. Recipient's raw feedback on attempts stays in their Vessel

## Synthesis Rules

When the AI creates cross-user content, it must:

- **Never quote** raw user words without explicit consent
- **Abstract** specific complaints into universal need categories
- **Anonymize** strategy proposals (Stage 4) — no attribution
- **Frame** partner perspectives as possibilities ("they might feel..."), not certainties

## File-Level Access Rules

Each stage enforces strict retrieval contracts on the file-based state tree:

| Stage | Files Readable | Files Forbidden |
|---|---|---|
| 0 | `session.json`, `stage-progress.json` | All vessel files |
| 1 | Own `vessel-{x}/*`, `conversation-summary.md` | Partner's vessel, `shared/*` |
| 2 | Own vessel + `shared/consented-content.json` | Partner's raw vessel |
| 3 | Own `vessel-{x}/needs.json` + `shared/consented-content.json`, `shared/common-ground.json` | Partner's raw vessel, own raw events |
| 4 | `shared/*` (all) | Both users' raw vessels |

The `synthesis/` directory is **never** read during user-facing turns — it exists for dev/monitoring purposes only.

## Vessel Contents

Each user's Vessel stores:

- Raw conversation messages (all stages)
- Emotional readings and barometer data (Stage 1+)
- Identified needs with categories (Stage 3+)
- Strategy proposals and rankings (Stage 4)
- Conversation summaries and notable facts (AI-generated)
