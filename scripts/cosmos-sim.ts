/**
 * Cosmos pacing: plays the whole journey headless with the greedy bot, flipping realms for real,
 * and prints the time spent in each realm, the share of it eaten when it flipped, the longest
 * stretch without eating and any safety-net flips, as the median over the seeds, with PASS/FAIL
 * against the targets. "Eaten" is by weight (ground area), out of the realm's props that fit by
 * its goal: the top tier is the next realm's bottom one and cannot be eaten before the flip.
 *
 *   npm run sim:cosmos                       # casual player (as sim.ts --human), seeds 1-3
 *   npm run sim:cosmos -- --good --seeds 1-5
 *   npm run sim:cosmos -- --realm garden     # one realm from its start size (no crumbs carried in)
 *   npm run sim:cosmos -- --static           # props per size level, reachable sizes, best-case share at the goal
 */
import { SIZE } from '../src/config/balance';
import { REALMS, isRealmId } from '../src/config/cosmos';
import { Bot } from '../src/core/bot';
import { cosmosConfig, flipScale } from '../src/core/cosmos';
import { frontierXpMult, levelToEat, radiusForLevel, xpForLevel } from '../src/core/economy';
import { formatDuration } from '../src/core/format';
import { generateRealm } from '../src/core/mapgen/cosmos';
import { spawnLevel } from '../src/core/mapgen/ladder';
import { Rng } from '../src/core/rng';
import { ALIVE, World, type WObj } from '../src/core/world';

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const GOOD = args.includes('--good');
const [s0, s1] = (arg('--seeds') ?? '1-3').split('-').map(Number);
const seeds = Array.from({ length: (s1 ?? s0) - s0 + 1 }, (_, i) => s0 + i);
const only = arg('--realm');
if (only && !isRealmId(only)) throw new Error(`unknown realm ${only}`);
const DT = 1 / 20;
/** Give up on a journey after this long. */
const CAP = 3600;

// The same player models as sim.ts: --human is the default here.
const profile = GOOD ? { bot: 0.45, stick: 1, cluster: 1.5 } : { bot: 0.45, stick: 0.8, cluster: 0 };

/** Targets: per realm (seconds, share eaten at the flip, longest dry stretch) and the whole journey. */
const TARGET = { realm: [75, 210], share: [0.4, 0.75], dry: 8, journey: [15 * 60, 25 * 60] };

/** The props of the realm just entered that fit by its goal: what "eaten at flip" is measured on. */
function edibleByGoal(w: World): WObj[] {
  const goal = w.cfg.cosmos!.goal;
  return w.objects.filter((o) => !o.crumb && o.state === ALIVE && levelToEat(o.f) <= goal);
}

function shareEaten(objs: WObj[]): number {
  let all = 0;
  let eaten = 0;
  for (const o of objs) {
    all += o.w;
    if (o.state !== ALIVE) eaten += o.w;
  }
  return all > 0 ? eaten / all : 0;
}

interface RealmRun {
  time: number;
  share: number;
  dry: number;
  safety: number;
}

function staticReport(): void {
  REALMS.forEach((r, i) => {
    if (only && r.id !== only) return;
    const map = generateRealm(r.id);
    const w = new World(map, cosmosConfig(i), { seed: 1 });
    const per = new Map<number, number>();
    for (const s of map.spawns) per.set(spawnLevel(s), (per.get(spawnLevel(s)) ?? 0) + 1);
    const levels = [...per.keys()].sort((a, b) => a - b);
    // Best case: everything eaten smallest first, each as soon as it fits.
    const objs = [...w.objects].sort((a, b) => a.f - b.f);
    const total = edibleByGoal(w).reduce((n, o) => n + o.w, 0);
    let level = w.main.level;
    let xp = w.main.xp;
    let eaten = 0;
    for (const o of objs) {
      if (level >= r.goal) break;
      const rad = radiusForLevel(level);
      if (o.f > SIZE.fit * rad) break;
      eaten += o.w;
      xp += o.xp * frontierXpMult(o.f, rad);
      while (xp >= xpForLevel(level)) xp -= xpForLevel(level++);
    }
    console.log(
      `${r.name.padEnd(13)} ${String(map.spawns.length).padStart(5)} props · reach size ${w.main.level + w.reachable().levels + 1} (goal ${r.goal + 1}) · smallest-first share at goal ${(
        (eaten / total) *
        100
      ).toFixed(0)}%`,
    );
    console.log(`  per size: ${levels.map((l) => `${l + 1}:${per.get(l)}`).join(' ')}`);
  });
}

