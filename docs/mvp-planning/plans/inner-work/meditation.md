# Meditation ("Develop Loving Awareness") Implementation Plan

## Overview

A meditation practice feature with AI-generated guided meditations and an unguided timer. This is the most technically complex Inner Work pathway due to text-to-speech, audio handling, background playback, and offline support.

## Two Practice Types

### 1. Guided Meditation
- AI generates personalized scripts based on user context
- Text-to-speech delivers audio guidance
- User can specify focus OR accept AI suggestion
- Duration: 5, 10, 15, 20, 30, 45, 60 minutes

### 2. Unguided Timer
- Simple meditation timer with bells
- Opening bell, optional interval bells, closing bell
- Minimal visual (breathing animation or countdown)
- Same duration options

---

## Database Schema

### New Tables

```prisma
model MeditationSession {
  id              String    @id @default(cuid())
  userId          String
  type            MeditationType
  durationMinutes Int
  focusArea       String?   // e.g., "grounding", "self-compassion"
  completed       Boolean   @default(false)
  startedAt       DateTime  @default(now())
  completedAt     DateTime?

  // Guided-specific
  scriptGenerated String?   @db.Text // Full script text
  voiceId         String?   // TTS voice identifier
  backgroundSound String?   // "rain", "bowls", "silence"

  // Favorites
  savedAsFavorite Boolean   @default(false)
  favoriteType    FavoriteType? // "exact" or "theme"

  // Post-session
  postNotes       String?
  linkedNeedIds   Int[]     @default([])
  linkedConflictId String?  // If done in preparation for conflict

  user            User      @relation(fields: [userId], references: [id])

  @@index([userId, startedAt])
}

enum MeditationType {
  GUIDED
  UNGUIDED
}

enum FavoriteType {
  EXACT   // Replay exact script
  THEME   // Generate fresh variation
}

// Aggregated stats (computed periodically)
model MeditationStats {
  id              String   @id @default(cuid())
  userId          String   @unique
  totalSessions   Int      @default(0)
  guidedCount     Int      @default(0)
  unguidedCount   Int      @default(0)
  totalMinutes    Int      @default(0)
  currentStreak   Int      @default(0)
  longestStreak   Int      @default(0)
  streakStartDate DateTime?
  lastSessionDate DateTime?

  // Favorite focus areas (JSON: { "grounding": 5, "compassion": 3 })
  favoriteFocusAreas Json   @default("{}")

  user            User     @relation(fields: [userId], references: [id])
}

// Saved meditation favorites
model MeditationFavorite {
  id            String       @id @default(cuid())
  userId        String
  name          String       // User-given or auto-generated name
  focusArea     String
  durationMinutes Int
  favoriteType  FavoriteType
  script        String?      @db.Text // Only for EXACT type
  savedAt       DateTime     @default(now())

  user          User         @relation(fields: [userId], references: [id])

  @@index([userId])
}

// User preferences
model MeditationPreferences {
  id              String   @id @default(cuid())
  userId          String   @unique
  preferredVoice  String   @default("default")
  voiceSpeed      Float    @default(1.0) // 0.8 - 1.2
  defaultDuration Int      @default(10)
  backgroundSound String   @default("silence")
  reminderEnabled Boolean  @default(false)
  reminderTime    String?  // HH:MM

  user            User     @relation(fields: [userId], references: [id])
}
```

---

## API Endpoints

### Sessions

```
POST /api/v1/meditation/sessions
Body: {
  type: 'GUIDED' | 'UNGUIDED',
  durationMinutes: number,
  focusArea?: string,        // For guided
  voiceId?: string,
  backgroundSound?: string
}
Response: {
  session: MeditationSessionDTO,
  script?: string,           // For guided - the generated script
  audioUrl?: string          // Optional pre-generated audio URL
}
```

```
PATCH /api/v1/meditation/sessions/:id
Body: {
  completed?: boolean,
  postNotes?: string,
  savedAsFavorite?: boolean,
  favoriteType?: 'exact' | 'theme'
}
Response: { session: MeditationSessionDTO }
```

```
GET /api/v1/meditation/sessions
Query: { limit?, offset?, type? }
Response: { sessions: MeditationSessionDTO[], total: number }
```

### AI Suggestion

```
POST /api/v1/meditation/suggest
Response: {
  suggestedFocus: string,
  reasoning: string,
  suggestedDuration: number
}
```
Returns AI-suggested meditation based on user's needs/conflicts/patterns.

### Script Generation

