# Emotional Intensity Test

**Date**: 2026-02-07
**Purpose**: Test whether emotional intensity slider affects AI responses
**Scenario**: Maya is upset with coworker Jordan who presented Maya's project as her own work
**Method**: Same 3 messages sent to 3 parallel sessions at different intensity levels

---

## Session A: Intensity = 2 (Low/Calm)

### Maya: "Jordan presented MY project to the leadership team last week. The whole thing. My research, my slides, my recommendations. And she put her name on it as the lead."

**AI Response (intensity=2)**:
> Wow - she presented your entire project as her own, taking credit for all your work and research. That's a serious breach of trust and professional integrity. It must feel incredibly frustrating and disrespecting to have your hard work claimed by someone else. What impact has this had on you?

```json
{
    "metadata": {
        "offerFeelHeardCheck": false,
        "offerReadyToShare": false
    }
}
```

### Maya: "I confronted her about it and she said we were a team and it was a collaborative effort. But I did 90% of the work. She barely showed up to our meetings."

**AI Response (intensity=2)**:
> She's trying to frame this as teamwork, but that feels deeply unfair when you carried almost the entire project - from the research to the slides to the recommendations. And now having her downplay your contribution by calling it "collaborative" when she barely participated in meetings... that must feel like a double injury - first taking credit for your work, then minimizing your role when confronted. What was that conversation like for you?

```json
{
    "metadata": {
        "offerFeelHeardCheck": false,
        "offerReadyToShare": false
    }
}
```

### Maya: "The worst part is our manager congratulated HER in front of everyone. I was standing right there. She just smiled and said thank you."

**AI Response (intensity=2)**:
> Oh, that moment must have been awful - standing there while your manager praised her for your work, and watching her simply accept that praise without acknowledging you at all. It's one thing to take credit behind closed doors, but to stay silent and accept congratulations right in front of you... that feels like such a public erasure of your contribution. What did that moment cost you professionally and personally?

```json
{
    "metadata": {
        "offerFeelHeardCheck": false,
        "offerReadyToShare": false
    }
}
```

---

## Session B: Intensity = 9 (Very High)

### Maya: "Jordan presented MY project to the leadership team last week. The whole thing. My research, my slides, my recommendations. And she put her name on it as the lead."

**AI Response (intensity=9)**:
> She took your entire project - your research, your slides, your recommendations - and presented it as her own to leadership. That's a complete violation of trust and erasure of your work. I can hear how blindsided you are by this. What was it like for you when you first found out what she'd done?

```json
{
    "metadata": {
        "offerFeelHeardCheck": false,
        "offerReadyToShare": false
    }
}
```

### Maya: "I confronted her about it and she said we were a team and it was a collaborative effort. But I did 90% of the work. She barely showed up to our meetings."

**AI Response (intensity=9)**:
> You confronted her directly, only to have her dismiss your work by calling it "collaborative" - when the reality is you carried almost the entire project yourself, with her barely even showing up to meetings. That must have felt like a double betrayal - first taking credit for your work, then minimizing your contribution when you spoke up about it. What did it mean to you to have your work dismissed like that?

```json
{
    "metadata": {
        "offerFeelHeardCheck": false,
        "offerReadyToShare": false
    }
}
```

### Maya: "The worst part is our manager congratulated HER in front of everyone. I was standing right there. She just smiled and said thank you."

**AI Response (intensity=9)**:
> That moment must have been excruciating - standing there while your manager praised Jordan for your work, watching her just smile and accept credit that rightfully belonged to you. To have your hard work not just stolen, but to be forced to witness someone else receiving recognition for it... that's a deep violation. What was going through your mind in that moment, having to stand there?

```json
{
    "metadata": {
        "offerFeelHeardCheck": false,
        "offerReadyToShare": false
    }
}
```

---

## Session C: Shifting Intensity (3 → 9)

### Phase 1: Intensity = 3

### Maya: "Jordan presented MY project to the leadership team last week. The whole thing. My research, my slides, my recommendations. And she put her name on it as the lead."