/** Plays from realm `from` until the journey ends (or, with `one`, until that realm flips). */
function play(from: number, seed: number, one: boolean): { realms: RealmRun[]; total: number; finished: boolean } {
  const w = new World(generateRealm(REALMS[from].id), cosmosConfig(from), { seed });
  const bot = new Bot(profile.bot, { cluster: profile.cluster, rng: new Rng(seed * 7919) });
  const realms: RealmRun[] = [];
  let edible = edibleByGoal(w);
  let entered = 0;
  let lastEat = 0;
  let dry = 0;
  let finished = false;
  while (w.time < CAP) {
    const inp = bot.steer(w, DT);
    w.input = { x: inp.x * profile.stick, z: inp.z * profile.stick };
    w.step(DT);
    for (const e of w.events) {
      if (e.k !== 'eat' || e.hole !== 0) continue;
      dry = Math.max(dry, w.time - lastEat);
      lastEat = w.time;
    }
    w.events.length = 0;
    if (!w.realmPending) continue;
    realms.push({ time: w.time - entered, share: shareEaten(edible), dry, safety: w.safetyFlips });
    w.safetyFlips = 0;
    if (one || !flipScale(w)) {
      finished = !one;
      break;
    }
    bot.reset();
    edible = edibleByGoal(w);
    entered = lastEat = w.time;
    dry = 0;
  }
  return { realms, total: w.time, finished };
}

const median = (xs: number[]) => {
  const s = xs.filter((x) => !isNaN(x)).sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN;
};
const time = (s: number) => (isNaN(s) ? '-' : formatDuration(Math.round(s)));
const mark = (ok: boolean) => (ok ? 'PASS' : 'FAIL');

if (args.includes('--static')) staticReport();
else {
  const from = only ? REALMS.findIndex((r) => r.id === only) : 0;
  const runs = seeds.map((s) => play(from, s, !!only));
  console.log(`Cosmos, ${GOOD ? 'good' : 'casual'} player, seeds ${seeds.join(',')}: median (min-max)`);
  let fails = 0;
  REALMS.forEach((r, i) => {
    if (i < from || (only && r.id !== only)) return;
    const rs = runs.map((x) => x.realms[i - from]).filter(Boolean);
    if (!rs.length) {
      console.log(`${r.name.padEnd(13)} not reached`);
      fails++;
      return;
    }
    const t = rs.map((x) => x.time);
    const share = median(rs.map((x) => x.share));
    const dry = Math.max(...rs.map((x) => x.dry));
    const safety = rs.reduce((n, x) => n + x.safety, 0);
    const ok = [
      median(t) >= TARGET.realm[0] && median(t) <= TARGET.realm[1],
      share >= TARGET.share[0] && share <= TARGET.share[1],
      dry <= TARGET.dry,
      safety === 0,
    ];
    fails += ok.filter((v) => !v).length;
    console.log(
      `${r.name.padEnd(13)} ${time(median(t))} (${time(Math.min(...t))}-${time(Math.max(...t))}) ${mark(ok[0])}` +
        ` · eaten at flip ${(share * 100).toFixed(0)}% ${mark(ok[1])} · dry ${dry.toFixed(1)}s ${mark(ok[2])} · safety flips ${safety} ${mark(ok[3])}`,
    );
  });
  if (!only) {
    const totals = runs.map((x) => (x.finished ? x.total : NaN));
    const total = median(totals);
    const ok = total >= TARGET.journey[0] && total <= TARGET.journey[1];
    if (!ok) fails++;
    console.log(`Whole journey ${time(total)} (${runs.map((x) => (x.finished ? time(x.total) : 'unfinished')).join(', ')}) ${mark(ok)}`);
  }
  console.log(fails ? `${fails} target(s) missed` : 'every target met');
}
