# AI Architecture Implementation Plan

## Audit: Planned vs Implemented

### Model Stratification

| Planned | Implemented | Gap |
|---------|-------------|-----|
| Haiku for retrieval planning | Not implemented | **MISSING** |
| Haiku for stage classification | Not implemented | **MISSING** |
| Haiku for emotional intensity detection | Not implemented | **MISSING** |
| Haiku for judgment/attack detection | Not implemented | **MISSING** |
| Sonnet for user-facing responses | Partially (single model) | **PARTIAL** |
| Sonnet for need extraction | Not implemented | **MISSING** |
| Sonnet for content transformation | Not implemented | **MISSING** |

### Context Assembly

| Planned | Implemented | Gap |
|---------|-------------|-----|
| Stage-scoped retrieval contracts | Not implemented | **MISSING** |
| Memory Intent Layer | Not implemented | **MISSING** |
| Context bundles per stage | Not implemented | **MISSING** |
| Turn buffer (6 turns Stage 1, etc.) | Hardcoded messages only | **PARTIAL** |
| Emotional thread tracking | Not implemented | **MISSING** |
| Session summary injection | Not implemented | **MISSING** |
| Provenance/consent metadata | Not implemented | **MISSING** |

### Stage 1 Witnessing

| Planned | Implemented | Gap |
|---------|-------------|-----|
| WITNESS/INSIGHT mode switching | Basic version in prompt | **PARTIAL** |
| Green/red light detection | In prompt only, not tracked | **PARTIAL** |
| Analysis tags stripped | Yes | **DONE** |
| Prior themes injection | In prompt but not from DB | **PARTIAL** |
| Emotional intensity from barometer | Hardcoded placeholder | **MISSING** |
| Personality anchor | Not in current prompt | **MISSING** |
| Continuity signals | Not implemented | **MISSING** |

### Emotional Support

| Planned | Implemented | Gap |
|---------|-------------|-----|
| Barometer-triggered support | Not implemented | **MISSING** |
| Breathing/grounding exercises | Not implemented | **MISSING** |
| Memory Intent: avoid_recall | Not implemented | **MISSING** |

### Mirror Intervention

| Planned | Implemented | Gap |
|---------|-------------|-----|
| Judgment detection (Haiku) | Not implemented | **MISSING** |
| Intervention count tracking | Not implemented | **MISSING** |
| Escalating intervention responses | Not implemented | **MISSING** |

### Utility Functions

| Planned | Implemented | Gap |
|---------|-------------|-----|
| Need extraction (Stage 3 prep) | Not implemented | **MISSING** |
| Content transformation | Not implemented | **MISSING** |
| Clarification question generation | Not implemented | **MISSING** |

### Data Layer

| Planned | Implemented | Gap |
|---------|-------------|-----|
| UserVessel content storage | Schema exists, not populated | **PARTIAL** |
| Emotional readings storage | Schema exists | **PARTIAL** |
| AI Synthesis dirty flag | Schema has `isSynthesisDirty` | **PARTIAL** |
| Vector embeddings (pgvector) | Not implemented | **MISSING** |

---

## Implementation Plan

### Phase 1: Two-Model Architecture (Foundation)

**Goal**: Establish Haiku + Sonnet separation

#### 1.1 Bedrock Client Enhancement
```
File: backend/src/lib/bedrock.ts
Changes:
- Add BEDROCK_HAIKU_MODEL_ID config
- Add BEDROCK_SONNET_MODEL_ID config
- Create getHaikuCompletion() for fast structured output
- Create getSonnetCompletion() for empathetic responses
- Add JSON schema validation for Haiku outputs
```

#### 1.2 Retrieval Planner Service
```
File: backend/src/services/retrieval-planner.ts (NEW)
Purpose: Haiku-powered retrieval planning
Functions:
- planRetrieval(stage, userId, sessionId, message) -> RetrievalQuery[]
- validateRetrievalPlan(queries, stage) -> ValidatedQuery[]
- Zod schema for RetrievalQuery types
```

