#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const BASE_URL = process.env.MWF_AUDIT_BASE_URL || 'http://localhost:8082';
const API_BASE_URL = process.env.MWF_AUDIT_API_URL || 'http://localhost:3000';
const RUN_ID = process.env.MWF_AUDIT_RUN_ID || new Date().toISOString().replace(/[:.]/g, '-');
const OUT_DIR = path.resolve('test-results/design-audit', RUN_ID);
const E2E_USER_ID = 'cmoxzkzzy009kpx4vbaobcrg4';
const E2E_USER_EMAIL = 'visual-a@e2e.test';

const baseParams = `e2e-user-id=${encodeURIComponent(E2E_USER_ID)}&e2e-user-email=${encodeURIComponent(E2E_USER_EMAIL)}`;

const routeFixtures = [
  ['home', '/', 'Real home route after audit sessions are seeded; validates app chrome, current-session cards, and list entry points.'],
  ['settings', '/settings', 'Real settings route; validates list rows, appearance controls, and settings header.'],
  ['design-inventory', '/design-system?section=inventory', 'Component inventory of audited surfaces and conversation-list direction.'],
  ['design-palette', '/design-system?section=palette', 'Core palette, typography, and semantic token inventory.'],
  ['design-chat', '/design-system?section=chat', 'Component inventory for chat header, messages, indicators, input, and slider.'],
  ['design-ctas', '/design-system?section=ctas', 'Component inventory for bottom guided CTAs and waiting banner.'],
  ['design-states', '/design-system?section=states', 'Component inventory for loading, waiting, blocked, and completed states.'],
  ['design-overlays', '/design-system?section=overlays', 'Component inventory for drawer/sheet/modal launch rows and inline drawer preview.'],
  ['share-topic-drawer', '/design-system?section=overlays&overlay=share-topic', 'Real ShareTopicDrawer opened with representative props.'],
  ['support-options-modal', '/design-system?section=overlays&overlay=support', 'Real SupportOptionsModal opened with representative props.'],
  ['bottom-sheet', '/design-system?section=overlays&overlay=sheet', 'Bottom-sheet-like decision surface with scrim and CTA row.'],
];

const sessionFixtures = [
  ['session-created-a', 'CREATED', 'userA', 'Fresh created session with compact/start CTA, initial empty-ish chat, header, and input.'],
  ['session-empathy-shared-a', 'EMPATHY_SHARED_A', 'userA', 'Initiator waiting after sharing empathy; validates held empathy statement and waiting CTA.'],
  ['session-reconciler-offer-b', 'RECONCILER_SHOWN_B', 'userB', 'Partner sees share-topic/revision offer in the real session route.'],
  ['session-context-shared-a', 'CONTEXT_SHARED_B', 'userA', 'Initiator receives shared context and refinement/review affordances.'],
  ['session-empathy-revealed-a', 'EMPATHY_REVEALED', 'userA', 'Stage 2 completed/revealed chat surface and transition toward needs.'],
  ['session-needs-complete-a', 'NEED_MAPPING_COMPLETE', 'userA', 'Needs/common-ground surface and related drawer entry points.'],
  ['session-stage4-inventory-a', 'STAGE4_REDESIGN_INVENTORY', 'userA', 'Stage 4 redesigned proposal inventory in real session chrome.'],
  ['session-stage4-shared-a', 'STAGE4_REDESIGN_SHARED_SELECTIONS', 'userA', 'Stage 4 shared-selection CTA and overlap state.'],
  ['session-stage4-no-overlap-a', 'STAGE4_REDESIGN_NO_OVERLAP_SELECTIONS', 'userA', 'Stage 4 no-overlap state and guidance.'],
  ['session-stage4-inactive-a', 'STAGE4_REDESIGN_PARTNER_INACTIVE', 'userA', 'Stage 4 waiting/partner-inactive state.'],
];

function withParams(route, mode) {
  const sep = route.includes('?') ? '&' : '?';
  return `${BASE_URL}${route}${sep}${baseParams}&mode=${mode}`;
}

function withMode(url, mode) {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}mode=${mode}`;
}

async function seedSession(page, fixtureName, targetStage) {
  const userSuffix = `${fixtureName}-${RUN_ID}`.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 52);
  const response = await page.request.post(`${API_BASE_URL}/api/e2e/seed-session`, {
    headers: { 'Content-Type': 'application/json' },
    data: {
      userA: { email: `${userSuffix}-a@e2e.test`, name: 'Riley' },
      userB: { email: `${userSuffix}-b@e2e.test`, name: 'Sam' },
      targetStage,
    },
  });
  if (!response.ok()) {
    throw new Error(`Failed to seed ${fixtureName} (${targetStage}): ${response.status()} ${await response.text()}`);
  }
  const json = await response.json();
  if (!json.success) {
    throw new Error(`Failed to seed ${fixtureName} (${targetStage}): ${JSON.stringify(json)}`);
  }
  return json.data;
}

async function waitForApp(page) {
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const textMatches = ['Get the native app', 'Open in app'];
    const candidates = Array.from(document.querySelectorAll('div, section, aside, header'));
    for (const node of candidates) {
      const text = node.textContent || '';
      const rect = node.getBoundingClientRect();
      if (
        textMatches.some((match) => text.includes(match)) &&
        rect.top <= 4 &&
        rect.height > 40 &&
        rect.height < 140 &&
        rect.width > 280
      ) {
        node.remove();
        break;
      }
    }
  }).catch(() => {});
  await page.waitForTimeout(150);
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });

  const index = [
    '# Mobile Design Audit Screenshots',
    '',
    `Run: ${RUN_ID}`,
    `Base URL: ${BASE_URL}`,
    `API URL: ${API_BASE_URL}`,
    `Design-system E2E user: ${E2E_USER_ID} / ${E2E_USER_EMAIL}`,
    '',
    '| Screenshot | Mode | Seed command | URL | Notes |',
    '| --- | --- | --- | --- | --- |',
  ];

  for (const [name, targetStage, side, notes] of sessionFixtures) {
    const seed = await seedSession(page, name, targetStage);
    const seededUrl = (side === 'userB' ? seed.pageUrls.userB : seed.pageUrls.userA).replace('http://localhost:8081', BASE_URL);
    const seedCommand = `POST ${API_BASE_URL}/api/e2e/seed-session targetStage=${targetStage}`;
    for (const mode of ['light', 'dark']) {
      const url = withMode(seededUrl, mode);
      const fileName = `${name}-${mode}.png`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await waitForApp(page);
      await page.screenshot({ path: path.join(OUT_DIR, fileName), fullPage: true });
      index.push(`| ${fileName} | ${mode} | \`${seedCommand}\` | \`${url}\` | ${notes} Session \`${seed.session.id}\`, side \`${side}\`. |`);
    }
  }

  for (const [name, route, notes] of routeFixtures) {
    for (const mode of ['light', 'dark']) {
      const url = withParams(route, mode);
      const fileName = `${name}-${mode}.png`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await waitForApp(page);
      await page.screenshot({ path: path.join(OUT_DIR, fileName), fullPage: true });
      index.push(`| ${fileName} | ${mode} | n/a | \`${url}\` | ${notes} |`);
    }
  }

  await browser.close();
  await fs.writeFile(path.join(OUT_DIR, 'index.md'), `${index.join('\n')}\n`);
  console.log(`Wrote ${(sessionFixtures.length + routeFixtures.length) * 2} screenshots and index to ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
