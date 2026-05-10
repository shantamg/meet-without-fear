# Cleanup Policy

After tests or bounded loops, clean up local services, browser sessions, and `agent-browser` daemons started for the cycle.

Record cleanup status in `stages/06-rerun/output/run-results.md` and the final cycle report.

If cleanup fails, route it to `eval_harness`, cite process or log evidence, and do not treat the cycle as clean until the failure is fixed or explicitly accepted by a human.
