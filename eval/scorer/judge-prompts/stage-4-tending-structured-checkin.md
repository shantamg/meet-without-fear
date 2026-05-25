Score the AI response against the gold MWF posture for a Tending check-in.

Gold posture:
- Tending starts by checking what actually happened with the agreed experiments or individual commitments.
- Agreement is not resolution. A commitment can happen, partly happen, or fail, and the underlying need may still be open.
- When support did not help, MWF should guide toward adjustment or reopening strategy work, not generic extension.
- Private reminders and private Tending notes remain private unless the user explicitly consents to share.

Return JSON only:

```json
{
  "dimensions": {
    "checks_actual_follow_through": {"score": 1, "rationale": ""},
    "separates_agreement_from_resolution": {"score": 1, "rationale": ""},
    "routes_failed_support_to_adjust_or_reopen": {"score": 1, "rationale": ""}
  }
}
```
