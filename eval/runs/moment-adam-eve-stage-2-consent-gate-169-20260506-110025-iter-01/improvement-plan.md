# Moment Eval Improvement Plan

Run: `/Users/shantam/Software/meet-without-fear/eval/runs/moment-adam-eve-stage-2-consent-gate-169-20260506-110025-iter-01`
Moment: `adam-eve-stage-2-consent-gate-169`
Score: `1.0`

## Ownership Routing

- Owner: mwf_prompts
- Dimension: gold_posture
- Recommended action: patch_prompt
- Chosen edit/proposal: versioned Stage 4 prompt proposal

## Cross-Moment Regularization

- Source moment: `adam-eve-stage-2-consent-gate-169`
- Same-stage moments checked: 12
- Stage transcripts: adam-eve, core-protocol-update, james-catherine
- Checked transcripts: adam-eve, core-protocol-update, james-catherine
- Coverage parity: pass
- Baseline tolerance: 0.05
- Gate verdict: pass
- `adam-eve-stage-2-emotional-handling-137`: pass (score 1.0 / baseline 1.0 minimum 0.95; passed)
- `adam-eve-stage-2-emotional-handling-141`: pass (score 1.0 / baseline 1.0 minimum 0.95; passed)
- `adam-eve-stage-2-fact-reflection-286`: pass (score 1.0 / baseline 1.0 minimum 0.95; passed)
- `core-protocol-update-stage-2-emotional-handling-84`: pass (score 1.0 / baseline 1.0 minimum 0.95; passed)
- `james-catherine-stage-2-consent-gate-292`: pass (score 1.0 / baseline 1.0 minimum 0.95; passed)
- `james-catherine-stage-2-emotional-handling-225`: pass (score 1.0 / baseline 1.0 minimum 0.95; passed)
- `james-catherine-stage-2-emotional-handling-237`: pass (score 1.0 / baseline 1.0 minimum 0.95; passed)
- `james-catherine-stage-2-fact-reflection-285`: pass (score 1.0 / baseline 1.0 minimum 0.95; passed)
- `stage-2-empathy-validation`: pass (score 4.67 / baseline 4.5 minimum 4.45; passed)
- `stage-2-refinement-round`: pass (score 1.0 / baseline 0.9 minimum 0.85; passed)
- `stage-2-trajectory-empathy-cycle`: pass (score 1.0 / baseline 0.78 minimum 0.73; passed)
- `transition-stage-2-to-3`: pass (score 0.95 / baseline 0.5 minimum 0.45; passed)

## Regression Guard

- Same-stage moments must remain above their individual thresholds with no hard invariant failures.
