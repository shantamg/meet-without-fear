# Stage: Scan

## Input

- GitHub API access via `gh`
- Label to scan: `do-later`

## Process

1. **Fetch all open issues** with the `do-later` label:
   ```bash
   gh issue list --repo shantamg/meet-without-fear --label "do-later" --state open --json number,title,labels,createdAt,updatedAt,body --limit 200
   ```

2. **Group by category** using existing labels:
   - `bug` -- Bug reports
   - `security` -- Security/compliance issues
   - `enhancement` -- Feature requests
   - `research` -- Research or investigation tasks
   - `uncategorized` -- Issues with no category label

3. **Sort within each group** by age (oldest first -- these have waited longest)

4. **Build the scan manifest**: a structured list with:
   - Issue number, title, category
   - Age in days since creation
   - Labels currently applied
   - Brief body excerpt (first 200 chars)

## Output

Scan manifest: a categorized, age-sorted list of all do-later issues ready for evaluation.

If zero issues found, skip remaining stages and post a short "No do-later issues to review" message to Slack.

## Completion

Proceed to `stages/02-evaluate/` with the scan manifest.
