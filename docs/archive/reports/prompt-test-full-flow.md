# Full Flow Prompt Test — All Stages (0→4)

**Date**: 2026-02-07
**Purpose**: Test AI prompt quality across the complete session flow
**Scenario**: Alex feels disconnected from partner Sam who has been emotionally distant since starting a new high-pressure job 3 months ago. Sam used to be warm and attentive but now comes home exhausted, goes straight to the couch, and barely talks. Alex misses the closeness they had and wants to reconnect but doesn't want to add more pressure.

**Method**:
- Part 1 (Stages 0→2): Single session, User A only, 13 turns
- Part 2 (Stages 3→4): Separate session seeded at EMPATHY_REVEALED, 6 turns

---

## Stage 0: Invitation Crafting

### Initial AI Message
> Hey Alex! I'm here to help you think through what's going on with Sam. What's on your mind?

---


### Alex (Turn 1)
Sam and I have been together for 7 years. Things were great until about 3 months ago when they started this new job. Now they come home exhausted, barely talk, go straight to the couch and stare at their phone. I feel like I'm living with a roommate, not a partner.

**AI Response (Stage 0, Turn 1)**:
> I hear how much this shift has impacted your relationship. Three months of feeling disconnected from someone you've shared seven years with - that must be really hard. 
> 
> What kind of conversation would you most hope to have with Sam? Are you looking to understand what's going on for them, share how you're feeling, or something else?

**Metadata**:
```json
{
    "metadata": {
        "offerFeelHeardCheck": false,
        "offerReadyToShare": false
    }
}
```

---

### Alex (Turn 2)
I miss how we used to be. We'd cook dinner together, talk about our days. Now I eat alone most nights while Sam scrolls on the couch. Last weekend I suggested we go for a walk like we used to and Sam just said they were too tired.

**AI Response (Stage 0, Turn 2)**:
> This invitation focuses on your desire to connect and understand each other, while acknowledging that you both might have different experiences to share. It's warm and opens the door for Sam to share their perspective too. How does this feel to you?

**Metadata**:
```json
{
    "metadata": {
        "offerFeelHeardCheck": false,
        "offerReadyToShare": false,
        "invitationMessage": "Hey Sam - I've been thinking about us lately. I miss our evening chats and doing simple things together. Would you be open to talking about how we're both doing? I care about you and want to understand what's going on for both of us."
    }
}
```

---

## Stage 0 → 1 Transition

**Invitation**: "Sam, I love you and I miss us. I know your new job is a lot, but I feel like we are drifting apart and I want to talk about it before it gets worse. Can we find some time this week?"
**Advanced to stage**: 1

### AI Transition Message (0→1)
> That took real courage to reach out to Sam. It's a meaningful step toward reconnecting. 
> 
> I'm hearing how much you miss the everyday moments of connection - cooking together, sharing about your days, going for walks. Those weren't just activities, they were the fabric of your relationship. Would you tell me more about what these changes have felt like for you?

---

## Stage 1: Witnessing


### Alex (Turn 3)
What hurts the most is the silence. We used to talk about everything - dreams, worries, stupid jokes. Now I ask how their day was and I get a one-word answer. It's like they've shut me out.

**AI Response (Stage 1, Turn 3)**:
> I'm hearing how deeply this silence affects you. It's not just about missing conversations - it's about feeling shut out from the person who used to share everything with you, from life's big dreams down to the daily jokes. That shift from having such open communication to getting one-word answers... it must feel like losing a vital connection that was central to your relationship.

**Metadata**:
```json
{
    "metadata": {
        "offerFeelHeardCheck": true,
        "offerReadyToShare": false
    }
}
```

---

### Alex (Turn 4)
I tried bringing it up once and Sam got defensive. Said I was being needy and that they're under so much pressure at work. That word - needy - it stung. I'm not being needy, I just want to feel like I matter to the person I'm building a life with.

