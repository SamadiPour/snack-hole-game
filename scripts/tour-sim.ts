/**
 * Casual Tour pacing: plays every Tour map headless with the greedy bot, from the map's Tour start
 * size until it is cleared, and prints the median over the seeds.
 *
 *   npm run sim:tour                      # casual player (as sim.ts --human), seeds 1-3
 *   npm run sim:tour -- --good --seeds 1-5
 *   npm run sim:tour -- --map airport
 *   npm run sim:tour -- --magnet 1        # try another built-in magnet level (TOUR.magnetLevel)
 */
import { MAPS, TOUR, type MapId } from '../src/config/balance';
import { Bot } from '../src/core/bot';
import { mapDef } from '../src/core/economy';
import { formatDuration } from '../src/core/format';
import { generateMap } from '../src/core/mapgen';
import { Rng } from '../src/core/rng';
import { tourRoundConfig } from '../src/core/tour';
import { World } from '../src/core/world';

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const GOOD = args.includes('--good');
const [s0, s1] = (arg('--seeds') ?? '1-3').split('-').map(Number);
const seeds = Array.from({ length: (s1 ?? s0) - s0 + 1 }, (_, i) => s0 + i);
const only = arg('--map') as MapId | undefined;
const magnet = arg('--magnet');
const DT = 1 / 20;
/** Stop a map that has not been cleared after this long. */
const CAP = 1800;
const MARKS = [120, 240, 360, 480];

// The same player models as sim.ts: --human is the default here.
const profile = GOOD ? { bot: 0.45, stick: 1, cluster: 1.5 } : { bot: 0.45, stick: 0.8, cluster: 0 };

interface MapRun {
  goalAt: number;
  clearAt: number;
  pct: number;
  level: number;
  catchUps: number;
  /** Longest stretch without the hole eating anything. */
  dry: number;
  /** Size (1-based) at each of MARKS. */
  sizeAt: number[];
}

function playMap(id: MapId, seed: number): MapRun {
  const cfg = tourRoundConfig(id);
  if (magnet !== undefined) cfg.magnetLevel = Number(magnet);
  const w = new World(generateMap(id), cfg, { seed });
  const bot = new Bot(profile.bot, { cluster: profile.cluster, rng: new Rng(seed * 7919) });
  const goal = mapDef(id).goal;
  const run: MapRun = { goalAt: cfg.startLevel >= goal ? 0 : NaN, clearAt: NaN, pct: 0, level: 0, catchUps: 0, dry: 0, sizeAt: [] };
  let lastEat = 0;
  while (!w.ended && w.time < CAP) {
    const inp = bot.steer(w, DT);
    w.input = { x: inp.x * profile.stick, z: inp.z * profile.stick };
    w.step(DT);
    for (const e of w.events) {
      if (e.k === 'eat' && e.hole === 0) {
        run.dry = Math.max(run.dry, w.time - lastEat);
        lastEat = w.time;
      } else if (e.k === 'level' && e.level >= goal && isNaN(run.goalAt)) run.goalAt = w.time;
      else if (e.k === 'catchUp') run.catchUps++;
      else if (e.k === 'cleared') run.clearAt = w.time;
    }
    w.events.length = 0;
    for (let i = run.sizeAt.length; i < MARKS.length && w.time >= MARKS[i]; i++) run.sizeAt.push(w.main.level + 1);
  }
  run.pct = w.percentEaten;
  run.level = w.main.level;
  return run;
}

const median = (xs: number[]) => {
  const s = xs.filter((x) => !isNaN(x)).sort((a, b) => a - b);
  return s.length < xs.length ? NaN : s[Math.floor((s.length - 1) / 2)];
};
const time = (s: number) => (isNaN(s) ? '-' : formatDuration(Math.round(s)));

console.log(`Tour, ${GOOD ? 'good' : 'casual'} player, magnet ${magnet ?? TOUR.magnetLevel}, seeds ${seeds.join(',')}: median (min-max)`);
let goals = 0;
let clears = 0;
for (const m of MAPS) {
  if (only && m.id !== only) continue;
  const runs = seeds.map((s) => playMap(m.id, s));
  const span = (f: (r: MapRun) => number) => `${time(median(runs.map(f)))} (${time(Math.min(...runs.map(f)))}-${time(Math.max(...runs.map(f)))})`;
  goals += median(runs.map((r) => r.goalAt));
  clears += median(runs.map((r) => r.clearAt));
  const sizes = MARKS.map((t, i) => `${t / 60}m:${median(runs.map((r) => r.sizeAt[i] ?? r.level + 1))}`).join(' ');
  console.log(
    `${m.name.padEnd(13)} start ${tourRoundConfig(m.id).startLevel + 1} · goal ${m.goal + 1} @ ${span((r) => r.goalAt)} · clear @ ${span((r) => r.clearAt)} (par ${time(TOUR.par[m.id])})` +
      ` · catch-up ${median(runs.map((r) => r.catchUps))} · dry ${Math.round(Math.max(...runs.map((r) => r.dry)))}s · size ${sizes}`,
  );
}
if (!only) console.log(`Whole Tour: every goal ${time(goals)}, every clear ${time(clears)}`);
