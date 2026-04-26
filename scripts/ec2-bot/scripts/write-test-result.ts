#!/usr/bin/env tsx
/**
 * write-test-result.ts
 *
 * After a Playwright e2e run finishes on the EC2 bot, this script:
 *   1. Creates (or updates) a test_runs row in the test-dashboard Postgres.
 *   2. Uploads each screenshot in --screenshots-dir to Vercel Blob.
 *   3. Posts a run_artifacts row per screenshot + transcript.
 *   4. PATCHes the run with final status, finished_at, duration_ms, failure fields.
 *
 * Required env vars:
 *   TEST_DASHBOARD_API_URL   e.g. https://test-dashboard.meetwithoutfear.com
 *   BOT_WRITER_TOKEN         must match what the dashboard has configured
 *   BLOB_READ_WRITE_TOKEN    Vercel Blob token (rw)
 *
 * See ./write-test-result.README.md for examples.
 */
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { put } from '@vercel/blob';

type Status = 'queued' | 'running' | 'pass' | 'fail' | 'error' | 'cancelled';
type TriggerSource = 'slack' | 'cron' | 'web' | 'manual';

interface Args {
  runId?: string;
  scenario?: string;
  status?: Status;
  screenshotsDir?: string;
  transcriptFile?: string;
  startingSnapshotId?: string;
  endingSnapshotId?: string;
  codeSha?: string;
  triggerSource?: TriggerSource;
  triggeredBy?: string;
  finalStage?: number;
  errorMessage?: string;
  failedAssertion?: string;
  failedTestFile?: string;
  failedTestLine?: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];
    const take = () => {
      if (next === undefined) throw new Error(`missing value for ${flag}`);
      i++;
      return next;
    };
    switch (flag) {
      case '--run-id':              args.runId              = take(); break;
      case '--scenario':            args.scenario           = take(); break;
      case '--status':              args.status             = take() as Status; break;
      case '--screenshots-dir':     args.screenshotsDir     = take(); break;
      case '--transcript-file':     args.transcriptFile     = take(); break;
      case '--starting-snapshot-id':args.startingSnapshotId = take(); break;
      case '--ending-snapshot-id':  args.endingSnapshotId   = take(); break;
      case '--code-sha':            args.codeSha            = take(); break;
      case '--trigger-source':      args.triggerSource      = take() as TriggerSource; break;
      case '--triggered-by':        args.triggeredBy        = take(); break;
      case '--final-stage':         args.finalStage         = Number(take()); break;
      case '--error-message':       args.errorMessage       = take(); break;
      case '--failed-assertion':    args.failedAssertion    = take(); break;
      case '--failed-test-file':    args.failedTestFile     = take(); break;
      case '--failed-test-line':    args.failedTestLine     = Number(take()); break;
      case '--help':
      case '-h':
        printHelpAndExit();
        break;
      default:
        if (flag.startsWith('--')) {
          throw new Error(`unknown flag: ${flag}`);
        }
    }
  }
  return args;
}

function printHelpAndExit(): never {
  console.log(`Usage: tsx write-test-result.ts [flags]

Required:
  --scenario <name>            scenario name (e.g. two-browser-stage-2)
  --status <pass|fail|error>   final status

Optional:
  --run-id <id>                  update existing run instead of creating one
  --screenshots-dir <path>       dir of PNG/JPG screenshots
  --transcript-file <path>       path to transcript text file
  --starting-snapshot-id <id>
  --ending-snapshot-id <id>
  --code-sha <sha>               defaults to \`git rev-parse HEAD\`
  --trigger-source <slack|cron|web|manual>   defaults to 'manual'
  --triggered-by <id>            slack user id or email
  --final-stage <0..4>
  --error-message <msg>
  --failed-assertion <text>
  --failed-test-file <path>
  --failed-test-line <n>
`);
  process.exit(0);
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`ERROR: env var ${name} is required`);
    process.exit(1);
  }
  return v;
}

