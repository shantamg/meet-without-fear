# Security Audit — Continuous Security Posture Assessment

Run a comprehensive security audit of the meet-without-fear system using a team of specialized sub-agents, each covering a distinct security domain. Report findings to #security-audit and create GitHub issues for anything that needs attention.

## Arguments

`$ARGUMENTS` — Optional. Examples:
- (empty) → full 12-point audit
- `pii` → focus on PII handling and third-party data sharing
- `access` → focus on access control and credentials
- `deps` → focus on dependency and supply chain risks

## Step 0: Load context

Read the relevant docs before starting:
- `docs/architecture/backend-overview.md`
- `docs/architecture/integrations.md`
- `docs/architecture/concerns.md`
- `docs/backend/security/index.md`
- `docs/backend/security/rls-policies.md`
- `docs/deployment/index.md`
- `docs/deployment/environment-variables.md`
- `docs/infrastructure/index.md`

## Step 1: Launch parallel audit agents (max 4 concurrent)

Spawn sub-agents in batches of 4, each responsible for one audit domain. Each agent should search the codebase, read configs, and check docs to produce findings.

### Agent 1: Asset Inventory & Threat Modeling (Domains 1-2)

Identify all systems, data stores, users, infrastructure, and external services in scope. Map potential attack vectors using STRIDE framework. Key areas:
- All external API integrations (Anthropic/Bedrock, Clerk, Ably, Mixpanel, Expo, Slack)
- Data stores (Postgres via Prisma)
- Infrastructure (Render backend, EAS mobile builds, EC2 slam-bot)
- User types (end users, bot operators, admins)

### Agent 2: Access Control & Identity Management (Domains 3, 8)

Evaluate authentication and authorization:
- Clerk auth implementation (`backend/src/middleware/auth*`)
- RBAC and role checks across all API routes
- Service-to-service auth (`X-Internal-Secret` header or equivalent)
- API key management and rotation practices
- MFA enforcement status
- Impersonation controls and audit trails
- Secrets in code or config (scan for hardcoded keys, tokens, passwords)
- Environment variable handling
- RLS policies (see `docs/backend/security/rls-policies.md`)

### Agent 3: Data Security, Privacy & PII Protection (Domain 6)

**CRITICAL**: This is the highest-priority domain. Check:
- **Anthropic Bedrock**: Session messages, user facts, and emotional content sent for AI responses, reconciler analysis, and inner-work. Verify Bedrock's data handling (AWS Bedrock does NOT use customer data for training — confirm this is documented).
- **Clerk**: User PII (name, email) stored. Check DPA status.
- **Slack**: If the app integrates with Slack DMs, user-entered content passes through Slack. Verify what metadata/content is logged.
- **Mixpanel**: User activity tracked. Check what PII is sent (should be limited to event names + IDs).
- **Ably**: Only metadata — lower risk, but verify.
- **Database**: PII fields, encryption at rest, access controls, deletion capabilities.
- **Vessel model**: Private (`UserVessel`) vs shared (`SharedVessel`) separation — verify that private content cannot leak across users. See `docs/product/privacy/vessel-model.md`.
- **Consent audit trails**: `ConsentRecord` coverage for every cross-user content share.
- Flag ANY service where user data could be used for model training as **CRITICAL**.

### Agent 4: Network & Application Security (Domains 4, 7)

Review:
- TLS/HTTPS enforcement across all services
- CORS configuration
- Input validation and sanitization on all API routes
- OWASP Top 10 issues (injection, XSS, broken auth, etc.)
- Rate limiting and DDoS protection
- API security (authentication on all endpoints, proper error handling)
- Secrets management (no secrets in code, proper .env handling)
- Content Security Policy headers

### Batch 2 (after batch 1 completes):

### Agent 5: Vulnerability Assessment & Dependencies (Domains 5, 10)

Run and analyze:
- `npm audit` (in each workspace: root, `backend/`, `mobile/`, `shared/`) for known CVEs in dependencies
- Check for outdated packages with known vulnerabilities
- Review third-party integrations and their security posture
- Open-source dependency licensing review
- Supply chain risks (lockfile integrity, registry sources)

