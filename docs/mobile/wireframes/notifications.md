# Notifications UX

Notification surfaces for invitations, stage progress, cooling periods, and follow-ups.

## Surfaces

| Surface | Purpose |
|---------|---------|
| Push | Bring user back when offline (invite accepted, partner signed, follow-up) |
| In-app toast | Lightweight, transient updates while user is active |
| Inbox panel | Persistent list of recent events with deep links |
| Lock screen banner | System-level push preview |

## Flows

### Invitation Accepted

```mermaid
flowchart TB
    Push[Push: Alex accepted your invitation] --> Tap[User taps]
    Tap --> DeepLink[Deep link to session]
    DeepLink --> SessionDash[Session Dashboard]
    SessionDash --> Stage0[Stage 0 - Compact]
```

### Partner Signed Compact

```mermaid
flowchart TB
    Event[Partner signs] --> Push2[Push if offline]
    Event --> Toast[In-app toast if online]
    Toast --> CTA[Open session]
    Push2 --> CTA
```

### Waiting Room Updates

```mermaid
flowchart TB
    Waiting[User in waiting room]
    PartnerAdvances[Partner moves stages]
    Waiting --> Toast2[Inline toast: Jordan moved to Stage 2]
    Toast2 --> Action[CTA: Go to Stage 2]
```

### Follow-up Reminder

```mermaid
flowchart TB
    Schedule[Check-in scheduled] --> Push3[Push at scheduled time]
    Push3 --> Tap2[Tap opens Follow-up flow]
    Tap2 --> FollowUp[Follow-up check-in screen]
```

## UI Patterns

- **Toast**: Compact banner at top; includes title, short body, CTA button. Auto-dismiss after 6s.
- **Inbox**: In header menu; shows chronological list with icons by type (invite, stage, follow-up). Items link to destination screens.
- **Badge**: Header icon badge count when unread > 0.
- **Preferences**: Toggle push + email; per-event toggles (invites, partner actions, follow-ups).

## Example Copy

| Event | Copy | CTA |
|-------|------|-----|
| Invite accepted | Alex accepted your invitation | Open session |
| Partner signed | Jordan signed the Curiosity Compact | Begin Stage 1 |
| Waiting update | Jordan moved to Stage 2 | Continue |
| Follow-up | How is your agreement going with Jordan? | Check in |

## States & Errors

| State | Behavior |
|-------|----------|
| Push denied | Inline banner prompting to enable notifications; link to OS settings |
| No network | Queue in-app notifications; show once online |
| Stale link | If deep link target is missing/expired, show friendly error with home CTA |

---

[Back to Wireframes](./index.md) | [Back to Plans](../index.md)
