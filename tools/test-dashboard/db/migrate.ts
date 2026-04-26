/**
 * Run db/schema.sql against the configured Postgres instance.
 *
 * Usage:
 *   POSTGRES_URL=postgres://... npx tsx db/migrate.ts
 *   # or DATABASE_URL=...
 *
 * Idempotent — safe to run repeatedly. Logs each statement as it executes.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const connectionString =
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL_NON_POOLING;

  if (!connectionString) {
    console.error(
      'ERROR: set POSTGRES_URL (or DATABASE_URL) in the environment before running migrate.'
    );
    process.exit(1);
  }

  const schemaPath = join(__dirname, 'schema.sql');
  const sql = readFileSync(schemaPath, 'utf8');

  const client = new Client({ connectionString });
  await client.connect();

  try {
    // Naive splitter that respects DO $$ ... $$ blocks. Statements are separated by
    // semicolons at the end of a line, but we treat $$-quoted blocks as single units.
    const statements = splitSqlStatements(sql);

    for (const [i, stmt] of statements.entries()) {
      const trimmed = stmt.trim();
      if (!trimmed) continue;
      const preview = trimmed.replace(/\s+/g, ' ').slice(0, 80);
      console.log(`[migrate] (${i + 1}/${statements.length}) ${preview}`);
      await client.query(trimmed);
    }

    const { rows } = await client.query(
      'SELECT version, applied_at FROM schema_migrations ORDER BY version'
    );
    console.log('[migrate] schema_migrations:', rows);
    console.log('[migrate] OK');
  } finally {
    await client.end();
  }
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let buf = '';
  let inDollar = false;
  const lines = sql.split('\n');

  for (const line of lines) {
    const stripped = line.replace(/--.*$/, '');
    // Toggle on $$ occurrences
    const dollarCount = (stripped.match(/\$\$/g) || []).length;
    for (let i = 0; i < dollarCount; i++) inDollar = !inDollar;
    buf += line + '\n';
    if (!inDollar && /;\s*$/.test(stripped)) {
      statements.push(buf);
      buf = '';
    }
  }
  if (buf.trim()) statements.push(buf);
  return statements;
}

main().catch((err) => {
  console.error('[migrate] FAILED:', err);
  process.exit(1);
});