```
POST /api/v1/meditation/generate-script
Body: {
  focusArea: string,
  durationMinutes: number,
  context?: {
    preparingForConflict?: boolean,
    recentEmotions?: string[],
    lowNeeds?: string[]
  }
}
Response: {
  script: string,
  estimatedMinutes: number
}
```

### Stats

```
GET /api/v1/meditation/stats
Response: { stats: MeditationStatsDTO }
```

### Favorites

```
GET /api/v1/meditation/favorites
Response: { favorites: MeditationFavoriteDTO[] }
```

```
POST /api/v1/meditation/favorites
Body: { sessionId: string, name?: string }
Response: { favorite: MeditationFavoriteDTO }
```

```
DELETE /api/v1/meditation/favorites/:id
Response: { success: boolean }
```

### Preferences

```
GET /api/v1/meditation/preferences
Response: { preferences: MeditationPreferencesDTO }
```

```
PATCH /api/v1/meditation/preferences
Body: Partial<MeditationPreferencesDTO>
Response: { preferences: MeditationPreferencesDTO }
```

---

## Script Generation

### Script Structure

Per spec, meditations follow this structure:

| Section | % of Time | Content |
|---------|-----------|---------|
| Opening | 10% | Bell, welcome, posture, initial breath |
| Core Practice | 75% | Main technique with pauses |
| Integration | 10% | Widening awareness, bringing forward |
| Closing | 5% | Gentle return, bell |

### Pacing Guidelines

- **100-120 words per minute** speaking pace
- **Minimum 20-30 seconds silence** between sections
- **45-60 second pauses** during core practice
- Mark pauses explicitly: `[PAUSE 30s]`, `[PAUSE 60s]`

### Script Generation Prompt

```typescript
function buildMeditationScriptPrompt(params: {
  focusArea: string;
  durationMinutes: number;
  userContext: {
    lowNeeds?: string[];
    recentConflicts?: string[];
    recentGratitudeThemes?: string[];
    experienceLevel?: 'beginner' | 'intermediate' | 'advanced';
  };
  language?: string;
}): string {
  const totalWords = params.durationMinutes * 100; // ~100 wpm average with pauses

  return `
Generate a ${params.durationMinutes}-minute guided meditation script.

FOCUS: ${params.focusArea}

USER CONTEXT:
${params.userContext.lowNeeds?.length ?
  `- Low-scoring needs: ${params.userContext.lowNeeds.join(', ')}` : ''}
${params.userContext.recentConflicts?.length ?
  `- Recent conflicts with: ${params.userContext.recentConflicts.join(', ')}` : ''}
${params.userContext.recentGratitudeThemes?.length ?
  `- Recent gratitude themes: ${params.userContext.recentGratitudeThemes.join(', ')}` : ''}
- Experience level: ${params.userContext.experienceLevel || 'beginner'}
- Language: ${params.language || 'English'}

STRUCTURE (total ~${totalWords} words including pause markers):

OPENING (${Math.round(params.durationMinutes * 0.1)} min):
- Begin with [BELL]
- Welcome and settling
- Posture guidance
- Initial breath awareness

CORE PRACTICE (${Math.round(params.durationMinutes * 0.75)} min):
- Main technique/focus
- Include [PAUSE 30s] and [PAUSE 60s] markers generously
- Guided awareness with spacious silence
- Gentle redirecting for wandering mind
- More silence than words

INTEGRATION (${Math.round(params.durationMinutes * 0.1)} min):
- Widening awareness
- Bringing practice into daily life
${params.userContext.recentConflicts?.length ?
  '- Connection to upcoming difficult conversations if relevant' : ''}

CLOSING (${Math.round(params.durationMinutes * 0.05)} min):
- Gentle return
- [BELL]
- Brief acknowledgment

TONE GUIDANCE:
${params.focusArea.includes('rest') || params.focusArea.includes('grounding') ?
  '- Softer, slower voice' :
  params.focusArea.includes('courage') || params.focusArea.includes('clarity') ?
  '- Steadier, firmer voice' :
  params.focusArea.includes('compassion') ?
  '- Warmer, gentler voice' :
  '- Calm, neutral voice'}

REQUIREMENTS:
- Use specific sensory language (embodied, not intellectual)
- Include appropriate pauses - silence is essential
- Don't over-explain or be too wordy
- Natural pacing with room to breathe
- End with something grounding they can take forward

OUTPUT: Just the script text with [BELL] and [PAUSE Xs] markers.
No metadata or commentary.
`;
}
```

### Sample Generated Script (15 min, Grounding)

