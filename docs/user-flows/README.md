# User Flow Documentation

This directory contains visual documentation of user flows through the Meet Without Fear application, including state machines and sequence diagrams.

## Documents

| Document | Description |
|----------|-------------|
| [Stage 2: Empathy Flow](./stage2-empathy-flow.md) | Detailed flow of empathy exchange, reconciler system, and validation |
| [Accuracy Feedback Flow](./accuracy-feedback-flow.md) | How users validate partner's empathy and provide feedback |

## How to View

These documents use [Mermaid](https://mermaid.js.org/) diagrams. They render automatically in:
- GitHub (web view)
- VS Code (with Mermaid extension)
- Many Markdown previewers

## Document Structure

Each flow document includes:
1. **Overview** - High-level description of the feature
2. **State Diagrams** - Data model state transitions
3. **Flowcharts** - Decision logic and branching
4. **Sequence Diagrams** - User interactions over time
5. **Tables** - Quick reference for UI rules
6. **Edge Cases** - Known tricky scenarios

## Contributing

When updating code that affects user flows:
1. Update the relevant flow document
2. Add new edge cases discovered during debugging
3. Keep diagrams focused - create new documents for complex sub-flows
