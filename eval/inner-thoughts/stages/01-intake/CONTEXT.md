# Stage 01: Intake

## Inputs

- `eval/inner-thoughts/scenarios.json`
- Current git status
- Prior cycle reports, if resuming
- Existing scratch logs under `docs/product/inner-thoughts-scratch/`
- Relevant product files for home composer, Inner Thoughts, suggested actions, new-session flow, backend context generation, Stage 0 prompts, and Prisma linkage

## Process

Build an artifact index. Identify every live-enabled scenario, expected product path, existing run artifact, missing artifact, and current blocker.

## Outputs

- `output/latest-artifact-index.md`

## Audit

Every referenced path must exist or be explicitly marked missing. State whether the cycle is fresh, resuming, or blocked.
