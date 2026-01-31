#!/usr/bin/env node
/**
 * Interactive E2E Test Runner
 *
 * Presents a list of available tests and runs the selected one in headed mode.
 */

import { select, confirm } from '@inquirer/prompts';
import { spawn } from 'child_process';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const testsDir = join(__dirname, '../tests');

// Discover available test files
const testFiles = readdirSync(testsDir)
  .filter(f => f.endsWith('.spec.ts'))
  .map(f => f.replace('.spec.ts', ''));

// Map test files to their project names (if known)
const testProjects = {
  'single-user-journey': 'user-a-journey',
  'partner-journey': 'partner-journey',
  'homepage': 'homepage',
  'share-tab-rendering': 'share-tab-rendering',
};

// Build choices for the select prompt
const choices = testFiles.map(test => ({
  name: test.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
  value: test,
  description: `Run ${test}.spec.ts`,
}));

// Add "All tests" option
choices.unshift({
  name: 'All Tests',
  value: '__all__',
  description: 'Run all E2E tests',
});

async function main() {
  console.log('\n🧪 E2E Test Runner\n');

  const selectedTest = await select({
    message: 'Select a test to run:',
    choices,
  });

  const runMode = await select({
    message: 'How do you want to run it?',
    choices: [
      { name: 'Headed (watch browser)', value: 'headed' },
      { name: 'Debug (browser stays open)', value: 'debug' },
      { name: 'UI Mode (Playwright inspector)', value: 'ui' },
      { name: 'Headless (fast, no browser)', value: 'headless' },
    ],
  });

  console.log('');

  // Build the playwright command
  const args = ['playwright', 'test'];

  if (selectedTest !== '__all__') {
    // Run specific test
    args.push(selectedTest);

    // Add project flag if we know the project name
    const project = testProjects[selectedTest];
    if (project) {
      args.push('--project', project);
    }
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
      // Default behavior, no extra flags
      break;
  }

  console.log(`Running: npx ${args.join(' ')}\n`);

  // Run playwright
  const child = spawn('npx', args, {
    stdio: 'inherit',
    cwd: join(__dirname, '..'),
    shell: true,
  });

  child.on('close', (code) => {
    process.exit(code || 0);
  });
}

main().catch(console.error);
