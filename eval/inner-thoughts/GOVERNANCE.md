# Governance

Product, prompt, and eval-machine changes are allowed when justified by artifacts.

The loop may tighten completion criteria, actor difficulty, evidence requirements, and scenario coverage. It may not weaken them without explicit human approval.

Stop for human input when:

- The next step would weaken a rubric, completion criterion, hard invariant, or actor difficulty.
- Product intent is ambiguous and the scenario docs do not resolve it.
- Credentials, real-LLM cost, unavailable local services, or browser tooling block required reruns.
- Evidence cannot distinguish product behavior from actor or harness failure.

Reports must separate product fixes, prompt fixes, eval-machine fixes, tests, reruns, remaining risks, and human decisions.
