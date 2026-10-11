#!/usr/bin/env node
/**
 * Design QA screenshots (docs/DESIGN.md §11).
 * Starts the API and the Vite dev server unless they are already running,
 * then captures every route and key state at three viewports into frontend/screenshots/.
 *
 *   npm run screenshots -w frontend                 # all shots
 *   npm run screenshots -w frontend -- --only=search # shots whose name contains "search"
 */
import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const frontendDir = resolve(here, '..');
const repoRoot = resolve(frontendDir, '..');
const outDir = resolve(frontendDir, 'screenshots');
const WEB = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:5173';
const API = process.env.SCREENSHOT_API_URL ?? 'http://localhost:4000';
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1024', width: 1024, height: 768 },
  { name: '390', width: 390, height: 844 },
];

const settle = async (page) => {
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(300);
};

/** Each shot: path + optional action to reach a state. `fullPage` for long pages. */
const SHOTS = [
  { name: 'overview', path: '/', fullPage: true },
  { name: 'memories', path: '/memories', fullPage: true },
  {
    name: 'memories-drawer',
    path: '/memories',
    action: async (page) => {
      const row = page.locator('[data-testid="memory-row"]').first();
      if (await row.count()) {
        await row.click();
        await page.waitForSelector('[role="dialog"]', { timeout: 10_000 });
        await page.waitForTimeout(400);
      }
    },
  },
  { name: 'search', path: '/search' },
  {
    name: 'search-run-all',
    path: '/search',
    fullPage: true,
    action: async (page) => {
      const btn = page.getByRole('button', { name: /Run all/ });
      if (await btn.count()) {
        await btn.first().click();
        await page.waitForSelector('[data-testid="results-ready"]', { state: 'attached', timeout: 30_000 }).catch(() => {});
        await page.waitForTimeout(900);
      }
    },
  },
  {
    name: 'search-hover',
    path: '/search',
    viewports: ['1440'],
    action: async (page) => {
      const btn = page.getByRole('button', { name: /Run all/ });
      if (await btn.count()) {
        await btn.first().click();
        await page.waitForSelector('[data-testid="results-ready"]', { state: 'attached', timeout: 30_000 }).catch(() => {});
        await page.waitForTimeout(900);
        const row = page.locator('[data-column="hybrid"] [data-memory-id]').first();
        if (await row.count()) await row.hover();
        await page.waitForTimeout(300);
      }
    },
  },
  {
    name: 'search-answer',
    path: '/search',
    fullPage: true,
    viewports: ['1440', '390'],
    action: async (page) => {
      const btn = page.getByRole('button', { name: /Run all/ });
      if (!(await btn.count())) return;
      await btn.first().click();
      await page.waitForSelector('[data-testid="results-ready"]', { state: 'attached', timeout: 30_000 }).catch(() => {});
      const boxes = page.locator('[data-column="hybrid"] button[role="checkbox"]');
      const n = Math.min(2, await boxes.count());
      for (let i = 0; i < n; i++) await boxes.nth(i).click();
      const use = page.getByRole('button', { name: /Use in agent task/ });
      if (await use.count()) {
        await use.first().click();
        await page.waitForSelector('[data-testid="answer-ready"]', { state: 'attached', timeout: 45_000 }).catch(() => {});
        await page.waitForTimeout(400);
      }
    },
  },
  {
    name: 'search-fallback',
    path: '/search?simulate=fallback',
    viewports: ['1440'],
    action: async (page) => {
      await page.getByRole('button', { name: /Run all/ }).first().click();
      await page.waitForSelector('[data-testid="results-ready"]', { state: 'attached', timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(900);
    },
  },
  {
    name: 'search-outcome',
    path: '/search',
    fullPage: true,
    viewports: ['1440'],
    action: async (page) => {
      await page.getByRole('button', { name: /Run all/ }).first().click();
      await page.waitForSelector('[data-testid="results-ready"]', { state: 'attached', timeout: 30_000 }).catch(() => {});
      const boxes = page.locator('[data-column="hybrid"] button[role="checkbox"]');
      for (let i = 0; i < Math.min(2, await boxes.count()); i++) await boxes.nth(i).click();
      await page.getByRole('button', { name: /Use in agent task/ }).first().click();
      await page.waitForSelector('[data-testid="answer-ready"]', { state: 'attached', timeout: 45_000 }).catch(() => {});
      await page.getByRole('button', { name: 'Worked', exact: true }).click();
      await page.getByRole('button', { name: 'Helpful', exact: true }).click();
      await page.getByLabel('Notes').fill('Raised maxPoolSize to 80 and closed export cursors; p99 back under 200 ms.');
      await page.getByRole('button', { name: 'Record outcome' }).click();
      await page.waitForSelector('[data-testid="created-memory"]', { timeout: 30_000 }).catch(() => {});
      await page.getByText('Searchable', { exact: true }).waitFor({ timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(300);
    },
  },
  { name: 'agents', path: '/agents', fullPage: true },
  { name: 'learning', path: '/learning', fullPage: true },
  { name: 'activity', path: '/activity', fullPage: true },
  { name: 'settings', path: '/settings', fullPage: true },
  {
    name: 'task-resumed',
    path: '/agents',
    fullPage: true,
    action: async (page) => {
      const link = page.locator('[data-testid="task-link-resumed"]').first();
      if (await link.count()) {
        await link.click();
        await settle(page);
      }
    },
  },
  { name: 'empty-state', path: '/memories?agentId=000000000000000000000000', viewports: ['1440'] },
  { name: 'not-found', path: '/does-not-exist', viewports: ['1440'] },
  { name: 'dev-ui', path: '/dev/ui', fullPage: true },
  {
    name: 'palette',
    path: '/',
    action: async (page) => {
      await page.keyboard.press('Control+k');
      await page.waitForSelector('[cmdk-input]', { timeout: 5000 });
      await page.keyboard.type('pool');
      await page.waitForTimeout(800);
    },
  },
  {
    name: 'integrations-popover',
    path: '/',
    viewports: ['1440'],
    action: async (page) => {
      await page.getByRole('button', { name: /Integrations:/ }).click();
      await page.waitForTimeout(400);
    },
  },
  {
    name: 'dev-ui-drawer',
    path: '/dev/ui',
    viewports: ['1440', '390'],
    action: async (page) => {
      await page.getByRole('button', { name: 'Open drawer' }).click();
      await page.waitForTimeout(400);
    },
  },
];

async function isUp(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return res.status < 500 || res.status === 503;
  } catch {
    return false;
  }
}

async function waitFor(url, label, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isUp(url)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${label} did not come up at ${url} within ${timeoutMs / 1000}s`);
}

const children = [];
function start(cmd, args, cwd, label) {
  const child = spawn(cmd, args, { cwd, shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  child.stdout.on('data', () => {});
  child.stderr.on('data', (d) => {
    const s = String(d);
    if (/error/i.test(s)) process.stderr.write(`[${label}] ${s}`);
  });
  children.push(child);
  return child;
}

function stopAll() {
  for (const c of children) {
    try {
      if (process.platform === 'win32') spawn('taskkill', ['/pid', String(c.pid), '/T', '/F'], { shell: true });
      else c.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  }
}

async function main() {
  if (!(await isUp(`${API}/api/health`))) {
    console.log('Starting API…');
    start('npm', ['run', 'dev', '-w', 'backend'], repoRoot, 'api');
    await waitFor(`${API}/api/health`, 'API');
  }
  if (!(await isUp(WEB))) {
    console.log('Starting Vite…');
    start('npm', ['run', 'dev', '-w', 'frontend'], repoRoot, 'web');
    await waitFor(WEB, 'Vite');
  }

  const ready = await fetch(`${API}/api/ready`).then((r) => r.json()).catch(() => null);
  console.log(`Atlas: ${ready?.mongo?.connected ? `connected (${ready.mongo.latencyMs} ms)` : `NOT connected — ${ready?.mongo?.detail ?? 'unknown'}`}`);

  if (!only) await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  let count = 0;
  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
      const page = await context.newPage();
      // Warm up: demo login + caches.
      await page.goto(WEB, { waitUntil: 'domcontentloaded' });
      await settle(page);
      for (const shot of SHOTS) {
        if (only && !shot.name.includes(only)) continue;
        if (shot.viewports && !shot.viewports.includes(vp.name)) continue;
        if (shot.skipUnlessEnv && !process.env[shot.skipUnlessEnv]) continue;
        await page.goto(`${WEB}${shot.path}`, { waitUntil: 'domcontentloaded' });
        await settle(page);
        if (shot.action) await shot.action(page);
        const file = resolve(outDir, `${shot.name}@${vp.name}.png`);
        await page.screenshot({ path: file, fullPage: Boolean(shot.fullPage) });
        await page.keyboard.press('Escape').catch(() => {});
        count++;
        console.log(`  ✓ ${shot.name}@${vp.name}`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
    stopAll();
  }
  console.log(`Saved ${count} screenshots to ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  stopAll();
  process.exit(1);
});
