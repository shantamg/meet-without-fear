# MWF Gold Skills Index

The MWF gold-loop skills are part of the eval machine. The repo copy under `eval/skills/` is the source of truth so actor, scorer, reporter, tester, and improver behavior is reviewable in GitHub and diffable with product changes.

Codex discovers skills from its runtime skill directory, usually `${CODEX_HOME:-$HOME/.codex}/skills`. Run this setup command from the repo root to symlink the runtime skill names to the repo source:

```sh
scripts/install_mwf_gold_skills.sh
```

The installer refuses to replace an existing non-symlink runtime skill directory. Move or remove the local copy first if you intentionally want the repo skill to become canonical.

## Skills

| Skill | Repo Source | Runtime Symlink | Primary Use |
|---|---|---|---|
| `mwf-gold-loop-actor` | [`eval/skills/mwf-gold-loop-actor/SKILL.md`](../../skills/mwf-gold-loop-actor/SKILL.md) | `${CODEX_HOME:-$HOME/.codex}/skills/mwf-gold-loop-actor` | Drive one assigned participant side in `scripts/mwf_gold_loop.py` browser runs. |
| `mwf-gold-session-scorer` | [`eval/skills/mwf-gold-session-scorer/SKILL.md`](../../skills/mwf-gold-session-scorer/SKILL.md) | `${CODEX_HOME:-$HOME/.codex}/skills/mwf-gold-session-scorer` | Score run artifacts and write `score.json`. |
| `mwf-gold-session-reporter` | [`eval/skills/mwf-gold-session-reporter/SKILL.md`](../../skills/mwf-gold-session-reporter/SKILL.md) | `${CODEX_HOME:-$HOME/.codex}/skills/mwf-gold-session-reporter` | Synthesize live playthrough evidence into durable reports. |
| `mwf-gold-session-tester` | [`eval/skills/mwf-gold-session-tester/SKILL.md`](../../skills/mwf-gold-session-tester/SKILL.md) | `${CODEX_HOME:-$HOME/.codex}/skills/mwf-gold-session-tester` | Manual Codex Desktop browser playthroughs and DB/UI triage. |
| `mwf-gold-prompt-improver` | [`eval/skills/mwf-gold-prompt-improver/SKILL.md`](../../skills/mwf-gold-prompt-improver/SKILL.md) | `${CODEX_HOME:-$HOME/.codex}/skills/mwf-gold-prompt-improver` | Propose or patch prompt/product/eval-machine improvements after scoring. |

## Runtime Verification

Before relying on skill behavior in an autonomous ICM cycle, verify that each runtime skill path is a symlink to `eval/skills/<skill-name>`:

```sh
for skill in \
  mwf-gold-loop-actor \
  mwf-gold-session-scorer \
  mwf-gold-session-reporter \
  mwf-gold-session-tester \
  mwf-gold-prompt-improver
do
  target="$(readlink "${CODEX_HOME:-$HOME/.codex}/skills/$skill" || true)"
  case "$target" in
    */eval/skills/$skill) echo "$skill: repo-backed" ;;
    *) echo "$skill: not repo-backed ($target)" >&2; exit 1 ;;
  esac
done
```

If the runtime path is not repo-backed, either run `scripts/install_mwf_gold_skills.sh` or record the mismatch in the cycle report as an eval-machine risk.
