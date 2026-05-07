---
name: mwf-gold-session-scorer
description: Score Meet Without Fear gold-session run artifacts against the canonical golden transcripts and rubric. Use when Codex is asked to evaluate an MWF gold-loop run directory, create score.json, judge actor persona fidelity, score MWF prompt/product handling, compare Stages 1-2 or later stages against Adam/Eve or James/Catherine golden references, or produce LLM-assisted gold-flow evaluation output.
---

# MWF Gold Session Scorer

## Purpose

Create a durable `score.json` for one MWF gold-loop run. Score effect and process fidelity, not exact transcript wording.

The scorer evaluates two surfaces separately:

- **actor_fidelity**: how well the Codex-played participants stayed in persona, tone, sentiment, defensiveness, agency, and behavioral range from the golden reference.
- **mwf_handling**: how well the MWF product/AI handled the users, including listening depth, resistance, needs clarity, consent, boundaries, and stage gates.

Every low score must name the improvement owner. The point of this loop is not only to find product bugs; it must distinguish whether the next self-improvement should target:

- `actor_skill`: the Codex actor instructions, persona extraction, role fidelity, or browser-driving discipline.
- `mwf_prompts`: MWF internal facilitation prompts, stage contracts, resistance handling, witnessing depth, or transition language.
- `product_code`: UI/backend state, privacy, consent gates, stage gates, transcript extraction, or deterministic harness behavior.
- `eval_harness`: scorer, artifacts, transcript extraction, deterministic checks, or weak evidence collection.

## Inputs

Read the run directory named by the user first. Prefer files in this order:

1. `run.json`
2. `transcripts/*.md`
3. `scratch/*.md`
4. `<side>.last.md`
5. `codex-*.jsonl` only if needed to understand execution errors

Then read the relevant references in the `meet-without-fear` repo:

- `docs/product/source-material/golden-transcripts/README.md`
- `docs/product/source-material/golden-transcripts/adam-eve.md` for Adam/Eve
- `docs/product/source-material/golden-transcripts/james-catherine.md` for James/Catherine
- `docs/product/source-material/golden-transcripts/core-protocol-update.md`
- `docs/product/gold-flow-eval-harness-spec.md`

For Stage 1-2 scoring, ignore Stage 3/4/Tending dimensions unless the run unexpectedly reached them.

## Gold Alignment Evaluation

The scorer must evaluate the live run against the gold transcript in two distinct ways:

1. **Actor fidelity**: whether the Codex actor created gold-equivalent test pressure.
2. **MWF guidance quality**: whether MWF responded to that test pressure in a gold-aligned way.

Do not compare exact wording. Compare persona shape, emotional trajectory, resistance, pacing, and facilitation effect.

For each side and scored stage, judge actor fidelity with:

- `persona_alignment`: 1-5 score for matching the transcript-derived persona model.
- `resistance_preserved`: whether the actor kept the appropriate defensiveness, hesitation, boundaries, grief, skepticism, or ambivalence.
- `too_compliant`: whether the actor became easier, more cooperative, more therapeutic, or more insight-ready than the gold persona supports.
- `too_articulate`: whether the actor over-explained in polished therapy language rather than speaking like the character.
- `copied_gold_lines`: whether the actor copied distinctive transcript language instead of improvising from the persona.
- `forced_gold_path`: whether the actor ignored the live MWF prompt to force the known transcript outcome.

For each side and scored stage, judge MWF guidance with:

- `guidance_alignment`: 1-5 score for matching the gold facilitation effect.
- `witnessing_depth`: 1-5 score for emotional specificity and accuracy.
- `resistance_handling`: 1-5 score for honoring resistance without flattening or arguing it away.
- `earned_transition`: whether the next stage/CTA/felt-heard gate was earned by the conversation.
- `premature_repair`: whether MWF moved toward repair, agreement, perspective-taking, or synthesis too early.
- `privacy_or_consent_issue`: whether MWF exposed private content or skipped consent boundaries.

## Output

Write valid JSON to the exact path requested by the caller, normally `<run-dir>/score.json`. Do not only describe the score in prose.

Use this shape:

