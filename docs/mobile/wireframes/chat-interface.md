---
title: Chat Interface
sidebar_position: 3
description: The primary conversation interface where users interact with the AI.
updated: 2026-04-26
status: living
---
# Chat Interface

The primary conversation interface where users interact with the AI.

## Core Chat Layout

```mermaid
flowchart TB
    subgraph ChatScreen[Chat Interface]
        subgraph Header[Chat Header]
            StageTitle[Stage 1: The Witness]
            StageDesc[Share your perspective]
            ProgressDots[Progress indicators]
        end

        subgraph Messages[Message Area - Scrollable]
            AI1[AI: Welcome message]
            User1[User: Response]
            AI2[AI: Reflection]
            User2[User: More detail]
            AI3[AI: Deeper reflection]
            Typing[AI is composing...]
        end

        subgraph Input[Input Area - Fixed]
            EmotionCheck[Feeling: 5/10]
            TextField[Type your thoughts...]
            SendButton[Send]
        end
    end
```

## Message Bubbles

### AI Message

```mermaid
flowchart TB
    subgraph AIBubble[AI Message]
        Avatar[AI Avatar]
        Content[Message content with
        warm supportive tone
        and reflection]
        Time[2:34 PM]
    end
```

Characteristics:
- Left-aligned
- Subtle background color
- AI avatar/icon
- A typing indicator ("ghost dots") appears while the user is waiting for the AI's reply — it's derived from cache state (the last message role is `USER`, meaning the AI hasn't answered yet) and from pending mutations like `isFetchingInitialMessage` / `isConfirmingFeelHeard` / `isSharingEmpathy` / `isConfirmingInvitation`. Dots hide as soon as the first AI chunk arrives via SSE / Ably.
- **AI error feedback**: when an Ably `onAIError` event arrives (e.g. the backend failed to process the user's message), the optimistic message is rolled back (dots hide automatically) and a toast is shown: *"Something went wrong — Your message could not be processed. Please try again."* This is triggered via `useToast().showError` in `UnifiedSessionScreen`.

### User Message

```mermaid
flowchart TB
    subgraph UserBubble[User Message]
        UserContent[User message content
        can be multiple lines
        and as long as needed]
        UserTime[2:35 PM]
        Status[Sent]
    end
```

Characteristics:
- Right-aligned
- User-colored background
- Timestamp
- Sent/read status

## Stage-Specific Variations

### Stage 0: Onboarding Chat

```mermaid
flowchart TB
    subgraph OnboardingChat[Onboarding View]
        Header0[Welcome to Meet Without Fear]

        subgraph Content0[AI Welcome Message]
            Message[Brief warm opening with typewriter effect]
        end

        subgraph Actions0[Action Button]
            Ready[Ready / Let's go]
        end
    end
```

### Stage 1: The Witness Chat

```mermaid
flowchart TB
    subgraph WitnessChat[The Witness View]
        Header1[Stage 1: The Witness]

        subgraph Chat1[Open Conversation]
            AI11[Take your time. What would you like to share?]
            User11[User shares perspective]
            AI12[So what I hear is... Is that right?]
        end

        subgraph Completion1[Completion Check - Appears Later]
            HeardQ[Do you feel fully heard?]
            NotYet[Not yet - tell me more]
            YesHeard[Yes I feel heard]
        end
    end
```

### Stage 2: Perspective Stretch Chat

```mermaid
flowchart TB
    subgraph StretchChat[Perspective Stretch View]
        Header2[Stage 2: Understanding Their View]

        subgraph OtherPerspective[Partner Perspective Panel]
            PTitle[What your partner shared]
            PSummary[Curated summary of key points and needs]
        end

        subgraph Chat2[Reflection Conversation]
            AI21[How does hearing this land for you?]
            User21[User response]
            AI22[AI reflection or intervention]
        end
    end
```

### Stage 3: Need Mapping Chat

```mermaid
flowchart TB
    subgraph NeedChat[Need Mapping View]
        Header3[Stage 3: Finding Common Ground]

        subgraph NeedPanels[Need Panels]
            subgraph YourNeeds[Your Needs]
                YN1[Safety]
                YN2[Recognition]
            end
            subgraph TheirNeeds[Their Needs]
                TN1[Connection]
                TN2[Safety]
            end
        end

        subgraph CommonPanel[Common Ground]
            Common[Both need: Safety]
        end

        subgraph Chat3[Exploration]
            AI31[AI explores needs]
        end
    end
```

### Stage 4: Strategic Repair ("Moving Forward Together")

```mermaid
flowchart TB
    subgraph RepairChat[Strategic Repair View]
        Header4[Stage 4: Moving Forward]

        subgraph ProposalArea[Proposals]
            YourProp[Your proposal: Daily check-in]
            TheirProp[Their proposal: Weekly date]
            PropStatus[Awaiting response]
        end

        subgraph AgreedArea[Agreements]
            Agreed1[Agreed: 10-min daily conversation]
        end

        subgraph Chat4[Negotiation]
            AI41[AI facilitates discussion]
        end
    end
```

## Session entry flow

Before the chat list renders, `UnifiedSessionScreen` can swap in a full-screen mood check (`SessionEntryMoodCheck`) — this is the default entry when `shouldShowMoodCheck` is true. Only after the user submits (or dismisses) the mood reading does the usual chat layout show.

## Empty States

### Opening not acknowledged (onboarding)

If the caller enters a session but hasn't acknowledged the opening message, the list replaces its usual empty state with a `CompactChatItem` (a brief AI welcome message). A "Ready" button appears above the input via `CompactAgreementBar`. This is controlled by `isInOnboardingUnsigned` / `customEmptyState`.

### Waiting for Partner

```mermaid
flowchart TB
    subgraph WaitingState[Waiting State]
        WaitIcon[Hourglass or calm illustration]
        WaitTitle[Waiting for partner]
        WaitMessage[Your partner has not completed
        this stage yet. You can
        review your progress or
        take a break.]
        WaitActions[Review my sharing - Take a break]
    end
```

### Session Not Started

```mermaid
flowchart TB
    subgraph NotStarted[Session Not Started]
        NSIcon[Envelope illustration]
        NSTitle[Invitation sent]
        NSMessage[Your partner has not
        accepted the invitation yet.
        We will notify you when
        they join.]
        NSActions[Resend invitation - Edit message]
    end
```

## Input Area Details

```mermaid
flowchart TB
    subgraph InputDetailed[Input Area Detail]
        subgraph EmotionMini[Emotion Indicator]
            EmoLabel[Feeling:]
            EmoValue[5]
            EmoSlider[Small slider or tap to expand]
        end

        subgraph TextInput[Text Input]
            Placeholder[Share your thoughts...]
            TextArea[Expandable text area]
            CharCount[Optional character count]
        end

        subgraph Actions[Actions]
            Attach[Attach file]
            Send[Send arrow]
        end
    end
```

## Attachment Support

Not implemented. The message input accepts text only (`sendMessage(message: string)`); there is no attachment button, file picker, or attachment preview in `UnifiedSessionScreen` or `ChatInterface`. Documented here only as a deferred design idea — remove from wireframes before shipping if it doesn't make the roadmap.

## Integrated emotional barometer

The chat input hosts an inline emotion slider (`barometerValue` / `handleBarometerChange`). Readings ≥9 automatically open the `support-options` overlay to surface coping exercises before the user continues typing.

## Typewriter + inline Stage 2 cards

The chat list tracks `isTypewriterAnimating` (set while a new AI message is being typed in) so it can delay the appearance of inline cards until the text has finished. In Stage 2 (`PERSPECTIVE_STRETCH`), the list renders **validation cards** directly in the timeline (`validationCards`) with "Accurate / Partially / Off" buttons wired to `handleValidationAccurate` / `handleValidationNotQuite` instead of routing users to a separate screen.

## Stage label map

The screen uses this friendly-name map when rendering the stage header:

| Internal enum | UI label |
|---|---|
| `Stage.ONBOARDING` | Welcome |
| `Stage.WITNESS` | Share what's on your mind |
| `Stage.PERSPECTIVE_STRETCH` | Imagine their side |
| `Stage.NEED_MAPPING` | Find what you both need |
| `Stage.INFORMED_EMPATHY` | Deeper Understanding |
| `Stage.STRATEGIC_REPAIR` | Moving Forward Together |

---

## Related Documents

- [Core Layout](./core-layout.md)
- [Stage Controls](./stage-controls.md)
- [Emotional Barometer UI](./emotional-barometer-ui.md)

---

[Back to Wireframes](./index.md) | [Back to Plans](../index.md)
