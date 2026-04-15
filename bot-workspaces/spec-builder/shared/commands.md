# Slash Commands

Available commands that users can post in issue comments during the interview.

## Command Vocabulary

| Command | Action | Available in |
|---|---|---|
| `/pause` | Remove `bot:spec-builder` label, post paused comment preserving full state. Resume by re-adding label. | All stages |
| `/skip-to-technical` | Advance to Technical stage. Validate with warning if rubric items unmet. | Scope, Deepen |
| `/publish-now` | Advance to Publish stage. Validate with warning if rubric items unmet. | Scope, Deepen, Technical |
| `/restart-stage` | Reset current stage rubric to all `missing`, re-ask from the beginning. | Scope, Deepen, Technical |
| `/confirm-skip` | Confirm a pending skip after a warning about unmet rubric items. | After skip warning |

## Parsing Rules

1. Check the latest human comment for commands BEFORE generating the next question.
2. Commands must be the first token on a line (ignore inline mentions).
3. Only process the first command found per comment.

## Skip Validation

When `/skip-to-technical` or `/publish-now` is used with unmet rubric items:
1. Post a warning listing unmet items: "You're skipping [Stage], but I haven't covered: [items]. Proceed? Reply `/confirm-skip` or let me continue."
2. Wait for `/confirm-skip` in the next human comment before advancing.
3. If the user replies with anything other than `/confirm-skip`, resume normal questioning.

## Command Footer

Include this footer on every question comment (subtle, not prominent):

```
_You can also: /pause · /skip-to-technical · /publish-now_
```

Adjust available commands based on current stage (e.g., don't show `/skip-to-technical` when already in Technical).
