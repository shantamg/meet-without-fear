# Brainstorm Digest

Take a brainstorm session transcript, create a structured GitHub issue, then break action items into sub-issues.

## Arguments

`$ARGUMENTS` — The transcript of the brainstorm conversation. This is typically a raw transcript with speaker labels (Speaker A, Speaker B, etc.) or names.

## Step 1: Digest the transcript

Read through the full transcript and extract:

- **Title** — A short descriptive title for the brainstorm session (under 80 chars). Format: `Brainstorm: <topic summary>`
- **Participants** — Who was in the conversation (use names if identifiable from context, otherwise Speaker A/B/etc.)
- **Key themes** — The major topics discussed, each with a short heading and bullet points summarizing what was said, decisions made, and any specific examples or analogies used
- **Decisions & next steps** — A prioritized table of actionable items that emerged, with columns: Priority, Item, Status (default "To do")
- **Open questions** — Unresolved questions that came up during the discussion

Be faithful to what was actually discussed. Capture the nuance and reasoning, not just conclusions. Include memorable analogies or examples that illustrate key points — these are often the most useful things to reference later.

## Step 2: Create the parent brainstorm issue (sub-agent)

Spawn a sub-agent to create the parent brainstorm issue via `/create-issue`. Pass it the full digest from Step 1:

- **Title**: `Brainstorm: <topic summary>`
- **Label**: `brainstorm`
- **Body** formatted as:

```
**Date:** YYYY-MM-DD
**Participants:** Names

---

## Key Themes

### Theme 1 heading
- point
- point

### Theme 2 heading
- point
- point

[...more themes as needed]

---

## Decisions & Next Steps

| Priority | Item | Status |
|----------|------|--------|
| 1 | ... | To do |
| 2 | ... | To do |

---

## Open Questions

- question 1
- question 2

---
*Digested from brainstorm transcript by Claude*
```

`/create-issue` handles duplicate checks, assignees, cross-referencing, and labeling automatically.

**Wait for this agent to finish and capture the parent issue number before proceeding.**

## Step 3: Plan sub-issues

Review the "Decisions & Next Steps" table and identify which items are **actionable tasks** (not pure decisions or observations). Skip items that are just recording a decision made — only create sub-issues for things that require future work.

For each actionable item, prepare:

- **Title**: A clear, actionable title (not just the table text — expand it into something a developer can act on)
- **Labels**: Appropriate labels based on the item type (e.g. `enhancement`, `bug`, `design`, `research`)
- **Body**: Key context from the relevant Key Theme section that explains *why* this item matters, any specifics discussed, and constraints mentioned. End with `Parent brainstorm: #<parent-issue-number>`

## Step 4: Create sub-issues (one sub-agent per issue, in parallel)

For each sub-issue from Step 3, spawn a sub-agent to create it via `/create-issue`. Run these in parallel. Each agent receives:

- The title, labels, and body from Step 3
- The parent issue number for cross-referencing

After all sub-issue agents complete, edit the parent brainstorm issue body to replace the "Decisions & Next Steps" table with a task list linking to the sub-issues:

```
## Decisions & Next Steps

- [ ] #<sub-issue-1> — short description
- [ ] #<sub-issue-2> — short description
...
```

## Output

Return the parent issue URL, all sub-issue URLs, and a brief summary of the key themes captured.
