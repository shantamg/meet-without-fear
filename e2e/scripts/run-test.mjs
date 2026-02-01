#!/usr/bin/env node
/**
 * Interactive E2E Test Runner
 *
 * Presents a tree of available tests and allows drilling down to specific test cases.
 */

import { select } from '@inquirer/prompts';
import { spawn, execSync } from 'child_process';
import { readdirSync, statSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const testsDir = join(__dirname, '../tests');
const e2eDir = join(__dirname, '..');

/**
 * Recursively find all .spec.ts files
 */
function findTestFiles(dir, baseDir = dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...findTestFiles(fullPath, baseDir));
    } else if (entry.endsWith('.spec.ts')) {
      files.push(relative(baseDir, fullPath));
    }
  }
  return files;
}

/**
 * Get test list from Playwright
 */
function getTestList() {
  try {
    const output = execSync('npx playwright test --list 2>/dev/null', {
      cwd: e2eDir,
      encoding: 'utf-8',
      timeout: 30000,
    });

    const tests = [];
    for (const line of output.split('\n')) {
      // Parse lines like: [project] › path/file.spec.ts:line:col › Describe › Test Name
      const match = line.match(/^\s*\[([^\]]+)\]\s+›\s+(.+?):(\d+):\d+\s+›\s+(.+)$/);
      if (match) {
        const [, project, file, line, fullName] = match;
        tests.push({ project, file, line: parseInt(line), fullName });
      }
    }
    return tests;
  } catch (e) {
    return [];
  }
}

/**
 * Build a tree structure from test files
 */
function buildFileTree(files) {
  const tree = {};

  for (const file of files) {
    const parts = file.split('/');
    let current = tree;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;

      if (isFile) {
        current[part] = { __file: file };
      } else {
        current[part] = current[part] || {};
        current = current[part];
      }
    }
  }

  return tree;
}

/**
 * Format a name for display
 */
function formatName(name) {
  return name
    .replace('.spec.ts', '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Navigate the tree and select a test file
 */
async function selectFromTree(tree, path = []) {
  const entries = Object.entries(tree);

  const choices = [];

  // Add "Run all at this level" if not at root
  if (path.length > 0) {
    choices.push({
      name: `▶ Run all in ${path[path.length - 1]}`,
      value: { type: 'run-dir', path: path.join('/') },
    });
    choices.push({
      name: '← Back',
      value: { type: 'back' },
    });
  } else {
    choices.push({
      name: '▶ Run All Tests',
      value: { type: 'run-all' },
    });
  }

  // Add directories first, then files
  const dirs = entries.filter(([_, v]) => !v.__file).sort((a, b) => a[0].localeCompare(b[0]));
  const files = entries.filter(([_, v]) => v.__file).sort((a, b) => a[0].localeCompare(b[0]));

  for (const [name, value] of dirs) {
    choices.push({
      name: `📁 ${formatName(name)}/`,
      value: { type: 'dir', name, subtree: value },
    });
  }

  for (const [name, value] of files) {
    choices.push({
      name: `📄 ${formatName(name)}`,
      value: { type: 'file', file: value.__file },
    });
  }

  const selected = await select({
    message: path.length > 0 ? `📂 ${path.join('/')}` : '🧪 Select test to run:',
    choices,
    pageSize: 15,
  });

  if (selected.type === 'dir') {
    return selectFromTree(selected.subtree, [...path, selected.name]);
  } else if (selected.type === 'back') {
    // Go back - not easily doable with current approach, just return null to restart
    return null;
  }

  return selected;
}

/**
 * Select a specific test within a file
 */
async function selectTestInFile(file, tests) {
  const fileTests = tests.filter(t => t.file === file);

  if (fileTests.length === 0) {
    return { type: 'file', file };
  }

  // Group by describe block
  const groups = {};
  for (const test of fileTests) {
    const parts = test.fullName.split(' › ');
    const describePath = parts.slice(0, -1).join(' › ');
    const testName = parts[parts.length - 1];

    if (!groups[describePath]) {
      groups[describePath] = [];
    }
    groups[describePath].push({ ...test, testName });
  }

  const choices = [
    {
      name: '▶ Run entire file',
      value: { type: 'file', file },
    },
    {
      name: '← Back to file list',
      value: { type: 'back' },
    },
  ];

  // Add describe blocks and their tests
  for (const [describe, tests] of Object.entries(groups)) {
    choices.push({
      name: `📦 ${describe}`,
      value: { type: 'describe', file, describe },
    });

    for (const test of tests) {
      const isSkipped = test.testName.includes('.skip') || test.fullName.includes('.skip');
      const icon = isSkipped ? '⏭️' : '  ';
      choices.push({
        name: `${icon}   └─ ${test.testName}`,
        value: { type: 'test', file, line: test.line, name: test.testName },
      });
    }
  }

  return select({
    message: `📄 ${file}`,
    choices,
    pageSize: 20,
  });
}

async function main() {
  console.log('\n🧪 E2E Test Runner\n');

  // Find all test files
  const testFiles = findTestFiles(testsDir);
  const tree = buildFileTree(testFiles);

  // Get detailed test list (for drilling into files)
  console.log('Loading test list...');
  const allTests = getTestList();
  console.log(`Found ${allTests.length} tests in ${testFiles.length} files\n`);

  let selection = null;

  // Main selection loop
  while (true) {
    selection = await selectFromTree(tree);

    if (selection === null) {
      // User went back to root, restart
      continue;
    }

    if (selection.type === 'file') {
      // User selected a file, offer to drill down
      const fileSelection = await selectTestInFile(selection.file, allTests);
      if (fileSelection.type === 'back') {
        continue;
      }
      selection = fileSelection;
    }

    break;
  }

  // Select run mode
  const runMode = await select({
    message: 'How do you want to run it?',
    choices: [
      { name: 'Headed (watch browser)', value: 'headed' },
      { name: 'UI Mode (Playwright inspector)', value: 'ui' },
      { name: 'Debug (browser stays open)', value: 'debug' },
      { name: 'Headless (fast, no browser)', value: 'headless' },
    ],
  });

  console.log('');

  // Build the playwright command
  const args = ['playwright', 'test'];

  switch (selection.type) {
    case 'run-all':
      // No filter needed
      break;
    case 'run-dir':
      args.push(selection.path);
      break;
    case 'file':
      args.push(selection.file);
      break;
    case 'describe':
      args.push(selection.file, '-g', selection.describe);
      break;
    case 'test':
      args.push(`${selection.file}:${selection.line}`);
      break;
  }

  // Add mode-specific flags
  switch (runMode) {
    case 'headed':
      args.push('--headed');
      break;
    case 'debug':
      args.push('--debug');
      break;
    case 'ui':
      args.push('--ui');
      break;
    case 'headless':
      // Default behavior
      break;
  }

  console.log(`Running: npx ${args.join(' ')}\n`);

  // Run playwright
  const child = spawn('npx', args, {
    stdio: 'inherit',
    cwd: e2eDir,
    shell: true,
  });

  child.on('close', (code) => {
    process.exit(code || 0);
  });
}

main().catch(console.error);
