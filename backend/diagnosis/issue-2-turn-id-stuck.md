# Issue 2: Turn IDs Not Incrementing (Stuck at Turn 10)

## Summary
Brain activity records show that after turn 9, all subsequent message turns are being recorded with the same turn ID (`-10`). This causes the status site to show incomplete brain activity because multiple turns share the same ID.

## Symptom
The user reported that recent messages are not showing in the brain activity on the status site.

## Evidence

### Brain Activity Records (Ordered by Time)
```
Turn: cmkoo095z001mpx5wbg17byqn-cmkolirdw0000pxc91phtrmei-3  @ 15:41:08
Turn: cmkoo095z001mpx5wbg17byqn-cmkolirdw0000pxc91phtrmei-4  @ 15:41:33
Turn: cmkoo095z001mpx5wbg17byqn-cmkolirdw0000pxc91phtrmei-5  @ 15:42:18
Turn: cmkoo095z001mpx5wbg17byqn-cmkolirdw0000pxc91phtrmei-6  @ 15:43:25
Turn: cmkoo095z001mpx5wbg17byqn-cmkolirdw0000pxc91phtrmei-7  @ 15:44:23
Turn: cmkoo095z001mpx5wbg17byqn-cmkolirdw0000pxc91phtrmei-8  @ 15:44:50
Turn: cmkoo095z001mpx5wbg17byqn-cmkolirdw0000pxc91phtrmei-9  @ 15:45:18
Turn: cmkoo095z001mpx5wbg17byqn-cmkolirdw0000pxc91phtrmei-10 @ 15:46:07  // First turn 10
Turn: cmkoo095z001mpx5wbg17byqn-cmkolirdw0000pxc91phtrmei-10 @ 15:46:47  // DUPLICATE
Turn: cmkoo095z001mpx5wbg17byqn-cmkolirdw0000pxc91phtrmei-10 @ 15:47:40  // DUPLICATE
Turn: cmkoo095z001mpx5wbg17byqn-cmkolirdw0000pxc91phtrmei-10 @ 15:48:10  // DUPLICATE
```

### Message Timeline (for correlation)
```
[15:45:18] AI response (Turn 9)
[15:45:12] User: "I guess not..."
[15:46:00] User: "I'm afraid she might not be interested anymore..."
[15:46:07] AI response (should be Turn 10)
[15:46:38] User: "I guess it could be awkward..."
[15:46:47] AI response (should be Turn 11, recorded as Turn 10)
[15:47:33] User: "I valued our ability to talk..."
[15:47:40] AI response (should be Turn 12, recorded as Turn 10)
[15:48:01] User: "I just told you that"
[15:48:10] AI response (should be Turn 13, recorded as Turn 10)
```

There are 4 distinct AI responses after turn 9, but all are recorded with turn ID ending in `-10`.

### Brain Activity Summary
```
=== Brain Activity (last 15) ===
[PARTNER_SESSION_CLASSIFICATION] COMPLETED - Turn: ...-10 @ 15:46:07
[null] COMPLETED - Turn: ...-10 @ 15:46:07
[null] COMPLETED - Turn: ...-10 @ 15:46:11
[ORCHESTRATED_RESPONSE] COMPLETED - Turn: ...-10 @ 15:46:38
[PARTNER_SESSION_CLASSIFICATION] COMPLETED - Turn: ...-10 @ 15:46:47
[null] COMPLETED - Turn: ...-10 @ 15:46:47
[null] COMPLETED - Turn: ...-10 @ 15:46:52
[ORCHESTRATED_RESPONSE] COMPLETED - Turn: ...-10 @ 15:47:33
[PARTNER_SESSION_CLASSIFICATION] COMPLETED - Turn: ...-10 @ 15:47:40
[null] COMPLETED - Turn: ...-10 @ 15:47:40
[null] COMPLETED - Turn: ...-10 @ 15:47:45
[ORCHESTRATED_RESPONSE] COMPLETED - Turn: ...-10 @ 15:48:01
[PARTNER_SESSION_CLASSIFICATION] COMPLETED - Turn: ...-10 @ 15:48:10
[null] COMPLETED - Turn: ...-10 @ 15:48:10
[null] COMPLETED - Turn: ...-10 @ 15:48:15
```

Note: There are also `[null]` call types which seems like another issue - these should have a `callType` value.

## Relevant Code

### Turn ID Generation (messages.ts)
The turn ID is typically generated in the message controller. Need to find where this is created.

```typescript
// Pattern observed: {sessionId}-{userId}-{turnNumber}
// Example: cmkoo095z001mpx5wbg17byqn-cmkolirdw0000pxc91phtrmei-10
```

### How Turn ID Should Be Calculated
Need to investigate how `turnId` is determined. Likely should be:
1. Count of previous turns for this user in this session
2. Incremented for each new message

## Root Cause Hypotheses

### Hypothesis A: Turn Counter Not Incrementing
The turn counter might be cached or not being refreshed between rapid messages.

### Hypothesis B: Race Condition
Multiple messages sent in quick succession might be reading the same turn count before any writes complete.

### Hypothesis C: Stage Transition Issue
Turn 9 was the last turn before `feelHeardCheckOffered: true` was set. Perhaps something about the stage transition is affecting turn ID generation.

## Secondary Issue: Null Call Types

Some brain activity records have `callType: null`:
```
[null] COMPLETED - Turn: ...-10 @ 15:46:07
[null] COMPLETED - Turn: ...-10 @ 15:46:11
```

This suggests some LLM calls are not being properly tagged with their call type.

## Areas to Investigate

1. **Turn ID generation logic** in `controllers/messages.ts` - how is turnId computed?
2. **Message counting** - is there a query that counts existing messages to determine turn number?
3. **Caching** - is there any caching of turn counts that might cause stale reads?
4. **Concurrency** - what happens when multiple messages are processed simultaneously?

## Questions for Expert

1. Where is the turn ID generated and how is the turn number calculated?
2. Is there any caching mechanism that could cause stale turn counts?
3. Could this be related to the "fire-and-forget" pattern used for background classifiers?
4. Why are some brain activity records missing their `callType`?
