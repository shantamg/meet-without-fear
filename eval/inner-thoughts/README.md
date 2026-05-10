# Inner Thoughts Eval Workspace

This workspace is the durable control plane for self-improving Inner Thoughts. It is parallel to `eval/icm/`, but its subject is a solo reflection surface that can optionally bridge into a partner session. It does not assume two scripted gold personas or a known transcript path.

Start a loop with:

```text
/goal Follow eval/inner-thoughts/RUN_SELF_IMPROVEMENT_LOOP.md exactly.
```

## Canonical Inputs

- `eval/inner-thoughts/scenarios.json`
- `eval/skills/mwf-inner-thoughts-loop-actor/`
- Product code for the home composer, Inner Thoughts chat, suggested actions, session creation, and Stage 0 prompt context handoff
- Actor scratch logs under `docs/product/inner-thoughts-scratch/`
- Stage outputs under `eval/inner-thoughts/stages/*/output/`

## Usually Local Only

- Live run transcripts
- Screenshots from local/E2E browser runs
- Raw browser logs
- Temporary backend logs

Promote generated material only when it becomes a scenario fixture, regression record, cycle report, or durable eval-machine improvement.
