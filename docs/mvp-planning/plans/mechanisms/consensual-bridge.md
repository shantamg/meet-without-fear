# Consensual Bridge

:::tip See it in action
[Try the Consensual Bridge demo](/demo/features/consensual-bridge.html) - Explore explicit consent prompts for sharing reflections with your partner.
:::

## Purpose

Control what information flows between users, ensuring nothing is shared without explicit consent.

## Core Principle

**The AI never auto-summarizes or shares user input.** Every piece of information that moves from one users private space to shared visibility requires explicit consent.

## How It Works

```mermaid
flowchart TD
    Share[User shares something] --> Store[Stored in User Vessel]
    Store --> Analyze[AI analyzes internally]

    Analyze --> Valuable{Valuable to share?}
    Valuable -->|No| Private[Remains private]
    Valuable -->|Yes| AskConsent[Ask for consent]

    AskConsent --> Decision{User decision}
    Decision -->|Deny| Private
    Decision -->|Allow| Shared[Move to Shared Vessel]

    Shared --> Present[Available for other to see]
```

## Consent Request Pattern

When the AI identifies something valuable to share:

```
AI: "You mentioned that [Event X] felt like betrayal.
    Would you like me to highlight 'Trust' as a core need
    for [Partner] to reflect on?"

    [Yes, share this]  [No, keep private]
```

## What Can Be Shared

The AI curates and transforms content before requesting sharing:

| Original Content | Transformed for Sharing |
|-----------------|------------------------|
| "They completely ignored me at the party" | "Feeling overlooked in social situations" |
| "I hate how they always take their side" | "Need for feeling supported and prioritized" |
| "They never listen to anything I say" | "Need for being heard and understood" |

## What Never Gets Shared

Even with consent, some content remains private:

- Raw venting language
- Direct accusations
- Character attacks
- Detailed grievance lists
- Anything the user explicitly wants private

## Flow Between Vessels

```mermaid
flowchart LR
    subgraph UserA[User A Vessel]
        A1[Raw thoughts]
        A2[Emotions]
        A3[Events]
    end

    subgraph AISynthesis[AI Synthesis - Internal]
        S1[Needs identified]
        S2[Patterns noted]
        S3[Common ground detected]
    end

    subgraph Shared[Shared Vessel]
        Sh1[Consented insights]
        Sh2[Identified needs]
        Sh3[Common ground]
    end

    subgraph UserB[User B Vessel]
        B1[Raw thoughts]
        B2[Emotions]
        B3[Events]
    end

    A1 --> S1
    A2 --> S1
    B1 --> S2
    B2 --> S2

    S1 -->|With A consent| Shared
    S2 -->|With B consent| Shared

    Shared --> ViewA[User A can see]
    Shared --> ViewB[User B can see]
```

## Consent Tracking

The system tracks what has been consented:

```
Consent Record for User A:
- Need: Trust - SHARED
- Need: Recognition - SHARED
- Event: Work argument - PRIVATE
- Emotion: Feeling betrayed - SHARED (as "trust concern")
- Detail: Specific conversation - PRIVATE
```

## Wireframe: Consent Request

```mermaid
flowchart TB
    subgraph Dialog[Sharing Consent Dialog]
        Question[Would you like to share this insight?]

        subgraph Preview[What Partner Will See]
            Transformed[You have a need for feeling prioritized in decisions]
        end

        subgraph Original[Your Original Words - Private]
            Raw[They always make decisions without me]
        end

        Actions[No keep private ---- Yes share this]
    end
```

## Granular Control

Users can consent to different levels:

```mermaid
flowchart TD
    Content[Content to share] --> Level{Sharing level?}

    Level -->|Full| Full[Share complete insight]
    Level -->|Summary| Summary[Share high-level only]
    Level -->|Theme| Theme[Share just the need/theme]
    Level -->|None| None[Keep fully private]
```

## Revoking Consent

Users can revoke sharing consent:

```mermaid
flowchart TD
    Shared[Previously shared content] --> Revoke[User requests revocation]
    Revoke --> Remove[Remove from Shared Vessel]
    Remove --> Notify[Notify AI]
    Notify --> Adjust[AI adjusts future references]
```

## Implementation Notes

- Every share request must be explicit
- Transformations should preserve meaning while removing heat
- Track all consent decisions for transparency
- Allow users to review what they have shared
- Provide easy revocation mechanism

---

## Related Documents

- [Privacy Model](../privacy/index.md)
- [Stage 2: Perspective Stretch](../stages/stage-2-perspective-stretch.md)
- [System Guardrails](./guardrails.md)

---

[Back to Mechanisms](./index.md) | [Back to Plans](../index.md)