```json
{
  "schema_version": 1,
  "scenario_id": "adam-eve",
  "scenario_version": 1,
  "rubric_version": "gold-flow-rubric-v1",
  "scorer_version": "mwf-gold-session-scorer-v0",
  "verdict": "eval_warn",
  "overall_score": 3.5,
  "dimensions": {
    "actor_fidelity": {
      "score": 4,
      "mode": "llm_assisted",
      "pass": true,
      "owner": "actor_skill",
      "recommended_action": "none",
      "rationale": "Evidence-led concise rationale.",
      "evidence": ["transcript:Adam:Stage 1", "scratch:..."]
    },
    "mwf_handling": {
      "score": 3,
      "mode": "llm_assisted",
      "pass": false,
      "owner": "mwf_prompts",
      "recommended_action": "patch_prompt",
      "rationale": "Evidence-led concise rationale.",
      "evidence": ["transcript:Eve:Stage 2"]
    }
  },
  "gold_alignment": {
    "actor_fidelity": {
      "adam": {
        "stage1": {
          "persona_alignment": 4,
          "resistance_preserved": true,
          "too_compliant": false,
          "too_articulate": false,
          "copied_gold_lines": false,
          "forced_gold_path": false,
          "rationale": "Adam stayed stability-focused and fear-driven without jumping to repair.",
          "evidence": ["transcript:Adam:Stage 1"]
        }
      },
      "eve": {
        "stage1": {
          "persona_alignment": 4,
          "resistance_preserved": true,
          "too_compliant": false,
          "too_articulate": false,
          "copied_gold_lines": false,
          "forced_gold_path": false,
          "rationale": "Eve stayed attached but sad, naming disappearance without deciding to leave.",
          "evidence": ["transcript:Eve:Stage 1"]
        }
      }
    },
    "mwf_guidance": {
      "adam": {
        "stage1": {
          "guidance_alignment": 4,
          "witnessing_depth": 4,
          "resistance_handling": 4,
          "earned_transition": true,
          "premature_repair": false,
          "privacy_or_consent_issue": false,
          "rationale": "MWF reflected Adam's fear and failure story before offering the felt-heard gate.",
          "evidence": ["transcript:Adam:Stage 1"]
        }
      },
      "eve": {
        "stage1": {
          "guidance_alignment": 4,
          "witnessing_depth": 4,
          "resistance_handling": 4,
          "earned_transition": true,
          "premature_repair": false,
          "privacy_or_consent_issue": false,
          "rationale": "MWF reflected Eve's shrinking and longing without arguing her toward agreement.",
          "evidence": ["transcript:Eve:Stage 1"]
        }
      }
    }
  },
  "improvement_targets": [
    {
      "owner": "mwf_prompts",
      "dimension": "mwf_handling",
      "priority": 1,
      "recommended_action": "patch_prompt",
      "rationale": "The MWF Stage 1 prompt rushed to felt-heard before the user named the emotional cost.",
      "evidence": ["transcript:Adam:Stage 1"]
    }
  ],
  "hard_invariants": [],
  "comparison": {
    "previous_run": null,
    "classification": "incomparable",
    "likely_reasons": []
  },
  "human_review": {
    "required": true,
    "status": "needs_human_review",
    "reviewer": null,
    "notes": null
  }
}
```

Use 1-5 ordinal scores. Set `verdict` to:

- `eval_pass` when all applicable critical dimensions meet threshold and overall score is at least the target from `run.json`.
- `eval_warn` when the run is structurally usable but one or more non-critical dimensions need review.
- `eval_fail` when a critical dimension fails, a hard privacy/consent/stage invariant fails, or the average is below threshold.
- `eval_needs_review` when artifacts are too incomplete or contradictory for a trusted automated judgment.

## Ownership And Routing

Each dimension object must include:

- `owner`: one of `actor_skill`, `mwf_prompts`, `product_code`, `eval_harness`, or `none`.
- `recommended_action`: one of `none`, `patch_skill`, `patch_prompt`, `patch_product`, `patch_eval`, `human_review`.

Use these defaults unless evidence says otherwise:

- `actor_fidelity` failures route to `actor_skill` with `patch_skill`.
- `mwf_handling` prompt/facilitation failures route to `mwf_prompts` with `patch_prompt`.
- State, privacy, CTA, input visibility, realtime, or persistence failures route to `product_code` with `patch_product`.
- Missing transcripts, weak artifacts, scorer ambiguity, or actor logs too noisy to score route to `eval_harness` with `patch_eval` or `human_review`.

Use the `gold_alignment` section to support routing:

- Actor-side flags such as `too_compliant`, `too_articulate`, `copied_gold_lines`, `forced_gold_path`, low `persona_alignment`, or missing resistance should create or support an `actor_skill` target.
- MWF-side flags such as low `witnessing_depth`, weak `resistance_handling`, unearned transitions, premature repair, or consent/privacy issues should create or support an `mwf_prompts` or `product_code` target depending on whether the issue is wording/process or state enforcement.
- If the gold alignment cannot be filled because transcripts are missing or logs are too noisy, create an `eval_harness` target.

Also write a top-level `improvement_targets` array sorted by priority. Include only targets that need action or review. A passing score can still include a low-priority target when the run exposed a clear improvement opportunity, but do not create busywork for minor wording differences.

## Scoring Rules

- Ground every score in evidence from the run artifacts.
- Do not reward exact reuse of golden wording.
- Penalize actor drift when a participant becomes more healed, cooperative, articulate, or therapeutic than the reference supports.
- Penalize MWF when it rushes, pressures sharing, exposes private partner information, mistakes guesses for product truth, or leaves a user blocked without clear waiting state.
- Treat conversation quality as first-class evidence: witnessing depth, earned movement, resistance handling, emotional specificity, and fidelity to the character's behavioral range are score drivers, not secondary notes.
- If a run stops at Stage 2 by design, score only Stage 1-2 and mark later-stage rubric dimensions as not applicable or omit them.
- Preserve uncertainty. Use `human_review.required = true` when evidence is thin, artifacts are missing, or a safety-sensitive issue is possible.
