# Failure Taxonomy

Use exactly one primary owner for each failure.

- `product_code`: navigation, creation, persistence, traceability, CTA layout, API behavior, Stage 0 handoff, session drawer/new-session flow, safe-area/input overlap.
- `mwf_prompts`: solo reflection quality, CTA timing, over-routing, under-routing, tone, premature action planning, context use in Stage 0.
- `actor_skill`: unrealistic actor behavior, too much compliance, forcing a partner CTA, weak scratch evidence, invalid status JSON.
- `eval_harness`: browser automation, fixture setup, missing commands, scenario metadata, scoring/reporting gaps.
- `none`: expected behavior or no actionable issue.

Do not hide product or prompt failures under eval-machine labels. Use `eval_harness` only when the run cannot fairly evaluate the product.
