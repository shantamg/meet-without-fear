# Stage 1: Fetch and Classify

## Inputs

| Source | What | Why |
|---|---|---|
| Prompt | The specific message to handle (provided by socket-listener) | Contains channel context + message text |
| `.claude/config/services.json` | Bot user ID `U0ALQHDUVSM` | Filter self |
| `references/classification-guide.md` | Classification criteria and examples | Accurate message typing |
| `scripts/slack-get-images.mjs` | Image scanner | Detect file attachments MCP cannot see |

## Process

### Step 1: Extract message from prompt

The socket-listener provides the message in the prompt under "## Message to handle". Extract:
- Channel ID (from the prompt context)
- Message timestamp (`ts`)
- Thread timestamp (`thread_ts`) if it's a thread reply
- User ID
- Message text
- Whether the message has file attachments (check `[Attached files: ...]` in the formatted message)

If the message mentions attached files, scan for images:
```bash
SLACK_MCP_XOXB_TOKEN="$SLACK_MCP_XOXB_TOKEN" node scripts/slack-get-images.mjs <CHANNEL_ID> --ts <message_ts>
```

### Step 2: Filter non-actionable messages

Skip this message (exit without action) if it matches ANY:

| Filter | How to detect |
|---|---|
| Acknowledgment only | Text matches: "ok", "thanks", "got it", "noted", "ty", thumbs-up emoji |
| Emoji-only | Message text is a single emoji or empty |
| Join/leave/system | Message has a `subtype` |

### Step 3: Classify each remaining message

For each actionable message, assign exactly one type. See `references/classification-guide.md` for detailed criteria and examples.

| Type | Signal words / patterns |
|---|---|
| **BUG** | "broken", "error", "crash", "not working", "stuck", "freeze", "blank screen", "wrong", screenshot of error |
| **FEATURE** | "it would be nice", "can we add", "I wish", "what if", "could you make", "feature request" |
| **QUESTION** | "how do I", "where is", "what does", "is there a way", "?", asking about functionality |
| **REQUEST** | "do", "run", "review", "audit", "build", "create", "investigate", "deploy", imperatives — expects bot to *do* work |
| **PRIORITIZE** | "prioritize", "priority", "urgent", "high priority", "expedite", "bump up", ⚡ (`:zap:`) emoji — asking to escalate an existing issue/PR |
| **FEEDBACK** | "I like", "I don't like", "it feels", "the experience", "UX", sharing impressions without requesting changes |
| **OBSERVATION** | Status update, personal reflection, "just tried", "interesting", conversational, no action implied |

**When ambiguous:**
- Bug + Question ("why isn't X working?") --> BUG (broken behavior takes priority)
- Feature + Feedback ("I wish the button was bigger") --> FEATURE (actionable request takes priority)
- Observation + Feedback ("just tried X, it felt slow") --> FEEDBACK (impression with implicit suggestion)
- Question + Request ("can you investigate why X is slow?") --> REQUEST (requires substantive work)
- Request + Feature ("build push notifications") --> REQUEST (asking the bot to do it now)
- Request + Prioritize ("prioritize PR #123") --> PRIORITIZE (escalating priority of existing item)

### Step 4: Build classified list

For each message, record:

```
{
  message_ts: string,      // Slack message timestamp (used as unique ID)
  thread_ts: string,       // Thread parent ts (same as message_ts if top-level)
  type: "BUG" | "FEATURE" | "QUESTION" | "REQUEST" | "PRIORITIZE" | "FEEDBACK" | "OBSERVATION",
  summary: string,         // One-line summary of the message content
  has_images: boolean,     // Whether the image scan found files on this message
  user: string,            // Slack user ID of the message author
  text: string             // Original message text (for Stage 2 context)
}
```

## Checkpoints

- [ ] MCP fetch completed (messages retrieved)
- [ ] Image scan completed (file attachments identified)
- [ ] Filtering applied (bot messages, acknowledgments, already-triaged removed)
- [ ] Each remaining message has exactly one classification
- [ ] Classified list is ready for Stage 2

## Output

A classified list: `[{message_ts, thread_ts, type, summary, has_images, user, text}]`

If the list is empty (no actionable messages), skip Stage 2 and exit. No reply needed.

## Completion

Pass the classified list to `stages/2-dispatch/` and proceed directly.
