# Inner Work Implementation Plans

Implementation roadmap for expanding Inner Work (Inner Thoughts) from a single chat pathway to the full four-pathway system described in the [Inner Work Spec](../../inner-work-spec.md).

## Current State

We have built **"Talk it Out"** (renamed to "Inner Thoughts"):
- Solo self-reflection chat sessions
- Linking to partner sessions for context-aware reflection
- Rolling conversation summaries
- Memory detection and suggestions
- Semantic embeddings for retrieval

## Target State

Four distinct pathways within Inner Work:
1. **Talk it Out** (Inner Thoughts) - ✅ Built
2. **See the Positive** (Gratitude Practice) - 🔲 Not built
3. **Am I OK?** (Needs Assessment) - 🔲 Not built
4. **Develop Loving Awareness** (Meditation) - 🔲 Not built

Plus supporting infrastructure:
- **People Tracking** - Track people mentioned across all features
- **Cross-Feature Intelligence** - Pattern recognition, contradiction detection

---

## Implementation Priority Order

Based on value/complexity analysis:

### Phase 1: Foundation (Recommended First)

| Plan | Complexity | Value | Rationale |
|------|------------|-------|-----------|
| [Needs Assessment](./needs-assessment.md) | Medium | High | Enables cross-feature intelligence, core to spec vision |
| [People Tracking](./people-tracking.md) | Low | Medium | Simple to build, enables pattern recognition |

### Phase 2: Engagement Features

| Plan | Complexity | Value | Rationale |
|------|------------|-------|-----------|
| [Gratitude Practice](./gratitude-practice.md) | Low | High | Quick win, adds daily engagement touchpoint |
| [Cross-Feature Intelligence](./cross-feature-intelligence.md) | High | High | The "magic" - connects all features together |

### Phase 3: Advanced Features

| Plan | Complexity | Value | Rationale |
|------|------------|-------|-----------|
| [Meditation](./meditation.md) | High | Medium | Requires TTS, audio, offline support |

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
