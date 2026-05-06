# Moment Eval Improvement Plan

Run: `/Users/shantam/Software/meet-without-fear/eval/runs/moment-stage-4-no-shared-agreement-20260506-095956-iter-01`
Moment: `stage-4-no-shared-agreement`
Score: `1.67`

## Ownership Routing

- Owner: mwf_prompts
- Dimension: no_overlap_clarity
- Recommended action: patch_prompt
- Chosen edit/proposal: versioned Stage 4 prompt proposal

## Cross-Moment Regularization

- Source moment: `stage-4-no-shared-agreement`
- Same-stage moments checked: 8
- Stage transcripts: adam-eve, james-catherine
- Checked transcripts: adam-eve, james-catherine
- Coverage parity: pass
- Baseline tolerance: 0.05
- Gate verdict: pass
- `adam-eve-stage-4-willingness-selection-1031`: pass (score 1.0 / baseline 1.0 minimum 0.95; passed)
- `adam-eve-stage-4-willingness-selection-975`: pass (score 1.0 / baseline 1.0 minimum 0.95; passed)
- `james-catherine-stage-4-emotional-handling-1112`: pass (score 1.0 / baseline 1.0 minimum 0.95; passed)
- `james-catherine-stage-4-fact-reflection-818`: pass (score 1.0 / baseline 1.0 minimum 0.95; passed)
- `james-catherine-stage-4-willingness-selection-944`: pass (score 1.0 / baseline 1.0 minimum 0.95; passed)
- `stage-4-no-shared-agreement-closure`: pass (score 5.0 / baseline 2.33 minimum 2.28; passed)
- `stage-4-trajectory-willingness-to-close`: pass (score 4.0 / baseline 1.33 minimum 1.28; passed)
- `stage-4-willingness-selection`: pass (score 1.0 / baseline 1.0 minimum 0.95; passed)

## Regression Guard

- Same-stage moments must remain above their individual thresholds with no hard invariant failures.
