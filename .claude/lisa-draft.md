# Inner Work Section Refinement - Interview Complete

*Interview completed: 2026-01-11*
*Final spec written to: `docs/specs/inner-work-refinement.md`*

## Summary

The Lisa interview gathered comprehensive requirements for a substantial Inner Work refinement including:

1. **Home Page Chat Input** - Instant access to Inner Thoughts from home screen
2. **AI Action Suggestions** - Full action palette (partner sessions, meditation, gratitude, needs)
3. **Inner Thoughts → Partner Session Transition** - Context-aware handoff with AI summary
4. **Meditation Refinements** - Structured timing tokens, custom creation, saved library
5. **People Tracking** - AI extraction with confidence-based partner linking
6. **Cross-Feature Intelligence** - Full implementation (patterns, insights, conversation integration)
7. **Navigation Audit** - Fix dead ends, improve completion flows, error handling

## Implementation Phases

1. **Phase 1 (Priority)**: Home page chat + Inner Thoughts improvements
2. **Phase 2**: Meditation refinements (timing, custom creation, saves)
3. **Phase 3**: People Tracking + Cross-Feature Intelligence
4. **Phase 4**: Navigation audit + polish

## Key Decisions

- Chat input on home page creates Inner Thoughts sessions directly
- AI determines when to suggest partner sessions (no rigid rules)
- Context transfers as visible first AI message in new session
- Meditation uses `[PAUSE:Xs]` tokens for accurate timing
- Edit saved meditations via chat only (not direct text editing)
- People linking: auto for high confidence, confirm for ambiguous
- Cross-Feature Intelligence: all modes (proactive, queryable, woven into conversations)
- Navigation: fix dead ends only, keep current IA structure

## Verification

```bash
npm run check
npm run test
```

---

<promise>SPEC COMPLETE</promise>
