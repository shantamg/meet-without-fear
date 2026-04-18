# Respond to GitHub PR Comment/Mention

You've been mentioned or someone commented on a PR you're involved with. Respond to the specific comment.

## Parse arguments

Extract from `$ARGUMENTS`:
- **PR number** (required) — first positional arg
- **Repo** (optional) — second positional arg, defaults to `shantamg/meet-without-fear`
- **Comment ID** (optional) — third positional arg
- **Comment Author** (optional) — fourth positional arg

The comment body is provided in the prompt context above the skill invocation. Look for "Comment Body:" in the prompt.

## Workflow

### Step 0: Acknowledge immediately

Before doing any research or heavy work, post a quick acknowledgment so the commenter knows you're on it. Choose an appropriate response based on what you can tell from the comment at a glance:

| Situation | Acknowledgment |
|---|---|
| Code change request | Reply: "On it — making that change now." |
| Question / investigation needed | Reply: "Looking into this..." |
| Bug report / issue | Reply: "Investigating..." |
| Simple question you can answer immediately | Skip this step — just answer directly |
| Approval / LGTM | Skip this step — no reply needed |

Post the acknowledgment reply using:
- For issue comments: `gh api repos/<repo>/issues/<PR>/comments -f body="..."`
- For review comments (if comment ID provided): `gh api repos/<repo>/pulls/<PR>/comments/<comment_id>/replies -f body="..."`

Then proceed with the full workflow below.

---

### If comment details were provided (comment ID + body in prompt):

1. **Get PR context** — Fetch enough context to give an informed response:
   ```bash
   gh pr view <number> --repo <repo> --json title,body,state,headRefName,baseRefName,files
   gh pr diff <number> --repo <repo>
   ```

2. **Analyze the comment** — Read the comment body from the prompt. Understand what is being asked or requested.

3. **Determine action** based on the comment:

| Comment type | Action |
|---|---|
| **Code change request** | Make the requested change, push to the PR branch, reply confirming the fix |
| **Question about the code** | Reply with a clear explanation, referencing specific files/lines |
| **Approval / LGTM** | No reply needed |
| **General feedback** | Acknowledge and reply thoughtfully |
| **Request for more info** | Provide the requested details |

4. **Respond** — Reply using the `/github-ops` PR comment reply patterns.

### If no comment details were provided (fallback):

1. **Discover the comment** — Fetch recent comments to find what needs a response:
   ```bash
   gh api repos/<repo>/pulls/<number>/comments --jq '.[-5:]'
   gh api repos/<repo>/issues/<number>/comments --jq '.[-5:]'
   gh api repos/<repo>/pulls/<number>/reviews --jq '.[-3:]'
   ```

2. **Identify the latest comment** requiring a response — find the most recent comment NOT from `slam-paws`.

3. Then follow steps 2-4 from above.

### If a code change was requested:

- Check out the PR branch
- Make the fix
- Commit and push
- Reply confirming what was changed

## Safety rules

1. Never force-push to someone else's branch
2. If the change is complex or ambiguous, ask for clarification in a comment rather than guessing
3. Keep replies concise and professional
4. If the PR is not yours and you're just mentioned, be helpful but don't make changes unless explicitly asked
