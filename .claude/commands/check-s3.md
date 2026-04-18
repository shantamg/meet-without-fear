Note: MWF does not currently use S3 for core session data. This command is available for future use or for ad-hoc S3 debugging if S3 resources are added.

# Check S3 — Meet Without Fear Bucket

Query a meet-without-fear S3 bucket to verify uploads, inspect objects, or confirm what exists in storage.

## Arguments

`$ARGUMENTS` — What to check. Examples:
- (empty) → bucket-level summary (size, recent uploads, object count)
- `session <id>` → list objects under `sessions/<id>/`
- `recent` → objects uploaded in the last 24h
- `user <userId>` → recent uploads from a specific user (if keyed by user)
- `bucket <name>` → switch buckets (e.g., `bucket mwf-assets-dev-shantam`)

## Credentials

On the EC2 bot, credentials come from the `EC2-CloudWatch-Agent-Role` instance profile (`ReadOnlyAccess`). No env setup needed — `aws` CLI picks them up via IMDS automatically.

For local dev, set `AWS_PROFILE=mwf` or set `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` from `backend/.env`.

**SECURITY**: This is a read-only investigation skill. Never run `aws s3 rm`, `aws s3api delete-object`, or any mutating commands. The IAM role on EC2 denies these at the policy level.

## Bucket conventions

| Bucket | Purpose |
|--------|---------|
| (none configured) | MWF does not currently use S3 for core session data. Add bucket names here if/when introduced. |
| `slam-bot-memory` | Bot agent memory backups (if applicable) |

Example key prefixes for future buckets:
- `sessions/<sessionId>/...` — session-scoped objects
- `users/<userId>/...` — user-scoped objects

If the bucket has a lifecycle policy (e.g., 90-day expiration), objects older than that may already be gone (expected).

## Default summary (no arguments)

Run these in parallel:

```bash
# 1. Bucket size + object count (via CloudWatch metrics — cheap)
aws cloudwatch get-metric-statistics \
  --namespace AWS/S3 \
  --metric-name BucketSizeBytes \
  --dimensions Name=BucketName,Value=<bucket-name> Name=StorageType,Value=StandardStorage \
  --start-time "$(date -u -d '2 days ago' '+%Y-%m-%dT%H:%M:%SZ')" \
  --end-time "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
  --period 86400 --statistics Average

# 2. Recent uploads (last 10 under sessions/)
aws s3api list-objects-v2 \
  --bucket <bucket-name> \
  --prefix sessions/ \
  --max-items 50 \
  --query 'sort_by(Contents, &LastModified)[-10:].[Key,Size,LastModified]' \
  --output table
```

## Guided queries based on $ARGUMENTS

### `session <id>`
```bash
aws s3api list-objects-v2 \
  --bucket <bucket-name> \
  --prefix "sessions/<id>/" \
  --query 'Contents[].[Key,Size,LastModified,StorageClass]' \
  --output table
```

Cross-reference with the database: `SELECT id, status, "createdAt" FROM "Session" WHERE id = '<id>'`. If the DB references an S3 path but S3 returns no object, the upload failed or was lifecycled.

### `recent`
List recent uploads across the bucket to see what clients are actually pushing:
```bash
aws s3api list-objects-v2 \
  --bucket <bucket-name> \
  --prefix sessions/ \
  --query "Contents[?LastModified>='$(date -u -d '24 hours ago' '+%Y-%m-%dT%H:%M:%SZ')'].[Key,Size,LastModified]" \
  --output table
```

If this returns rows but the database shows no corresponding session rows, the upload succeeded but the pipeline failed to register it — check backend logs.

## Cross-referencing with the database

Typical investigation pattern when a user reports "my data isn't showing up":

1. `/check-db sessions for <user>` — find recent Session rows
2. `/check-s3 session <id>` for each session — verify object actually exists (if S3 is in use for this feature)
3. If S3 has the object but DB is missing the reference → pipeline failure, check Render logs
4. If S3 has no object and DB has no reference → upload never happened, check mobile/client logs
5. If S3 has no object but DB has the reference → object was lifecycled or deleted

## Output format

```
📦 S3 Check — [bucket]
[summary of findings]

[formatted object listings with timestamps and sizes]

🔗 Correlation
- DB rows matching: N
- S3 objects found: M
- [any mismatches flagged]
```