```
[BELL]

Welcome. Find a comfortable position - sitting or lying down, whatever
feels sustainable for the next fifteen minutes. Let your body settle.
There's nowhere you need to be, nothing you need to do right now except
be here.

[PAUSE 10s]

Begin by noticing your breath. Not changing it, just noticing.
The inhale... and the exhale. The natural rhythm of breathing.

[PAUSE 20s]

Bring your attention to where your body meets the ground - your sit
bones on the chair, your feet on the floor, your back against the
surface behind you. Feel the support underneath you. The earth is
holding you.

[PAUSE 30s]

...

[Script continues per spec example]

...

[BELL]
```

---

## Text-to-Speech Implementation

### Options Evaluated

| Option | Pros | Cons |
|--------|------|------|
| **Expo Speech** (`expo-speech`) | Built-in, simple | Limited voice quality, no background play |
| **React Native TTS** | More control | Still device voices |
| **ElevenLabs API** | Premium quality | Cost per character, requires API call |
| **Amazon Polly** | Good quality, reasonable cost | AWS integration needed |
| **Google Cloud TTS** | Good quality | GCP integration needed |
| **Web Speech API** (spec suggestion) | Free, many voices | Web only, not native |

### Recommended Approach: Hybrid

1. **MVP**: Use `expo-speech` for device TTS
   - Free, works offline once script generated
   - Quality varies by device but acceptable
   - Background playback requires `expo-av` workaround

2. **Future Enhancement**: Add cloud TTS option
   - ElevenLabs or Amazon Polly for premium voices
   - Pre-generate and cache audio
   - Offer as premium feature

### Expo Speech Implementation

```typescript
import * as Speech from 'expo-speech';

async function speakMeditation(script: string, options: {
  voice?: string;
  rate?: number;
  onDone?: () => void;
}) {
  // Parse script for pauses
  const segments = parseScriptSegments(script);

  for (const segment of segments) {
    if (segment.type === 'pause') {
      await delay(segment.durationMs);
    } else if (segment.type === 'bell') {
      await playBellSound();
    } else {
      await new Promise<void>((resolve) => {
        Speech.speak(segment.text, {
          voice: options.voice,
          rate: options.rate || 0.9,
          onDone: resolve,
        });
      });
    }
  }

  options.onDone?.();
}

function parseScriptSegments(script: string): Segment[] {
  const segments: Segment[] = [];
  const parts = script.split(/(\[BELL\]|\[PAUSE \d+s\])/);

  for (const part of parts) {
    if (part === '[BELL]') {
      segments.push({ type: 'bell' });
    } else if (part.match(/\[PAUSE (\d+)s\]/)) {
      const seconds = parseInt(part.match(/\d+/)![0]);
      segments.push({ type: 'pause', durationMs: seconds * 1000 });
    } else if (part.trim()) {
      segments.push({ type: 'speech', text: part.trim() });
    }
  }

  return segments;
}
```

### Background Audio

For audio to continue when screen locks:

```typescript
import { Audio } from 'expo-av';

// Enable background audio
await Audio.setAudioModeAsync({
  allowsRecordingIOS: false,
  staysActiveInBackground: true,
  playsInSilentModeIOS: true,
  shouldDuckAndroid: true,
  playThroughEarpieceAndroid: false,
});
```

### Bell Sound

- Ship a single high-quality bell sound (Tibetan singing bowl)
- ~3-5 seconds with natural decay
- Store as asset, play via `expo-av`

```typescript
import { Audio } from 'expo-av';

const bellSound = require('../assets/sounds/bell.mp3');

async function playBellSound(): Promise<void> {
  const { sound } = await Audio.Sound.createAsync(bellSound);
  await sound.playAsync();
  // Wait for duration + decay
  await delay(5000);
  await sound.unloadAsync();
}
```

---

## User Flows

### Flow 1: Guided Meditation

```
GuidedMeditationScreen
├── SetupView
│   ├── FocusInput (text) OR "Ask AI to suggest" button
│   ├── DurationSelector [5][10][15][20][30][45][60]
│   ├── VoiceSelector (preview available)
│   ├── BackgroundSelector [Silence][Rain][Bowls]
│   └── [Begin] button
├── PlayingView
│   ├── ProgressIndicator
│   ├── FocusAreaLabel
│   ├── PauseButton
│   └── EndEarlyButton
└── CompletionView
    ├── DurationCompleted
    ├── PostNotesInput (optional)
    ├── SaveAsFavorite option
    │   ├── "Save exact script"
    │   └── "Save theme (AI varies it)"
    └── [Done] button
```

