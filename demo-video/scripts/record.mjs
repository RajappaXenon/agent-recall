#!/usr/bin/env node
/**
 * Records the real Agent Recall UI (http://localhost:5173) at 1920×1080 with Playwright,
 * capturing frames through the Chrome DevTools screencast (JPEG q92) so text stays sharp.
 *
 * Scenes are timed to the narration clip lengths: each scene starts at a fixed offset on
 * the app timeline, performs real clicks/typing, then holds until its slot ends.
 * Output: <framesDir>/*.jpg + demo-video/recording/timeline.json
 *
 * Usage: node demo-video/scripts/record.mjs <framesDir>
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const framesDir = resolve(process.argv[2] ?? resolve(root, 'recording/frames'));
const WEB = 'http://localhost:5173';
const QUERY = 'Orders API keeps hitting 504s after we shrank the database driver pool. How did we fix it before?';
const INCIDENT = 'Checkout API timed out after connection pool change';
const PROCEDURE = 'Fix connection pool exhaustion after a pool size change';
const NOTE = 'Raised maxPoolSize to 80 and closed export cursors. The 504s stopped.';

/** App-timeline slots (seconds). Sum = 52 s; narration starts 0.4 s into each slot. */
const SCENES = [
  { id: 's1-incident', seconds: 10.0 },
  { id: 's2-search', seconds: 12.5 },
  { id: 's3-answer', seconds: 10.5 },
  { id: 's4-outcome', seconds: 8.5 },
  { id: 's5-reload', seconds: 10.5 },
];

rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });
mkdirSync(resolve(root, 'recording'), { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, colorScheme: 'dark' });
// Recording-only overlay: a visible pointer + click ripple so viewers can follow the actions.
// It lives in this browser context only; the application code is unchanged.
await context.addInitScript(() => {
  const install = () => {
    if (document.getElementById('__demo-cursor')) return;
    const c = document.createElement('div');
    c.id = '__demo-cursor';
    c.innerHTML =
      '<svg width="28" height="28" viewBox="0 0 24 24"><path d="M4 2l15 9.5-6.6 1.3L9 19.5z" fill="#fff" stroke="#0b0d12" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: 'fixed', left: '-100px', top: '-100px', zIndex: 2147483647, pointerEvents: 'none', transform: 'translate(-3px,-2px)', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.5))' });
    document.documentElement.appendChild(c);
    addEventListener('mousemove', (e) => {
      c.style.left = `${e.clientX}px`;
      c.style.top = `${e.clientY}px`;
    }, true);
    addEventListener('mousedown', (e) => {
      const r = document.createElement('div');
      Object.assign(r.style, {
        position: 'fixed', left: `${e.clientX - 18}px`, top: `${e.clientY - 18}px`, width: '36px', height: '36px', borderRadius: '50%',
        border: '2px solid rgba(139,124,255,.9)', zIndex: 2147483646, pointerEvents: 'none', transition: 'transform .35s ease-out, opacity .35s ease-out',
      });
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => {
        r.style.transform = 'scale(1.8)';
        r.style.opacity = '0';
      });
      setTimeout(() => r.remove(), 400);
    }, true);
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', install);
  else install();
});
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push(String(e)));

let mouse = { x: 960, y: 540 };
async function moveTo(locator, { click = false, steps = 22 } = {}) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('target not visible');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y, { steps });
  mouse = { x, y };
  if (click) {
    await page.mouse.down();
    await page.mouse.up();
  }
}
async function smoothScrollTo(locator, offset = 120) {
  const top = await locator.evaluate((el, off) => el.getBoundingClientRect().top + window.scrollY - off, offset);
  await page.evaluate((t) => window.scrollTo({ top: t, behavior: 'smooth' }), top);
  await page.waitForTimeout(700);
}
const pause = (ms) => page.waitForTimeout(ms);

// ── Warm-up (not recorded): sign-in, data, fonts ─────────────────────────────
await page.goto(`${WEB}/search`);
await page.waitForLoadState('networkidle');
await page.goto(`${WEB}/memories`);
await page.waitForLoadState('networkidle');
await page.evaluate(() => document.fonts.ready);
await page.mouse.move(mouse.x, mouse.y);
await pause(800);

// ── Screencast ───────────────────────────────────────────────────────────────
const cdp = await context.newCDPSession(page);
const frames = [];
let n = 0;
cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
  const file = `f${String(n++).padStart(6, '0')}.jpg`;
  frames.push({ file, ts: metadata.timestamp });
  writeFileSync(resolve(framesDir, file), Buffer.from(data, 'base64'));
  try {
    await cdp.send('Page.screencastFrameAck', { sessionId });
  } catch {
    /* session closed */
  }
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
const t0 = Date.now() / 1000;
const timeline = [];
const marks = {}; // named moments (s since t0) the build aligns narration to
const mark = (name) => (marks[name] = Number((Date.now() / 1000 - t0).toFixed(3)));
let cursor = 0;

async function scene(id, seconds, fn) {
  const start = cursor;
  const wallStart = t0 + start;
  const wait = wallStart - Date.now() / 1000;
  if (wait > 0) await pause(wait * 1000);
  const began = Date.now() / 1000 - t0;
  await fn();
  const actionsDone = Date.now() / 1000 - t0;
  cursor = start + seconds;
  const holdUntil = t0 + cursor;
  const rest = holdUntil - Date.now() / 1000;
  if (rest > 0) await pause(rest * 1000);
  const overrun = actionsDone > cursor;
  timeline.push({ id, slotStart: start, slotEnd: cursor, began: Number(began.toFixed(3)), actionsDone: Number(actionsDone.toFixed(3)), overrun });
  console.log(`${id.padEnd(12)} slot ${start.toFixed(1)}–${cursor.toFixed(1)} s · actions done at ${actionsDone.toFixed(2)} s${overrun ? '  ⚠ OVERRUN' : ''}`);
}

