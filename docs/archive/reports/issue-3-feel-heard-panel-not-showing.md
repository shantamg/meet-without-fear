# Issue 3: Feel-Heard Confirmation Panel Not Showing

## Summary
The AI has marked `feelHeardCheckOffered: true` in the stage gates (visible in database), but the user reports the feel-heard confirmation panel is not appearing in the UI. The AI continues to ask questions instead of offering the user a chance to confirm they feel heard.

## Symptom
User expected to see an "I feel heard" button/panel but it's not appearing, even though the backend has recorded that the AI recommended offering it.

## Evidence

### Database State
```
=== Stage Progress ===
Shantam Stage 0: COMPLETED { compactSigned: true, invitationSent: true }
Shantam Stage 1: IN_PROGRESS { feelHeardCheckOffered: true }
                              ^^^^^^^^^^^^^^^^^^^^^^^^
                              This flag IS set in the database
```

### AI Response Metadata
The AI is outputting `FeelHeardCheck: Y` in its thinking block, which should trigger the panel:
```
<thinking>
Mode: WITNESS
Intensity: 6
FeelHeardCheck: Y   <-- AI recommends showing panel
Strategy: Continue exploring emotional landscape
</thinking>
```

### Stage Prompt (stage-prompts.ts:34-35)
```typescript
if (stage === 1) {
  flagInstructions = 'FeelHeardCheck: [Y if ready to offer feel-heard check, N otherwise]';
}
```

### Metadata Parser (micro-tag-parser.ts:48)
```typescript
const offerFeelHeardCheck = /FeelHeardCheck:\s*Y/i.test(thinking);
```

### Backend Saves Gate (messages.ts:1542-1553)
```typescript
if (currentStage === 1 && metadata.offerFeelHeardCheck && progress?.id) {
  const currentGates = (progress.gatesSatisfied as Record<string, unknown>) ?? {};
  await prisma.stageProgress.update({
    where: { id: progress.id },
    data: {
      gatesSatisfied: {
        ...currentGates,
        feelHeardCheckOffered: true,  // <-- This is being saved
      },
    },
  });
}
```

## Frontend Flow

### 1. State Management (useUnifiedSession.ts:224-225)
```typescript
// Track AI recommendation for feel-heard check
const [aiRecommendsFeelHeardCheck, setAiRecommendsFeelHeardCheck] = useState(false);
```

### 2. Restoration from Database (useUnifiedSession.ts:647-655)
When the page loads, this useEffect should restore the state from database:
```typescript
useEffect(() => {
  if (currentStage === Stage.WITNESS && progressData?.myProgress?.gatesSatisfied) {
    const gates = progressData.myProgress.gatesSatisfied as Record<string, unknown>;
    // Check if feelHeardCheckOffered is set (Stage 1 specific gate)
    if (gates.feelHeardCheckOffered === true && !gates.feelHeardConfirmed) {
      setAiRecommendsFeelHeardCheck(true);
    }
  }
}, [currentStage, progressData?.myProgress?.gatesSatisfied]);
```

### 3. Panel Visibility Derivation (useUnifiedSession.ts:473-475)
```typescript
// Show feel-heard UI when AI sets offerFeelHeardCheck: true in JSON response
// Once true, stays true until user confirms or dismisses (sticky state)
const showFeelHeardConfirmation = aiRecommendsFeelHeardCheck;
```

### 4. UI State Computation (chatUIState.ts:237-253)
```typescript
function computeShowFeelHeardPanel(inputs: ChatUIStateInputs): boolean {
  const {
    myStage,
    showFeelHeardConfirmation,  // Must be true
    feelHeardConfirmedAt,        // Must be null/undefined
    isConfirmingFeelHeard,       // Must be false
  } = inputs;

  const currentStage = myStage ?? Stage.ONBOARDING;

  return !!(
    currentStage === Stage.WITNESS &&    // Stage 1
    showFeelHeardConfirmation &&         // AI recommended it
    !feelHeardConfirmedAt &&             // Not already confirmed
    !isConfirmingFeelHeard               // Not in process of confirming
  );
}
```

### 5. Panel Priority (chatUIState.ts:312-315)
```typescript
// Priority 3: Feel heard panel (Stage 1)
if (panels.showFeelHeardPanel) {
  return 'feel-heard';
}
```

