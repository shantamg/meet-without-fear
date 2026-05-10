# Regression Policy

Every confirmed bug needs regression coverage or a tracked exception.

Use `eval/icm/regressions/<owner>/` for durable regression records. Raw logs and transcript dumps stay in local artifact locations unless a specific excerpt or fixture is intentionally promoted.

Regression coverage may be a unit test, integration test, loop invariant, scorer rule, actor rule, reporter rule, or manual gate, depending on the owner and failure mode.
