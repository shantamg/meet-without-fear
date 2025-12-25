# Stage 4: Strategic Repair

## Purpose

Move from understanding to action by designing small, reversible experiments that address identified needs.

## AI Goal

- Invite **both users** to propose their own strategies
- Help refine proposals to be small, reversible, and time-bounded
- Collect and combine suggestions from both parties
- Present all strategies as **unlabeled options** (no attribution to source)
- Allow users to select from the combined pool
- Offer to generate additional AI suggestions if desired
- Document agreed-upon micro-experiments

## Key Design: Collaborative Strategy Generation

Unlike traditional negotiation where one person proposes and the other reacts, Stage 4 invites **both parties to contribute strategies independently**. The AI then:

1. Collects strategies from both users
2. Presents them as a single unlabeled pool
3. Asks: "Here is what we have come up with so far. Are you happy with these options, or would you like me to try and generate a few more to explore?"

This approach:
- Removes defensiveness that comes with accepting another's proposal
- Creates joint ownership of solutions
- Avoids win/lose dynamics
- Encourages creativity when users can build on unlabeled ideas

## Flow

```mermaid
flowchart TD
    Enter[Enter Stage 4] --> Intro[AI introduces repair work]
    Intro --> InviteA[Invite User A strategy]
    InviteA --> RefineA[AI helps refine specifics]

    InviteB[Invite User B strategy] --> RefineB[AI helps refine]

    RefineA --> Collect[Collect all strategies]
    RefineB --> Collect

    Collect --> Present[Present unlabeled strategy pool]
    Present --> Question[Happy with options or want more?]

    Question -->|Want more| Generate[AI generates additional ideas]
    Generate --> Present

    Question -->|Happy| Select[Users select preferred strategies]
    Select --> Combine[Combine selections]
    Combine --> Document[Document micro-experiment]

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
            SharedNeed[You both need: Recognition]
        end

        subgraph Strategies[Collective Strategies - Unlabeled]
            Title2[Here is what we have come up with]
            Strat1[Weekly 15-min planning session]
            Strat2[Daily appreciation message]
            Strat3[Shared task list]
            Strat4[Take turns choosing activities]
            Strat5[5-minute check-in before bed]
        end

        subgraph Actions[Options]
            Happy[These look good]
            More[Generate more ideas]
        end

        subgraph Agreed[Final Agreement]
            Title3[Your Commitments]
            Exp1[Weekly planning + daily appreciation]
            FollowUp[Check-in: Two weeks from today]
        end
    end
```

**Key visual elements:**
- Strategy buttons are presented without labels indicating who suggested them
- All buttons use soft, neutral colors (no "yours" vs "theirs" styling)
- Users can select multiple strategies to combine

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