### 6. Dismissal Handler (useUnifiedSession.ts:913-915)
```typescript
// Dismiss feel-heard card without confirming (user clicks "Not yet")
const handleDismissFeelHeard = useCallback(() => {
  setAiRecommendsFeelHeardCheck(false);
}, []);
```

## Root Cause Hypotheses

### Hypothesis A: User Dismissed the Panel
If the user clicked "Not yet" at any point, `setAiRecommendsFeelHeardCheck(false)` would be called. The restoration useEffect would only run on mount or when `gatesSatisfied` changes.

**Evidence against:** The useEffect depends on `progressData?.myProgress?.gatesSatisfied`. If user dismissed it and then reloaded the page, the useEffect should restore it.

### Hypothesis B: Progress Data Not Loading Correctly
The `progressData?.myProgress?.gatesSatisfied` might not contain `feelHeardCheckOffered`.

**To verify:** Add logging to see what the API returns:
```typescript
useEffect(() => {
  console.log('[DEBUG] progressData:', progressData);
  console.log('[DEBUG] gatesSatisfied:', progressData?.myProgress?.gatesSatisfied);
  // ... rest of effect
}, [currentStage, progressData?.myProgress?.gatesSatisfied]);
```

### Hypothesis C: Timing/Race Condition
The useEffect might run before `progressData` is loaded, and then not re-run when data arrives.

**To verify:** Check if the dependency array is correct. Currently it's:
```typescript
}, [currentStage, progressData?.myProgress?.gatesSatisfied]);
```

If `progressData` is undefined initially, then becomes defined, does the optional chaining trigger a re-run?

### Hypothesis D: Stage Mismatch
The `currentStage` might not equal `Stage.WITNESS` (value 1) when the check runs.

**To verify:** Log `currentStage` value.

## API Response Shape

### GET /sessions/:id/progress Response (sessions.ts:336-343)
```typescript
const myProgress = myProgressRecord
  ? {
      stage: myProgressRecord.stage,
      status: myProgressRecord.status,
      startedAt: myProgressRecord.startedAt?.toISOString() ?? null,
      completedAt: myProgressRecord.completedAt?.toISOString() ?? null,
      gatesSatisfied: myProgressRecord.gatesSatisfied,  // <-- Should include feelHeardCheckOffered
    }
  : defaultProgress;
```

### Expected API Response
```json
{
  "myProgress": {
    "stage": 1,
    "status": "IN_PROGRESS",
    "startedAt": "2026-01-21T23:42:44.000Z",
    "completedAt": null,
    "gatesSatisfied": {
      "feelHeardCheckOffered": true
    }
  },
  "partnerProgress": { ... },
  "sessionStatus": "INVITED",
  "milestones": { ... }
}
```

## Debugging Steps

1. **Add console logging** to the restoration useEffect:
```typescript
useEffect(() => {
  console.log('[FeelHeard] currentStage:', currentStage, 'Stage.WITNESS:', Stage.WITNESS);
  console.log('[FeelHeard] gatesSatisfied:', progressData?.myProgress?.gatesSatisfied);

  if (currentStage === Stage.WITNESS && progressData?.myProgress?.gatesSatisfied) {
    const gates = progressData.myProgress.gatesSatisfied as Record<string, unknown>;
    console.log('[FeelHeard] gates.feelHeardCheckOffered:', gates.feelHeardCheckOffered);
    console.log('[FeelHeard] gates.feelHeardConfirmed:', gates.feelHeardConfirmed);

    if (gates.feelHeardCheckOffered === true && !gates.feelHeardConfirmed) {
      console.log('[FeelHeard] Setting aiRecommendsFeelHeardCheck to true');
      setAiRecommendsFeelHeardCheck(true);
    }
  }
}, [currentStage, progressData?.myProgress?.gatesSatisfied]);
```

2. **Verify API response** in network tab - check `/sessions/{id}/progress` response

3. **Check React Query cache** - verify the data is being cached correctly

## Questions for Expert

1. Is the optional chaining in the dependency array (`progressData?.myProgress?.gatesSatisfied`) a reliable trigger for re-running the effect?

2. Should we use a different approach to restore UI state from server state (e.g., derive it directly from query data rather than using local state)?

3. Could React Query's stale-while-revalidate pattern cause the panel to flash/disappear?

4. Should the feel-heard state be derived purely from cache rather than maintained in local state?
