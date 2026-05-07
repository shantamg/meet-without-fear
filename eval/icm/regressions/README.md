# Regressions

Each confirmed bug gets a file under `eval/icm/regressions/<owner>/`.

Use durable records here, not raw run dumps. Link to raw local artifacts when useful, and promote only specific excerpts or fixtures when needed.

## Template

```md
# Regression: <name>

## Bug

What happened.

## Evidence

Run dirs, transcript lines, scratch logs, screenshots, logs.

## Expected Invariant

What must never happen again.

## Coverage

Unit test, integration test, loop invariant, scorer rule, or manual gate.

## Status

active | covered | accepted-risk

## Last Verified

Command or run artifact.
```
