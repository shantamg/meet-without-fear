# Deploy — Workspace Context

## Purpose

Prepare a deployment build by analyzing git history since the last build and generating a user-friendly changelog.

## Stage Pointers

- `stages/prepare/CONTEXT.md` — Single-stage build preparation

## Key Files

- `backend/builds.json` — Build history with commit hashes and changelogs
- `deploy-ios-prepare.js` — iOS build preparation script
- `deploy-android-prepare.js` — Android build preparation script
