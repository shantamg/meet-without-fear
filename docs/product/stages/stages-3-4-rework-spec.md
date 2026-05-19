# Stages 3 & 4 Rework — Working Spec

> **Status: DRAFT / not-yet-implemented.** This is a working spec describing
> desired changes — it does not reflect current behavior. The living docs for
> current state are `stage-3-what-matters.md` and `stage-4-strategic-repair.md`
> in this directory. Promote / fold this in when the work lands.

This document captures work needed on Stage 3 (identifying my needs) and Stage 4
(working toward agreements), plus the boundary for what comes after. It is a
faithful transcription of a working conversation; it is not yet a final spec.

## Scope boundary

- **In scope for current work:** finish Stages 3 and 4 well, ending when the
  two parties have a set of agreements (the "boom, here's the summary" moment),
  including the ~10-day check-in piece that has already been added to the
  golden example.
- **Out of scope (next chunk of work):** Stage 5 / "tending" — the ongoing
  check-ins after agreements are made. Captured at the end of this doc so we
  don't lose it, but not part of the current build.
- We agreed we can't ship a version that ends before this point. If we don't
  end here, what happens next can't just be "go back to a previous stage" —
  it has to be another set of stages (a continuation). So this is the natural
  cut-off.

## Guiding principles (apply to both stages)

- **Never a three-way.** The user is always interacting with the AI, never
  with the other person directly. At the end, the AI presents "here's what you
  agreed to, here are the check-ins."
- **One thing at a time.** Don't present a wall of content. Walk the user
  through items one by one.
- **User helps build the result.** The final summary should feel like
  something the user co-created, not something thrown at them all at once.
- **Go back and fix.** The user should be able to revisit and edit prior
  items; the experience should be responsive (e.g. they can check on their
  list of things while working).
- **Anchor on what the user will pay attention to** — which is mostly their
  own needs. Start there before bringing in the other person's needs.

---

## Stage 3 — Identifying my needs

### What works today
- Stage 3 already tries to pull the user's needs out of them.
- Once needs are drafted, the system asks "are these your needs?"

### What's broken / what to fix

1. **Editing needs back and forth is hard right now.** The user wants to
   confirm and then iterate ("yeah, can we edit that?") and the current flow
   makes that painful. Fix the edit loop so users can comfortably refine the
   list before sending.
   - Once that's smooth: "boom, I send my needs."

2. **Needs are currently framed as blame / strategy aimed at the other
   person.** Example from the conversation: "I need to feel good, i.e. not
   feeling like Chantal's gonna show up and poop on my lawn." That is an
   attack on Chantal, not a need.
   - Reframe needs in **universal, NVC-style** terms that don't depend on the
     other person's actions.
     - Bad: "I don't want him to poop on my lawn."
     - Good: "I want my lawn to be clean / I want a healthy, clean space to
       live in."
   - This is the core NVC move: **separate the need from the strategy.**
     "Him not pooping on my lawn" is a strategy for meeting the underlying
     need. Stage 3's job is to tease out the need; strategies belong in
     Stage 4.
   - Practical implication: the model needs to detect needs that are phrased
     as "the other person doing/not doing X" and help the user reframe them.

### Stage 3 done = clean, universal needs list the user has confirmed and sent.

---

## Stage 4 — Working toward agreements

This is the bigger rework. The shape below is the target experience.

### The problem with the current shape
After the user sends their needs, they then receive a list of stuff from the
other person. If it shows up as a list, **the user probably won't engage with
it.** People don't engage well with a pile of someone else's stuff dropped on
them.

### Target shape: start with the user's own needs first

The system anchors the conversation around what the user will pay most
attention to — their own needs.

> "You said you had these three core needs you wanted to get resolved. We've
> got these. Let's start with number one."

For **each** of the user's needs, walk through it:

1. **Present the options on the table for that need.** Options come from
   **both** the user and the other person.
   - "Well, this one is one that *you* put up — do you want to go ahead and
     read it?"
   - Then the other person's options for the same need.
2. **Have a conversation about each option.** "What are your thoughts on
   that one — are you interested, are you not?"
3. **Confirm peace / check for more.** "It sounds like we've already got an
   option to meet that. Do you want to try for one more, or do you feel at
   peace with what's there?"
4. **If the user feels good:** "Great, that means this need is met. Let's go
   to your next one."
