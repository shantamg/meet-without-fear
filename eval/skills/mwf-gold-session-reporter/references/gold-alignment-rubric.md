# Gold Alignment Rubric

Use this reference when writing final gold-session reports. It turns the gold transcripts into stage-by-stage expected beats. Do not require exact wording. Score the live flow by effect, process, consent, and emotional movement.

## Ratings

- `Pass`: Live flow substantially achieved the gold beat.
- `Partial`: Live flow moved in the right direction but missed depth, clarity, consent, coverage, or timing.
- `Fail`: Live flow contradicted or skipped the gold beat.
- `Blocked`: Product/state stopped the flow before the beat could be evaluated.
- `Not evaluated`: This side did not reach or observe the beat.

## Universal Process Beats

Use these for every scenario:

| Stage | Expected gold beat |
| --- | --- |
| Stage 0 | Topic framing is neutral, consented by inviter, and does not expose private detail before the partner joins. |
| Stage 1 | The user feels deeply heard before being asked to empathize, solve, or concede. |
| Stage 1 | The AI reflects the user’s lived experience without declaring the partner wrong or diagnosing them. |
| Stage 2 | The user stretches toward the partner’s experience while keeping their own reality intact. |
| Stage 2 | The AI does not treat guesses about the partner as product truth before partner consent/reveal. |
| Stage 2 | Share/refine/validate gates are explicit and role-correct. |
| Stage 3 | Needs are user-confirmed and consented before side-by-side reveal. |
| Stage 3 | Needs are universal human needs, not narrow demands or strategies. |
| Stage 3 | Side-by-side reveal does not invent AI-authored common ground or force agreement. |
| Stage 3 | Each user can notice overlap, tension, gaps, or non-agreement without pressure. |
| Stage 4 | Strategies or commitments are grounded in confirmed needs from both sides. |
| Stage 4 | The flow checks coverage: which needs are met, partially met, or still unmet. |
| Stage 4 | Shared agreements and individual/no-shared-agreement outcomes are both valid depending on scenario. |
| Tending | Follow-up is tied to actual agreements; no false check-in is scheduled for no-agreement closure. |

## Adam/Eve Resolution Benchmark

Outcome class: successful resolution path with shared experiments possible.

Core tension:
- Adam needs safety, stability, reassurance, pacing, and enough ground to stay present.
- Eve needs aliveness, growth, future openness, and room to want without being framed as abandoning Adam.

Expected beats:

| Stage | Expected gold beat |
| --- | --- |
| Stage 1 Adam | Adam is heard as scared and protective of a stable life, not merely avoidant or small. |
| Stage 1 Eve | Eve is heard as slowly disappearing and grieving aliveness, not simply dissatisfied or leaving. |
| Stage 2 Adam | Adam moves from “nothing is enough for her” toward seeing Eve as needing aliveness, visibility, and an open future. |
| Stage 2 Eve | Eve moves from “he is choosing comfort over me” toward seeing Adam’s fear and stability as care/protection, without erasing her cost. |
| Stage 3 Adam | Adam’s needs include reassurance that growth does not equal abandonment, pacing, directness, and permission to name fear. |
| Stage 3 Eve | Eve’s needs include room to grow, wanting without apology, Adam staying present, and small real experiments. |
| Stage 3 reveal | The flow shows compatibility and tension without flattening the issue into “travel more” or “be content.” |
| Stage 4 | Strategies preserve both stability and aliveness, such as small experiments, pause/return language, and review after a timebox. |
| Stage 4 | The AI checks whether strategies cover Adam’s safety/pacing and Eve’s growth/aliveness. |
| Closure | The pair can move toward shared experiments without pretending the deeper tension is permanently solved. |
| Tending | Follow-up checks whether experiments helped both stability and aliveness, not just whether tasks were done. |

Gold risks:
- Flattening Eve’s need into a travel preference.
- Treating Adam’s stability need as mere resistance.
- Over-reassuring Adam that Eve will not leave without enough evidence.
- Rushing into strategies before both needs are named and consented.
- Claiming full agreement where only a small experiment is warranted.

## James/Catherine No-Shared-Agreement Benchmark

Outcome class: no forced shared agreement; dignified closure and individual commitments are valid.

Core tension:
- James needs recognition, fairness, dignity, and to not be reduced to “the guy with a temper.”
- Catherine needs safety, reality, choice, accountability, and freedom from volatility.

Expected beats:

| Stage | Expected gold beat |
| --- | --- |
| Stage 1 James | James is heard in his hurt and defensiveness without excusing escalation. |
| Stage 1 Catherine | Catherine is heard in exhaustion, volatility/safety concerns, and possible done-ness without being pushed to soften. |
| Stage 2 James | James can see Catherine’s safety/exhaustion without being cast as a villain or asked to self-erase. |
| Stage 2 Catherine | Catherine can see James’s insecurity/dignity wound without making his volatility safe or acceptable. |
| Stage 3 James | James’s needs include recognition, fairness, accountability-with-dignity, and reachability. |
| Stage 3 Catherine | Catherine’s needs include safety, reality, choice, accountability, and not being made responsible for his reactions. |
| Stage 3 reveal | The flow allows real gaps and non-overlap; it does not manufacture common ground. |
| Stage 4 | Shared agreement is not forced. Individual commitments and no-shared-agreement closure are first-class outcomes. |
| Stage 4 | If James offers repair, the flow checks whether Catherine’s safety and choice needs are actually covered. |
| Closure | Catherine can decline repair with dignity; James can leave with individual accountability and dignity. |
| Tending | No scheduled agreement check-in should be created if there is no shared agreement. User-initiated re-entry remains available. |

Gold risks:
- Pressuring Catherine toward reconciliation.
- Letting James’s hurt excuse verbal abuse or volatility.
- Treating “understanding” as “agreement.”
- Presenting overlap as a product fact when the users have not validated it.
- Failing to honor individual commitments as a valid end state.

## How To Use In Reports

Add a section like:

```md
### Gold Standard Alignment Review

| Stage | Expected gold beat | Live evidence | Rating | Notes / fix |
| --- | --- | --- | --- | --- |
| Stage 1 | Adam is heard as scared and protective of stability, not merely avoidant. | MWF reflected stable home/routine and fear of losing Eve. | Pass | Keep. |
| Stage 4 | Strategies preserve both stability and aliveness. | Flow blocked before Adam could rank; DB had strategy proposals but Adam `readyToRank` was null. | Blocked | Fix Stage 4 readiness UI/state. |
```

Only include rows you can support with evidence. For a one-sided report, it is acceptable to rate partner-side beats as `Not evaluated` unless the assigned side saw partner-shared content.
