#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const BASE_URL = process.env.MWF_AUDIT_BASE_URL || 'http://localhost:8082';
const API_BASE_URL = process.env.MWF_AUDIT_API_URL || 'http://localhost:3000';
const RUN_ID = process.env.MWF_AUDIT_RUN_ID || new Date().toISOString().replace(/[:.]/g, '-');
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const MOBILE_DIR = path.resolve(SCRIPT_DIR, '..');
const OUT_DIR = path.join(MOBILE_DIR, 'test-results/design-audit', RUN_ID);
const E2E_USER_ID = 'cmoxzkzzy009kpx4vbaobcrg4';
const E2E_USER_EMAIL = 'visual-a@e2e.test';

const baseParams = `e2e-user-id=${encodeURIComponent(E2E_USER_ID)}&e2e-user-email=${encodeURIComponent(E2E_USER_EMAIL)}`;

const routeFixtures = [
  ['home', '/', 'Real home route after audit sessions are seeded; validates app chrome, current-session cards, and list entry points.'],
  ['settings', '/settings', 'Real settings route; validates list rows, appearance controls, and settings header.'],
  ['settings-account', '/settings/account', 'Settings account subpage; validates nested settings header and account rows.'],
  ['settings-voice', '/settings/voice', 'Settings voice subpage; validates voice controls and nested page chrome.'],
  ['settings-memories', '/settings/memories', 'Settings memories subpage; validates remembered-context settings surface.'],
  ['settings-privacy', '/settings/privacy', 'Settings privacy subpage; validates privacy copy, rows, and nested settings chrome.'],
  ['settings-help', '/settings/help', 'Settings help subpage; validates support rows and nested settings chrome.'],
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

const scrolledSessionFixtures = [
  ['session-context-shared-a', 'CONTEXT_SHARED_B', 'userA', 'Scrolled viewport for shared-context chat history and sticky CTA behavior.'],
  ['session-needs-complete-a', 'NEED_MAPPING_COMPLETE', 'userA', 'Scrolled viewport for needs/common-ground content and sticky CTA behavior.'],
  ['session-stage4-inventory-a', 'STAGE4_REDESIGN_INVENTORY', 'userA', 'Scrolled viewport for Stage 4 proposal inventory and bottom action behavior.'],
];

const sessionAuditFixtureOverlays = [
  ['empathy-statement-drawer-real', 'session-empathy-shared-a', 'EMPATHY_SHARED_A', 'userA', 'empathy-drawer', 'Real empathy statement drawer opened from the seeded session route by audit fixture query.'],
  ['accuracy-feedback-drawer-real', 'session-empathy-revealed-a', 'EMPATHY_REVEALED', 'userA', 'accuracy-feedback', 'Real accuracy feedback drawer opened from the seeded session route by audit fixture query.'],
  ['guided-draft-modal-real', 'session-empathy-revealed-a', 'EMPATHY_REVEALED', 'userA', 'guided-draft', 'Real guided feedback draft modal opened from the seeded session route by audit fixture query.'],
  ['needs-drawer-real', 'session-needs-complete-a', 'NEED_MAPPING_COMPLETE', 'userA', 'needs-drawer', 'Real needs drawer opened from the seeded session route by audit fixture query.'],
];

function withParams(route, mode) {
  const sep = route.includes('?') ? '&' : '?';
  return `${BASE_URL}${route}${sep}${baseParams}&mode=${mode}`;
}

function withMode(url, mode) {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}mode=${mode}`;
}

function withAuditFixture(url, auditFixture) {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}auditFixture=${encodeURIComponent(auditFixture)}`;
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

async function setAppearanceMode(page, mode) {
  if (!page.url().startsWith(BASE_URL)) {
    await page.goto(`${BASE_URL}/?${baseParams}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  }
  await page.evaluate((nextMode) => {
    window.localStorage.setItem('mwf.appearancePreference', nextMode);
  }, mode);
}

async function gotoFixture(page, url, mode) {
  await setAppearanceMode(page, mode);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
}

async function scrollPrimarySurface(page) {
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);

    const scrollableNodes = Array.from(document.querySelectorAll('div, main, section, article'))
      .filter((node) => node.scrollHeight - node.clientHeight > 80)
      .sort((a, b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        return (bRect.width * bRect.height) - (aRect.width * aRect.height);
      });

    for (const node of scrollableNodes.slice(0, 3)) {
      node.scrollTop = Math.max(0, node.scrollHeight - node.clientHeight);
    }
  }).catch(() => {});
  await page.mouse.wheel(0, 900).catch(() => {});
  await page.waitForTimeout(300);
}

async function clickAndCapture(page, index, {
  baseUrl,
  click,
  fileName,
  mode,
  notes,
  seedCommand,
  urlForIndex,
}) {
  await gotoFixture(page, baseUrl, mode);
  await waitForApp(page);
  await click(page);
  await waitForApp(page);
  await page.screenshot({ path: path.join(OUT_DIR, fileName), fullPage: true });
  index.push(`| ${fileName} | ${mode} | session interaction | \`${seedCommand}\` | \`${urlForIndex || baseUrl}\` | ${notes} |`);
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
    '| Screenshot | Mode | Route type | Seed command | URL | Notes |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  const seededSessions = new Map();

  for (const [name, targetStage, side, notes] of sessionFixtures) {
    const seed = await seedSession(page, name, targetStage);
    seededSessions.set(name, seed);
    const seededUrl = (side === 'userB' ? seed.pageUrls.userB : seed.pageUrls.userA).replace('http://localhost:8081', BASE_URL);
    const seedCommand = `POST ${API_BASE_URL}/api/e2e/seed-session targetStage=${targetStage}`;
    for (const mode of ['light', 'dark']) {
      const url = withMode(seededUrl, mode);
      const fileName = `${name}-${mode}.png`;
      await gotoFixture(page, url, mode);
      await waitForApp(page);
      await page.screenshot({ path: path.join(OUT_DIR, fileName), fullPage: true });
      index.push(`| ${fileName} | ${mode} | session route | \`${seedCommand}\` | \`${url}\` | ${notes} Session \`${seed.session.id}\`, side \`${side}\`. |`);
    }
  }

  for (const [name, targetStage, side, notes] of scrolledSessionFixtures) {
    const seed = seededSessions.get(name);
    if (!seed) {
      throw new Error(`Expected seed for scrolled capture ${name}`);
    }
    const seededUrl = (side === 'userB' ? seed.pageUrls.userB : seed.pageUrls.userA).replace('http://localhost:8081', BASE_URL);
    const seedCommand = `POST ${API_BASE_URL}/api/e2e/seed-session targetStage=${targetStage}`;
    for (const mode of ['light', 'dark']) {
      const url = withMode(seededUrl, mode);
      const fileName = `${name}-scrolled-${mode}.png`;
      await gotoFixture(page, url, mode);
      await waitForApp(page);
      await scrollPrimarySurface(page);
      await page.screenshot({ path: path.join(OUT_DIR, fileName), fullPage: false });
      index.push(`| ${fileName} | ${mode} | session route scrolled viewport | \`${seedCommand}\` | \`${url}\` | ${notes} Session \`${seed.session.id}\`, side \`${side}\`. |`);
    }
  }

  for (const [filePrefix, seedName, targetStage, side, auditFixture, notes] of sessionAuditFixtureOverlays) {
    const seed = seededSessions.get(seedName);
    if (!seed) {
      throw new Error(`Expected seed for session audit fixture ${seedName}`);
    }
    const seededUrl = (side === 'userB' ? seed.pageUrls.userB : seed.pageUrls.userA).replace('http://localhost:8081', BASE_URL);
    const seedCommand = `POST ${API_BASE_URL}/api/e2e/seed-session targetStage=${targetStage}`;
    for (const mode of ['light', 'dark']) {
      const url = withAuditFixture(withMode(seededUrl, mode), auditFixture);
      const fileName = `${filePrefix}-${mode}.png`;
      await gotoFixture(page, url, mode);
      await waitForApp(page);
      await page.screenshot({ path: path.join(OUT_DIR, fileName), fullPage: true });
      index.push(`| ${fileName} | ${mode} | session route audit fixture | \`${seedCommand}\` | \`${url}\` | ${notes} Session \`${seed.session.id}\`, side \`${side}\`. |`);
    }
  }

  const sidebarSeed = seededSessions.get('session-created-a');
  if (!sidebarSeed) {
    throw new Error('Expected session-created-a seed for sidebar interaction captures');
  }
  const sidebarSeedCommand = `POST ${API_BASE_URL}/api/e2e/seed-session targetStage=CREATED`;
  const sidebarBaseUrl = sidebarSeed.pageUrls.userA.replace('http://localhost:8081', BASE_URL);

  for (const mode of ['light', 'dark']) {
    const baseUrl = withMode(sidebarBaseUrl, mode);
    await clickAndCapture(page, index, {
      baseUrl,
      mode,
      seedCommand: sidebarSeedCommand,
      fileName: `sidebar-open-${mode}.png`,
      notes: `Real session drawer opened from session chrome. Session \`${sidebarSeed.session.id}\`, side \`userA\`.`,
      click: async (pageForClick) => {
        await pageForClick.getByLabel('Open session drawer').first().click({ timeout: 10000 });
      },
    });

    await clickAndCapture(page, index, {
      baseUrl,
      mode,
      seedCommand: sidebarSeedCommand,
      fileName: `sidebar-row-menu-${mode}.png`,
      notes: `Real session drawer row overflow menu opened from a seeded conversation row. Session \`${sidebarSeed.session.id}\`, side \`userA\`.`,
      click: async (pageForClick) => {
        await pageForClick.getByLabel('Open session drawer').first().click({ timeout: 10000 });
        await pageForClick.getByLabel(/More actions for /).first().click({ timeout: 10000 });
      },
    });

  }

  const activitySeed = seededSessions.get('session-context-shared-a');
  if (!activitySeed) {
    throw new Error('Expected session-context-shared-a seed for activity drawer interaction captures');
  }
  const activitySeedCommand = `POST ${API_BASE_URL}/api/e2e/seed-session targetStage=CONTEXT_SHARED_B`;
  const activityBaseUrl = activitySeed.pageUrls.userA.replace('http://localhost:8081', BASE_URL);

  for (const mode of ['light', 'dark']) {
    const baseUrl = withMode(activityBaseUrl, mode);
    await clickAndCapture(page, index, {
      baseUrl,
      mode,
      seedCommand: activitySeedCommand,
      fileName: `activity-drawer-${mode}.png`,
      notes: `Real activity drawer opened from the session header. Session \`${activitySeed.session.id}\`, side \`userA\`.`,
      click: async (pageForClick) => {
        await pageForClick.getByLabel(/Open exchange history/).first().click({ timeout: 10000 });
      },
    });

    await clickAndCapture(page, index, {
      baseUrl,
      mode,
      seedCommand: activitySeedCommand,
      fileName: `partner-info-drawer-${mode}.png`,
      notes: `Real partner info drawer opened from the session header. Session \`${activitySeed.session.id}\`, side \`userA\`.`,
      click: async (pageForClick) => {
        await pageForClick.getByTestId('session-chat-header-center-touchable').click({ timeout: 10000 });
      },
    });
  }

  const shareOfferSeed = seededSessions.get('session-reconciler-offer-b');
  if (!shareOfferSeed) {
    throw new Error('Expected session-reconciler-offer-b seed for share-topic drawer interaction captures');
  }
  const shareOfferSeedCommand = `POST ${API_BASE_URL}/api/e2e/seed-session targetStage=RECONCILER_SHOWN_B`;
  const shareOfferBaseUrl = shareOfferSeed.pageUrls.userB.replace('http://localhost:8081', BASE_URL);

  for (const mode of ['light', 'dark']) {
    const baseUrl = withMode(shareOfferBaseUrl, mode);
    await clickAndCapture(page, index, {
      baseUrl,
      mode,
      seedCommand: shareOfferSeedCommand,
      fileName: `share-topic-drawer-real-${mode}.png`,
      notes: `Real share-topic drawer opened from the seeded partner offer panel. Session \`${shareOfferSeed.session.id}\`, side \`userB\`.`,
      click: async (pageForClick) => {
        await pageForClick.getByText('Review', { exact: true }).first().click({ timeout: 10000 });
      },
    });
  }

  for (const [name, route, notes] of routeFixtures) {
    for (const mode of ['light', 'dark']) {
      const url = withParams(route, mode);
      const fileName = `${name}-${mode}.png`;
      await gotoFixture(page, url, mode);
      await waitForApp(page);
      await page.screenshot({ path: path.join(OUT_DIR, fileName), fullPage: true });
      const routeType = route.startsWith('/design-system') ? 'design-system inventory' : 'real route';
      index.push(`| ${fileName} | ${mode} | ${routeType} | n/a | \`${url}\` | ${notes} |`);
    }
  }

  await browser.close();
  await fs.writeFile(path.join(OUT_DIR, 'index.md'), `${index.join('\n')}\n`);
  const screenshotCount = (sessionFixtures.length + scrolledSessionFixtures.length + sessionAuditFixtureOverlays.length + routeFixtures.length) * 2 + 10;
  console.log(`Wrote ${screenshotCount} screenshots and index to ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
