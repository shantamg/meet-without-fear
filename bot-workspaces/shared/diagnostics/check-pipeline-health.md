# Check Pipeline Health Utility

Inspect the recording pipeline to identify stuck, failed, or incomplete recordings.

## Pipeline Progression

```
Recording (started) -> Transcript (created) -> CodedTranscript (coded) -> HealthScore (scored)
```

Each stage should complete within minutes. A recording stuck at any stage for >1 hour is likely failed.

## Core Query

```sql
SELECT
  r.id, r.status as recording_status, r.created_at, c.name as circle,
  (SELECT COUNT(*) FROM "Transcript" t WHERE t.recording_id = r.id) as transcripts,
  (SELECT COUNT(*) FROM "CodedTranscript" ct JOIN "Transcript" t ON ct.transcript_id = t.id WHERE t.recording_id = r.id) as coded_transcripts,
  (SELECT COUNT(*) FROM "HealthScore" hs WHERE hs.recording_id = r.id) as health_scores
FROM "Recording" r
JOIN "Circle" c ON r.circle_id = c.id
ORDER BY r.created_at DESC LIMIT 10;
```

## Interpretation

| Status | Transcripts | Coded | Scores | Meaning |
|---|---|---|---|---|
| `completed` | >=1 | >=1 | >=1 | Healthy |
| `completed` | >=1 | >=1 | 0 | Stuck at scoring |
| `completed` | >=1 | 0 | 0 | Stuck at coding |
| `completed` | 0 | 0 | 0 | Stuck at transcription |
| `processing` | 0 | 0 | 0 | In progress or stuck (check age) |
| `failed` | any | any | any | Pipeline error |

## Stuck Detection

Flag as stuck if `processing` and `created_at` > 1 hour ago, or `completed` with missing downstream counts.
