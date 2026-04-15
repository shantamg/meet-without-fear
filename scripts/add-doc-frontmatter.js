#!/usr/bin/env node
/**
 * add-doc-frontmatter.js
 *
 * Walks docs/ (excluding archive/ and *.json), ensures each .md file has
 * Docusaurus-compatible YAML frontmatter with:
 *   - title        (from first H1 heading)
 *   - sidebar_position  (from existing value if present; otherwise alphabetical within dir)
 *   - description  (from first paragraph of text, truncated to 160 chars)
 *
 * Idempotent: preserves existing frontmatter fields, only adds missing ones.
 *
 * Run with: node scripts/add-doc-frontmatter.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const DOCS_DIR = path.resolve(__dirname, '..', 'docs');
const SKIP_DIRS = new Set(['archive']);
const DRY_RUN = process.argv.includes('--dry-run');

let changedFiles = 0;
let skippedFiles = 0;

function walk(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      results.push(...walk(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { frontmatter: null, body: content };
  const fmLines = match[1].split(/\r?\n/);
  const frontmatter = {};
  for (const line of fmLines) {
    const kvMatch = line.match(/^(\w+):\s*(.*)$/);
    if (kvMatch) {
      frontmatter[kvMatch[1]] = kvMatch[2].replace(/^["']|["']$/g, '');
    }
  }
  return { frontmatter, body: match[2] };
}

function extractTitle(body) {
  const h1 = body.match(/^#\s+(.+)$/m);
  if (!h1) return null;
  let t = h1[1].trim();
  // Strip markdown emphasis/bold/code and backslash-escapes
  t = t.replace(/[*_`]/g, '').replace(/\\(.)/g, '$1').trim();
  return t || null;
}

function extractDescription(body) {
  // Skip headings and blank lines, grab first paragraph
  const lines = body.split(/\r?\n/);
  let para = [];
  let inCode = false;
  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    if (line.trim().startsWith('#')) continue;
    if (line.trim() === '' && para.length > 0) break;
    if (line.trim() === '') continue;
    para.push(line.trim());
  }
  let text = para.join(' ').replace(/\s+/g, ' ').trim();
  // Strip markdown links: [text](url) -> text
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  // Strip emphasis/bold/code backticks
  text = text.replace(/[*_`]/g, '');
  if (text.length > 160) text = text.slice(0, 157).trimEnd() + '...';
  return text || null;
}

function renderFrontmatter(fm) {
  const keys = ['title', 'sidebar_position', 'description'];
  // Preserve any extra keys that were already present
  const allKeys = [...keys, ...Object.keys(fm).filter(k => !keys.includes(k))];
  const lines = ['---'];
  for (const k of allKeys) {
    if (fm[k] === undefined || fm[k] === null || fm[k] === '') continue;
    const v = fm[k];
    if (typeof v === 'number') {
      lines.push(`${k}: ${v}`);
    } else {
      // Always JSON-stringify strings: safe against YAML specials
      // (*, &, :, #, quotes, leading-dash, etc.) and idempotent on reads.
      lines.push(`${k}: ${JSON.stringify(String(v))}`);
    }
  }
  lines.push('---', '');
  return lines.join('\n');
}

function processFile(filePath, positionIndex) {
  const content = fs.readFileSync(filePath, 'utf8');
  const { frontmatter, body } = parseFrontmatter(content);
  const fm = frontmatter || {};
  let changed = false;

  if (!fm.title) {
    const title = extractTitle(body);
    if (title) {
      fm.title = title;
      changed = true;
    }
  }

  if (fm.sidebar_position === undefined) {
    fm.sidebar_position = positionIndex;
    changed = true;
  }

  if (!fm.description) {
    const desc = extractDescription(body);
    if (desc) {
      fm.description = desc;
      changed = true;
    }
  }

  // Force a re-render if existing frontmatter has YAML-unsafe unquoted values
  // (leading *, &, leading -, etc.) — those break Docusaurus load.
  if (!changed && frontmatter) {
    const raw = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] || '';
    const hasUnsafe = raw.split(/\r?\n/).some(line => {
      const m = line.match(/^\w+:\s*([^"'\d\[\{].*)$/);
      if (!m) return false;
      const val = m[1].trim();
      return /^[*&!%@`>|]/.test(val); // YAML indicator chars at start
    });
    if (!hasUnsafe) {
      skippedFiles++;
      return;
    }
    changed = true;
  }

  const newContent = renderFrontmatter(fm) + body.replace(/^\r?\n+/, '');
  if (DRY_RUN) {
    console.log(`[dry-run] would update: ${path.relative(DOCS_DIR, filePath)}`);
  } else {
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log(`updated: ${path.relative(DOCS_DIR, filePath)}`);
  }
  changedFiles++;
}

function main() {
  const files = walk(DOCS_DIR);
  // Group by directory so sidebar_position is unique per dir (alphabetical)
  const byDir = {};
  for (const f of files) {
    const dir = path.dirname(f);
    if (!byDir[dir]) byDir[dir] = [];
    byDir[dir].push(f);
  }
  for (const dir of Object.keys(byDir)) {
    byDir[dir].sort();
    byDir[dir].forEach((f, idx) => {
      // index.md always gets position 1 so it lands first in the sidebar
      const name = path.basename(f);
      const pos = name === 'index.md' ? 1 : idx + 2;
      processFile(f, pos);
    });
  }
  console.log(`\n${DRY_RUN ? '[dry-run] ' : ''}changed=${changedFiles} skipped=${skippedFiles} total=${files.length}`);
}

main();