function gitSha(): string | null {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

async function apiFetch(
  baseUrl: string,
  token: string,
  path: string,
  method: 'GET' | 'POST' | 'PATCH',
  body?: unknown
): Promise<unknown> {
  const url = `${baseUrl.replace(/\/$/, '')}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-bot-token': token,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    throw new Error(
      `${method} ${path} -> ${res.status}: ${
        typeof parsed === 'string' ? parsed : JSON.stringify(parsed)
      }`
    );
  }
  return parsed;
}

/**
 * Try to extract a step index from a filename like "01-opens-app.png" or
 * "step-12_login.jpg". Returns null if no leading number is found.
 */
function extractStepIndex(filename: string): number | null {
  const m = filename.match(/^(?:step[-_])?(\d{1,4})/i);
  if (!m) return null;
  return Number(m[1]);
}

function captionFromFilename(filename: string): string {
  const noExt = filename.replace(/\.(png|jpg|jpeg|webp)$/i, '');
  // Drop a leading numeric step prefix.
  const stripped = noExt.replace(/^(?:step[-_])?\d{1,4}[-_]?/i, '');
  return stripped.replace(/[-_]+/g, ' ').trim() || noExt;
}

function listScreenshots(dir: string): string[] {
  const entries = readdirSync(dir);
  return entries
    .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.scenario) {
    console.error('ERROR: --scenario is required');
    process.exit(1);
  }
  if (!args.status) {
    console.error('ERROR: --status is required');
    process.exit(1);
  }

  const apiBase = requireEnv('TEST_DASHBOARD_API_URL');
  const botToken = requireEnv('BOT_WRITER_TOKEN');
  // BLOB_READ_WRITE_TOKEN only needed if we have screenshots to upload.
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

  const codeSha = args.codeSha ?? gitSha();
  const triggerSource: TriggerSource = args.triggerSource ?? 'manual';

  // 1. Create or mark-running.
  const startedAtMs = Date.now();
  let runId: string;

  if (args.runId) {
    runId = args.runId;
    await apiFetch(apiBase, botToken, `/api/runs/${runId}`, 'PATCH', {
      status: 'running',
      started_at: new Date(startedAtMs).toISOString(),
      code_sha: codeSha,
      starting_snapshot_id: args.startingSnapshotId,
      triggered_by: args.triggeredBy,
    });
    console.log(`[write-test-result] reusing run ${runId} -> running`);
  } else {
    const created = (await apiFetch(apiBase, botToken, '/api/runs', 'POST', {
      scenario: args.scenario,
      starting_snapshot_id: args.startingSnapshotId,
      triggered_by: args.triggeredBy,
    })) as { id: string };
    runId = created.id;
    console.log(`[write-test-result] created run ${runId}`);

    // The POST endpoint forces trigger_source='web' & status='queued', so
    // immediately PATCH to the real values for non-web triggers.
    await apiFetch(apiBase, botToken, `/api/runs/${runId}`, 'PATCH', {
      status: 'running',
      started_at: new Date(startedAtMs).toISOString(),
      code_sha: codeSha,
    });
  }

  // 2. Upload screenshots and post artifact rows.
  if (args.screenshotsDir) {
    if (!blobToken) {
      console.warn(
        '[write-test-result] BLOB_READ_WRITE_TOKEN missing — skipping screenshot uploads'
      );
    } else {
      try {
        const stat = statSync(args.screenshotsDir);
        if (!stat.isDirectory()) {
          console.warn(
            `[write-test-result] --screenshots-dir is not a directory: ${args.screenshotsDir}`
          );
        } else {
          const files = listScreenshots(args.screenshotsDir);
          console.log(
            `[write-test-result] uploading ${files.length} screenshot(s) from ${args.screenshotsDir}`
          );
          for (let i = 0; i < files.length; i++) {
            const filename = files[i];
            const path = join(args.screenshotsDir, filename);
            const data = readFileSync(path);
            const ext = extname(filename).toLowerCase();
            const contentType =
              ext === '.png'
                ? 'image/png'
                : ext === '.webp'
                ? 'image/webp'
                : 'image/jpeg';

            const blobKey = `runs/${runId}/${String(i).padStart(3, '0')}-${basename(filename)}`;
            const uploaded = await put(blobKey, data, {
              access: 'public',
              contentType,
              token: blobToken,
            });

            const stepIndex = extractStepIndex(filename) ?? i;
            const caption = captionFromFilename(filename);

            await apiFetch(apiBase, botToken, '/api/artifacts', 'POST', {
              run_id: runId,
              type: 'screenshot',
              blob_url: uploaded.url,
              caption,
              step_index: stepIndex,
            });
            console.log(
              `[write-test-result]   step ${stepIndex} (${caption}) -> ${uploaded.url}`
            );
          }
        }
      } catch (err) {
        console.warn(
          `[write-test-result] screenshot processing failed: ${(err as Error).message}`
        );
      }
    }
  }

  // 3. Transcript artifact.
  if (args.transcriptFile) {
    try {
      const text = readFileSync(args.transcriptFile, 'utf8');
      await apiFetch(apiBase, botToken, '/api/artifacts', 'POST', {
        run_id: runId,
        type: 'transcript',
        inline_text: text,
        caption: basename(args.transcriptFile),
        step_index: 9999, // sort transcript last
      });
      console.log(`[write-test-result] transcript posted (${text.length} chars)`);
    } catch (err) {
      console.warn(
        `[write-test-result] transcript read failed: ${(err as Error).message}`
      );
    }
  }

  // 4. Final PATCH with status + timing + failure metadata.
  const finishedAtMs = Date.now();
  const durationMs = finishedAtMs - startedAtMs;

  await apiFetch(apiBase, botToken, `/api/runs/${runId}`, 'PATCH', {
    status: args.status,
    finished_at: new Date(finishedAtMs).toISOString(),
    duration_ms: durationMs,
    final_stage: args.finalStage ?? null,
    ending_snapshot_id: args.endingSnapshotId,
    error_message: args.errorMessage ?? null,
    failed_assertion: args.failedAssertion ?? null,
    failed_test_file: args.failedTestFile ?? null,
    failed_test_line: args.failedTestLine ?? null,
  });

  const dashboardUrl = `${apiBase.replace(/\/$/, '')}/run/${runId}`;
  console.log('');
  console.log(`[write-test-result] DONE: ${args.status} in ${durationMs}ms`);
  console.log(`[write-test-result] run id:  ${runId}`);
  console.log(`[write-test-result] view:    ${dashboardUrl}`);
}

main().catch((err) => {
  console.error('[write-test-result] FAILED:', err);
  process.exit(1);
});
