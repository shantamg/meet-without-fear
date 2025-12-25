# Emotional Barometer

## Purpose

Monitor emotional intensity throughout the process and enforce pacing controls when intensity is too high for productive work.

## How It Works

```mermaid
flowchart TD
    Session[User in session] --> Periodic[Periodic check-in]
    Periodic --> Prompt[How intense are your feelings right now?]
    Prompt --> Rate[User rates 1-10]

    Rate --> Evaluate{Intensity level}
    Evaluate -->|1-4| Calm[Calm zone]
    Evaluate -->|5-7| Elevated[Elevated zone]
    Evaluate -->|8-10| High[High intensity zone]

    Calm --> Continue[Continue normally]
    Elevated --> Monitor[Monitor more frequently]
    High --> Pause[Trigger cooling period]

    Monitor --> Trend{Trending up?}
    Trend -->|No| Continue
    Trend -->|Yes| Pause

    Pause --> Disable[Disable advancement]
    Disable --> Message[Supportive message]
    Message --> Options[Offer grounding options]
    Options --> Later[User returns when ready]
    Later --> Rate
```

## Intensity Zones

| Rating | Zone | AI Behavior |
|--------|------|-------------|
| 1-4 | Calm | Normal pace; occasional check-ins |
| 5-7 | Elevated | More frequent check-ins; watch for trends |
| 8-10 | High | Cooling period required before advancing |

## Triggering a Cooling Period

When intensity exceeds threshold:

```
if user_emotion > 8:
    disable_advance_button()
    send_message("High emotional intensity detected.
                  Cooling period recommended.
                  Return when ready.")
```

## Cooling Period Flow

```mermaid
flowchart TD
    Trigger[High intensity detected] --> Acknowledge[Acknowledge the feeling]
    Acknowledge --> Validate[Validate the experience]
    Validate --> Options[Offer options]

    Options --> Ground[Grounding exercises]
    Options --> Break[Take a break]
    Options --> Journal[Private journaling]

    Ground --> Return[Return when ready]
    Break --> Return
    Journal --> Return

    Return --> Recheck[Re-check intensity]
    Recheck --> Level{Level now?}
    Level -->|Still high| Options
    Level -->|Lowered| Resume[Resume session]
```

## Wireframe: Emotional Barometer UI

```mermaid
flowchart TB
    subgraph Compact[Compact View - In Chat]
        Label[How are you feeling?]
        Slider[1 --- 5 --- 10]
        Description[Calm ... Intense]
    end

    subgraph Expanded[Expanded View - Cooling Period]
        Title[Taking a Moment]
        Message[It makes sense to feel strongly about this]
        Current[Your intensity: 9/10]
        Suggestions[What might help right now?]
        Option1[Breathing exercise]
        Option2[Take a break]
        Option3[Write in private journal]
        Ready[I am ready to continue]
    end
```

## Multi-Session Persistence

The barometer tracks patterns over time:

```mermaid
flowchart LR
    Session1[Session 1\nAvg: 6] --> Session2[Session 2\nAvg: 7]
    Session2 --> Session3[Session 3\nAvg: 5]
    Session3 --> Session4[Session 4\nAvg: 4]

    Session1 --> Trend[Trend Analysis]
    Session2 --> Trend
    Session3 --> Trend
    Session4 --> Trend

    Trend --> Insight[Emotions decreasing over time]
```

## Privacy of Emotional Data

- Ratings are **private by default**
- Stored in User Vessel only
- AI may ask consent to share if it helps:

```
AI: "I noticed you have been feeling quite intense during our
    conversations. Would it be helpful for [Partner] to know
    that this process brings up strong feelings for you?"
```

## Grounding Options

When cooling period is triggered, the AI may offer:

| Option | Description |
|--------|-------------|
| Breathing exercise | Guided 4-7-8 breathing or similar |
| Body scan | Brief check-in with physical sensations |
| Take a break | Log off and return later |
| Private journaling | Write without sharing |
| Pause timer | Set a timer before returning |

## Display Options

The barometer can be presented in two ways:

1. **Always visible** - A persistent slider at the bottom of the chat interface that users can adjust at any time
2. **Periodic popup** - The barometer appears as a gentle popup at key moments (stage transitions, after intense exchanges, or on a timer)

Either approach is valid. The always-visible option provides continuous awareness, while the popup approach can feel less intrusive and more intentional.

## Implementation Notes

- Check-ins should feel natural, not intrusive
- Frequency adapts to user pattern (more often if volatile)
- Never shame or judge high intensity ratings
- Cooling periods are framed as wisdom, not failure

---

## Related Documents

- [User Journey](../overview/user-journey.md)
- [Stage 1: The Witness](../stages/stage-1-witness.md)
- [System Guardrails](./guardrails.md)

---

[Back to Mechanisms](./index.md) | [Back to Plans](../index.md)
