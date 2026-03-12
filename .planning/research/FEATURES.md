# Feature Research

**Domain:** Therapy-prep journaling with AI — Inner Thoughts Journal milestone
**Researched:** 2026-03-11
**Confidence:** MEDIUM-HIGH (ecosystem well-researched; some anti-feature reasoning is inference from patterns)

---

## Context: What Already Exists

The following infrastructure is already built and must be treated as a foundation, not as features to
build. The new milestone adds a layer on top.

| Existing capability | Location | Notes |
|---------------------|----------|-------|
| Inner Thoughts chat sessions (solo AI chat) | `InnerWorkSession` model, `inner-work.ts` controller | CRUD + messaging fully working |
| Rolling conversation summaries per session | `conversation-summarizer.ts`, `conversationSummary` field | Fire-and-forget, triggers at 25+ messages |
| Memory detection and intentional saves | `memory-detector.ts` | Very conservative: only explicit "remember that..." |
| Notable facts across sessions (global memory) | `global-memory.ts`, `User.globalFacts` | Up to 50 categorized facts, consolidated via Haiku |
| People extraction and mention tracking | `people-extractor.ts`, `Person` + `PersonMention` models | Extracts names, tracks per-source counts, supports merge |
| Semantic embeddings for session retrieval | `embedding.ts`, `InnerWorkSession.contentEmbedding` | Session-level vector(1024) on theme+summary |
| Linking inner thoughts to partner sessions | `linkedPartnerSessionId` field | Stage + trigger tracking |

The milestone adds: dated sessions with topic summaries/tags, AI-guided distillation into takeaways,
organic theme/person recognition surfaced in UI, and a browsable accumulated knowledge view.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist in any journaling or therapy-prep tool. Missing these makes the product
feel unfinished.

| Feature | Why Expected | Complexity | Existing foundation? |
|---------|--------------|------------|----------------------|
| Session list sorted by date with visible date | Every journal shows date; "dated sessions" is explicitly the milestone goal | LOW | Sessions have `createdAt`; list endpoint exists. Add date display only. |
| AI-generated session title or summary line | Users don't want to name every entry; every AI journal (Rosebud, Reflectly, Mindsera) auto-titles | LOW | `InnerWorkSession.title` and `.summary` fields exist. Need to populate reliably on session close. |
| Post-vent distillation: "here's what I heard" summary | Core milestone goal. Grow Therapy, Rosebud, and clinical research all validate this as the key therapy-prep primitive. Users need a condensed version to take to therapy. | MEDIUM | Conversation summarizer produces `keyThemes` + `unresolvedTopics`. Need to surface these as explicit "takeaways" — a distillation step after venting. |
| Editable takeaways / user can correct AI output | Grow Therapy explicitly lets patients edit AI-generated themes before sharing. Users distrust AI accuracy on personal content without edit control. | MEDIUM | No editing surface for AI output currently. New UI + endpoint needed. |
| Topic/theme tag visible on each session in list | Every journaling app (Reflectly, Mindsera, Clearful) tags or categorizes entries. Users scan by topic, not just by date. | LOW | `InnerWorkSession.theme` field exists (single string). Need reliable population + display. |
| Navigate sessions by date or topic | Table-stakes navigation. Without it, accumulated sessions become unusable. | MEDIUM | List endpoint has filter support but no topic grouping. |
| Persist insights across sessions (not per-session only) | Users expect "the app remembers me" from Rosebud, Mindsera, etc. Global facts already exist; they need to be visible. | MEDIUM | `globalFacts` exists but is invisible to user currently. |

### Differentiators (Competitive Advantage)

