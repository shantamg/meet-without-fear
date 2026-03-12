---
phase: 17-session-list-distillation-ui-and-voice-input
plan: 01
subsystem: mobile-ui, backend-api
tags:
  - distillation
  - takeaways
  - react-query
  - optimistic-updates
  - swipe-to-delete
  - inline-editing
dependency_graph:
  requires:
    - 15-01: SessionTakeaway schema and TakeawayDTO
    - 15-02: distillation service and distilledAt field on sessions
  provides:
    - takeaway CRUD backend endpoints (GET/PATCH/DELETE)
    - useDistillation hooks (useTakeaways, useUpdateTakeaway, useDeleteTakeaway)
    - TakeawayRow component (view/edit modes)
    - TakeawayReviewSheet component (slide-up sheet with swipe-to-delete)
    - Takeaways button in InnerThoughtsScreen header
  affects:
    - mobile/src/hooks/queryKeys.ts (added takeawayKeys)
    - mobile/src/hooks/index.ts (exported distillation hooks)
    - backend/src/routes/inner-thoughts.ts (added 3 routes)
    - mobile/src/screens/InnerThoughtsScreen.tsx (header + review sheet)
tech_stack:
  added: []
  patterns:
    - React Query optimistic mutations with setQueryData (never invalidateQueries)
    - Animated.Value slide-up panel (tension 65, friction 11)
    - Swipeable from react-native-gesture-handler for swipe-to-delete
    - View/edit toggle pattern with blur-to-save
key_files:
  created:
    - mobile/src/hooks/useDistillation.ts
    - mobile/src/components/TakeawayRow.tsx
    - mobile/src/components/TakeawayReviewSheet.tsx
    - backend/src/controllers/takeaways.ts
  modified:
    - mobile/src/hooks/queryKeys.ts
    - mobile/src/hooks/index.ts
    - mobile/src/screens/InnerThoughtsScreen.tsx
    - backend/src/routes/inner-thoughts.ts
    - shared/src/dto/distillation.ts
decisions:
  - "[17-01]: Created takeaway CRUD backend endpoints as part of this plan — Phase 15 did not ship GET/PATCH/DELETE takeaway routes, only POST /distill"
  - "[17-01]: TakeawayReviewSheet mounts conditionally when session.distilledAt is set — avoids loading takeaway data for undistilled sessions"
  - "[17-01]: Simplified sheet visibility: parent controls mounting/unmounting via visible prop; Animated.Value handles open animation; no __getValue() needed"
metrics:
  duration_minutes: 16
  completed_date: "2026-03-12"
  tasks_completed: 2
  files_created: 4
  files_modified: 5
---

# Phase 17 Plan 01: Distillation Review UI Summary

**One-liner:** Takeaway review sheet with inline editing (blur-to-save PATCH) and swipe-to-delete using React Query optimistic updates, plus backend CRUD endpoints for GET/PATCH/DELETE takeaways.

## What Was Built

### Backend: Takeaway CRUD Endpoints (Rule 2 — missing critical functionality)

Phase 15 shipped the distillation engine and `POST /inner-thoughts/:id/distill` but did NOT create standalone takeaway management endpoints. These were needed for the mobile UI to function. Created them as a deviation:

- `GET /inner-thoughts/:id/takeaways` — returns `{ takeaways: TakeawayDTO[], distilledAt: string | null }`
- `PATCH /inner-thoughts/:id/takeaways/:takeawayId` — updates content, sets `source = 'USER'` to mark as user-edited
- `DELETE /inner-thoughts/:id/takeaways/:takeawayId` — permanently deletes a single takeaway

All three verify session ownership (`userId` check) and takeaway-to-session membership before executing.

### Shared DTOs

Added `UpdateTakeawayRequest`, `UpdateTakeawayResponse`, `DeleteTakeawayResponse` to `shared/src/dto/distillation.ts`.

### Mobile: Query Keys

