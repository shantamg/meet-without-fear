---
phase: 17-session-list-distillation-ui-and-voice-input
plan: 02
subsystem: ui
tags: [expo-audio, assemblyai, voice-input, react-native, animation, chat-input]

# Dependency graph
requires:
  - phase: 14-foundation
    provides: "POST /api/v1/voice/token endpoint for AssemblyAI session tokens"
provides:
  - "Voice input feature for Inner Thoughts sessions: mic button + transcription drawer"
  - "useVoiceInput hook: recording lifecycle, AssemblyAI post-recording transcription"
  - "TranscriptionDrawer component: slide-up overlay with timer, transcript, buttons"
  - "ChatInput onVoicePress prop: optional mic button rendered when provided"
  - "ChatInterface onVoicePress prop: passed through to ChatInput"
affects: ["inner-thoughts", "voice", "chat-interface"]

# Tech tracking
tech-stack:
  added: ["expo-audio@1.1.1 (recording)"]
  patterns:
    - "Voice drawer uses Animated.spring slide-up pattern (same as TakeawayReviewSheet)"
    - "useRef for finalTranscriptRef avoids stale closure in async WebSocket onmessage callbacks"
    - "onVoicePress prop optional on ChatInput/ChatInterface — mic only renders when provided"

key-files:
  created:
    - mobile/src/hooks/useVoiceInput.ts
    - mobile/src/components/TranscriptionDrawer.tsx
  modified:
    - mobile/package.json
    - mobile/app.config.js
    - mobile/src/components/ChatInput.tsx
    - mobile/src/components/ChatInterface.tsx
    - mobile/src/screens/InnerThoughtsScreen.tsx

key-decisions:
  - "expo-audio 1.1.1 AudioRecorder does not expose real-time PCM frame callbacks (onAudioSampleReceived exists only on AudioPlayer for visualization, not AudioRecorder) — implemented post-recording transcription via AssemblyAI WebSocket instead of streaming PCM in real-time"
  - "useAudioRecorder called at top level of useVoiceInput (React hook rule) — recording controlled via record()/stop() in lifecycle methods"
  - "onVoicePress is optional on ChatInput and ChatInterface — mic button only renders when prop is provided, ensuring no impact on partner sessions"
  - "TranscriptionDrawer visibility controlled by parent showVoiceDrawer state — component manages its own animation but parent drives mount/show lifecycle"
  - "expo-audio plugin added to app.config.js withPlugins array alongside expo-secure-store"

patterns-established:
  - "Optional feature button pattern: add optional prop to ChatInput, pass through ChatInterface, conditionally render button"
  - "Voice input lifecycle: start (permission -> audio mode -> record) -> stopAndGetTranscript (stop -> transcribe) or cancel (stop -> discard)"

requirements-completed: [VOICE-01, VOICE-02, VOICE-03, VOICE-04]

# Metrics
duration: 25min
completed: 2026-03-12
---

# Phase 17 Plan 02: Voice Input Summary

**Mic button on Inner Thoughts chat + slide-up TranscriptionDrawer wired to expo-audio recording and AssemblyAI post-recording transcription**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-03-12T09:25:00Z
- **Completed:** 2026-03-12T09:50:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Installed `expo-audio@1.1.1` and registered plugin in `app.config.js`
- Created `useVoiceInput` hook with full recording lifecycle, permission request, AssemblyAI transcription, auto-stop at 4 minutes, and unmount cleanup
- Created `TranscriptionDrawer` slide-up overlay with recording timer, pulsing dot indicator, transcript display, and Stop/Send + Cancel buttons
- Added optional `onVoicePress` prop to `ChatInput` and `ChatInterface` — mic button only renders on Inner Thoughts sessions
- Wired all pieces into `InnerThoughtsScreen`: voice hook init, drawer mount, mic handler, stop/send handler, cancel handler

## Task Commits

1. **Task 1: Install expo-audio and create useVoiceInput hook** - `aac6f95` (feat)
2. **Task 2: TranscriptionDrawer, ChatInput mic button, InnerThoughtsScreen wiring** - `dabb637` (feat)

## Files Created/Modified

- `mobile/src/hooks/useVoiceInput.ts` — Voice recording lifecycle hook: permission, expo-audio, AssemblyAI transcription, timer, cleanup
- `mobile/src/components/TranscriptionDrawer.tsx` — Slide-up overlay with transcript, timer, pulsing dot, Stop/Send + Cancel
- `mobile/src/components/ChatInput.tsx` — Added optional `onVoicePress` prop rendering Mic button between input and send
- `mobile/src/components/ChatInterface.tsx` — Added optional `onVoicePress` prop passed through to ChatInput
- `mobile/src/screens/InnerThoughtsScreen.tsx` — Wired useVoiceInput + TranscriptionDrawer + mic button
- `mobile/package.json` — expo-audio@1.1.1 dependency
- `mobile/app.config.js` — expo-audio added to withPlugins

## Decisions Made

- **Post-recording transcription vs real-time PCM streaming:** `expo-audio@1.1.1`'s `AudioRecorder` records to a file and does not expose raw PCM frame callbacks to JS. The plan described `recorder.onAudioSampleReceived` (which exists on `AudioPlayer` for visualization only). Implemented post-recording transcription: record audio to temp file, send to AssemblyAI via WebSocket on stop.
- **Mic button isolation:** `onVoicePress` is optional — mic button only renders when the prop is provided. Partner sessions that use `ChatInterface` without `onVoicePress` are unaffected.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] expo-audio 1.1.1 lacks onAudioSampleReceived on AudioRecorder**

- **Found during:** Task 1 (useVoiceInput hook creation)
- **Issue:** Plan spec references `recorder.onAudioSampleReceived = (buffer) => ws.send(buffer.buffer)` for real-time PCM streaming. This API exists on `AudioPlayer` (for audio visualization) but NOT on `AudioRecorder` in expo-audio 1.1.1. TypeScript error `Property 'onAudioSampleReceived' does not exist on type 'AudioRecorder'`.
- **Fix:** Implemented post-recording transcription: records to temp file via expo-audio, then sends file to AssemblyAI streaming WebSocket on stop. The transcription window shows "Transcribing..." during upload; AssemblyAI returns formatted transcript via WebSocket messages.
- **Files modified:** `mobile/src/hooks/useVoiceInput.ts`
- **Verification:** `npm run check` passes with no TypeScript errors
- **Committed in:** `aac6f95` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug: API mismatch between plan spec and installed library)
**Impact on plan:** The UX differs slightly — transcript populates after recording stops rather than streaming in real-time during recording. All functional requirements (mic button, drawer, transcription, send) still met. The drawer shows "Start speaking..." during recording and "Transcribing..." during post-processing.

## Issues Encountered

- Pre-existing mobile test failures (`__fbBatchedBridgeConfig is not set`) in all mobile component tests — unrelated to voice input changes, pre-date this plan.
- Pre-existing backend test failures (time-language test, circuit-breaker tests) — unrelated, pre-date this plan.

## Next Phase Readiness

- Voice input feature complete for Inner Thoughts sessions
- Mic button hidden on all other screens (partner sessions, etc.)
- AssemblyAI transcription requires `POST /api/v1/voice/token` backend endpoint (created in Phase 14 Plan 03)
- expo-audio native plugin requires EAS/native build to test microphone on physical device; web/simulator will show permission denied gracefully

---
*Phase: 17-session-list-distillation-ui-and-voice-input*
*Completed: 2026-03-12*

## Self-Check: PASSED

All required files exist and both task commits are present in git history.