**AI Suggestion Flow:**
```
User: [taps "Ask AI to suggest"]

AI: "I notice rest and regulation both feel somewhat unmet right now,
    and you've had some intense conversations with [partner] lately.

    I'd suggest a 15-minute practice focused on grounding and
    creating inner steadiness. Does that feel supportive?"

User: [Confirms or adjusts]
```

### Flow 2: Unguided Timer

```
UnguidedTimerScreen
├── SetupView
│   ├── DurationSelector
│   ├── IntervalBells [None][Every 5 min][Every 10 min]
│   ├── VisualSelector [Breathing circle][Timer][Minimal]
│   └── [Begin] button
├── TimerView
│   ├── Visual (selected type)
│   ├── TimeRemaining (if timer visual)
│   └── EndEarlyButton
└── CompletionView
    ├── DurationCompleted
    ├── PostNotesInput (optional)
    └── [Done] button
```

### Flow 3: Favorites Library

```
FavoritesScreen
├── FavoriteCard
│   ├── Name
│   ├── Duration + Type (exact/theme)
│   ├── SavedDate
│   ├── [Generate & Play] (for theme) OR [Play] (for exact)
│   └── [Delete]
└── EmptyState if no favorites
```

### Flow 4: Stats Dashboard

```
MeditationStatsScreen
├── StreakDisplay
│   ├── CurrentStreak (with fire emoji if active)
│   └── LongestStreak
├── WeekSummary
│   ├── SessionCount
│   └── TotalMinutes
├── AllTimeSummary
│   ├── TotalSessions
│   ├── TotalHours
│   └── GuidedVsUnguided breakdown
├── FavoriteFocusAreas (ranked list)
└── [Start Practice] button
```

---

## Streak Logic

### Rules
- Streak increments if user completes meditation today
- Streak breaks if a day is missed
- "Day" = user's local timezone midnight-to-midnight

