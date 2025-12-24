# Stage 4: Strategic Repair

## Purpose

Move from understanding to action by designing small, reversible experiments that address identified needs.

## AI Goal

- Guide users toward proposing concrete actions
- Ensure proposals are small, reversible, and time-bounded
- Facilitate negotiation if needed
- Document agreed-upon micro-experiments
- Optionally schedule follow-up

## Flow

```mermaid
flowchart TD
    Enter[Enter Stage 4] --> Intro[AI introduces repair work]
    Intro --> Review[Review common ground needs]
    Review --> Invite[Invite action proposals]

    Invite --> Propose[User proposes action]

    subgraph Criteria[Micro-Experiment Criteria]
        C1[Small - one specific thing]
        C2[Reversible - can undo if needed]
        C3[Time-bounded - clear duration]
        C4[Measurable - can assess success]
    end

    Propose --> Check{Meets criteria?}
    Check -->|Too big| Smaller[Help scope down]
    Smaller --> Propose
    Check -->|Not reversible| Adjust[Suggest reversible version]
    Adjust --> Propose
    Check -->|Vague| Clarify[Help make specific]
    Clarify --> Propose
    Check -->|Good| ToOther[Present to other party]

    ToOther --> Response{Other response}
    Response -->|Accept| Agreed[Record agreement]
    Response -->|Counter-propose| Negotiate[AI facilitates]
    Negotiate --> ToOther
    Response -->|Reject| WhyReject[Explore concerns]
    WhyReject --> Revise[Revise proposal]
    Revise --> ToOther

    Agreed --> Document[Document experiment]
    Document --> FollowUp{Schedule check-in?}
    FollowUp -->|Yes| Schedule[Set follow-up date]
    FollowUp -->|No| Complete[Stage 4 complete]
    Schedule --> Complete

    Complete --> Resolution[Resolution achieved]
```

## Micro-Experiment Design

The AI helps users design experiments that are:

```mermaid
flowchart TB
    subgraph Good[Good Micro-Experiment]
        G1[Specific: One 15-min check-in per day]
        G2[Time-bounded: For the next week]
        G3[Reversible: Can adjust or stop]
        G4[Measurable: Did we do it? How did it feel?]
    end

    subgraph Bad[Too Big - Not a Micro-Experiment]
        B1[Vague: Communicate better]
        B2[Permanent: Always do X]
        B3[High stakes: Major life change]
        B4[Unmeasurable: Be more supportive]
    end
```

## Example Micro-Experiments

| Need Addressed | Micro-Experiment |
|----------------|------------------|
| Connection | "We will have a 10-minute phone-free conversation at dinner for 5 days" |
| Recognition | "I will say one specific thing I appreciate each morning for a week" |
| Safety | "We will use a pause signal when conversations get heated and take 5 minutes" |
| Fairness | "We will alternate who chooses weekend activities for the next month" |

## Negotiation Flow

```mermaid
flowchart TD
    Proposal[User A proposes] --> Present[AI presents to User B]

    Present --> Reaction{User B reaction}
    Reaction -->|Love it| Accept[Accept as-is]
    Reaction -->|Mostly good| Tweak[Suggest small tweak]
    Reaction -->|Concerns| Counter[Counter-proposal]
    Reaction -->|No way| Explore[Explore objection]

    Tweak --> Modify[AI helps modify]
    Modify --> BackToA[Present modified to A]
    BackToA --> Agreed{A accepts?}
    Agreed -->|Yes| Done[Agreement reached]
    Agreed -->|No| Negotiate[Further negotiation]

    Counter --> Process[AI processes counter]
    Process --> BackToA

    Explore --> Understand[Understand the concern]
    Understand --> NewIdea[Generate new idea]
    NewIdea --> Proposal
```

## Wireframe: Strategic Repair Interface

```mermaid
flowchart TB
    subgraph Screen[Strategic Repair Screen]
        subgraph Header[Header]
            Logo[BeHeard]
            Stage[Stage 4: Strategic Repair]
            Status[Building your path forward]
        end

        subgraph Foundation[Common Ground Foundation]
            Title1[Building on shared needs]
            SharedNeed[You both need: Safety and Connection]
        end

        subgraph Proposals[Proposals Area]
            Title2[Proposed Micro-Experiments]
            Prop1[Your proposal: Daily 10-min check-in]
            Status1[Status: Awaiting partner response]
            Prop2[Partner proposal: Weekly date night]
            Status2[Status: Awaiting your response]
        end

        subgraph Actions[Response Actions]
            Accept[Accept]
            Modify[Suggest modification]
            Counter[Counter-propose]
        end

        subgraph Agreed[Agreed Experiments]
            Title3[Your Commitments]
            Exp1[1. Daily check-in - starts Monday]
            FollowUp[Schedule check-in: Next Sunday]
        end
    end
```

## Success Criteria

Mutual agreement on at least one micro-experiment.

## Agreement Documentation

When users agree, the AI documents:

```
MICRO-EXPERIMENT AGREEMENT
--------------------------
Participants: [User A], [User B]
Date agreed: [Date]

Experiment: [Specific description]
Duration: [Time period]
Success measure: [How to know if it worked]

Check-in scheduled: [Date/time if applicable]
```

## Failure Paths

| Scenario | AI Response |
|----------|-------------|
| No proposals generated | AI suggests options based on identified needs |
| Repeated rejection | Explore what would work; may need to return to need mapping |
| Proposals too ambitious | Help scope down; emphasize "small and reversible" |
| One party uncooperative | Acknowledge difficulty; explore barriers |

## Follow-Up Support

If users schedule a check-in:

```mermaid
flowchart TD
    Experiment[Experiment period] --> CheckIn[Scheduled check-in]

    CheckIn --> Review[Review how it went]
    Review --> Result{Outcome}

    Result -->|Worked well| Celebrate[Celebrate progress]
    Celebrate --> Expand{Expand or continue?}
    Expand -->|Expand| NewExperiment[Design new experiment]
    Expand -->|Continue| Maintain[Keep current experiment]

    Result -->|Partially worked| Adjust[Discuss adjustments]
    Adjust --> Modify[Modify experiment]
    Modify --> TryAgain[Try again]

    Result -->|Did not work| Learn[Learn from it]
    Learn --> Understand[Understand barriers]
    Understand --> NewApproach[Try different approach]
    NewApproach --> NewExperiment
```

## Data Captured

- Proposals made
- Negotiation history
- Agreed experiments
- Follow-up schedules
- Check-in outcomes (if applicable)

---

## Related Documents

- [Previous: Stage 3 - Need Mapping](./stage-3-need-mapping.md)
- [User Journey](../overview/user-journey.md)
- [System Guardrails](../mechanisms/guardrails.md)

---

[Back to Stages](./index.md) | [Back to Plans](../index.md)
