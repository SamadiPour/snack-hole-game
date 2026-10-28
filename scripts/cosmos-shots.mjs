// Screenshots of Cosmos realms: each one at its start size, mid-way, near its goal, and just after
// it flips into the next realm. Starts its own dev server unless BASE_URL is set.
// Usage: node scripts/cosmos-shots.mjs [--out DIR] [realmId...]   (default DIR: $TMPDIR/snack-hole-cosmos)
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { devServer } from './devServer.mjs';

const REALMS = ['quantum', 'atomic', 'molecular', 'microbial', 'garden', 'hometown', 'earth', 'solar', 'galaxy'];
const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
const out = outAt >= 0 ? args[outAt + 1] : join(tmpdir(), 'snack-hole-cosmos');
const only = args.filter((a, i) => a !== '--out' && i !== outAt + 1);
const realms = only.length ? only : REALMS;
mkdirSync(out, { recursive: true });

const server = await devServer();
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

/** Puts the hole at size level `level` (0-based) and lets the camera settle. */
async function sizeTo(level) {
  await page.evaluate((l) => {
    const h = window.game.debugState.world.main;
    h.level = l;
    h.baseR = h.r = 0.75 * 1.125 ** l;
    h.xp = 0;
  }, level);
  await page.waitForTimeout(3500);
}

for (const id of realms) {
  const i = REALMS.indexOf(id);
  if (i < 0) throw new Error(`unknown realm ${id}`);
  await page.goto(`${server.base}?mute&fresh&seed=1&realm=${i}`);
  await page.waitForFunction(() => window.game !== undefined);
  await page.evaluate(() => {
    window.game.setMode('cosmos');
    window.game.play();
  });
  await page.waitForTimeout(2500);
  const info = await page.evaluate(() => {
    const w = window.game.debugState.world;
    return { props: w.objects.length, start: w.main.level, goal: w.cfg.cosmos.goal };
  });
  await page.screenshot({ path: join(out, `cosmos-${id}-1-start.png`) });
  await sizeTo(Math.round((info.start + info.goal) / 2));
  await page.screenshot({ path: join(out, `cosmos-${id}-2-mid.png`) });
  await sizeTo(info.goal - 1);
  await page.screenshot({ path: join(out, `cosmos-${id}-3-goal.png`) });
  if (i + 1 < REALMS.length) {
    await page.evaluate(() => window.game.cosmosSkip());
    await page.waitForTimeout(3000);
    await page.screenshot({ path: join(out, `cosmos-${id}-4-flipped.png`) });
  }
  console.log(`${id}: ${info.props} props, sizes ${info.start + 1} to ${info.goal + 1}`);
}
console.log(`screenshots in ${out}`);
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
await server.close();