### Handling Timezone Changes
- Store dates in UTC
- Calculate streak based on user's current timezone
- If timezone changes mid-streak, be generous (don't break unfairly)

### Broken Streak Messaging
```
"Your 23-day streak ended, but those days of practice are still real.
Would meditating feel supportive today?"
```
Not guilt-inducing, compassionate.

### Milestones
Celebrate at: 7, 30, 60, 100, 365 days

---

## Offline Support

### What Works Offline

| Feature | Offline? | Notes |
|---------|----------|-------|
| Unguided timer | Yes | Timer + bells fully local |
| Guided (cached) | Yes | If script was cached |
| Guided (new) | No | Requires AI generation |
| Stats viewing | Partial | Cached stats, no fresh calculation |
| Favorites (exact) | Yes | Script stored locally |
| Favorites (theme) | No | Requires new generation |

### Caching Strategy

```typescript
// Cache recently generated scripts
const CACHE_KEY = 'meditation_scripts_cache';
const MAX_CACHED_SCRIPTS = 10;

async function cacheScript(sessionId: string, script: string) {
  const cache = await AsyncStorage.getItem(CACHE_KEY);
  const scripts = cache ? JSON.parse(cache) : {};
  scripts[sessionId] = { script, cachedAt: Date.now() };

  // Prune old entries
  const entries = Object.entries(scripts);
  if (entries.length > MAX_CACHED_SCRIPTS) {
    entries.sort((a, b) => b[1].cachedAt - a[1].cachedAt);
    const pruned = Object.fromEntries(entries.slice(0, MAX_CACHED_SCRIPTS));
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(pruned));
  } else {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(scripts));
  }
}
```

### Offline Download for Favorites
- Allow explicit "Download for offline" on favorites
- Store full script + bell sound locally

---

## Mobile Implementation

### New Files

```
mobile/src/
├── screens/
│   ├── MeditationHomeScreen.tsx      # Stats + quick actions
│   ├── GuidedMeditationScreen.tsx    # Setup + playback
│   ├── UnguidedTimerScreen.tsx       # Timer flow
│   └── MeditationFavoritesScreen.tsx # Favorites library
├── components/
│   └── meditation/
│       ├── DurationSelector.tsx
│       ├── VoiceSelector.tsx
│       ├── BreathingCircle.tsx       # Visual for timer
│       ├── MeditationTimer.tsx
│       ├── StreakDisplay.tsx
│       └── FavoriteCard.tsx
├── services/
│   └── meditation-player.ts          # TTS + audio orchestration
├── hooks/
│   └── useMeditation.ts              # React Query hooks
└── assets/
    └── sounds/
        └── bell.mp3                  # Singing bowl sound
```

### Key Service: MeditationPlayer

```typescript
// meditation-player.ts
export class MeditationPlayer {
  private isPlaying = false;
  private isPaused = false;
  private currentSegmentIndex = 0;
  private segments: Segment[] = [];
  private onProgress?: (progress: number) => void;
  private onComplete?: () => void;

  async loadScript(script: string) {
    this.segments = parseScriptSegments(script);
    this.currentSegmentIndex = 0;
  }

  async play() {
    this.isPlaying = true;
    this.isPaused = false;

    for (let i = this.currentSegmentIndex; i < this.segments.length; i++) {
      if (!this.isPlaying) break;
      while (this.isPaused) await delay(100);

      this.currentSegmentIndex = i;
      const segment = this.segments[i];

      if (segment.type === 'bell') {
        await playBellSound();
      } else if (segment.type === 'pause') {
        await delay(segment.durationMs);
      } else {
        await speakText(segment.text);
      }

      this.onProgress?.(i / this.segments.length);
    }

    if (this.isPlaying) {
      this.onComplete?.();
    }
  }

  pause() { this.isPaused = true; }
  resume() { this.isPaused = false; }
  stop() { this.isPlaying = false; Speech.stop(); }
}
```

---

## Integration Points

### With Needs Assessment
- AI suggests focus areas based on low-scoring needs
- "Rest feels unmet - would a restful meditation help?"
- Link sessions to related needs

### With Conflicts
- "Preparing for difficult conversation" meditation type
- Link sessions to upcoming conflicts
- Post-session: "Return to conflict with more clarity"

### With Gratitude
- Post-meditation: "Notice anything you're grateful for?"
- Integration moment in closing of script

### With Inner Thoughts
- AI can suggest meditation: "Would grounding help right now?"
- Reference meditation practice: "I notice you meditated this morning..."

---

## Testing Strategy

### Unit Tests
- Script parsing (pause/bell markers)
- Streak calculation
- Duration calculations

### Integration Tests
- Session creation + script generation
- Stats updates after completion
- Favorites save/retrieve

### Manual Testing Required
- TTS quality on various devices
- Background playback (screen lock)
- Bell sound timing

---

## Implementation Phases

### Phase 1: Data Model (0.5 day)
- [ ] Create Prisma schema
- [ ] Run migration
- [ ] Add DTOs to shared/

### Phase 2: Unguided Timer (1-2 days)
- [ ] Create UnguidedTimerScreen
- [ ] Implement timer logic
- [ ] Add bell sound playback
- [ ] Handle background audio mode
- [ ] Create completion flow

### Phase 3: Script Generation (1 day)
- [ ] Create script generation prompt
- [ ] Implement endpoint
- [ ] Test various durations/focuses

### Phase 4: Guided Meditation (2-3 days)
- [ ] Create GuidedMeditationScreen
- [ ] Implement MeditationPlayer service
- [ ] Parse scripts with pauses/bells
- [ ] TTS integration with expo-speech
- [ ] Progress indicator
- [ ] Completion flow with save option

### Phase 5: Stats & Streaks (1 day)
- [ ] Implement stats calculation
- [ ] Create MeditationHomeScreen
- [ ] Add streak tracking logic
- [ ] Create StreakDisplay component

### Phase 6: Favorites (1 day)
- [ ] Create favorites storage
- [ ] Implement FavoritesScreen
- [ ] "Generate & Play" for theme favorites
- [ ] "Play" for exact favorites

### Phase 7: Polish (1-2 days)
- [ ] AI suggestion endpoint
- [ ] Voice selection UI
- [ ] Background sound options
- [ ] Offline caching
- [ ] Notifications

---

## Open Questions

1. **TTS Quality Threshold**
   - Is device TTS good enough for MVP?
   - Budget for cloud TTS if needed?
   - Recommendation: MVP with device TTS, premium cloud later

2. **Script Pre-generation**
   - Pre-generate common scripts for faster start?
   - Recommendation: No, always generate fresh - personalization is key

3. **Background Sound Implementation**
   - Ship audio files or stream?
   - Recommendation: Ship 2-3 options as assets (~1-2MB each)

4. **Meditation Reminders**
   - How aggressive with notifications?
   - Recommendation: Gentle daily reminder if enabled, respect settings

5. **Screen Lock Behavior**
   - Should screen stay on during meditation?
   - Recommendation: Option to keep screen on (for visual) or allow lock (for audio-only)

---

[Back to Inner Work Plans](./index.md)