#### 1.3 Context Assembler Service
```
File: backend/src/services/context-assembler.ts (NEW)
Purpose: Build stage-scoped context bundles
Functions:
- assembleContextBundle(stage, userId, sessionId, retrievalPlan)
- buildTurnBuffer(sessionId, userId, bufferSize)
- buildEmotionalThread(sessionId, userId)
- buildSessionSummary(sessionId, userId) - for sessions > 30min
Returns: ContextBundle with provenance metadata
```

---

### Phase 2: Stage 1 Full Implementation

**Goal**: Complete witnessing experience with all nuances

#### 2.1 Emotional Barometer Integration
```
File: backend/src/services/emotional-barometer.ts (NEW)
Purpose: Track and respond to emotional intensity
Functions:
- recordReading(sessionId, userId, intensity, context?)
- getLatestReading(sessionId, userId) -> EmotionalReading
- getTrend(sessionId, userId, window?) -> 'escalating' | 'stable' | 'de-escalating'
- shouldTriggerSupport(reading, trend) -> boolean
```

#### 2.2 Enhanced Witness Response
```
File: backend/src/services/ai.ts
Changes:
- Inject emotional intensity from barometer
- Inject turn buffer from context assembler
- Inject prior themes from UserVessel
- Add personality anchor to system prompt
- Add continuity signals instructions
- Track green/red lights in response metadata
```

#### 2.3 Emotional Support Handler
```
File: backend/src/services/emotional-support.ts (NEW)
Purpose: Handle high-intensity moments
Functions:
- generateSupportPrompt(intensity, trend, sustained?)
- handleBreathingExercise(sessionId, userId)
- handleGrounding(sessionId, userId)
- handlePauseSession(sessionId)
```

---

### Phase 3: Memory & Vessel Population

**Goal**: Actually store and retrieve from vessels

#### 3.1 UserVessel Population
```
File: backend/src/services/vessel-manager.ts (NEW)
Purpose: Manage vessel content
Functions:
- storeUserEvent(sessionId, userId, event, embedding?)
- storeEmotionalReading(sessionId, userId, reading)
- storeIdentifiedNeed(sessionId, userId, need)
- getUserVesselContent(sessionId, userId, stage) -> VesselContent
```

#### 3.2 Memory Extraction (Post-Turn)
```
File: backend/src/services/memory-extractor.ts (NEW)
Purpose: Extract memory objects from conversations (Haiku)
Functions:
- extractMemoryObjects(messages) -> MemoryObject[]
- classifyMemoryType(content) -> 'event' | 'emotion' | 'need' | 'boundary'
- Called after each turn to populate vessels
```

#### 3.3 Memory Intent Layer
```
File: backend/src/services/memory-intent.ts (NEW)
Purpose: Determine appropriate remembering
Functions:
- determineIntent(stage, intensity, message) -> MemoryIntent
- getRetrievalDepth(intent) -> 'none' | 'minimal' | 'light' | 'full'
```

---

### Phase 4: Classification & Detection (Haiku)

**Goal**: Enable all Haiku-powered mechanics

#### 4.1 Judgment Detector
```
File: backend/src/services/judgment-detector.ts (NEW)
Purpose: Detect attacks/judgment for mirror intervention
Functions:
- detectJudgment(message) -> JudgmentResult | null
- classifyJudgmentType() -> 'character_attack' | 'mind_reading' | 'dismissive' | 'sarcasm'
- detectUnderlyingHurt(judgment) -> string
```

#### 4.2 Stage Classifier
```
File: backend/src/services/stage-classifier.ts (NEW)
Purpose: Classify user intent/stage appropriateness
Functions:
- classifyMessage(message, currentStage) -> Classification
- detectStageSkipAttempt(message, stage) -> boolean
```

#### 4.3 Intervention Tracker
```
File: backend/src/services/intervention-tracker.ts (NEW)
Purpose: Track mirror intervention count
Functions:
- getInterventionCount(sessionId, userId) -> number
- incrementIntervention(sessionId, userId)
- resetInterventions(sessionId, userId)
```

---

### Phase 5: Advanced Features

**Goal**: Full prompt implementations for all stages