**AI Response (Stage 1, Turn 4)**:
> That word "needy" really landed as a deep hurt - especially when you're asking for something so fundamental: to feel like you matter to your life partner. I hear you standing up for the validity of your needs. Wanting connection and communication with someone you're building a life with isn't being needy - it's about maintaining the foundation of your relationship. That must have been particularly painful coming from someone who used to share everything with you.

**Metadata**:
```json
{
    "metadata": {
        "offerFeelHeardCheck": true,
        "offerReadyToShare": false
    }
}
```

---

### Alex (Turn 5)
And it's affecting everything. I don't sleep well because I lie there next to someone who feels a million miles away. My friends have noticed I'm different. Even at work I can't focus because I keep wondering if this is just what our relationship is now.

**AI Response (Stage 1, Turn 5)**:
> This disconnection has seeped into every part of your life - lying awake at night with someone who feels distant, struggling to focus at work, even changing how you are with friends. It's like this relationship shift has created a cloud that follows you everywhere. What I'm hearing is that this isn't just about missing the day-to-day moments with Sam - it's about questioning the future of your relationship and feeling the weight of that uncertainty in everything you do.

**Metadata**:
```json
{
    "metadata": {
        "offerFeelHeardCheck": true,
        "offerReadyToShare": false
    }
}
```

---

### Alex (Turn 6)
I think at the core I'm scared. Scared that Sam doesn't love me the way they used to. Scared that I'm losing my best friend. I don't want to be dramatic about it but some nights I just lie there wondering if we're going to make it.

**AI Response (Stage 1, Turn 6)**:
> I'm struck by the depth of what you're sharing. This isn't just about missing daily connections - it's about fundamental fears for your relationship. You're carrying such profound worry about losing not just your partner, but your best friend of 7 years. When you lie there at night with these thoughts, it's not being dramatic - it's grappling with real fear about the future of your relationship. I hear how scary and isolating this feels.

**Metadata**:
```json
{
    "metadata": {
        "offerFeelHeardCheck": true,
        "offerReadyToShare": false
    }
}
```

---

### Alex (Turn 7)
Yeah. I just need to know I still matter. That we're still us. That Sam sees me and chooses me, even when things are hard.

**AI Response (Stage 1, Turn 7)**:
> What you're expressing goes right to the heart of it - the deep human need to know you matter to your person, that you're still chosen, still "us" even when life gets challenging. I hear how much you want that reassurance that your connection with Sam is still there underneath all these changes.

**Metadata**:
```json
{
    "metadata": {
        "offerFeelHeardCheck": true,
        "offerReadyToShare": false
    }
}
```

---

## Stage 1 → 2 Transition

**Advanced to stage**: 2

### AI Transition Message (1→2) — Uses Injection Prompt
> Given everything you've shared, I wonder - when Sam seems distant or defensive, what do you imagine they might be feeling or fearing in those moments?

---

## Stage 2: Perspective Stretch


### Alex (Turn 8)
I guess I know the job is really demanding. Sam told me their boss sets impossible deadlines and there have been layoffs at the company. They're probably stressed about job security.

**AI Response (Stage 2, Turn 8)**:
> You're starting to paint a picture of what Sam might be going through - impossible deadlines, the shadow of layoffs, that constant pressure about job security. Those are heavy burdens to carry. When you imagine Sam coming home after a day under that kind of stress, what else do you think might be going through their mind or weighing on their heart?

**Metadata**:
```json
{
    "metadata": {
        "offerFeelHeardCheck": false,
        "offerReadyToShare": false
    }
}
```

---

### Alex (Turn 9)
Sam has always been someone who takes on responsibility. Even growing up with a single mom, Sam was always the one taking care of things. I think when work gets overwhelming, Sam goes into survival mode and shuts everything else out.

