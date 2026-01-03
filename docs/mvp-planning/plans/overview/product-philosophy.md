# Product Philosophy

## The Core Insight: Decoupling Memory from the Model

For most users today, conversational history lives inside a vendor silo:
- ChatGPT history lives with OpenAI
- Gemini history lives with Google
- Claude history lives with Anthropic

That history is not just logs. Over time it becomes:
- Personal context
- Relational context
- Implicit "training" through repetition and correction

This creates lock-in. Switching models means starting over, losing continuity, and re-explaining yourself. This benefits model providers, not users.

**Meet Without Fear removes long-term memory from the model entirely.**

In our system:
- LLMs are stateless reasoning engines
- They are called when needed
- They do not own or retain the user's history in any meaningful way

The canonical record of the user's conversations and mediations lives in *our* system.

**This is what "holding it in trust" actually means:**
- We are the memory layer
- The model is interchangeable
- The user's continuity does not belong to OpenAI, Google, or anyone else

When a user switches models:
- Nothing is lost
- No retraining is required
- The same mediation context can be injected into a different model
- The user's experience remains continuous even as the underlying intelligence changes

---

## Why This Matters More for Mediation

Mediation is fundamentally different from casual chat because:
- Mediation is longitudinal
- Conflicts recur
- Language patterns matter
- Prior misunderstandings matter

A stateless chat model is fundamentally misaligned with that use case.

**For casual use:** Losing history is annoying but tolerable.

**For mediation:** Losing history is destructive.
- The sequence of misunderstandings matters
- Prior repair attempts matter
- Emotional framing over time matters

---

## The Trust Relationship

We are not promising data extraction.
We are promising **data stability independent of vendor choice**.

> "We will remember for you, so you don't have to commit your relational history to a single AI company."

This is different from: "You can export your data whenever you want."

The emotional valence is different. It's about **continuity**, not escape.

---

## Cross-User Mediation

Because memory is centralized in our system, we can mediate between two people even if they would otherwise use different AI tools. Their histories can coexist and be reconciled without forcing them into the same model ecosystem.

**This is something model providers structurally cannot offer without breaking their own incentives.**

---

## How Major LLMs Actually Work Today

When a user talks to ChatGPT / Gemini / Claude:

**1. The model is stateless**
Each response is generated from:
- The base model
- System instructions
- The conversation context window

**2. The product is stateful**
The provider stores:
- Chat transcripts
- Thread-level summaries
- User-level metadata

This is used for:
- Rehydrating conversations
- "Memory" features
- Product personalization
- Lock-in and retention

**The model weights don't change, but the user experience does, because the vendor owns the memory.**

---

## Why Our System Is Fundamentally Different

| Our System | OpenAI / Google / Anthropic |
|------------|----------------------------|
| Memory is externalized and vendor-agnostic | Memory is tightly coupled to the product |
| LLMs are interchangeable compute engines | Even if exported, data is unstructured, hard to reuse, not interoperable |
| No provider accumulates longitudinal user context | Switching providers means losing implicit preferences, relational context, accumulated framing |
| User's continuity does not live inside a proprietary product | System of memory belongs to them |

---

## The Real Value (Stripped of Buzzwords)

Not "data ownership."

Not "portability."

**The value is: Continuity of shared meaning, independent of the intelligence doing the reasoning.**

That's subtle, and most people won't articulate it — but they will feel it once they experience it.

---

## Why Big LLM Providers Won't Do This Well

Not because they can't technically.

But because:
- Their unit of value is the individual user
- Their retention lever is accumulated context
- Their memory systems are designed for single-account continuity, not shared relational truth

**Mediation breaks all three.**

A model provider would have to:
- Let two users co-own a shared memory space
- Allow that space to persist independently of accounts
- Make it portable across models

That runs directly against their incentives and architecture.

---

## Target Audience

This value will only be legible to:
- People already frustrated with miscommunication
- People who care about relational continuity
- Professionals who see repeated patterns over time

That is a small but real audience.

**This is not a growth rocket, but it is a coherent, honest product.**

---

## Product Definition

A paid, mediation-first AI service designed for people who are trying to communicate clearly with someone else: couples, family members, coworkers, clients, or colleagues.

**It is not an individual productivity assistant.**

Core job: Facilitate structured, neutral conversations between two or more people, help them feel heard, and produce shared understanding.

---

## Technical Architecture