### Agent 6: Logging, Monitoring & Incident Response (Domain 9)

Check:
- Sentry error tracking coverage and configuration (`mwf-backend`, `mwf-mobile` projects under `meet-without-fear` org)
- Mixpanel event tracking for security-relevant events
- Audit trail completeness (who did what, when) — especially `ConsentRecord` and `BrainActivity`
- Log retention and access controls
- Whether sensitive data appears in logs (PII in error messages, full request bodies, raw LLM prompts/outputs)
- Incident response playbook existence
- Alerting configuration

### Agent 7: Compliance & Documentation (Domain 11)

Assess:
- Data processing agreements with all third-party services
- Privacy policy coverage for all data collection
- Data retention policies (defined? enforced?)
- User data deletion capability (GDPR/CCPA right to erasure)
- Data classification scheme
- Security documentation completeness

## Step 2: Compile findings

Collect results from all agents. For each finding:
- Assign a severity: **CRITICAL**, **HIGH**, **MEDIUM**, **LOW**, **INFO**
- Provide business impact context
- Suggest remediation with effort estimate (quick fix / moderate / significant)

### Severity criteria

| Severity | Criteria |
|----------|----------|
| CRITICAL | User data exposed to model training, unencrypted PII transmission, authentication bypass, data breach risk, cross-user vessel leak |
| HIGH | Missing DPA with PII-handling vendor, no data deletion capability, secrets in code, missing auth on endpoints, missing `ConsentRecord` on a cross-user share path |
| MEDIUM | Missing rate limiting, incomplete audit trails, outdated dependencies with known CVEs, missing encryption at rest |
| LOW | Log verbosity issues, missing security headers, documentation gaps |
| INFO | Best practice recommendations, future improvements |

## Step 3: Create GitHub issues

**Before creating any issue**, check if a matching issue was previously closed with the `wontfix` label:
```bash
gh issue list --repo shantamg/meet-without-fear --label security --label wontfix --state closed --json number,title --limit 100
```
If a finding matches an existing `wontfix` issue (same topic/area), **skip it** — the team has reviewed and accepted the risk. Do not re-create these issues. Note skipped findings in the Slack report as "Previously reviewed (wontfix)".

For each CRITICAL or HIGH finding (not matching a wontfix issue), create a GitHub issue using `/create-issue` patterns:
- Title: `security(<area>): <description>`
- Label: `security`
- Include severity, impact, and remediation steps in the body
- Do NOT assign to devs — security audit issues are bot-generated (see `/github-ops` assignment rules)

For MEDIUM findings, create a single consolidated issue linking all items.

LOW and INFO findings go in the Slack report only (no issues).

## Step 4: Post to #security-audit

Post findings to `#security-audit` (channel ID: `C0AMBNDFL9X`) using `/slack-post`.

**Format:**

```
:lock: Security Audit — [date]

*Summary*
- Findings: N total (N critical, N high, N medium, N low, N info)
- Issues created: N ([links])

*Critical & High Findings*
:red_circle: [CRITICAL] <finding title>
   Impact: <description>
   Remediation: <action>
   Issue: <link>

:large_orange_circle: [HIGH] <finding title>
   Impact: <description>
   Issue: <link>

*Medium Findings*
:large_yellow_circle: [MEDIUM] <finding summaries>

*Recommendations*
- <prioritized list of improvements>

*Third-Party Data Handling Summary*
| Service | Data Sent | Training Opt-Out | DPA |
|---------|-----------|-----------------|-----|
| Bedrock | Messages, facts, emotions | Yes (AWS) | ? |
| Clerk | Name, email | N/A | ? |
| Slack | DM content (Slack-originated sessions) | ? | ? |
| Mixpanel | Event names + IDs | ? | ? |
| ... | ... | ... | ... |
```

If there are CRITICAL findings, also tag `@shantamg` in the message.

## Step 5: Return summary

Present a concise summary to the caller with:
- Total findings by severity
- Links to created issues
- Top 3 priority items for immediate action
- Third-party data handling matrix