Features that set this product apart from generic journaling apps, or that specifically serve the
"therapy prep" use case and the user's "flexible and organic" vision.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Organic people recognition with cross-session timeline | Rosebud mentions relationship patterns but doesn't expose a people-centric view. Showing "here are the 3 people you've talked about most, and the themes that appear with each" is genuinely novel for therapy prep. | HIGH | `people-extractor.ts` + `PersonMention` already exist. New UI and a "person profile" aggregation query needed. |
| Distillation as a distinct explicit step (not automatic) | Most apps silently summarize in the background. Making distillation a named, intentional moment ("want to distill this session?") mirrors how therapy prep actually works: vent first, organize after. Gives users agency. | MEDIUM | Requires a post-session or mid-session trigger. UI flow design needed. |
| Themes surfaced organically from accumulated sessions, not just per-session tags | Mindsera tracks topics; Rosebud tracks patterns. But both are per-session. Cross-session theme clustering that shows "work stress has come up in 4 sessions over 3 weeks" is what the user explicitly asked for. | HIGH | Requires cross-session aggregation (semantic clustering or tag grouping). Existing embeddings + keyThemes could seed this. |
| Linking inner journal to partner session as therapy-prep context | No competitor does this. The ability to say "I'm preparing for a conversation with my partner about X — here's what came up in my private reflection" bridges private journaling and relational work. | LOW | Infrastructure exists. Needs visible UX to highlight linked sessions in the journal view. |
| Easy to modify — user-editable insights, not locked AI output | Grow Therapy found that client autonomy over AI summaries is critical for trust and adoption. For therapy prep specifically, users want to curate what they bring. | MEDIUM | Inline editing of takeaways and tags. Merge/rename people. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Streaks, badges, journaling habit tracking | Every mainstream journaling app does this (Reflectly, Jour). Users have seen it. | Research (2026 Wiley Consumer Psychology Review) found gamification backfires in therapeutic contexts: users optimize for the streak rather than authentic reflection. Misaligns with this app's purpose. | Let the content itself be the reward. Show "you've had 8 sessions this month" as a neutral stat, not a congratulatory badge. |
| Daily prompts / push nudges to journal | Reflectly and Rosebud both use daily prompts as a retention mechanic. | Journaling about a conflict or emotional issue should happen when the user needs it, not on a schedule. Forced prompts at the wrong time feel intrusive and can surface anxiety without support. | Let the app be a pull tool, not a push tool. If reminders exist, make them fully user-controlled and opt-in, not a default engagement loop. |
| Real-time theme detection during chat | Technically feasible. Mindsera shows analysis during entry. | Seeing "you are talking about: anxiety, work, resentment" while venting breaks the venting flow. Research (Frontiers 2025) found decoupling core journaling from AI is a principle for avoiding overwhelm. | Run theme detection after the session closes (or explicitly triggered). Never interrupt the chat flow. |
| Mood tracking with emoji/scale | Every journaling app has this. Users expect it. | This app is not a mood tracker — it's a reflection and therapy-prep tool. Adding a mood scale at session start/end creates a form-filling expectation that conflicts with freeform venting. It also generates data the app can't act on without a dedicated analytics screen. | If mood is relevant, let the AI detect emotional tone from the conversation and include it in the summary. Don't ask the user to rate their mood explicitly. |
| Full knowledge graph / bidirectional links | Obsidian, Roam Research. Power users want this. | Extreme complexity, small audience, and risk of making the product feel like a note-taking productivity tool rather than an emotionally safe space. Defeats "easy to navigate" goal. | Flat, simple browsing by person/theme/date is sufficient for therapy prep. A graph is a v2+ feature at most. |
| Automatic sharing with therapist | Grow Therapy uses this with full patient consent controls. | Without a therapist integration partner, this is a privacy liability. User trust in this app depends on the journal being private and portable. | Provide a clean "prepare for therapy" export/copy: a formatted list of today's takeaways. User manually brings it to session. |
| Per-message annotations or highlights | Obsidian-style markup during journaling. | Interrupts the flow of venting. Annotation-during-capture is the wrong moment for reflection in a therapeutic context. | Highlight extraction should be AI-driven post-session, surfaced in takeaways. |

---

## Feature Dependencies