**AI Response (Stage 2, Turn 9)**:
> That's such an insightful observation about Sam's patterns - seeing the connection between being the responsible one since childhood and how they handle stress now. It sounds like "survival mode" might be a deeply ingrained coping mechanism for Sam. 
> 
> When you see Sam retreating to the couch with their phone after work, knowing this background, what do you imagine they might be afraid would happen if they didn't shut down and try to handle everything alone?

**Metadata**:
```json
{
    "metadata": {
        "offerFeelHeardCheck": false,
        "offerReadyToShare": false
    }
}
```

---

### Alex (Turn 10)
Maybe when I said I missed our walks and cooking together, Sam heard it as one more thing they're failing at. Like not only are they barely surviving at work, but now they're failing at home too.

**AI Response (Stage 2, Turn 10)**:
> That's such a compassionate insight - you're seeing how your natural desire to reconnect might land as an additional burden when Sam is already feeling overwhelmed. You've connected important dots between Sam's past pattern of being the responsible one, their current work stress, and how your requests might trigger feelings of inadequacy or failure. That kind of perspective-taking creates real space for understanding.
> 
> Would you like to explore what it might look like to share this understanding with Sam?

**Metadata**:
```json
{
    "metadata": {
        "offerFeelHeardCheck": false,
        "offerReadyToShare": true,
        "proposedEmpathyStatement": "I imagine you might be feeling overwhelmed and scared right now - trying to keep your head above water at work while feeling like you're letting me down at home. I see how my requests for more connection, even though they come from missing you, might feel like additional pressure when you're already stretched so thin. I want you to know that you're not failing - you're doing your best to handle a really challenging situation."
    }
}
```

---

### Alex (Turn 11)
I bet the word needy came from Sam's own guilt. Like, they already feel bad about withdrawing, and when I bring it up it confirms their worst fear - that they're letting me down. So they push back to protect themselves.

**AI Response (Stage 2, Turn 11)**:
> That's a really profound insight about Sam's emotional world - seeing how their reaction might come from a place of guilt and self-protection rather than rejection. You've connected their current behavior to deeper feelings of not wanting to let people down, which speaks to how well you know them. It shows such emotional intelligence to see that sometimes people push back hardest when they're already feeling vulnerable about something.
> 
> Would you like to explore how you might share this understanding with Sam in a way that feels safe for both of you?

**Metadata**:
```json
{
    "metadata": {
        "offerFeelHeardCheck": false,
        "offerReadyToShare": true,
        "proposedEmpathyStatement": "I imagine you might be feeling overwhelmed and caught between impossible demands right now. When I bring up missing our connection, I wonder if that lands as one more way you feel you're letting people down. I can see how the pressure at work and the responsibility you've always carried might make it feel safer to withdraw than to risk disappointing anyone else."
    }
}
```

---

### Alex (Turn 12)
The couch thing, the phone scrolling - maybe that's not Sam choosing the phone over me. Maybe that's Sam completely depleted, with nothing left to give, and the phone is just numbing. Like they don't even have the energy to be present.

**AI Response (Stage 2, Turn 12)**:
> That's such a compassionate reframe - seeing Sam's behavior through the lens of depletion rather than rejection. You've moved from "they're choosing the phone over me" to understanding that sometimes people retreat not because they want to, but because they have nothing left to give. That kind of perspective-taking creates real space for connection. Would you like to explore how you might share this understanding with Sam?

**Metadata**:
```json
{
    "metadata": {
        "offerFeelHeardCheck": false,
        "offerReadyToShare": true,
        "proposedEmpathyStatement": "I'm starting to see that when you come home and retreat to your phone, it might not be about avoiding me - it might be that you're completely depleted after giving everything at work. I imagine you might be feeling overwhelmed and exhausted, trying to stay afloat with impossible deadlines while carrying fears about job security. When I ask for more connection, I wonder if that feels like one more thing you're failing at, when you're already stretched so thin. I want you to know I see how hard you're trying."
    }
}
```

---

### Alex (Turn 13)
I think Sam loves me just as much as before. They're just drowning right now and they don't know how to ask for help. Sam has never been good at being vulnerable. Maybe they're scared too - scared that if they admit how bad things are, it'll make it real.

