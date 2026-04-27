/**
 * Custom Playwright reporter that captures everything the test-dashboard
 * writer needs in a single JSON file. Designed to run alongside the existing
 * `html` and `list` reporters — it's a passive observer that doesn't change
 * test behavior.
 *
 * Output: ${OUTPUT_DIR}/dashboard-summary.json
 *   {
 *     scenario: string,                 // first test's title path or env override
 *     status: 'pass' | 'fail' | 'error',
 *     started_at: string,               // ISO
 *     finished_at: string,              // ISO
 *     duration_ms: number,
 *     final_stage: number | null,       // parsed from test annotation, optional
 *     error_message: string | null,
 *     failed_assertion: string | null,
 *     failed_test_file: string | null,  // relative to repo root
 *     failed_test_line: number | null,
 *     console_logs: string,             // newline-joined
 *     page_errors: string,              // newline-joined
 *     transcript: string,               // newline-joined console.log() output from spec
 *     screenshot_dir: string,           // absolute path; same as Playwright's outputDir per-test
 *   }
 *
 * Configure in playwright.config.ts:
 *   reporter: [
 *     ['html', { open: 'never' }],
 *     ['list'],
 *     ['./reporters/test-dashboard-reporter.ts', { outputDir: 'test-results' }],
 *   ]
 *
 * Override the scenario name with env var DASHBOARD_SCENARIO (set by the
 * run-and-publish wrapper to match the spec name the operator asked for).
 */
import { writeFileSync, mkdirSync, existsSync, copyFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, basename, extname, dirname } from 'node:path';
import type {
  Reporter,
  TestCase,
  TestResult,
  FullResult,
  FullConfig,
  Suite,
  TestStep,
} from '@playwright/test/reporter';

interface ReporterOptions {
  outputDir?: string;
}

interface SummaryShape {
  scenario: string;
  status: 'pass' | 'fail' | 'error';
  started_at: string;
  finished_at: string;
  duration_ms: number;
  final_stage: number | null;
  error_message: string | null;
  failed_assertion: string | null;
  failed_test_file: string | null;
  failed_test_line: number | null;
  console_logs: string;
  page_errors: string;
  transcript: string;
  screenshot_dir: string;
  test_count: number;
  pass_count: number;
  fail_count: number;
}

export default class TestDashboardReporter implements Reporter {
  private startedAtMs = Date.now();
  private outputDir: string;
  private screenshotDir: string;
  private consoleLogs: string[] = [];
  private pageErrors: string[] = [];
  private transcript: string[] = [];
  private firstFailure: { test: TestCase; result: TestResult } | null = null;
  private testCount = 0;
  private passCount = 0;
  private failCount = 0;
  private repoRoot: string | null = null;

  constructor(options: ReporterOptions = {}) {
    const dir = options.outputDir ?? 'test-results';
    this.outputDir = resolve(dir);
    this.screenshotDir = join(this.outputDir, 'dashboard-screenshots');
  }

  onBegin(config: FullConfig, _suite: Suite): void {
    this.startedAtMs = Date.now();
    // Repo root: walk up from the e2e dir to find package.json with workspaces.
    this.repoRoot = config.rootDir ? resolve(config.rootDir, '..') : process.cwd();
    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }
    if (!existsSync(this.screenshotDir)) {
      mkdirSync(this.screenshotDir, { recursive: true });
    }
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    this.testCount++;
    if (result.status === 'passed') this.passCount++;
    if (result.status === 'failed' || result.status === 'timedOut') {
      this.failCount++;
      if (!this.firstFailure) this.firstFailure = { test, result };
    }

    // stdout / stderr — captured per-test by Playwright. We accumulate.
    for (const out of result.stdout) {
      const text = typeof out === 'string' ? out : out.toString('utf8');
      this.transcript.push(text.trimEnd());
    }
    for (const err of result.stderr) {
      const text = typeof err === 'string' ? err : err.toString('utf8');
      this.consoleLogs.push(text.trimEnd());
    }

    // Page errors come through result.errors as `Error` objects. Stringify.
    for (const e of result.errors) {
      const lines: string[] = [];
      if (e.message) lines.push(e.message);
      if (e.stack) lines.push(e.stack);
      this.pageErrors.push(lines.join('\n'));
    }

    // Per-step messages mostly clutter; we skip TestStep details unless useful.
    void this.collectSteps(result);

