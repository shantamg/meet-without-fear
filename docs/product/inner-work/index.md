---
title: Inner Work Implementation Plans
sidebar_position: 1
description: "> v1.2 Status: The Inner Work hub currently shows only one active pathway — Inner Thoughts (Talk it Out). Needs Assessment, Gratitude Practice, and Meditatio..."
---
# Inner Work Implementation Plans

> **v1.2 Status:** The Inner Work hub currently shows only one active pathway — Inner Thoughts (Talk it Out). Needs Assessment, Gratitude Practice, and Meditation are **deferred to a future milestone** and are not part of v1.2. See each plan for the DEFERRED status banner.

Implementation roadmap for expanding Inner Work (Inner Thoughts) from a single chat pathway to the full four-pathway system described in the [Inner Work Spec](../../inner-work-spec.md).

## Current State (v1.2)

We have built **"Talk it Out"** (renamed to "Inner Thoughts"):
- Solo self-reflection chat sessions
- Linking to partner sessions for context-aware reflection
- Rolling conversation summaries
- Memory detection and suggestions
- Semantic embeddings for retrieval

The Inner Work hub shows a session list for Inner Thoughts only. The other three pathways are not exposed in the UI.

## Target State (Future Milestones)

Four distinct pathways within Inner Work:
1. **Talk it Out** (Inner Thoughts) - Active in v1.2
2. **See the Positive** (Gratitude Practice) - [DEFERRED] Future milestone
3. **Am I OK?** (Needs Assessment) - [DEFERRED] Future milestone
4. **Develop Loving Awareness** (Meditation) - [DEFERRED] Future milestone

Plus supporting infrastructure:
- **People Tracking** - Track people mentioned across all features
- **Cross-Feature Intelligence** - Pattern recognition, contradiction detection

---

## Implementation Priority Order (When Resumed)

Based on value/complexity analysis:

### Phase 1: Foundation (Recommended First)

| Plan | Complexity | Value | Rationale |
|------|------------|-------|-----------|
| [Needs Assessment](./needs-assessment.md) [DEFERRED] | Medium | High | Enables cross-feature intelligence, core to spec vision |
| [People Tracking](./people-tracking.md) | Low | Medium | Simple to build, enables pattern recognition |

### Phase 2: Engagement Features

| Plan | Complexity | Value | Rationale |
|------|------------|-------|-----------|
| [Gratitude Practice](./gratitude-practice.md) [DEFERRED] | Low | High | Quick win, adds daily engagement touchpoint |
| [Cross-Feature Intelligence](./cross-feature-intelligence.md) | High | High | The "magic" - connects all features together |

### Phase 3: Advanced Features

| Plan | Complexity | Value | Rationale |
|------|------------|-------|-----------|
| [Meditation](./meditation.md) [DEFERRED] | High | Medium | Requires TTS, audio, offline support |

---

## Shared Infrastructure Needs

These cut across multiple features and should be considered:

### Database Additions
- `Need` - 19 needs reference table
- `NeedScore` - User scores over time
- `GratitudeEntry` - Gratitude entries with extracted metadata
- `MeditationSession` - Meditation tracking
- `PersonMention` - People tracking across features

### Mobile Navigation
- Inner Work dashboard/hub screen
- Navigation between 4 pathways
- Quick access from partner sessions

### Notification System
- Scheduled check-in reminders
- Gratitude prompts
- Meditation reminders

---

## Dependencies Between Plans

```
People Tracking ──────────────────────────────────────┐
                                                      │
Needs Assessment ─────────────────────────────────────┼──→ Cross-Feature Intelligence
                                                      │
Gratitude Practice ───────────────────────────────────┘

Inner Thoughts (existing) ────────────────────────────→ Already integrated

Meditation ───────────────────────────────────────────→ Can leverage needs for suggestions
```

---

## Existing Assets to Leverage

- **Memory System**: Intentional memory saves + RAG retrieval can store/retrieve needs, patterns
- **Embedding Service**: Already handles semantic search, can extend to gratitude/needs
- **Chat Interface**: Reusable for conversational check-ins
- **Conversation Summarizer**: Can adapt for needs check-in conversations

---

## Links

- [Original Spec](../../inner-work-spec.md) - Full product specification
- [Needs Assessment Plan](./needs-assessment.md)
- [Gratitude Practice Plan](./gratitude-practice.md)
- [Meditation Plan](./meditation.md)
- [People Tracking Plan](./people-tracking.md)
- [Cross-Feature Intelligence Plan](./cross-feature-intelligence.md)

---

[Back to Plans](../index.md)
