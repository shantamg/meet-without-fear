# Stage 09: Self-Improve

## Inputs

- `stages/08-report/output/cycle-report.md`
- missed failures
- noisy failures
- `GOVERNANCE.md`
- `self-improvement/README.md`

## Process

Identify improvements to actors, scorer, reporter, harness, or routing. Use `mwf-gold-prompt-improver` for prompt/process proposals when relevant.

Keep eval-machine improvements separate from product fixes.

If the cycle spent repeated full fresh runs reaching the same later-stage state, propose a snapshot registry entry or seeded-stage check. If snapshot replay was noisy or invalid, propose tighter registry metadata or a fresh/full-flow gate instead.

## Outputs

- `output/self-improvement-proposals.md`

## Audit

Every proposed eval-machine change must state evidence, diagnosis, files to change, regression coverage, rollback notes, and whether it tightens, clarifies, or weakens the system. Weakening requires human approval. Snapshot replay proposals must say whether they add faster focused coverage without reducing required fresh gates.