The system sits above large language models rather than replacing them. It treats LLMs as interchangeable reasoning engines and keeps all conversational memory at the application level, not at the model level.

A user's mediation history, summaries, and relational context are stored in one place and can be reused regardless of which LLM is called.

---

## Session Flow

1. One person initiates a session and invites another participant via a link
2. The invited person joins with minimal friction — no payment or complex setup required
3. Each participant speaks to the system, not directly to each other
4. The system reflects, clarifies, and synthesizes what's being said using one or more LLM calls
5. At the end, it produces a shared summary and notes unresolved points
6. For paying users (or those in trial), this is saved to their personal mediation history
7. For invited non-paying users, the experience is full, but nothing is saved unless they later create an account

---

## Pricing Model

### Free Trial
- Every new user gets 3 free mediation sessions
- During those sessions, history is saved
- Experience is identical to paid version

### Subscription
- $15–$20 per month
- Unlimited mediations
- Long-term storage of mediation history

### Distribution Loop
- Invited participants receive their own 3 free mediations
- Natural but non-aggressive growth mechanism

---

## Cost Structure

### Variable Costs (Per Mediation)
- Multiple LLM calls for reflection, synthesis, tone handling
- Estimate: $0.30–$1.00 per mediation depending on models used
- At 5–10 mediations/month per user: $2–$5/month in API costs

### Infrastructure
- AWS compute, storage, vector DBs, auth, logging
- Under $5–$7 per user per month all-in at small scale

### Operating Costs
- Target: Two-person company (1 engineer, 1 product/financial/operator)
- $100,000 per person per year (intentionally below market)
- Total with taxes, benefits, operating expenses: ~$275,000–$300,000/year

### Sustainability Threshold
- At 3,000 paying users at $20/month = $720,000/year
- After variable costs (~$200,000/year) and operating expenses
- Comfortably supports salaries with buffer for marketing, tooling, uncertainty
- At $15/month: margins tighter but workable if usage stays within expectations

---

## Strategic Position

**This is explicitly not a defensible product in the traditional startup sense.**

The technology is replicable, and major players could build similar components.

The bet is not on moat, but on focus: large LLM providers are structurally disincentivized to build shared, cross-user mediation tools with independent memory because it conflicts with their retention models and product priorities.

**The realistic ambition is not dominance, but sustainability:** a niche, paid-only product for people who care deeply about communication, privacy, and continuity, run by a small team, without venture capital, debt, or growth pressure.

---

## Plain English Version

This is a tool for people who are trying to talk through something hard with someone else and don't want the conversation to fall apart.

Imagine you and another person — a partner, a family member, a coworker — are stuck in a loop. You keep misunderstanding each other, getting defensive, or talking past one another. This product gives you a neutral space where each of you can speak, be reflected accurately, and feel heard without having to manage the conversation yourselves.

**You don't talk directly to each other inside the app.** You each speak to the system. The system listens, helps clarify what you're trying to say, and then reflects it back in a calmer, more accurate way. It also checks understanding, helps surface where you agree, and gently points out where things are still unclear.

**The goal isn't to "win" or convince the other person. The goal is to actually understand each other.**

You can invite someone into a conversation with a simple link. They don't have to pay, and they don't have to set anything up beyond opening the app or website. The focus is on making it easy to show up and talk, not on onboarding or accounts. After the conversation ends, you'll get a clear summary of what was said, what you agreed on, and what still needs work.

Everyone can try the service for free a few times. During those early conversations, the system remembers what happened so you don't have to start over each time. If you decide to keep using it, you pay a monthly subscription. That subscription lets the system continue remembering past conversations and lets you have as many mediated conversations as you want.

**One important difference between this and other AI tools is where your history lives.** When people use most AI chat tools today, their conversations live inside that specific product. If they switch to a different AI, they have to start from scratch. With this tool, your conversation history lives in one place, separate from any single AI. That means the system can use different AI models behind the scenes without you losing continuity. You don't have to care which AI is being used. You just keep your shared understanding over time.

**This isn't meant to replace therapy or human mediation.** It's for everyday situations where people care about each other but struggle to communicate well. It's designed for people who value clarity, fairness, and being understood, and who want help slowing conversations down enough to actually connect again.

---

## Customization: Mediator Persona

Users can customize aspects of their mediator experience:
- **Create an image** — visual representation of their mediator
- **Change language** — support for different languages
- **Change tone** — adjust formality, warmth, directness

This allows the mediation experience to feel personal while maintaining neutrality and structure.
