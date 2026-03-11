# Mixpanel Event Reference - Meet Without Fear

**Last Updated**: January 4, 2026

---

## Identity Management (Keep As Is)

This is the hardest part to get right later. The alias/identify flow is correct:

### Website
1. Anonymous visit → Mixpanel assigns distinct_id
2. OAuth sign-in → `alias(userId)` ONCE, then `identify(userId)`
3. Return visits → `identify(userId)` from localStorage

### Mobile
1. App launch → `identify(userId)` if logged in
2. First login → `alias(userId)` ONCE (flag in AsyncStorage), then `identify(userId)`
3. App resume → `identify(userId)` again (defensive)
4. Logout → `reset()`

---

## MVP Event List (~20 Events)

### Auth (4 events)

| Event | Properties | When |
|-------|------------|------|
| **App Launch** | `platform`, `app_version` | App opens |
| **Sign In Completed** | `method: 'oauth'`, `provider`, `user_id` | Successful login |
| **Sign Up Completed** | `method: 'oauth'`, `provider`, `user_id` | First-time user |
| **Logout** | - | User logs out |

### Acquisition (3 events)

| Event | Properties | When |
|-------|------------|------|
| **Invitation Page Viewed** | `invitation_id`, `status` | Website invite page |
| **Invitation Accepted** | `invitation_id`, `inviter_id` | User accepts invite |
| **App Download Clicked** | `platform: 'ios' \| 'android'`, `source` | Download link tapped |

### Core Loop (5 events)

| Event | Properties | When |
|-------|------------|------|
| **Session Created** | `session_id`, `person_id` | New session started |
| **Person Selected** | `is_new_person`, `person_id` | Tracks network growth |
| **Invitation Sent** | `session_id`, `share_method` | Link shared |
| **Compact Signed** | `session_id`, `is_inviter` | User signs compact |
| **Session Resolved** | `session_id`, `resolution_type` | Session completed |

### Flow (5 events)

| Event | Properties | When |
|-------|------------|------|
| **Stage Started** | `session_id`, `stage_name`, `previous_stage` | Enter new stage |
| **Stage Completed** | `session_id`, `stage_name`, `duration_seconds` | Finish stage |
| **Message Sent** | `session_id`, `message_length` | User sends message |
| **Felt Heard Response** | `session_id`, `response: 'yes' \| 'no'` | Key product metric |
| **Common Ground Found** | `session_id`, `overlapping_needs` | Discovery moment |

### Inner Work (2 events)

| Event | Properties | When |
|-------|------------|------|
| **Inner Thoughts Created** | `session_id` | Personal session started |
| **Inner Thoughts Linked** | `session_id`, `partner_session_id` | High-value behavior |

### Errors (1 event)

| Event | Properties | When |
|-------|------------|------|
| **Error** | `error_type`, `error_code`, `context` | Any critical error |

---

## Super Properties (Auto-attached)

```typescript
// Mobile
{
  app_session_id: string,
  platform: 'ios' | 'android',
  app_version: string,
  environment: 'dev' | 'prod',
  user_id?: string
}

// Website
{
  platform: 'web',
  environment: 'dev' | 'prod',
  user_id?: string
}
```

---

## User Properties

### Set Once
```typescript
{
  first_seen_at: string,
  signup_source: 'website' | 'mobile' | 'invitation'
}
```

### Updated on Login
```typescript
{
  name: string,
  email: string,
  last_login_at: string,
  total_sessions: number,
  completed_sessions: number
}
```

---

## Key Funnels

### 1. Onboarding
```
App Launch → Sign In/Up Completed
```

### 2. Invitation Flow
```
Invitation Page Viewed → Invitation Accepted → App Download Clicked
```

### 3. Session Completion
```
Session Created → Invitation Sent → Compact Signed (x2) →
Stage Started → Stage Completed (repeat) → Session Resolved
```

### 4. Product Value
```
Message Sent → Felt Heard Response → Common Ground Found
```

---

## Implementation Files

- `mobile/src/services/mixpanel.ts` - Core tracking functions
- `mobile/src/utils/appSession.ts` - Session ID management
- `website/lib/mixpanel.ts` - Website tracking

---

## Testing

- Dev mode logs to console: `[Mixpanel DEV]`
- Use Mixpanel Live View in production
- Filter by `environment = 'prod'`
