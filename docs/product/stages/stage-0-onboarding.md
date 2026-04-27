---
title: "Stage 0: Onboarding"
sidebar_position: 3
description: Welcome both parties with a brief warm opening and secure acknowledgment before entering the conversation.
---
# Stage 0: Onboarding

## Purpose

Welcome users with a brief, warm opening and secure acknowledgment before entering the conversation.

## AI Goal

- Briefly explain the private chat format
- Reassure users that nothing is shared without consent
- Get a simple "Ready" acknowledgment to proceed

## Opening Message

The AI opens with a brief, warm message. The message varies based on whether this is the user's first session with this partner:

**First session:**
> "I am here to help you work through conflict — step by step. You'll start by sharing what you believe is happening, privately. I won't share anything you've said unless you explicitly approve it."

**Repeat session:**
> "Welcome back. Same as before — everything stays private unless you approve sharing. Let's pick up where we left off."

This message:
- Speaks in the AI's first person voice
- Sets expectation of a step-by-step process
- Explains the private chat format
- Reassures about consent before sharing

## Flow

```mermaid
flowchart TD
    Entry[User enters system] --> Welcome[AI welcome message]
    Welcome --> Ready{User taps Ready?}
    Ready -->|Yes| Acknowledged[Record acknowledgment]

    Acknowledged --> WaitOther{Other acknowledged?}
    WaitOther -->|Yes| Advance[Advance to Stage 1]
    WaitOther -->|No| Wait[Waiting room]
    Wait --> Notify[Notify when other acknowledges]
    Notify --> Advance
```

## Wireframe: Onboarding Screen

```mermaid
flowchart TB
    subgraph Screen[Onboarding Screen]
        subgraph Header[Header]
            Logo[Meet Without Fear]
            Stage[Stage 0 of 4]
        end

        subgraph Content[Main Content]
            Message[AI welcome message with typewriter effect]
        end

        subgraph Actions[Actions]
            Ready[Ready / Let's go button]
        end
    end
```

## Success Criteria

Both users must acknowledge the opening message.

## Failure Paths

| Scenario | AI Response |
|----------|-------------|
| User has concerns | Explore concerns; provide reassurance |
| User refuses to proceed | Explore concerns; explain the format is required; offer resources for other options |
| Other party not responding | Send reminders; offer to resend invitation |
| Invitation expires | Allow session creator to send new invitation |

## Data Captured

- Acknowledgment timestamp for each user
- Any concerns raised (for improving onboarding)
- Invitation/acceptance timing

---

## Related Documents

- [User Journey](../overview/user-journey.md)
- [Next: Stage 1 - The Witness](./stage-1-witness.md)

### Backend Implementation

- [Stage 0 API](../backend/api/stage-0.md) - Onboarding acknowledgment endpoints
- [Stage 0 Prompt](../backend/prompts/stage-0-opening.md) - Opening message template
- [Retrieval Contracts](../backend/state-machine/retrieval-contracts.md#stage-0-onboarding)

---

[Back to Stages](./index.md) | [Back to Plans](../index.md)