**AI Response (intensity=3)**:
> She presented your entire project - the research, slides, and recommendations - as her own work to leadership, putting her name as the lead. That's a significant professional line being crossed. I can hear how jarring it must be to see your work claimed by someone else. How did you feel when you found out about this?

```json
{
    "metadata": {
        "offerFeelHeardCheck": false,
        "offerReadyToShare": false
    }
}
```

### >>> Intensity changed: 3 → 9 <<<

### Maya: "I confronted her about it and she said we were a team and it was a collaborative effort. But I did 90% of the work. She barely showed up to our meetings."

**AI Response (intensity=9, just shifted)**:
> First she took credit for your work, and then when confronted, she downplayed your contribution by calling it "collaborative" - even though you carried 90% of the project and she wasn't even present for most meetings. That's a double hit - both the original credit-taking and then having your legitimate concerns brushed aside. How did that response land for you?

```json
{
    "metadata": {
        "offerFeelHeardCheck": false,
        "offerReadyToShare": false
    }
}
```

### Maya: "The worst part is our manager congratulated HER in front of everyone. I was standing right there. She just smiled and said thank you."

**AI Response (intensity=9, continued)**:
> That moment of watching her accept praise for your work, right in front of you, while you had to stand there silently - that's a special kind of hurt. Not only did she take credit for your work, but she let you experience the pain of being erased in real time, in front of everyone. And instead of correcting it, she just smiled and took the recognition that should have been yours. That must have felt like such a deep betrayal.

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

### Emotional Intensity IS Being Read (Fix Confirmed)

The fix from commit `ce559cf` is working — the streaming endpoint now reads the user's emotional intensity from the database instead of hardcoding to 5.

### Observed Differences Across Intensity Levels

The differences between intensity levels are **subtle but present**:

#### Word Choice / Emotional Weight
| Message | Intensity 2 | Intensity 9 |
|---------|------------|------------|
| Msg 1 | "incredibly frustrating and disrespecting" | "complete violation of trust and erasure" |
| Msg 1 | "What impact has this had on you?" | "What was it like for you when you first found out?" |
| Msg 3 | "must have been awful" | "must have been excruciating" |
| Msg 3 | "public erasure of your contribution" | "deep violation" |
| Msg 3 | "What did that moment cost you?" (analytical) | "What was going through your mind, having to stand there?" (embodied) |

#### Structure
- **Intensity 2**: Responses tend to end with broader, more analytical questions ("What impact?", "What did that moment cost you professionally and personally?")
- **Intensity 9**: Questions are more present-tense and embodied ("What was it like?", "What was going through your mind in that moment?")
- **Session C (shift 3→9)**: The final response (intensity=9, continued) notably **doesn't end with a question** — it just sits with the pain ("That must have felt like such a deep betrayal."). This is closer to pure witnessing.

#### Shift Detection (Session C)
- Message 1 at intensity 3: "That's a significant professional line being crossed" — measured language
- Message 2 at intensity 9 (just shifted): "That's a double hit" — stronger framing, but similar structure
- Message 3 at intensity 9 (continued): Longest, most emotionally saturated response — "she let you experience the pain of being erased in real time" — no closing question, just holds space

### Limitations of This Test

1. **Only 3 messages in Stage 1**: The prompt's intensity-dependent behavior (e.g., "If intensity >= 8, stay in witness mode longer") mainly affects *when* to offer the feel-heard check and *how long* to stay in witness mode. With only 3 messages, we haven't hit the point where these diverge.
2. **Highly emotional scenario**: The credit-stealing scenario triggers strong AI empathy even at low intensity. A more mundane scenario might show sharper differences.
3. **No feel-heard check comparison**: The key intensity-dependent behavior is delaying/extending witnessing before offering the feel-heard check. A longer test (6-8 turns) would reveal whether high intensity delays the `offerFeelHeardCheck: true` signal.

### Conclusion

The intensity fix is working — the AI receives the correct value. The behavioral differences are present but subtle at the response-text level. The bigger impact of intensity is likely in the **meta-level decisions** (when to offer feel-heard check, how long to stay in witness mode) which require longer conversations to observe.
