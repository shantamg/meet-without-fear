# Stage: Digest Transcript

## Input

- Raw brainstorm transcript from `$ARGUMENTS` (speaker labels or names)

## Process

1. Read the full transcript and extract:
   - **Title**: short descriptive title (<80 chars), format: `Brainstorm: <topic>`
   - **Participants**: names or Speaker A/B labels
   - **Key themes**: major topics with heading + bullet points (decisions, reasoning, examples, analogies)
   - **Decisions & next steps**: prioritized table (Priority, Item, Status)
   - **Open questions**: unresolved questions from discussion
2. Be faithful to what was discussed — capture nuance and reasoning, not just conclusions
3. Include memorable analogies or examples (these are the most useful to reference later)

## Output

Structured digest ready for issue creation in Stage 2:
- Title, participants, themes, decisions table, open questions

## Completion

Proceed to `stages/2-create-issues/` with the digest.
