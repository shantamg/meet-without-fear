# Session Attention Notification Feature

## Problem

When a user is in Inner Thoughts (or anywhere else in the app outside the active partner session), they have **no in-app indicator** that the partner session needs their attention. The only notification mechanism is push notifications, which:
- Don't work in E2E browser testing
- Require the user to check their phone's notification shade
- Are easily missed or dismissed

## Current State

| Mechanism | Exists? | Works in Inner Thoughts? | Works on Home Screen? |
|-----------|---------|--------------------------|----------------------|
| Push notifications | Yes | OS-level only | OS-level only |
| In-session badges | Yes | No (different screen) | No |
| Session-level Ably events | Yes | No (not subscribed) | No |
| User-level Ably events | Partial | Not used here | Could be enabled |
| App-level badge count | Backend exists | Not displayed | Not displayed |
| "Return to session" banner | No | N/A | N/A |

## Proposed Solution

### 1. Global Session Attention Hook

Create a `useSessionAttention` hook that listens to user-level Ably events and tracks which sessions need attention. This hook would be used on ANY screen (Inner Thoughts, home, drawer).

```typescript
// useSessionAttention.ts
function useSessionAttention() {
  // Subscribe to user-level Ably channel
  // Listen for: partner.empathy_shared, partner.stage_completed,
  //   empathy.revealed, notification.pending_action, etc.
  // Maintain a map of sessionId -> { needsAttention: boolean, reason: string, timestamp: Date }
  // Expose: sessionsNeedingAttention, hasAnyAttention, clearAttention(sessionId)
}
```

### 2. Floating "Return to Session" Banner

When the user is NOT on the partner session screen and that session needs attention, show a floating banner/toast at the top of the screen:

```
┌──────────────────────────────────────────┐
│ 🔔 Alice is ready — tap to return       │
│    to your partner session               │
└──────────────────────────────────────────┘
```

- Appears on Inner Thoughts screen, home screen, anywhere
- Tapping navigates directly to the partner session
- Dismissable but reappears if new events arrive
- Subtle animation to draw attention without being intrusive

### 3. Session Card Badge in Drawer

The session list in the drawer should show a badge on session cards that need attention:

```
┌─────────────────────────────────┐
│ 🟢 Session with Alice    [2]   │  ← badge showing 2 pending actions
│    Last activity: 2 min ago     │
└─────────────────────────────────┘
```

### 4. App-Level Badge on Drawer Icon

The drawer/hamburger icon should show a badge when ANY session needs attention:

```
[≡]•  ← red dot on drawer icon
```

## Events That Should Trigger "Needs Attention"

From the existing Ably event system:

| Event | Meaning | Priority |
|-------|---------|----------|
| `partner.empathy_shared` | Partner shared their empathy — user may need to validate | High |
| `empathy.revealed` | Both empathy statements revealed — validation needed | High |
| `empathy.share_suggestion` | Reconciler suggests sharing context | High |
| `empathy.context_shared` | Partner shared additional context — user should refine | High |
| `notification.pending_action` | Generic "you have something to do" | Medium |
| `partner.needs_confirmed` | Partner confirmed needs — common ground may be ready | Medium |
| `session.common_ground_ready` | Common ground analysis complete | Medium |
| `partner.ready_to_rank` | Partner ready to rank strategies | Medium |
| `stage.progress` | Partner advanced to new stage | Low (informational) |

## Implementation Approach

### Backend Changes
- None required — the events and badge count API already exist
- The `GET /notifications/badge-count` endpoint already returns aggregate counts

### Mobile Changes

**New files:**
- `mobile/src/hooks/useSessionAttention.ts` — Global hook that subscribes to user-level Ably channel and maintains attention state
- `mobile/src/components/SessionAttentionBanner.tsx` — Floating banner component

**Modified files:**
- `mobile/src/screens/InnerThoughtsScreen.tsx` — Add `useSessionAttention` hook and render `SessionAttentionBanner` when linked partner session needs attention
- `mobile/src/components/SessionDrawer/index.tsx` — Show badges on session cards, badge on drawer icon
- `mobile/src/hooks/useRealtime.ts` — Ensure user-level channel subscription is available globally (may already be via `useUserSessionUpdates`)

### Key Design Decisions

1. **Non-intrusive**: Banner should be informative, not alarming. This is a conflict resolution app — users should feel safe, not pressured.
2. **Contextual**: Banner text should be specific ("Alice shared her perspective" not "Action needed")
3. **Dismissable**: User can dismiss and come back when ready. No countdown timers or urgency signals.
4. **Smart timing**: Don't show banner immediately — wait 5-10 seconds after event to avoid interrupting the user mid-thought in Inner Thoughts.

## Relationship to Multi-Agent E2E Skill

The multi-agent E2E skill (`MULTI_AGENT_E2E_SKILL.md`) will test this feature by having each user agent:
1. Go to Inner Thoughts when waiting
2. Check for the attention banner
3. Report whether the banner appeared and what it said
4. Navigate back via the banner (if it exists) or manually

If the feature doesn't exist yet, the E2E agents will document the gap explicitly, confirming the need for this feature.