```
[Dated sessions with date display]
    (already exists structurally — display work only)

[Post-session distillation step]
    └──requires──> [Conversation summary with keyThemes + unresolvedTopics]  (EXISTS)
    └──requires──> [UI trigger: "distill this session" or auto on close]      (new)
    └──produces──> [Editable takeaway list per session]                        (new storage + UI)

[Editable takeaways]
    └──requires──> [Post-session distillation step]
    └──enhances──> [AI-generated session title/summary]  (user can override)

[Topic tags on sessions]
    └──requires──> [InnerWorkSession.theme field reliably populated]           (field EXISTS, population needs work)
    └──enhances──> [Navigate by topic]

[Navigate by topic/date]
    └──requires──> [Topic tags]
    └──requires──> [Session list endpoint with topic filter]                   (filter exists, topic grouping is new)

[Cross-session theme clustering]
    └──requires──> [Topic tags on enough sessions to cluster]
    └──OR uses──>  [InnerWorkSession.contentEmbedding for semantic grouping]   (EXISTS)
    └──produces──> [Browsable themes view]

[People profile / cross-session person view]
    └──requires──> [People extraction already running on sessions]             (EXISTS)
    └──requires──> [New aggregation query: sessions x person x themes]
    └──produces──> [Browsable people view]

[Linked session context in journal view]
    └──requires──> [linkedPartnerSessionId field]                              (EXISTS)
    └──requires──> [UI to surface the link visibly]                           (new display)

[Browsable knowledge base]
    └──requires──> [Cross-session theme clustering]
    └──requires──> [People profile view]
    └──requires──> [Navigate by topic/date]
```

### Dependency Notes

- **Distillation requires conversation summarizer output:** The existing `SummarizationResult` type already includes `keyThemes`, `unresolvedTopics`, `emotionalJourney`. The distillation step is primarily a prompt to synthesize these into a user-facing "what I want to bring to therapy" list.
- **People view requires no new extraction work:** The `people-extractor.ts` is already called on inner thoughts sessions. The gap is the aggregation query and the UI, not the data pipeline.
- **Cross-session theme clustering is the highest-effort feature:** It either needs a new aggregation model (group sessions by `theme` string similarity) or a semantic clustering pass over `contentEmbedding`. Start with simple string-based grouping; migrate to semantic later.
- **Topic tags and distillation are mutually reinforcing:** Distillation produces themes that become tags; tags feed the browsable view. Build them together.

---

## MVP Definition

### Launch With (v1.2 — this milestone)

The minimum that validates "therapy-prep journal with accumulated knowledge."

- [ ] Dated session list — display `createdAt` prominently as the primary session identifier
- [ ] Reliable AI-generated title + summary for every session on close
- [ ] Topic tag per session — single primary theme, AI-generated, user-editable
- [ ] Post-vent distillation trigger — explicit step at session end: "want a summary of what came up?"
- [ ] Editable takeaway list — 3-7 bullet points from the distillation, user can delete/reword
- [ ] Basic browsable view — sessions grouped by tag/theme + sessions grouped by person mentioned
- [ ] People mentioned list — shows people extracted across all sessions, with session count

### Add After Validation (v1.x)

Features to add once the core browsing/distillation loop is validated.

- [ ] Cross-session theme clustering with trend view — "work stress has come up 4 times this month" — add when users have accumulated 10+ sessions
- [ ] Linked partner session surfaced in journal — visible badge or label when a session was linked to a conflict session
- [ ] Session search by keyword — straightforward; add when users report difficulty finding past entries

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] Person profile page — timeline of mentions, sentiment trend, themes that co-occur with this person. High value but requires significant UI surface area. Defer until people browsing is validated.
- [ ] Export / therapy-prep print view — formatted PDF or clipboard of session takeaways. Valid and useful, but exporting is premature before the content itself is trusted.
- [ ] Semantic similarity grouping of themes — upgrade from string-match clustering to embedding-based clustering once the data volume justifies it.
- [ ] Multiple tags per session — single tag is sufficient to start; multi-tag adds UI complexity before browsing patterns are understood.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Dated session list with visible date | HIGH | LOW | P1 |
| AI-generated session title/summary on close | HIGH | LOW | P1 |
| Post-vent distillation trigger + editable takeaways | HIGH | MEDIUM | P1 |
| Topic tag per session (AI-generated, editable) | HIGH | LOW-MEDIUM | P1 |
| Browsable people mentioned across sessions | HIGH | MEDIUM | P1 |
| Basic theme/tag grouping in session list | MEDIUM | LOW-MEDIUM | P1 |
| Cross-session theme trend view | HIGH | HIGH | P2 |
| Linked partner session badge in journal | MEDIUM | LOW | P2 |
| Session keyword search | MEDIUM | LOW | P2 |
| Person profile page with timeline | HIGH | HIGH | P3 |
| Export / print-ready takeaways | MEDIUM | LOW | P3 |

