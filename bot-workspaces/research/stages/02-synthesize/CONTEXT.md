# Stage 02: Synthesize

## Input

- GitHub issue with `bot:research` label
- Findings from Stage 01's three sub-agents (codebase, web, internal)
- `shared/references/slack-format.md` (formatting conventions)

## Process

### 1. Read the gathered findings

Load the raw findings from Stage 01. If resuming from a prior run, read the meta tag and findings comment from the issue thread.

### 2. Compile the research report

Organize findings into four sections. Each section should be concise and actionable -- not a data dump.

#### Section 1: Codebase Analysis
- Current architecture in the affected area (key files, services, data flow)
- Existing patterns that the implementation should follow
- Technical constraints (schema shape, service boundaries, shared types)

#### Section 2: External Research
- Relevant third-party docs, API references, or standards
- Best practices and recommended approaches
- Known pitfalls or caveats to watch for
- If no external research was needed, state that briefly

#### Section 3: Constraints & Risks
- Breaking change potential (schema migrations, API contracts, mobile compatibility)
- Performance concerns (query complexity, payload size, real-time impact)
- Dependencies on other in-progress work (check open PRs and WIP)
- Security or privacy implications
- Gaps in the research (things that couldn't be determined)

#### Section 4: Recommended Approach
- High-level implementation strategy (which services, which patterns)
- Suggested order of operations
- Open questions that need human input before building
- Estimated complexity: simple (single service, <100 LOC), moderate (multi-service, schema change), or complex (new service, cross-cutting)

### 3. Post the research comment

Post the compiled report as a single issue comment with this structure:

```markdown
## Research Report

### Codebase Analysis
[findings]

### External Research
[findings]

### Constraints & Risks
[findings]

### Recommended Approach
[findings]

---
*Complexity: [simple | moderate | complex]*
*Next step: [spec-builder | pr | needs human decision]*
```

### 4. Update meta tag

Post updated meta tag:
```
<!-- bot:research-meta: {"stage": "synthesize", "complexity": "<simple|moderate|complex>", "recommendation": "<spec-builder|pr|needs-decision>"} -->
```

## Output

- Research report comment posted on the issue
- Meta tag updated with complexity assessment and next-step recommendation

## Completion

Proceed to `stages/03-graduate/` to swap labels.
