# MWF Gold Skills

These skills are specialist modules for the MWF gold-loop eval machine. This repo copy is the reviewable source of truth.

Codex discovers skills from its runtime skill directory, usually `${CODEX_HOME:-$HOME/.codex}/skills`. From the repo root, run:

```sh
scripts/install_mwf_gold_skills.sh
```

That command symlinks the runtime skill names to these repo-backed directories and refuses to overwrite existing non-symlink skill directories.

See `eval/icm/references/skills-index.md` for the full skill map and runtime verification command.
