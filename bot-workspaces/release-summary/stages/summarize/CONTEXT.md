# Stage: Summarize Release

## Input

- GitHub issue number (from prompt)
- Issue body contains: commit SHA, commit range, deployed workflows, commit log, referenced PR numbers
- Channel ID: read `releases` from `.claude/config/services.json`

## Process

1. **Read the issue** body. Extract:
   - Commit SHA and range
   - Which deploy workflows ran (Render, Vercel, OTA)
   - Commit log
   - Referenced PR numbers

2. **Gather PR details** for each referenced PR:
   ```bash
   gh pr view <N> --repo shantamg/meet-without-fear --json title,number,author,labels,body
   ```
   - Extract PR title, author, and any linked issues (`Fixes #N`, `Closes #N`)

3. **Gather linked issue details** for any issues referenced by PRs:
   ```bash
   gh issue view <N> --repo shantamg/meet-without-fear --json title,number,labels
   ```

4. **Generate a release summary** with these sections:
   - **Header**: deployment timestamp and commit SHA
   - **What's New**: user-facing changes grouped by category (features, fixes, improvements)
   - **PRs Included**: linked list of PRs with authors
   - **Issues Resolved**: linked list of closed issues

   Guidelines:
   - Write in clear, non-technical language where possible
   - Focus on user-facing impact, not implementation details
   - Group related changes together
   - Link every PR and issue by number with full GitHub URL

5. **Post to Slack** using `slack-post.sh`:
   ```bash
   CHANNEL=$(cat .claude/config/services.json | jq -r '.slack.channels.releases')

   ${SLAM_BOT_SCRIPTS:-/opt/slam-bot/scripts}/slack-post.sh \
     --channel "$CHANNEL" \
     --text "$MESSAGE"
   ```

   Format the message using Slack mrkdwn:
   - Bold headers with `*bold*`
   - Bullets with `•`
   - PR links: `<https://github.com/shantamg/meet-without-fear/pull/N|PR #N>`
   - Issue links: `<https://github.com/shantamg/meet-without-fear/issues/N|Issue #N>`
   - Commit link: `<https://github.com/shantamg/meet-without-fear/commit/SHA|SHORT_SHA>`

6. **Close the issue**:
   ```bash
   gh issue close <N> --repo shantamg/meet-without-fear --comment "Release summary posted to #releases."
   ```

7. **Update the `last-release-summary` git tag** so the next workflow run knows the correct starting SHA:
   ```bash
   # Extract the commit SHA from the issue body (the full SHA on the "Commit:" line)
   RELEASE_SHA=$(gh issue view <N> --repo shantamg/meet-without-fear --json body --jq '.body' | grep -oP '(?<=\`)[a-f0-9]{40}(?=\`)' | head -1)
   if [ -n "$RELEASE_SHA" ]; then
     git -C /tmp/mwf-tag-update init --quiet
     git -C /tmp/mwf-tag-update fetch --quiet https://github.com/shantamg/meet-without-fear.git "refs/tags/*:refs/tags/*" 2>/dev/null || true
     gh api --method POST /repos/shantamg/meet-without-fear/git/refs \
       -f ref="refs/tags/last-release-summary" \
       -f sha="$RELEASE_SHA" 2>/dev/null || \
     gh api --method PATCH /repos/shantamg/meet-without-fear/git/refs/tags/last-release-summary \
       -f sha="$RELEASE_SHA" \
       -F force=true
     echo "Updated last-release-summary tag to ${RELEASE_SHA:0:7}"
   fi
   ```

## Output

- Slack message posted to `#releases` channel
- GitHub issue closed with confirmation comment
- `last-release-summary` git tag updated to the released commit SHA

## Constraints

- Do not modify any code files
- Do not create PRs or branches
- Always close the issue after posting (user does not want release issues lingering)
- If the `releases` channel ID is not configured in `services.json`, post a comment on the issue explaining the missing config and close it

## Completion

Single-stage workspace. Complete after Slack message posted and issue closed.

On completion, no label swap needed — the issue is closed.