// 1. The past incident is already in memory.
await scene(SCENES[0].id, SCENES[0].seconds, async () => {
  await pause(700);
  const row = page.locator('[data-testid="memory-row"]', { hasText: INCIDENT }).first();
  await moveTo(row, { steps: 30 });
  await pause(500);
  await moveTo(row, { click: true, steps: 4 });
  await page.getByRole('dialog').waitFor();
  await pause(600);
});

// 2. A new problem, worded differently → Run all.
await scene(SCENES[1].id, SCENES[1].seconds, async () => {
  await page.keyboard.press('Escape');
  await pause(300);
  await moveTo(page.getByRole('link', { name: 'Search Playground' }), { click: true });
  const box = page.getByRole('textbox', { name: 'Query' });
  await box.waitFor();
  await pause(150);
  await moveTo(box, { click: true, steps: 12 });
  await page.keyboard.press('Control+A');
  await page.keyboard.type(QUERY, { delay: 6 });
  await pause(150);
  // Run all lands while the narration introduces the three modes.
  await moveTo(page.getByRole('button', { name: /Run all/ }), { click: true, steps: 12 });
  mark('run-all');
  await page.waitForSelector('[data-testid="results-ready"]', { state: 'attached', timeout: 20_000 });
  await pause(1800);
  // Hover the old incident in the Hybrid column: its keyword + semantic lines light up.
  await moveTo(page.locator('[data-column="hybrid"] [data-memory-id]', { hasText: INCIDENT }).first(), { steps: 26 });
  await pause(900);
});

// 3. Select evidence → grounded answer with citations.
await scene(SCENES[2].id, SCENES[2].seconds, async () => {
  const hybrid = page.locator('[data-column="hybrid"]');
  await moveTo(hybrid.getByRole('checkbox', { name: `Select ${PROCEDURE}` }), { click: true, steps: 16 });
  await pause(250);
  await moveTo(hybrid.getByRole('checkbox', { name: `Select ${INCIDENT}` }), { click: true, steps: 16 });
  await pause(250);
  const use = page.getByRole('button', { name: /Use in agent task/ });
  await smoothScrollTo(use, 520);
  await moveTo(use, { click: true, steps: 18 });
  await page.waitForSelector('[data-testid="answer-ready"]', { state: 'attached', timeout: 30_000 });
  await pause(500);
  await smoothScrollTo(page.getByRole('heading', { name: 'Grounded answer' }), 90);
  const chip = page.getByRole('button', { name: /^Citation 1/ }).first();
  if (await chip.count()) await moveTo(chip, { steps: 24 });
  await pause(500);
});

// 4. Record that it worked → new verified memory, searchable.
await scene(SCENES[3].id, SCENES[3].seconds, async () => {
  await smoothScrollTo(page.getByRole('heading', { name: 'Did this work?' }), 360);
  await moveTo(page.getByRole('button', { name: 'Worked', exact: true }), { click: true, steps: 16 });
  await moveTo(page.getByRole('button', { name: 'Helpful', exact: true }), { click: true, steps: 12 });
  await moveTo(page.getByRole('textbox', { name: 'Notes' }), { click: true, steps: 12 });
  await page.keyboard.type(NOTE, { delay: 10 });
  await moveTo(page.getByRole('button', { name: 'Record outcome' }), { click: true, steps: 14 });
  await page.getByTestId('created-memory').waitFor({ timeout: 20_000 });
  await smoothScrollTo(page.getByTestId('created-memory'), 360);
  await page.getByText('Searchable', { exact: true }).waitFor({ timeout: 30_000 });
  await moveTo(page.getByText('Searchable', { exact: true }), { steps: 20 });
  await pause(400);
});

// 5. Full page reload → the new memory is still there (persisted in Atlas).
await scene(SCENES[4].id, SCENES[4].seconds, async () => {
  await moveTo(page.getByRole('link', { name: 'Memory Explorer' }), { click: true });
  await page.locator('[data-testid="memory-row"]').first().waitFor();
  await pause(250);
  mark('reload');
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.mouse.move(mouse.x, mouse.y);
  const fresh = page.locator('[data-testid="memory-row"]', { hasText: 'Resolved: Orders API' }).first();
  await fresh.waitFor({ timeout: 15_000 });
  await pause(500);
  await moveTo(fresh, { steps: 26 });
  await pause(300);
  await moveTo(fresh, { click: true, steps: 3 });
  await page.getByRole('dialog').waitFor();
  await pause(350);
  // Provenance: created from a recorded outcome, verified, with the memories it was based on.
  await moveTo(page.getByRole('tab', { name: 'Provenance' }), { click: true, steps: 14 });
  await pause(500);
});

await cdp.send('Page.stopScreencast');
await pause(300);
await browser.close();

const out = {
  t0,
  appSeconds: SCENES.reduce((s, x) => s + x.seconds, 0),
  frames: frames.map((f) => ({ file: f.file, t: Number((f.ts - t0).toFixed(4)) })),
  scenes: timeline,
  marks,
  consoleErrors,
  query: QUERY,
};
writeFileSync(resolve(root, 'recording/timeline.json'), JSON.stringify(out, null, 2));
console.log(`frames: ${frames.length} · console errors: ${consoleErrors.length}`);
if (consoleErrors.length) console.log(consoleErrors.slice(0, 5));
