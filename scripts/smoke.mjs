// Smoke test: loads the game, plays a round, buys upgrades, checks for console errors and
// saves screenshots to screenshots/. Needs a local Google Chrome; starts its own dev server
// unless given one. Usage: node scripts/smoke.mjs [baseUrl]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { devServer } from './devServer.mjs';

const server = await devServer(process.argv[2]);
const base = server.base;
mkdirSync('screenshots', { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const errors = [];
const watch = (page) => {
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[console] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
};

async function run(viewport, prefix) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: prefix === 'mobile' });
  const page = await ctx.newPage();
  watch(page);
  await page.goto(base);
  await page.waitForFunction(() => window.game !== undefined);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `screenshots/${prefix}-01-hub.png` });

  // Round 1, sped up with the debug time warp.
  await page.click('.play-btn', { force: true });
  await page.waitForTimeout(600);
  await page.evaluate(() => (window.game.warp = 4));
  if (prefix === 'desktop') {
    // Mouse steering: pointer right of centre moves the hole toward +X.
    const x0 = await page.evaluate(() => window.game.debugState.world.main.x);
    await page.mouse.move(viewport.width / 2 + 250, viewport.height / 2);
    await page.waitForTimeout(800);
    const x1 = await page.evaluate(() => window.game.debugState.world.main.x);
    console.log('mouse steer dx', (x1 - x0).toFixed(2));
    if (!(x1 > x0 + 0.5)) errors.push('mouse steering did not move the hole');
    await page.mouse.move(viewport.width / 2, viewport.height / 2);
  }
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(1200);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `screenshots/${prefix}-02-round.png` });
  await page.keyboard.up('ArrowLeft');
  await page.waitForFunction(() => window.game.debugState.state === 'results', null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `screenshots/${prefix}-03-results.png` });
  await page.click('.results-modal .btn.primary');
  await page.waitForTimeout(500);

  // Buy whatever is affordable.
  for (let i = 0; i < 6; i++) {
    const btn = await page.$('.buy.can');
    if (!btn) break;
    await btn.click();
    await page.waitForTimeout(150);
  }
  await page.screenshot({ path: `screenshots/${prefix}-04-shop.png` });
  const state = await page.evaluate(() => {
    const s = window.game.debugState.save;
    return { cash: s.cash, rounds: s.rounds ?? s.stats.rounds, upgrades: s.upgrades, gulpedia: Object.keys(s.gulpedia).length };
  });
  console.log(prefix, JSON.stringify(state));

  // A bigger, later-game round to check performance and visuals.
  await page.evaluate(() => {
    const s = window.game.debugState.save;
    s.upgrades.startSize = 14;
    s.upgrades.speed = 6;
    s.abilities.dash = 1;
    s.abilities.vortex = 1;
    s.helpers = 3;
    window.game.warp = 1;
  });
  await page.click('.play-btn', { force: true });
  await page.waitForTimeout(800);
  await page.keyboard.down('d');
  await page.keyboard.press('2');
  await page.waitForTimeout(3500);
  const fps = await page.evaluate(
    () =>
      new Promise((res) => {
        let n = 0;
        const t0 = performance.now();
        const f = () => {
          n++;
          if (performance.now() - t0 < 1000) requestAnimationFrame(f);
          else res(n);
        };
        requestAnimationFrame(f);
      }),
  );
  console.log(prefix, 'fps (software GL)', fps);
  await page.screenshot({ path: `screenshots/${prefix}-05-biground.png` });
  await page.keyboard.up('d');
  const ms = await page.evaluate(() => window.game.debugState.frameMs);
  const sim = await page.evaluate(() => window.game.debugState.simMs + window.game.debugState.syncMs);
  console.log(prefix, 'avg JS frame ms', ms.toFixed(2), 'sim+sync ms', sim.toFixed(2), 'objects', await page.evaluate(() => window.game.debugState.world.objects.length));

  if (prefix === 'desktop') {
    // Offline progress: pretend we left 2 hours ago (pays from the rounds just played).
    await page.evaluate(() => {
      window.game.debugState.world.timeLeft = 0.01;
    });
    await page.waitForFunction(() => window.game.debugState.state === 'results', null, { timeout: 30000 });
    await page.click('.results-modal .btn.primary');
    await page.evaluate(() => {
      const g = window.game;
      g.persist();
      const raw = JSON.parse(localStorage.getItem('snack-hole-save'));
      raw.lastSeen = Date.now() - 2 * 3600 * 1000;
      localStorage.setItem('snack-hole-save', JSON.stringify(raw));
      // Keep the doctored save: stop the unload autosave from overwriting it.
      g.persist = () => {};
    });
    const cashBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('snack-hole-save')).cash);
    await page.goto(base);
    await page.waitForSelector('.offline', { timeout: 10000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `screenshots/${prefix}-06-offline.png` });
    const cashAfter = await page.evaluate(() => window.game.debugState.save.cash);
    console.log('offline earned', (cashAfter - cashBefore).toFixed(0));
    if (!(cashAfter > cashBefore)) errors.push('offline earnings missing');
    await page.click('.offline .btn.primary');

    // Prestige flow.
    await page.evaluate(() => {
      const s = window.game.debugState.save;
      s.maps.farm = true;
      s.maps.downtown = true;
      s.lifetimeCash = 2e9;
      window.game.hub.selectTab('singularity');
    });
    await page.waitForTimeout(500);
    await page.click('.sing-btn');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `screenshots/${prefix}-07-prestige-confirm.png` });
    // The reset button only fires when held. Hold until the reset goes through, not for a fixed
    // time: headless frames can come 400 ms apart, so a release soon after the 1.2 s hold can land
    // before the frame that would have finished it.
    await page.locator('.modal .hold-btn').hover();
    await page.mouse.down();
    await page.waitForFunction(() => window.game.debugState.save.dm > 0, null, { polling: 100, timeout: 10000 }).catch(() => {});
    await page.mouse.up();
    await page.waitForTimeout(1800);
    const dm = await page.evaluate(() => window.game.debugState.save.dm);
    console.log('dm after prestige', dm);
    if (!(dm >= 10)) errors.push('prestige did not grant DM');
    await page.screenshot({ path: `screenshots/${prefix}-08-after-prestige.png` });
  }

  // Cosmos: start a journey, flip into the next realm, end the journey.
  if (await page.evaluate(() => window.game.debugState.state === 'round')) {
    await page.evaluate(() => {
      window.game.debugState.world.timeLeft = 0.01;
    });
    await page.waitForFunction(() => window.game.debugState.state === 'results', null, { timeout: 30000 });
    await page.click('.results-modal .btn.primary');
    await page.waitForTimeout(500);
  }
  await page.evaluate(() => {
    window.game.setMode('cosmos');
    window.game.play();
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.game.cosmosSkip());
  await page.waitForFunction(() => window.game.debugState.world.cfg.cosmos?.realm === 1, null, { timeout: 10000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `screenshots/${prefix}-09-cosmos.png` });
  await page.evaluate(() => {
    window.game.debugState.world.timeLeft = 0.01;
  });
  await page.waitForFunction(() => window.game.debugState.state === 'results', null, { timeout: 30000 });
  const runs = await page.evaluate(() => window.game.debugState.save.cosmos.runs);
  if (runs !== 1) errors.push(`cosmos run not booked (runs ${runs})`);
  await page.click('.results-modal .btn.ghost');
  console.log(prefix, 'cosmos journey ok');
  await ctx.close();
}

await run({ width: 1280, height: 800 }, 'desktop');
await run({ width: 390, height: 844 }, 'mobile');
await browser.close();
await server.close();
if (errors.length) {
  console.error('Console errors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('Smoke OK');
