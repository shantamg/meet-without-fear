---
title: Architecture
sidebar_position: 1
description: System architecture documentation for Meet Without Fear. These docs describe the current state of the codebase.
created: 2026-03-11
updated: 2026-03-11
status: living
---
# Architecture

System architecture documentation for Meet Without Fear. These docs describe the current state of the codebase.

**Source of truth**: These `docs/architecture/` files are the authoritative versions. The `.planning/codebase/` copies are older (Feb 2026) and should not be treated as upstream.

## Documents

- [Backend Overview](backend-overview.md) -- Monorepo layers, Express + Prisma architecture, AI orchestration pipeline
- [Structure](structure.md) -- Full directory layout, file organization, component locations
- [Stack](stack.md) -- Languages, frameworks, runtime, package manager, dependencies
- [Conventions](conventions.md) -- Naming patterns, file organization rules, code style
- [Integrations](integrations.md) -- Clerk auth, AWS Bedrock, Ably realtime, external services
- [Testing](testing.md) -- Jest, Playwright, test patterns, run commands
- [Concerns](concerns.md) -- Known issues, tech debt, areas needing attention