---

## Competitor Feature Analysis

| Feature | Rosebud | Mindsera | Grow Therapy | Reflectly | Our Approach |
|---------|---------|---------|--------------|-----------|--------------|
| Post-session distillation | Background AI insights, not explicit step | Mental model templates structure output | AI theme extraction after entry, user edits and shares | AI prompts guide structure during entry | Explicit distillation step post-vent; user-triggered or end-of-session. Preserves venting flow. |
| People / relationship tracking | Pattern recognition mentions people but no dedicated view | Not present | Not present | Not present | Dedicated people view; already have extraction infrastructure. First-mover advantage here. |
| Cross-session theme clustering | Weekly growth insights | Topic view with recurring themes | Not present (single session) | Mood trends only | Cross-session grouping by tag + people; organic emergence, not forced categories. |
| Browsable knowledge base | Premium "Bloom" feature with pattern history | Chat with your journal via AI | Not applicable (clinical tool) | Not present | Flat browsing by theme/person/date. Simple over clever. |
| Editability of AI output | Limited | Not present | User can edit/delete before sharing | Not applicable | Full edit of takeaways and tags. Trust through control. |
| Gamification | Streaks, growth scores | Progress tracking | Not present | Streaks, mood streaks | None. Therapeutic context; engagement through utility. |
| Therapy-session link | Not present | Not present | Explicit clinical integration | Not present | Implicit link via partner session context. No direct therapist sharing (privacy first). |

---

## UX Principles (From Research)

These patterns emerged consistently across competitor analysis and clinical research and should inform
implementation decisions.

**1. Decouple journaling from AI.** The venting chat must work with zero AI interpretation visible.
AI only surfaces after the user is done talking or explicitly asks. (Frontiers 2025, Grow Therapy)

**2. AI outputs are suggestions, not verdicts.** Every AI-generated takeaway, tag, and theme must be
editable. Trust is built through control, not accuracy. (Grow Therapy, clinical research)

**3. Organic emergence over pre-defined categories.** Don't present a taxonomy of "relationships /
work / health" buckets to fill. Let themes name themselves from what the user actually says. Present
them after they've accumulated, not before. (User's explicit "flexible and organic" requirement)

**4. Flat navigation over depth.** A simple list grouped by tag and by person is better than a
hierarchical knowledge graph. Every additional click is friction between the user and their memory.

**5. No interruption during venting.** Never show pattern detection, theme labels, or "you've said
this before" notices during the chat. The chat is a safe space. Analysis is post-session only.

**6. Therapy prep is about what to bring, not what to review.** The distillation output should be
framed as "things I want to think about" — a short, scannable list. Not a report. Not a score.

---

## Sources

- [Rosebud AI Journal — pattern recognition and memory system](https://www.rosebud.app/)
- [Rosebud: AI Journaling App Review (Bustle)](https://www.bustle.com/wellness/rosebud-therapy-app-review-features-price)
- [Grow Therapy: AI-powered between-session reflections](https://growtherapy.com/blog/grow-therapy-unveils-ai-powered-between-session-reflections-to-deepen-therapy-insights/)
- [Mindsera — topic tracking and mental models](https://www.mindsera.com/)
- [AI Journaling Apps Compared: Reflection vs Rosebud vs Mindsera (2026)](https://www.reflection.app/blog/ai-journaling-apps-compared)
- [Journaling with LLMs: novel UX paradigm for personal health (Frontiers 2025)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12234568/)
- [Gamification backfire research: Consumer Psychology Review 2026](https://myscp.onlinelibrary.wiley.com/doi/10.1002/arcp.70004)
- [7 Best Journaling Apps for Mental Health 2026 (therapist-reviewed)](https://blog.mylifenote.ai/best-journaling-apps-mental-health-2026-edition/)
- [Reflectly App Review 2025](https://ikanabusinessreview.com/2025/10/reflectly-app-review-2025-guided-journaling-for-wellbeing/)

---
*Feature research for: Inner Thoughts Journal milestone (v1.2)*
*Researched: 2026-03-11*
