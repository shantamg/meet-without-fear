# Stage Controls

UI elements that manage stage progression and status.

## Stage Progress Bar

```mermaid
flowchart LR
    subgraph ProgressBar[Stage Progress Bar]
        S0((0))
        S1((1))
        S2((2))
        S3((3))
        S4((4))

        S0 --- L1[---] --- S1
        S1 --- L2[---] --- S2
        S2 --- L3[---] --- S3
        S3 --- L4[---] --- S4
    end
```

### State Styling

| State | Circle | Line | Label |
|-------|--------|------|-------|
| Complete | Filled + check | Solid | Stage name |
| Current | Highlighted ring | Dashed | Stage name + status |
| Locked | Empty + lock | Dotted | Stage name (grayed) |

### With Partner Status

```mermaid
flowchart TB
    subgraph DetailedProgress[Progress with Partner Status]
        subgraph Stage1Box[Stage 1]
            S1Icon[Checkmark]
            S1Label[The Witness]
            S1You[You: Complete]
            S1Partner[Partner: Complete]
        end

        subgraph Stage2Box[Stage 2 - Current]
            S2Icon[In progress]
            S2Label[Perspective Stretch]
            S2You[You: In progress]
            S2Partner[Partner: Waiting]
        end

        subgraph Stage3Box[Stage 3]
            S3Icon[Lock]
            S3Label[Need Mapping]
            S3Status[Locked]
        end
    end
```

## Gate Status Indicators

### Gate Not Satisfied

```mermaid
flowchart TB
    subgraph GateLocked[Gate Locked State]
        GateIcon[Lock icon]
        GateTitle[Cannot advance yet]
        GateReason[You need to: Confirm you feel fully heard]
        GateProgress[Progress: Almost there]
        GateAction[Continue conversation]
    end
```

### Gate Satisfied - Waiting for Partner

```mermaid
flowchart TB
    subgraph GateWaiting[Waiting for Partner]
        WaitIcon[Hourglass icon]
        WaitTitle[Ready to advance]
        WaitReason[Waiting for partner to complete Stage 1]
        WaitStatus[Partner is still working]
        WaitAction[Take a break - Review my progress]
    end
```

### Gate Satisfied - Can Advance

```mermaid
flowchart TB
    subgraph GateOpen[Gate Open]
        OpenIcon[Arrow icon]
        OpenTitle[Ready for next stage]
        OpenMessage[You have both completed Stage 1]
        OpenAction[Continue to Stage 2]
    end
```

## Stage Completion Confirmation

### Generic Confirmation Pattern

```mermaid
flowchart TB
    subgraph ConfirmDialog[Stage Completion]
        ConfirmTitle[Complete Stage 1?]
        ConfirmSummary[You have confirmed that you feel
        fully heard by the AI.]
        ConfirmNote[You will not be able to add more
        to Stage 1 after advancing.]
        ConfirmActions[Go back - Yes advance]
    end
```

### Stage-Specific Confirmations

**Stage 0 - Signing Compact:**
```mermaid
flowchart TB
    subgraph CompactSign[Sign Curiosity Compact]
        CompactTitle[Ready to begin?]
        CompactTerms[By signing you agree to approach
        this process with curiosity...]
        CompactCheck[I agree to the Curiosity Compact]
        CompactAction[Sign and Begin]
    end
```

**Stage 1 - Feeling Heard:**
```mermaid
flowchart TB
    subgraph HeardConfirm[Confirmation Check]
        HeardTitle[Do you feel fully heard?]
        HeardMessage[Take your time. There is no rush.
        Once you confirm we will move
        to understanding your partners view.]
        HeardOptions[Not yet - I feel fully heard]
    end
```

**Stage 4 - Agreement:**
```mermaid
flowchart TB
    subgraph AgreementConfirm[Confirm Agreement]
        AgrTitle[Confirm micro-experiment]
        AgrDetail[You are agreeing to:
        Daily 10-minute check-in
        for the next 7 days]
        AgrCheck[I commit to this experiment]
        AgrAction[Confirm - Suggest changes]
    end
```

## Stage Header Variations

### Current Active Stage

```mermaid
flowchart TB
    subgraph ActiveHeader[Active Stage Header]
        ActiveTitle[Stage 2: Perspective Stretch]
        ActiveDesc[Understanding your partners view]
        ActiveProgress[Your progress: Building empathy]
    end
```

### Completed Stage (Review Mode)

```mermaid
flowchart TB
    subgraph ReviewHeader[Review Header]
        ReviewBadge[Completed]
        ReviewTitle[Stage 1: The Witness]
        ReviewDesc[Your sharing and reflections]
        ReviewAction[View summary]
    end
```

### Locked Stage (Preview)

```mermaid
flowchart TB
    subgraph LockedHeader[Locked Stage Header]
        LockedBadge[Upcoming]
        LockedTitle[Stage 3: Need Mapping]
        LockedDesc[Finding common ground]
        LockedNote[Complete Stage 2 to unlock]
    end
```

## Mobile Stage Controls

```mermaid
flowchart TB
    subgraph MobileStage[Mobile Stage View]
        subgraph MobileHeader[Compact Header]
            MStageNum[2/4]
            MStageName[Perspective Stretch]
            MExpandBtn[Expand]
        end

        subgraph MobileExpanded[Expanded Overlay]
            MFullProgress[Full progress bar]
            MStageDetails[Current stage details]
            MPartnerStatus[Partner status]
            MCloseBtn[Close]
        end
    end
```

## Stage Transition Animation

```mermaid
flowchart LR
    Current[Current Stage] --> Transition[Transition Animation]
    Transition --> Next[Next Stage]

    subgraph TransitionDetails[Transition Sequence]
        T1[Fade current content]
        T2[Progress bar animates]
        T3[Celebration micro-moment]
        T4[Fade in new content]
    end
```

---

## Related Documents

- [Core Layout](./core-layout.md)
- [Chat Interface](./chat-interface.md)
- [Stages Overview](../stages/index.md)

---

[Back to Wireframes](./index.md) | [Back to Plans](../index.md)