    // Copy screenshot attachments into our dashboard dir, numbering them by
    // step order so the writer's filename-based step parsing works.
    let stepIdx = 1;
    for (const att of result.attachments) {
      if (att.contentType.startsWith('image/') && att.path) {
        const ext = extname(att.path) || '.png';
        const safeTitle = test.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
        const dest = join(
          this.screenshotDir,
          `${String(stepIdx).padStart(2, '0')}-${safeTitle}${ext}`
        );
        try {
          copyFileSync(att.path, dest);
          stepIdx++;
        } catch (err) {
          // Source may have been cleaned up; non-fatal.
          console.warn(`[dashboard-reporter] copy failed: ${(err as Error).message}`);
        }
      }
    }
  }

  private collectSteps(result: TestResult): void {
    const visit = (step: TestStep) => {
      if (step.error?.message) {
        this.pageErrors.push(`[${step.title}] ${step.error.message}`);
      }
      step.steps.forEach(visit);
    };
    result.steps.forEach(visit);
  }

  async onEnd(result: FullResult): Promise<void> {
    const finishedAtMs = Date.now();
    const overallStatus: SummaryShape['status'] =
      result.status === 'passed'
        ? 'pass'
        : result.status === 'failed' || result.status === 'timedout'
        ? 'fail'
        : 'error';

    const failure = this.firstFailure;
    const failedFile =
      failure && this.repoRoot
        ? relative(this.repoRoot, failure.test.location.file)
        : failure?.test.location.file ?? null;

    const failedError = failure?.result.errors[0];
    const errorMessage = failedError?.message ?? null;

    const summary: SummaryShape = {
      scenario: process.env.DASHBOARD_SCENARIO ?? this.deriveScenarioName(failure?.test ?? null),
      status: overallStatus,
      started_at: new Date(this.startedAtMs).toISOString(),
      finished_at: new Date(finishedAtMs).toISOString(),
      duration_ms: finishedAtMs - this.startedAtMs,
      final_stage: this.parseFinalStage(),
      error_message: errorMessage,
      failed_assertion: this.extractAssertion(errorMessage),
      failed_test_file: failedFile,
      failed_test_line: failure?.test.location.line ?? null,
      console_logs: this.consoleLogs.join('\n'),
      page_errors: this.pageErrors.join('\n'),
      transcript: this.transcript.join('\n'),
      screenshot_dir: this.screenshotDir,
      test_count: this.testCount,
      pass_count: this.passCount,
      fail_count: this.failCount,
    };

    const summaryPath = join(this.outputDir, 'dashboard-summary.json');
    writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(
      `[dashboard-reporter] wrote ${summaryPath} (status=${summary.status}, ${summary.test_count} tests, ${this.transcript.length} stdout chunks)`
    );
  }

  private deriveScenarioName(failed: TestCase | null): string {
    if (failed) {
      const file = basename(failed.location.file).replace(/\.spec\.ts$/, '');
      return file;
    }
    // Fall back to the directory name if no tests ran (rare).
    return basename(dirname(this.outputDir));
  }

  private parseFinalStage(): number | null {
    // If the test name or transcript mentions "stage N", capture it.
    const re = /\bstage[\s-]*(\d)\b/i;
    const sources = [...this.transcript, this.firstFailure?.test.title ?? ''].join('\n');
    const m = sources.match(re);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n >= 0 && n <= 4) return n;
    }
    return null;
  }

  private extractAssertion(message: string | null): string | null {
    if (!message) return null;
    // Playwright assertions look like "Expected: ...\nReceived: ...".
    const lines = message.split('\n');
    const expectIdx = lines.findIndex((l) => /^expect/i.test(l) || /Expected/.test(l));
    if (expectIdx === -1) return null;
    return lines.slice(expectIdx, expectIdx + 6).join('\n');
  }

  /**
   * Find PNG/JPG screenshots in the standard Playwright outputDir tree
   * (test-results/<test-name>/test-failed-*.png etc.) and copy them into
   * our screenshot dir. Used as a fallback when individual attachments
   * weren't captured per-test.
   */
  static walkOutputForScreenshots(outputDir: string, dest: string): void {
    if (!existsSync(outputDir)) return;
    let idx = 1;
    const visit = (dir: string) => {
      for (const name of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, name.name);
        if (name.isDirectory()) {
          visit(full);
        } else if (/\.(png|jpe?g|webp)$/i.test(name.name)) {
          const safe = name.name.replace(/[^a-z0-9.-]+/gi, '-');
          const out = join(dest, `${String(idx).padStart(2, '0')}-${safe}`);
          try {
            copyFileSync(full, out);
            idx++;
          } catch {
            // ignore
          }
        }
      }
    };
    visit(outputDir);
  }
}