Added `takeawayKeys` to `mobile/src/hooks/queryKeys.ts`:
```typescript
export const takeawayKeys = {
  all: ['takeaways'] as const,
  list: (sessionId: string) => [...takeawayKeys.all, sessionId] as const,
};
```

### Mobile: useDistillation Hooks

Three hooks in `mobile/src/hooks/useDistillation.ts`:

- **`useTakeaways(sessionId)`** — fetches takeaway list, staleTime 30s
- **`useUpdateTakeaway(sessionId)`** — optimistic PATCH with setQueryData + rollback
- **`useDeleteTakeaway(sessionId)`** — optimistic filter-out with setQueryData + rollback

All mutations cancel in-flight queries before mutating, snapshot previous data, and rollback via `setQueryData` in `onError`. Never calls `invalidateQueries`.

### Mobile: TakeawayRow Component

`mobile/src/components/TakeawayRow.tsx` — inline edit row with two modes:
- View mode: `TouchableOpacity` wrapping `Text`, tap to switch to edit
- Edit mode: multiline `TextInput` with `autoFocus`, saves on blur if text changed and non-empty
- Theme label shown as small muted uppercase text above content when `takeaway.theme` is set
- Syncs `editText` from `takeaway.content` via `useEffect` (handles cache updates when not in edit mode)

### Mobile: TakeawayReviewSheet Component

`mobile/src/components/TakeawayReviewSheet.tsx` — slide-up review sheet:
- `Animated.Value` spring animation (tension 65, friction 11, consistent with all other project panels)
- Semi-transparent backdrop (`TouchableWithoutFeedback` closes sheet on tap)
- Header with "Takeaways" title and "Done" button
- `FlatList` of `TakeawayRow` wrapped in `Swipeable` with red Delete action
- Loading state (`ActivityIndicator`) and empty state ("No takeaways yet")
- `useSafeAreaInsets` for bottom padding

### Mobile: InnerThoughtsScreen Integration

- Added `Sparkles` icon button to header (from `lucide-react-native`)
- Button only renders when `!isCreating && session?.distilledAt`
- `TakeawayReviewSheet` mounted conditionally when `session?.distilledAt` is set
- `showTakeaways` state controls `visible` prop

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Created backend takeaway CRUD endpoints**
- **Found during:** Task 1 — checking whether Phase 15 shipped standalone takeaway endpoints
- **Issue:** Phase 15 only shipped `POST /inner-thoughts/:id/distill`. No `GET`, `PATCH`, or `DELETE` takeaway endpoints existed. The mobile hook could not function without them.
- **Fix:** Created `backend/src/controllers/takeaways.ts` with `getTakeaways`, `updateTakeaway`, `deleteTakeaway`. Wired into `inner-thoughts.ts` router. Added `UpdateTakeawayRequest`, `UpdateTakeawayResponse`, `DeleteTakeawayResponse` to shared DTOs.
- **Files modified:** `backend/src/controllers/takeaways.ts` (created), `backend/src/routes/inner-thoughts.ts`, `shared/src/dto/distillation.ts`
- **Commit:** 06a0338

**2. [Rule 1 - Bug] Removed `__getValue()` call on Animated.Value**
- **Found during:** Task 2 type check
- **Issue:** `TakeawayReviewSheet` used `sheetAnim.__getValue()` (internal React Native method not in TypeScript types) to avoid rendering when sheet is closed. TypeScript error TS2551.
- **Fix:** Simplified to `if (!visible) return null;` — parent controls mounting/unmounting via the `visible` prop, which is cleaner and avoids the internal API.
- **Files modified:** `mobile/src/components/TakeawayReviewSheet.tsx`

## Verification

- `npm run check` passes (TypeScript, all workspaces)
- `npm run test` passes (978 passing; 12 pre-existing failures unrelated to this plan — mobile React Native Jest environment failures and DB-dependent tests)

## Self-Check: PASSED
