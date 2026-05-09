# Scoring Policy

Use `mwf-gold-session-scorer` as the specialist scoring and judging module. ICM may route to it and audit its outputs, but must not duplicate or bypass its instructions.

Scoring changes are eval-machine changes. They must cite artifacts and may only tighten or clarify scoring without human approval.

Do not weaken scoring rubrics, hard invariants, `not_evaluable` policy, or completion thresholds to pass a failing run.
