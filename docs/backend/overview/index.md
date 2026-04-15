---
title: Backend Overview
sidebar_position: 1
description: High-level architecture and design philosophy for the Meet Without Fear backend.
slug: /backend/overview
---
# Backend Overview

High-level architecture and design philosophy for the Meet Without Fear backend.

## Documents

### [Architecture](./architecture.md)
Three-layer architecture, FSM mental model, and system flow diagrams

### [Mental Model](./mental-model.md)
Why Meet Without Fear is NOT a chatbot - Process Guardian role explained

### Turn Lifecycle (coming soon)
Complete diagram of user turn processing

## Quick Reference

```mermaid
flowchart TD
    subgraph "Three-Layer Architecture"
        API[API Layer]
        SM[State Machine Layer]
        AI[AI Integration Layer]
    end

    API --> SM
    SM --> AI

    subgraph "Data Strategy"
        SQL[(PostgreSQL)]
        VEC[(pgvector)]
    end

    SM --> SQL
    AI --> VEC
```

[Back to Backend](../index.md)
