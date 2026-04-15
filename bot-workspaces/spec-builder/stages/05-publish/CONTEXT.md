# Stage: Publish

## Input

- GitHub issue with `bot:spec-builder` label
- Issue comments with complete draft (all rubric stages passed)
- `shared/draft-template.md` — for final render format

## Process

1. **Read latest meta tag** from most recent bot comment. Verify `stage` is `publish`.
2. **Render the final spec** into the issue body using the complete draft template. All sections should be filled — no "*(pending)*" placeholders remain.
3. **Post machine-readable summary comment** using the summary template from `shared/draft-template.md`. The comment must:
   - Start with `<!-- spec-summary -->` HTML comment marker (so downstream consumers can find it programmatically)
   - List all linked issues in priority order with one-line descriptions
   - Include per-issue briefs with: user story, acceptance criteria, and files to modify — extracted from the rendered spec sections
   - Keep it concise — this is what milestone-planner/builder will parse instead of the full spec

4. **Count distinct tasks** in the rendered spec. Review the user stories, technical approach, and scope sections to determine implementation complexity:
   - Count the number of discrete, independent work items (new endpoints, schema changes, UI components, service modifications)
   - Assess whether changes are cross-cutting (touching multiple services/packages) or focused (single area)

5. **Determine downstream routing**:

   | Condition | Downstream Label | Rationale |
   |---|---|---|
   | >2 distinct tasks OR cross-cutting changes | `bot:milestone-planner` | Needs decomposition into sub-issues with dependency ordering |
   | ≤2 focused tasks | `bot:pr` | Simple enough to implement directly |

6. **Post completion comment** with:
   - Quantified summary: "Spec complete: N user stories, N edge cases, technical approach across N services."
   - Section listing what the spec covers
   - Routing explanation: why it's going to milestone-planner or directly to PR
7. **Update meta tag** with `stage: complete` and `graduated_to: <label>`.
8. **Swap labels**:
   - Remove `bot:spec-builder`
   - Add the downstream label (`bot:milestone-planner` or `bot:pr`)
   - Add `spec-complete` label (ensure it exists first):
     ```bash
     gh label create "spec-complete" --repo shantamg/meet-without-fear \
       --description "Spec interview complete — ready for milestone planning" \
       --color "0E8A16" 2>/dev/null || true
     ```

## Input Context: Research Findings

Before rendering the final spec, check for a prior research report comment on the issue (from the `research/` workspace). Look for comments containing `## Research Report` heading. If found, incorporate the codebase analysis, constraints, and recommended approach into the spec's technical section. This ensures research work flows through to the spec.

## Output

- Issue body updated with final rendered spec
- Machine-readable summary comment posted (with `<!-- spec-summary -->` marker)
- Completion comment posted with summary and routing explanation
- `bot:spec-builder` label removed
- Downstream label added (`bot:milestone-planner` or `bot:pr`)
- `spec-complete` label added

## Completion

Final stage. The dispatcher picks up the issue via the new `bot:*` label and routes it to the appropriate workspace automatically.