5. **If no options exist** for a given need (neither user nor other person
   came up with anything):
   - "We don't have any solutions here yet. Do you want me to come up with
     some potential options to meet this, or do you want to leave it for
     later?"

> Important: at this point we still haven't gone to the other person's needs.
> We're still just walking through the user's needs.

### Then: switch to the other person's needs

Once the user's needs are walked through, switch sides:

> "Okay, now — what's relevant for *you* to engage with on the other side?
> What are the needs they said they had, and let's talk about some of the
> options they put on the table."

Three kinds of items for the other person's needs:

1. **Things that are about the other person doing stuff** — not for the user
   to do. The AI should still **explain what the other person sees themselves
   doing** ("they'll decide which one they want to pick from that"), so the
   user understands, but the user isn't being asked to commit to anything
   here.
2. **Shared things the two of you could potentially do together** to meet
   the other person's need. For each, the user is asked whether they'd
   commit.
3. **Things the user themselves suggested** to meet the other person's
   needs. The AI plays these back: "You suggested this — are you still
   willing to commit to it?"

Walk through each, asking what the user could do to meet that need. If we
hit a need with **no options on either side**:

- The AI can take a stab at generating some options.
- If the user doesn't like any of those, agree to move on without an answer
  for that one.

### Final summary

At the end:

> "All right, based on everything you just said, here's my summary of what
> you guys are saying you want to do — this, this, this, and this. It meets
> these needs potentially, and we'll meet up again and talk in this time
> period. Here's what you're doing between now and then."

The user has co-built this throughout, so it's not dropped on them all at
once.

### Stage 4 quality checks the AI should run on the agreements

Before calling it done, the AI should evaluate the commitments:

- **What did we just have these people commit to?**
- **Is it feasible — can they actually do it?**
- **Is it measurable — can we check in later and see whether it's
  happening?**

This is what makes the agreements actually useful instead of "somebody said
it and they moved on."

### The 10-day check-in piece

The ~10-day check-in (already added in the golden example) is an essential
part of Stage 4's output. Agreements without follow-up rarely get followed
through on. The summary at the end of Stage 4 must include:

- The agreements themselves.
- The check-in cadence (e.g. ~10 days).
- What the user is doing in between.

---

## Out of scope, but captured: Stage 5 / "tending"

(Names/numbers TBD — could be "stage 5," could be "tending," whatever we
call it.)

After Stage 4 agreements exist, this is the ongoing follow-up loop:

- **Notifications / pings.** "Hey, just checking in to see how this is
  going. What's happening?"
- **If things are working:**
  > "He hasn't pooped on my lawn in three months."
  > "How do you feel?"
  > "That was the only thing I really cared about — I feel resolved."
  Then go check the *other* person's side: "He was having a hard time with
  one, two, three, four. You said you'd do this and this; you've done this
  but not that — is that something you can step up on now? Anything we can
  do to help?" Potentially adjust commitments ("we said twice a month, that
  felt like too much — let's try once a month") and set reminders.
- **If things aren't working:**
  > "He pooped on my lawn three times last week."
  > "Okay, so he's not keeping up his end. Any agreement based on him just
  > changing his actions isn't working. What other ideas can we come up with?"
  The session can essentially be re-opened — e.g. revisit the "fence" kind of
  options the user can do unilaterally. **It's not resolved until it's
  resolved.**
- **Reminders the user can opt into:** "Would you like me to set a reminder
  to check in halfway through the month?"

### Why this matters for the product

- For an individual user with no professional involved: it's what turns
  "we agreed to something" into "we actually followed through." Most
  agreements people make never get followed through on; the check-ins are
  what closes that gap.
- For therapists and enterprises: this is a major value unlock. A therapist
  can say "the things we agreed on — they're not doing X, they're not doing
  Y, got it." Then when the clients come in for the next session, the
  therapist already knows what to focus on. The AI handled the low-hanging
  fruit and surfaced the real challenges. That's "an excellent job of an
  assistant."

---

## Open questions / things to revisit

- Exact UX for editing needs back and forth in Stage 3.
- How aggressively the AI should reframe blame-shaped needs vs. asking the
  user to do it themselves.
- How option-generation by the AI is framed (when neither party has put
  options on the table) so it doesn't feel like the AI is steering the
  outcome.
- The naming and numbering of the post-Stage-4 "tending" phase.
