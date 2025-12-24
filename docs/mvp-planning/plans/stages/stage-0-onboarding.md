# Stage 0: Onboarding

## Purpose

Establish the Process Guardian role and secure commitment from both parties through the Curiosity Compact.

## AI Goal

- Explain the system and its stages
- Set expectations for asynchronous, AI-mediated communication
- Establish trust in the process
- Secure explicit agreement to proceed with curiosity rather than judgment

## Flow

```mermaid
flowchart TD
    Entry[User enters system] --> Welcome[Welcome message]
    Welcome --> Explain[Explain BeHeard process]

    subgraph Explanation[Process Explanation]
        E1[AI facilitates - not judges]
        E2[You will not speak directly]
        E3[5 stages to resolution]
        E4[Your privacy is protected]
    end

    Explain --> Explanation
    Explanation --> Compact[Present Curiosity Compact]

    Compact --> Review[User reviews terms]
    Review --> Questions{Questions?}
    Questions -->|Yes| Clarify[AI clarifies]
    Clarify --> Review
    Questions -->|No| Decision{Sign compact?}

    Decision -->|Yes| Signed[Record signature]
    Decision -->|Not ready| Concerns[Explore concerns]
    Decision -->|Refuse| CannotProceed[Explain requirements]

    Concerns --> Address[AI addresses concerns]
    Address --> Decision
    CannotProceed --> Exit[Exit with resources]

    Signed --> WaitOther{Other signed?}
    WaitOther -->|Yes| Advance[Advance to Stage 1]
    WaitOther -->|No| Wait[Waiting room]
    Wait --> Notify[Notify when other signs]
    Notify --> Advance
```

## The Curiosity Compact

A commitment that both parties make before beginning:

```
I commit to:
- Approach this process with curiosity rather than certainty
- Allow the AI to guide the pace of our work
- Share honestly within my private space
- Consider the others perspective when presented
- Focus on understanding needs rather than winning arguments
- Take breaks when emotions run high

I understand that:
- The AI will not judge who is right or wrong
- My raw thoughts remain private unless I consent to share
- Progress requires both parties to complete each stage
- I can pause at any time but cannot skip ahead
```

## Wireframe: Onboarding Screen

```mermaid
flowchart TB
    subgraph Screen[Onboarding Screen]
        subgraph Header[Header]
            Logo[BeHeard]
            Stage[Stage 0 of 4]
        end

        subgraph Content[Main Content]
            Title[Welcome to BeHeard]
            Intro[Brief explanation paragraph]
            Steps[Visual stage overview]
        end

        subgraph CompactSection[Curiosity Compact]
            CompactTitle[Your Commitment]
            Terms[Scrollable terms]
            Checkbox[I agree to proceed with curiosity]
        end

        subgraph Actions[Actions]
            Questions[I have questions]
            Sign[Sign and Begin]
        end
    end
```

## Success Criteria

Both users must sign the Curiosity Compact.

## Failure Paths

| Scenario | AI Response |
|----------|-------------|
| User has concerns | Explore concerns; provide reassurance |
| User refuses to sign | Explain this is required; offer resources for other options |
| Other party not responding | Send reminders; offer to resend invitation |
| Invitation expires | Allow session creator to send new invitation |

## Data Captured

- Signature timestamp for each user
- Any concerns raised (for improving onboarding)
- Invitation/acceptance timing

---

## Related Documents

- [User Journey](../overview/user-journey.md)
- [Next: Stage 1 - The Witness](./stage-1-witness.md)

---

[Back to Stages](./index.md) | [Back to Plans](../index.md)