#### 5.1 Need Extraction
```
File: backend/src/services/need-extractor.ts (NEW)
Purpose: Extract needs from Stage 1-2 content
Functions:
- extractNeeds(messages, events, readings) -> NeedExtractionResult
- generateClarificationQuestions(uncertainNeeds) -> Question[]
```

#### 5.2 Content Transformation
```
File: backend/src/services/content-transformer.ts (NEW)
Purpose: Transform raw content for sharing
Functions:
- analyzeForClarification(content) -> ClarificationAnalysis
- transformContent(content, type, context) -> TransformedContent
```

#### 5.3 Mirror Intervention Handler
```
File: backend/src/services/mirror-intervention.ts (NEW)
Purpose: Generate mirror intervention responses
Functions:
- generateIntervention(message, count, judgmentType, detectedHurt)
- handlePostIntervention(userResponse) -> 'opened' | 'doubled_down' | 'refused'
```

---

## File Structure After Implementation

```
backend/src/
├── lib/
│   └── bedrock.ts              # Enhanced with Haiku + Sonnet
│
├── services/
│   ├── ai.ts                   # Enhanced orchestrator
│   ├── retrieval-planner.ts    # NEW - Haiku retrieval planning
│   ├── context-assembler.ts    # NEW - Context bundle building
│   ├── emotional-barometer.ts  # NEW - Intensity tracking
│   ├── emotional-support.ts    # NEW - Support exercises
│   ├── vessel-manager.ts       # NEW - Vessel CRUD
│   ├── memory-extractor.ts     # NEW - Post-turn extraction
│   ├── memory-intent.ts        # NEW - Intent determination
│   ├── judgment-detector.ts    # NEW - Attack detection
│   ├── stage-classifier.ts     # NEW - Stage classification
│   ├── intervention-tracker.ts # NEW - Intervention count
│   ├── need-extractor.ts       # NEW - Stage 3 prep
│   ├── content-transformer.ts  # NEW - Consensual bridge
│   └── mirror-intervention.ts  # NEW - Mirror responses
│
├── prompts/                    # NEW directory
│   ├── stage-0-opening.ts
│   ├── stage-1-witnessing.ts
│   ├── stage-2-perspective.ts
│   ├── stage-3-needs.ts
│   ├── stage-4-repair.ts
│   ├── emotional-support.ts
│   ├── mirror-intervention.ts
│   ├── need-extraction.ts
│   └── content-transformation.ts
```

---

## Execution Order

### Week 1: Foundation
1. [ ] Bedrock client enhancement (Haiku + Sonnet)
2. [ ] Basic retrieval planner structure
3. [ ] Context assembler with turn buffer
4. [ ] Wire into sendMessage

### Week 2: Stage 1 Complete
5. [ ] Emotional barometer service
6. [ ] Enhanced witness prompt with all nuances
7. [ ] Emotional support handler
8. [ ] Memory extraction (basic)

### Week 3: Classification & Memory
9. [ ] Judgment detector
10. [ ] Stage classifier
11. [ ] Vessel manager
12. [ ] Memory intent layer

### Week 4: Advanced
13. [ ] Need extraction
14. [ ] Content transformation
15. [ ] Mirror intervention
16. [ ] Integration testing

---

## Success Criteria

### Phase 1 Complete When:
- [ ] Haiku responds in < 500ms for classification
- [ ] Sonnet receives assembled context, not raw history
- [ ] Retrieval plans validate against Zod schemas

### Phase 2 Complete When:
- [ ] Emotional barometer readings stored and retrieved
- [ ] WITNESS/INSIGHT mode switches based on signals
- [ ] High intensity triggers support options

### Phase 3 Complete When:
- [ ] UserVessel populated with events after each turn
- [ ] Prior themes injected from previous sessions
- [ ] Memory intent respects avoid_recall at high intensity

### Phase 4 Complete When:
- [ ] Judgment detection catches all pattern types
- [ ] Intervention count persists and escalates correctly
- [ ] Stage skip attempts are blocked gracefully

### Phase 5 Complete When:
- [ ] Needs extracted with confidence scores
- [ ] Clarification questions generated for low-confidence
- [ ] Content transformed passes quality checks
