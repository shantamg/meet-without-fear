# Commands

Use these as the default command inventory for Inner Thoughts cycles.

```bash
scripts/install_mwf_eval_skills.sh
npm run check
npm run test
cd mobile && npm run check
cd backend && npm run check
```

For browser actor runs, prefer the `agent-browser` CLI from the actor skill. Record the exact app URL, backend URL, command, and run id in the scratch log.

If a command is unavailable or too broad for the current slice, record the attempted command and the narrower command used instead.
