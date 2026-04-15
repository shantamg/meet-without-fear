# Stage: Graduate

## Input

- GitHub issue with `bot:needs-info` label
- All issue comments containing the full interview thread
- `shared/graduation-criteria.md` — confirms criteria are met
- Category from metadata (`bug`, `feature`, or `question`)

## Process

1. **Read the full issue thread** and extract all user-provided information.
2. **Compile a structured summary** from the interview:
   - For bugs: screen/feature, steps to reproduce, expected vs actual behavior, environment
   - For features: user need, proposed solution, who it affects, priority signals
   - For questions: the specific question with enough context to answer
3. **Update the issue body** with the compiled summary appended under a `## Gathered Context` heading. Preserve the original issue body above.
4. **Swap labels** — route to the next pipeline stage based on category and gathered context:
   - Remove `bot:needs-info`
   - For bugs: add `bot:investigate` (bugs should always be investigated)
   - For features: evaluate the gathered context to determine the next stage:
     - If requirements are **clear and well-defined** (specific user need, clear acceptance criteria, known scope): add `bot:spec-builder`
     - If requirements are **unclear or need investigation** (multiple possible approaches, unknown dependencies, needs codebase research): add `bot:research`
     - If the feature is **trivial** (single-file change, obvious implementation): add `bot:pr`
   - For questions: post the answer directly if possible. If it requires implementation, route as a feature (using the same evaluation above).
5. **Post a graduation comment** explaining that enough info has been gathered:
   - For bugs: mention the issue is being routed to investigation
   - For features: mention the downstream workspace and why it was chosen (e.g., "Routing to research — the approach needs investigation before we can spec this out.")
   - For questions answered in-comment: mention the answer is above and close the issue

## Output

- Updated issue body with structured summary
- `bot:needs-info` label removed
- Downstream label added based on classification:
  - Bugs: `bot:investigate`
  - Features (clear): `bot:spec-builder`
  - Features (unclear): `bot:research`
  - Features (trivial): `bot:pr`
- Graduation comment posted with routing explanation

## Completion

Final stage. The dispatcher picks up the issue via the new `bot:*` label and routes it to the appropriate workspace automatically.