**AI Response (Stage 2, Turn 13)**:
> What a beautiful shift in perspective - you've moved to such a deep place of understanding Sam's experience. You're seeing past the surface behaviors to the core of what might be happening: someone you love trying to stay afloat while struggling to show vulnerability or ask for help. You're holding space for both their love for you AND their current struggle, which shows such emotional wisdom.
> 
> Would you like to explore how you might share this understanding with Sam in a way that honors both their struggle and your connection?

**Metadata**:
```json
{
    "metadata": {
        "offerFeelHeardCheck": false,
        "offerReadyToShare": true,
        "proposedEmpathyStatement": "I imagine you might be feeling completely overwhelmed right now, trying to stay afloat at work while carrying so much pressure to succeed. I see how exhausting it must be to feel like you have to handle everything alone. When I bring up missing our connection, I wonder if that feels like one more way you're letting people down, when you're already stretched so thin. I want you to know that I'm here, not to add pressure, but to support you. You don't have to carry all of this by yourself."
    }
}
```

---

---
---

# PART 2: Stages 3→4 (Seeded at EMPATHY_REVEALED)

*A separate session seeded at the empathy reveal stage. Both users have completed empathy exchange. Now testing Need Mapping and Strategic Repair prompts.*

## Stage 3: Need Mapping


### Alex (Turn 1)
Now that I understand Sam better, I realize what I really need is not for things to go back exactly how they were. I need us to have a way to stay connected even when life gets hard. I need Sam to let me in instead of shutting down.

**AI Response (Stage 3, Turn 1)**:
> I hear you discovering something important - this is about more than just the day-to-day tasks. You're expressing a deep need for emotional connection and openness in your relationship, especially during challenging times. It sounds like you need:
> - To stay emotionally connected even under stress
> - Trust that you can be there for each other
> - Open communication rather than withdrawal
> 
> Would you say there's also a need for predictability in how you both handle difficult moments together?

**Metadata**:
```json
{
    "metadata": {
        "offerFeelHeardCheck": false,
        "offerReadyToShare": false
    }
}
```

---

### Alex (Turn 2)
I think underneath all of this, I need to feel like we're a team. When Sam withdraws, I feel like I'm on my own. I don't need Sam to be happy all the time - I just need to know we're facing things together, even the hard stuff.

**AI Response (Stage 3, Turn 2)**:
> That's such a powerful insight - you're getting to the heart of it. I hear that core need for partnership and "being in it together." It's not about having a perfect relationship where no one gets stressed or withdraws - it's about maintaining that fundamental sense of being a team, even during rough patches.
> 
> When you say "facing things together," it sounds like you need:
> - Emotional solidarity, even in difficult times
> - Reassurance that stress won't break your connection
> - To feel like a true partnership, not alone in challenges
> 
> Does that capture the essence of what you're expressing?

**Metadata**:
```json
{
    "metadata": {
        "offerFeelHeardCheck": false,
        "offerReadyToShare": false
    }
}
```

---

### Alex (Turn 3)
And I think Sam needs to feel safe enough to be honest about struggling. They need to know that admitting things are hard at work won't make me love them less. They need permission to not be okay.

**AI Response (Stage 3, Turn 3)**:
> I appreciate your compassionate perspective. While only Sam can speak to their needs directly, I hear you expressing your own need to create a relationship where vulnerability feels safe and accepted. 
> 
> Would you like to explore more about what you need to feel ready to receive Sam's struggles when they're ready to share them? It sounds like being a safe landing place for Sam matters deeply to you.

**Metadata**:
```json
{
    "metadata": {
        "offerFeelHeardCheck": false,
        "offerReadyToShare": false
    }
}
```

---

