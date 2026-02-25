# Multi-Agent E2E Skill Design

## Overview

Redesign the E2E Session Playthrough skill to use an **agent team architecture** where each user has their own dedicated agent, coordinated by a supervisor. This enables true simultaneous interaction, stress-tests async flows, and exercises Inner Thoughts as a productive waiting activity.

## Architecture

```
Coordinator Agent (you — the main Claude Code session)
  ├── User A Agent (subagent) → playwright-a MCP → Browser A (Alice)
  ├── User B Agent (subagent) → playwright-b MCP → Browser B (Bob)
  └── Bash → 3 background servers (backend, mobile web, website)
```

### Agent Responsibilities

**Coordinator Agent:**
- Starts/stops servers (Phase 0)
- Seeds test users and creates the session (Phase 1)
- Accepts invitation via API (Phase 1.5)
- Spawns User A and User B agents
- Monitors progress — checks on agents periodically
- Keeps agents focused — if one stalls, nudges them forward
- Collects the final report from both agents
- Decides when to spawn agents based on session state (e.g., B can start after invitation is accepted)

**User A Agent (Alice):**
- Controls Browser A exclusively via `mcp__playwright-a__*` tools
- Roleplays as Alice with full character context
- Progresses through all stages independently
- When waiting for partner (empathy-pending, witness-pending), navigates to Inner Thoughts and chats
- Reports progress, bugs, and observations back to coordinator

**User B Agent (Bob):**
- Controls Browser B exclusively via `mcp__playwright-b__*` tools
- Roleplays as Bob with full character context
- Progresses through all stages independently
- When waiting for partner, navigates to Inner Thoughts and chats
- Reports progress, bugs, and observations back to coordinator

### Key Behavioral Rules

1. **No synchronization required** — each agent progresses at their own pace
2. **When waiting, go to Inner Thoughts** — don't just idle. Navigate to inner thoughts, chat about the conflict from a personal reflection angle, test the AI's contextual awareness
3. **Check for return notifications** — while in Inner Thoughts, periodically check if there's any in-app notification or banner indicating the partner session needs attention
4. **Report timing observations** — note how long each wait period is and whether the notification arrived before or after the wait ended

## What This Tests

### Core Session Flow
- All stages (0-4) work with fully async user timing
- Reconciler handles asymmetric empathy sharing correctly (the race condition fix)
- Real-time events properly update both browsers
- State transitions are smooth when users are at different stages

### Inner Thoughts Quality
1. **Context awareness** — Does the Inner Thoughts AI know about what was discussed in the partner session?
2. **Privacy boundary** — Does it correctly NOT know the partner's private messages?
3. **Relevance** — Are its responses helpful for processing the conflict?
4. **Cross-session retrieval** — Does it reference relevant past context?

### Notification Gap Detection
1. **In-app return notification** — Is there a visible indicator (badge, banner, alert) within Inner Thoughts when the partner session needs attention?
2. **Push notification** — Does a push notification arrive? (may not work in E2E browser context)
3. **Session list badge** — When returning to the home screen, does the session card show pending actions?
4. **Timing** — How quickly does the notification appear after the partner event?

## Implementation Plan

### Phase 0-1: Same as current skill
Server startup, user seeding, browser setup. Done by coordinator.

### Phase 2: Spawn User A Agent
After browsers are set up and logged in, spawn User A agent with:
- Character context (Alice's perspective on the conflict with Bob)
- Session ID and navigation instructions
- Instructions to complete Stage 0 (compact) → Stage 1 (witness chat) → click "feel heard"
- Instructions to confirm invitation ("I've sent it - Continue")

### Phase 1.5: Accept Invitation
Coordinator accepts invitation via API after User A confirms it.

### Phase 3: Spawn User B Agent
After invitation accepted, spawn User B agent with:
- Character context (Bob's perspective)
- Session URL with auth params
- Instructions to complete Stage 0 → Stage 1

### Phase 4+: Both Agents Progress Independently
- Each agent handles their own stage progression
- When a waiting state is detected (banner text, hidden input), the agent:
  1. Notes the waiting state and timestamp
  2. Navigates to Inner Thoughts (via drawer or "Keep Chatting" button)
  3. Creates/opens an Inner Thoughts session linked to the partner session
  4. Chats 2-3 messages about their feelings
  5. Checks for any "return to session" notification
  6. Periodically snapshots to see if notification appeared
  7. Eventually navigates back to partner session
  8. Notes whether they found out about the partner's progress via notification or manual check

### Phase 5: Coordinator Collects Results
- Waits for both agents to report completion or stalling
- Compiles combined bug report, UX observations, and notification gap findings

## Agent Prompt Templates

### User Agent System Prompt (Template)
```
You are controlling Browser {A/B} as {Alice/Bob} in an E2E session playthrough.

CHARACTER: {character description}

TOOLS: You have access to mcp__playwright-{a/b}__* tools ONLY.

RULES:
1. Progress through the session stages naturally
2. When you see a waiting banner or hidden input, go to Inner Thoughts:
   - Open the drawer menu
   - Click "Inner Thoughts"
   - Create or open an inner thoughts session linked to this partner session
   - Chat 2-3 messages reflecting on the conflict
   - OBSERVE: Does the AI seem aware of what you discussed in the partner session?
   - OBSERVE: Does it know anything about your partner's private messages? (it shouldn't)
   - CHECK: Is there any notification/badge/banner indicating the partner session needs attention?
   - Take a screenshot to document what you see
3. Periodically return to the partner session to check if the wait is over
4. Report all bugs, UX confusion, and notification observations

SESSION INFO:
- Session ID: {id}
- Session URL: {url}
- Your user ID: {userId}

REPORT FORMAT: When done or stuck, return a structured report with:
- Stage reached
- Bugs found (severity: CRITICAL/WARNING/INFO)
- Inner Thoughts observations (context awareness, privacy, quality)
- Notification observations (what you saw/didn't see when returning from Inner Thoughts)
- UX confusion points
```

## Dependencies

This design depends on:
1. The race condition fix (already implemented — `triggerReconcilerAndUpdateStatuses` guards)
2. Two Playwright MCP servers configured in `.mcp.json`
3. The Task tool supporting concurrent subagent spawning

## Open Questions

1. Can subagents access MCP tools? If not, the coordinator would need to multiplex browser commands, which defeats the purpose. **Need to verify MCP tool access in subagents.**
2. Should the coordinator poll agents or wait for them to report? Polling adds overhead but prevents silent failures.
3. How to handle the case where one agent finishes much faster than the other? Should it keep chatting in Inner Thoughts or just wait?

## Related: Notification Feature Gap

See `SESSION_ATTENTION_NOTIFICATION.md` for the design of a "return to partner session" notification that should be built to close the notification gap discovered during investigation.
