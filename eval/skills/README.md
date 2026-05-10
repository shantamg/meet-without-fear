# MWF Eval Skills

These skills are specialist modules for MWF eval loops. This repo copy is the reviewable source of truth.

Codex discovers skills from its runtime skill directory, usually `${CODEX_HOME:-$HOME/.codex}/skills`. From the repo root, run this for all repo-backed eval skills:

```sh
scripts/install_mwf_eval_skills.sh
```

For gold-loop-only installs, run:

```sh
scripts/install_mwf_gold_skills.sh
```

Those commands symlink the runtime skill names to these repo-backed directories and refuse to overwrite existing non-symlink skill directories.

Current skill families:

- `mwf-gold-*`: partner-session gold-loop evaluation.
- `mwf-inner-thoughts-loop-actor`: Inner Thoughts scenario evaluation from the home composer.

See `eval/icm/references/skills-index.md` for the full skill map and runtime verification command.