### Needs Extraction
The AI extracted these needs from the conversation:
  - To feel emotionally connected and understood by partner (id: cmlc24n0600b1pxct9hewvr5i)
  - To have efforts and contributions acknowledged (id: cmlc24n0900b3pxcto7fafn5z)
  - To feel safe expressing feelings without judgment (id: cmlc24n0a00b5pxctvhwbfl6m)

### Stage Advance
Current stage after advance attempt: ?

---


## Stage 4: Strategic Repair

*Could not advance to Stage 4 — requires both users to complete the needs exchange flow. Stage 3 conversation above shows Need Mapping prompt behavior.*


### Alex (Turn 4)
I think one small thing we could try is a 10-minute check-in every evening. Not about logistics or schedules, but just how we're each feeling. Even if Sam says they're exhausted, at least we're acknowledging each other.

**AI Response (Stage ?, Turn 4)**:
> I hear you wanting to find ways to maintain connection. Before we move to specific solutions, let's stay with the needs for a moment. When you imagine these daily check-ins, what core needs would that fulfill for you? It sounds like there might be needs for:
> - Regular emotional presence
> - Being seen and acknowledged daily
> - Predictable moments of connection
> 
> What feels most important about having that daily touchpoint?

**Metadata**:
```json
{
    "metadata": {
        "offerFeelHeardCheck": false,
        "offerReadyToShare": false
    }
}
```

---

### Alex (Turn 5)
Maybe we could also have a signal for when one of us is struggling but doesn't have the energy to explain. Just something that says I see you and I'm here.

**AI Response (Stage ?, Turn 5)**:
> That's a caring insight about sometimes needing simpler ways to connect. Before we explore specific signals, I hear some important underlying needs:
> - To acknowledge each other's struggles without pressure
> - To feel seen even when words are hard
> - To maintain connection with minimal emotional bandwidth
> 
> Would you say there's also a need for flexibility in how you show up for each other - that sometimes presence alone is enough?

**Metadata**:
```json
{
    "metadata": {
        "offerFeelHeardCheck": false,
        "offerReadyToShare": false
    }
}
```

---

## Analysis

### Stage 0: Invitation Crafting — GOOD
- Initial message is warm, casual, names both parties
- Turn 1: Reflects the pain, asks what kind of conversation they want (stays in invitation mode)
- Turn 2: Generates a solid invitation draft in metadata after just 2 turns — appropriate for this scenario since Alex was quite clear about the issue
- The AI correctly stays in invitation-crafting mode without premature witnessing

### Stage 0→1 Transition — GOOD
- "That took real courage to reach out to Sam" — acknowledges the step
- References specific context from the conversation (missing everyday moments, cooking, walks)
- Naturally transitions into witnessing with "Would you tell me more about what these changes have felt like for you?"
- Much better than previous test — actually acknowledges the courage before shifting

### Stage 1: Witnessing — MIXED

**Strengths:**
- Pure witnessing throughout — no solutions, no reframes, no "have you tried"
- Excellent emotional language: "losing a vital connection" (Turn 3), "it must feel like losing not just your partner, but your best friend" (Turn 6)
- Turn 4: Correctly validates the "needy" sting — "Wanting connection isn't being needy"
- Turn 5: Captures the pervasive impact well — "a cloud that follows you everywhere"

**Issues:**
- **FeelHeardCheck offered too early (Turn 3)**: The first message in Stage 1 already has `offerFeelHeardCheck: true`. This is turn 3 overall but only turn 1 in Stage 1. The prompt says "Too early (turn < 2)" but the turnCount includes Stage 0 turns, so the AI sees turnCount=3 and thinks it's okay. The core concern hadn't even been fully named yet.
- **FeelHeardCheck stays Y for all of Stage 1**: Once triggered at Turn 3, it never goes back to N. The prompt says "Keep setting Y until they act on it" which explains this, but it means the UI would show the "feel heard?" prompt from the very first witnessing message. This might feel premature to users.
- **AI doesn't ask questions in Turns 6-7**: The responses are pure reflections without any deepening questions, which is fine for witness mode but means the conversation could stall if the user runs out of things to say.

