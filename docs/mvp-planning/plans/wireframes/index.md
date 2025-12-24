# Wireframes

UI concepts and screen layouts for key BeHeard interfaces.

## Documents

- **[Core Layout](./core-layout.md)** - Base app structure and navigation
- **[Chat Interface](./chat-interface.md)** - The primary conversation interface
- **[Stage Controls](./stage-controls.md)** - Stage progression and status UI
- **[Emotional Barometer UI](./emotional-barometer-ui.md)** - Emotion tracking interface

## Design Principles

| Principle | Rationale |
|-----------|-----------|
| Minimalist | Reduce cognitive load during emotional work |
| No typing indicators | Reduce pressure and comparison |
| Stage-controlled | UI adapts to current stage |
| Calm aesthetic | Support emotional regulation |
| Clear boundaries | Visual separation of private/shared content |

## Screen Overview

```mermaid
flowchart TB
    subgraph Entry[Entry Screens]
        Login[Login]
        Create[Create Session]
        Accept[Accept Invitation]
    end

    subgraph Onboarding[Onboarding]
        Welcome[Welcome]
        Compact[Curiosity Compact]
        Wait[Waiting Room]
    end

    subgraph Core[Core Experience]
        Chat[Chat Interface]
        Progress[Progress View]
    end

    subgraph Support[Support Screens]
        Emotion[Emotion Check]
        Cooling[Cooling Period]
        Consent[Consent Dialog]
    end

    Entry --> Onboarding
    Onboarding --> Core
    Core --> Support
    Support --> Core
```

---

[Back to Plans](../index.md)