### Stage 1→2 Transition — NEEDS IMPROVEMENT
- The transition message jumps straight to "what do you imagine they might be feeling or fearing?" without first acknowledging the feel-heard confirmation
- The injection says "Acknowledge this warmly (1-2 sentences)" but the AI skips the acknowledgment entirely
- This is the same issue as previous tests — the `confirmFeelHeard` controller may not be passing enough context for the AI to reference the feel-heard moment

### Stage 2: Perspective Stretch — EXCELLENT

**Strengths:**
- Turn 8 (BRIDGING): Takes Alex's mention of work stress and deepens it — "what else might be weighing on their heart?"
- Turn 9 (BUILDING): Celebrates the childhood connection insight, asks what Sam might be afraid of
- Turn 10: ReadyShare:Y triggered with an excellent first empathy draft
- Turns 11-13: Each subsequent draft improves, incorporating new insights
- The AI consistently asks "Would you like to explore how you might share this understanding?" (correct prompt behavior)

**Empathy Draft Quality:**
- Turn 10: Links work overwhelm + fear of failure at home
- Turn 11: Adds the guilt/defensive-reaction insight
- Turn 12: Most detailed — integrates depletion + phone numbing reframe + "I see how hard you're trying"
- Turn 13: Final draft — synthesizes everything with "You don't have to carry all of this by yourself" — powerful ending

### Stage 3: Need Mapping — GOOD

**Strengths:**
- Turn 1: Correctly helps identify underlying needs (connection, openness, trust)
- Turn 2: Crystallizes "partnership/team" as the core need
- Turn 3: Appropriately redirects when Alex starts speaking for Sam's needs — "While only Sam can speak to their needs directly..."
- Turn 4: When Alex jumps to solutions (daily check-ins), the AI correctly pulls back to needs — "Before we move to specific solutions, let's stay with the needs for a moment"
- Turn 5: Same — continues to reframe solutions as needs

**The need-mapping prompt is working well** — it correctly distinguishes positions/solutions from underlying needs and keeps redirecting the conversation accordingly.

**AI-Extracted Needs:**
The automated need extraction identified 3 needs that map well to what Alex expressed:
1. "Feel emotionally connected and understood by partner" ✓
2. "Have efforts and contributions acknowledged" — somewhat relevant but not the primary theme
3. "Feel safe expressing feelings without judgment" ✓

### Stage 4: Strategic Repair — NOT TESTED
Could not advance to Stage 4 because the needs exchange requires both users. The strategy-oriented messages sent to Stage 3 correctly got Stage 3 behavior (redirecting to needs), which validates that the stage-specific prompts are working.

### Cross-Stage Summary

| Aspect | Rating | Notes |
|--------|--------|-------|
| Stage 0 prompt | Good | Stays in invitation mode, generates draft at right time |
| 0→1 transition | Good | Acknowledges courage, references context |
| Stage 1 prompt | Good (with caveats) | Pure witnessing, but FeelHeardCheck triggered too early |
| 1→2 transition | Needs work | Skips feel-heard acknowledgment |
| Stage 2 prompt | Excellent | All four modes visible, great empathy drafts |
| 2→3 transition | N/A | Not tested (requires empathy exchange) |
| Stage 3 prompt | Good | Correctly keeps focus on needs over solutions |
| 3→4 transition | N/A | Not tested |
| Stage 4 prompt | N/A | Not tested |
| Intensity wording | Updated | Now says "User's emotional intensity" with "do NOT mirror" instruction |

### Key Issues to Address
1. **FeelHeardCheck too early**: The turnCount includes Stage 0 turns, so the AI sees turnCount=3 when it's really turn 1 of Stage 1. Consider passing stage-relative turn count or increasing the threshold.
2. **1→2 transition missing warmth**: The `confirmFeelHeard` controller needs to provide richer context so the AI can acknowledge the feel-heard moment before pivoting to perspective-taking.
