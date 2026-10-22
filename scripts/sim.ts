/**
 * Headless balance simulation: a greedy player plays real rounds (same World + map generators as
 * the game, steered by the Bot), shops between rounds and prestiges. Prints when each unlock
 * happens and, with --report, checks the pacing targets from DESIGN.md.
 *
 *   npm run sim                      # 2 runs, event log
 *   npm run sim -- --runs 4 --report # pacing report with PASS/FAIL per target
 *   npm run sim -- --human           # casual player: 80% stick, abilities ~5 s after they are ready
 *   npm run sim -- --good            # good player: full stick, abilities on ready, steers into dense patches
 *   npm run sim -- --trace           # per-round level-up timeline
 *   npm run sim -- --moon            # hold the first Singularity until Moon Base is unlocked
 *   npm run sim -- --seed 7          # different (but reproducible) world seeds
 *   npm run sim -- --human --runs 6 --seeds 1-10  # report for each seed, run in parallel, side by side
 *
 * The player only plays: it never leaves the game, so it skips what only pays while away
 * (Offline Vault, Hawking Radiation).
 */
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { ABILITIES, DM_UPGRADES, HELPERS, MAP_CLEARED_FRACTION, MAPS, PRESTIGE, ROUND_END, SIZE, UPGRADES, type MapId } from '../src/config/balance';
import { checkAchievements } from '../src/core/achievements';
import { Bot } from '../src/core/bot';
import * as eco from '../src/core/economy';
import { formatDuration, formatNumber } from '../src/core/format';
import { generateMap } from '../src/core/mapgen';
import { Rng } from '../src/core/rng';
import { settleRound, summarizeRound } from '../src/core/round';
import { defaultSave, type SaveData } from '../src/core/save';
import { World } from '../src/core/world';

const args = process.argv.slice(2);
const arg = (name: string, def: number) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const RUNS = arg('--runs', 2);
const VERBOSE = args.includes('--verbose');
const TRACE = args.includes('--trace');
const REPORT = args.includes('--report');
const HUMAN = args.includes('--human');
const GOOD = args.includes('--good');
const MODEL = GOOD ? 'good' : HUMAN ? 'human' : 'bot';
const HOLD_MOON = args.includes('--moon');
const SEED = arg('--seed', 1);
const SEEDS = args.includes('--seeds') ? args[args.indexOf('--seeds') + 1] : '';
/** Child of a --seeds run: print the report as one JSON line for the parent. */
const JSON_OUT = args.includes('--json');
/**
 * World seeds, one per round in the order rounds are played. Ability rolls draw from their own
 * stream, so a change to what the bot buys or casts does not reshuffle every later round's world.
 */
const worldRng = new Rng(SEED);
const rollRng = new Rng(SEED * 7919 + 13);
/** The bot's roaming and sampling, kept off the world's Rng so steering changes leave its events alone. */
const botRng = new Rng(SEED * 104729 + 7);
const DT = 1 / 20;

/** Player model: how quickly the bot re-targets, how hard it pushes the stick, how it fires abilities. */
interface Profile {
  bot: number;
  stick: number;
  /** Ability casts per second once one is ready (Infinity = the moment it is ready). */
  castRate: number;
  /** Bot cluster steering (BotOptions.cluster). */
  cluster: number;
  /** Seconds spent on results + shop per round. */
  overhead: number;
}
const PROFILES: Record<typeof MODEL, Profile> = {
  bot: { bot: 0.8, stick: 1, castRate: Infinity, cluster: 0, overhead: 12 },
  // A casual player: about 5 s to notice a ready ability, the stick or mouse not pushed all the way.
  human: { bot: 0.45, stick: 0.8, castRate: 0.2, cluster: 0, overhead: 20 },
  // A good player: full speed (keys, or the mouse past 24% of the screen), abilities tapped on
  // ready, steering into dense patches. About 40% faster than `human` before any retune.
  good: { bot: 0.45, stick: 1, castRate: Infinity, cluster: 1.5, overhead: 20 },
};
const BASE = PROFILES[MODEL];
const withSkill = (s: number): Profile => ({ ...BASE, bot: BASE.bot * s, stick: Math.min(1, BASE.stick * (0.8 + 0.2 * s)) });

// ---------------------------------------------------------------- round

interface RoundStats {
  map: MapId;
  /** Round cash; when the round is recorded, what the game credits. */
  cash: number;
  pct: number;
  startLevel: number;
  endLevel: number;
  roundTime: number;
  /** Seconds into the round of each main-hole level-up. */
  levelTimes: number[];
  /** Share of the map eaten when the main hole reached the map's goal this round (NaN if it did not). */
  goalPct: number;
  /** Seconds between the last main-hole swallow and the end of the round. */
  deadTime: number;
  /** Seconds actually played (shorter than roundTime if the round ended early). */
  played: number;
  /** Seconds until the results show: played plus the end delay while the last props fall. */
  wall: number;
  /** Maps the recorded round unlocked. */
  unlocked: MapId[];
}

/**
 * The player ends the round from the pause menu once the hole cannot grow any more and only crumbs
 * are left: worth less than this share of the round's cash so far. Round cash includes combo, so
 * the crumbs are valued at the combo cap. A map not cleared before is played out to 100%, and a
 * random event in progress may still bring snacks.
 */
const QUIT_CRUMBS = 0.05;
function onlyCrumbsLeft(w: World): boolean {
  const r = w.reachable();
  if (r.count === 0 || w.eventId) return false;
  if (!w.cfg.mapCleared && w.weightEaten + r.weight >= w.weightTotal * MAP_CLEARED_FRACTION) return false;
  return r.levels === 0 && r.cash * w.cfg.comboCap < w.cash * QUIT_CRUMBS;
}

function playRound(save: SaveData, p: Profile, record = true, seed = worldRng.int(1, 1e6)): RoundStats {
  const cfg = eco.buildRoundConfig(save);
  const w = new World(generateMap(save.selectedMap), cfg, { seed });
  const bot = new Bot(p.bot, { cluster: p.cluster, rng: botRng });
  // The cast rate is per second, so the chance per step does not depend on DT.
  const castChance = 1 - Math.exp(-p.castRate * DT);
  const levelTimes: number[] = [];
  const goal = eco.mapDef(save.selectedMap).goal;
  // A hole that starts at the goal has it before eating anything.
  let goalPct = cfg.startLevel >= goal ? 0 : NaN;
  let lastEat = 0;
  let endAt = 0;
  let quitCheck = ROUND_END.checkEvery;
  while (!w.ended) {
    const inp = bot.steer(w, DT);
    w.input = { x: inp.x * p.stick, z: inp.z * p.stick };
    for (const a of ABILITIES) if (w.abilityReady(a.id) && rollRng.chance(castChance)) w.useAbility(a.id);
    w.step(DT);
    if (w.running && (quitCheck -= DT) <= 0) {
      quitCheck = ROUND_END.checkEvery;
      // As the pause menu's End round does.
      if (onlyCrumbsLeft(w)) w.timeLeft = 0;
    }
    for (const e of w.events) {
      if (e.k === 'level') {
        levelTimes.push(w.time);
        if (e.level === goal) goalPct = w.percentEaten;
      }
      else if (e.k === 'eat' && e.hole === 0) lastEat = w.time;
      else if ((e.k === 'timeUp' || e.k === 'cleared' || e.k === 'snackedOut') && !endAt) endAt = w.time;
    }
    w.events.length = 0;
  }
  if (!endAt) endAt = w.time;
  const stats: RoundStats = {
    map: save.selectedMap,
    cash: w.cash,
    pct: w.percentEaten,
    startLevel: cfg.startLevel,
    endLevel: w.main.level,
    roundTime: cfg.roundTime,
    levelTimes,
    goalPct,
    deadTime: Math.max(0, endAt - lastEat),
    played: endAt,
    wall: w.time,
    unlocked: [],
  };
  if (!record) return stats;
  // The same bookkeeping as the game's end of round (records, map unlocks).
  const settled = settleRound(save, summarizeRound(w));
  stats.cash = settled.total;
  stats.unlocked = settled.unlockedMaps;
  if (settled.completed) mark(`100-${stats.map}-${currentRun}`, `100% of ${stats.map}!`);
  checkAchievements(save);
  return stats;
}

// ---------------------------------------------------------------- shopping policy

type Option = { name: string; cost: number; buy: () => boolean; key: string };

function options(s: SaveData): Option[] {
  const out: Option[] = [];
  for (const u of UPGRADES) {
    if (!eco.isUpgradeVisible(s, u) || s.upgrades[u.id] >= u.max || u.id === 'offline') continue;
    out.push({ name: u.name, key: `u-${u.id}`, cost: eco.upgradeCost(u.id, s.upgrades[u.id], eco.priceScale(s)), buy: () => eco.buyUpgrade(s, u.id, 1) > 0 });
  }
  if (s.runCash >= HELPERS.unlockAt && s.helpers < HELPERS.countCosts.length)
    out.push({ name: `Helper #${s.helpers + 1}`, key: `h-${s.helpers + 1}`, cost: eco.helperCountCost(s.helpers, eco.fixedPriceScale(s)), buy: () => eco.buyHelper(s) });
  if (s.helpers > 0 && s.helperLevel < HELPERS.levelMax)
    out.push({ name: 'Helper level', key: 'hl', cost: eco.helperLevelCost(s.helperLevel, eco.fixedPriceScale(s)), buy: () => eco.buyHelperLevel(s) });
  for (const a of ABILITIES) {
    if (!eco.isAbilityVisible(s, a) || s.abilities[a.id] >= a.maxLevel) continue;
    out.push({ name: `${a.name} ${s.abilities[a.id] === 0 ? 'unlock' : 'level'}`, key: `a-${a.id}-${s.abilities[a.id] === 0 ? 0 : 1}`, cost: eco.abilityCost(a.id, s.abilities[a.id], eco.fixedPriceScale(s)), buy: () => eco.buyAbility(s, a.id) });
  }
  return out;
}

interface ShopStats {
  purchases: number;
  /** Cheapest option left after shopping, in rounds of last round's income (Infinity if none). */
  cheapestRounds: number;
  /**
   * Rounds of last round's income still missing for the cheapest option left, after the cash
   * left over from shopping (Infinity if none): <= 1 means it is affordable after the next round.
   */
  waitRounds: number;
  /** Next Starting Size level, in rounds of last round's income. */
  sizeRounds: number;
}

/** Buys the cheapest affordable option until nothing is affordable; returns how many it bought. */
function buyAffordable(s: SaveData): number {
  let purchases = 0;
  for (let guard = 0; guard < 400; guard++) {
    const opts = options(s).filter((o) => o.cost <= s.cash).sort((a, b) => a.cost - b.cost);
    if (!opts.length) break;
    const o = opts[0];
    if (!o.buy()) break;
    purchases++;
    if (!seen.has(o.key)) mark(o.key, `buy ${o.name} (${formatNumber(o.cost)})`);
  }
  return purchases;
}

function shop(s: SaveData, lastRoundCash: number): ShopStats {
  const purchases = buyAffordable(s);
  const inc = Math.max(1, lastRoundCash);
  const cheapest = Math.min(Infinity, ...options(s).map((o) => o.cost));
  return {
    purchases,
    cheapestRounds: cheapest / inc,
    waitRounds: (cheapest - s.cash) / inc,
    sizeRounds: eco.upgradeCost('startSize', s.upgrades.startSize, eco.priceScale(s)) / inc,
  };
}

function bestMap(s: SaveData): MapId {
  let best: MapId = 'suburb';
  for (const m of MAPS) if (s.maps[m.id]) best = m.id;
  return best;
}

function buyDmTree(save: SaveData): void {
  for (let guard = 0; guard < 200; guard++) {
    const opts = DM_UPGRADES.filter((d) => eco.dmLevel(save, d.id) < d.max && d.id !== 'hawking')
      .map((d) => ({ d, c: eco.dmUpgradeCost(d.id, eco.dmLevel(save, d.id)) }))
      .filter((o) => o.c <= save.dm)
      .sort((a, b) => a.c - b.c);
    if (!opts.length) break;
    eco.buyDmUpgrade(save, opts[0].d.id);
  }
}

// ---------------------------------------------------------------- several seeds

/** `--seeds 1-3` or `--seeds 1,4,7`. */
function seedList(spec: string): number[] {
  const out: number[] = [];
  for (const part of spec.split(',')) {
    const [a, b = a] = part.split('-').map(Number);
    for (let s = a; s <= b; s++) out.push(s);
  }
  return out;
}

interface SeedReport {
  seed: number;
  runs: string[];
  checks: [string, string, boolean][];
}

/** Runs the report once per seed in parallel child processes and prints them side by side. */
async function reportSeeds(seeds: number[]): Promise<void> {
  const flags = ['--seeds', '--seed'];
  const rest = args.filter((a, i) => !flags.includes(a) && !flags.includes(args[i - 1]));
  const runOne = (seed: number) =>
    new Promise<SeedReport>((resolve, reject) => {
      const childArgs = [...process.execArgv, process.argv[1], ...rest, '--report', '--json', '--seed', String(seed)];
      const child = spawn(process.execPath, childArgs, { stdio: ['ignore', 'pipe', 'inherit'] });
      let out = '';
      child.stdout.on('data', (d) => (out += d));
      child.on('error', reject);
      child.on('close', (code) => {
        const line = out.split('\n').find((l) => l.startsWith('{'));
        if (code !== 0 || !line) reject(new Error(`seed ${seed} failed (exit ${code})`));
        else resolve(JSON.parse(line) as SeedReport);
      });
    });
  const queue = [...seeds];
  const reports: SeedReport[] = [];
  const worker = async () => {
    for (let s = queue.shift(); s !== undefined; s = queue.shift()) reports.push(await runOne(s));
  };
  await Promise.all(Array.from({ length: Math.min(seeds.length, availableParallelism()) }, worker));
  reports.sort((a, b) => a.seed - b.seed);

  const out: string[] = ['', `=== pacing report (${MODEL} model, ${RUNS} runs, seeds ${seeds.join(', ')}) ===`];
  for (const r of reports) out.push(`seed ${r.seed}`, ...r.runs.map((l) => `  ${l}`));
  out.push('');
  const n = reports.length;
  // Checks are matched by name; one a seed did not report counts as a fail.
  const names = [...new Set(reports.flatMap((r) => r.checks.map((c) => c[0])))];
  const get = (r: SeedReport, name: string) => r.checks.find((c) => c[0] === name) ?? [name, '-', false];
  const w = Math.max(...names.map((name) => name.length));
  let all = 0;
  for (const name of names) {
    const passed = reports.filter((r) => get(r, name)[2]).length;
    if (passed === n) all++;
    const label = passed === n ? 'PASS' : passed === 0 ? 'FAIL' : 'SOME';
    out.push(`${label} ${passed}/${n}  ${name.padEnd(w)}  ${reports.map((r) => get(r, name)[1]).join(' | ')}`);
  }
  const met = reports.map((r) => r.checks.filter((c) => c[2]).length);
  out.push(`targets met: ${met.join(', ')} of ${names.length}; ${all} on every seed`);
  console.log(out.join('\n'));
}

if (SEEDS) {
  await reportSeeds(seedList(SEEDS));
  process.exit(0);
}

// ---------------------------------------------------------------- main loop

let clock = 0;
let currentRun = 1;
const events: string[] = [];
const seen = new Set<string>();
function mark(key: string, text: string): void {
  if (seen.has(key)) return;
  seen.add(key);
  events.push(`${formatDuration(clock).padStart(7)}  ${text}`);
}

interface RoundRow extends RoundStats, ShopStats {
  run: number;
  round: number;
  clock: number;
}
interface RunRow {
  run: number;
  start: number;
  end: number;
  rounds: number;
  dm: number;
  /** Seconds from run start until each map was unlocked. */
  mapAt: Partial<Record<MapId, number>>;
  /** Rounds played on each map before the next one unlocked. */
  roundsOn: Partial<Record<MapId, number>>;
  /** Rounds played on each map until its size goal was reached, and the share eaten when it was. */
  goalRounds: Partial<Record<MapId, number>>;
  goalPct: Partial<Record<MapId, number>>;
  /** Longest run of rounds without a new best size or an unlock, before the run's last goal. */
  stuckBefore: number;
  /** Rounds played after the run's last reachable goal, before the Singularity. */
  after: number;
  /**
   * Dark Matter gain on reaching the run's last goal, as a share of all DM earned before (Infinity
   * when none was; null until the goal).
   */
  gateDm: number | null;
  /** The run hit ROUND_CAP without a Singularity. */
  capped: boolean;
  firstPrestigeReady: number;
}
/** Rounds after which a run that still cannot collapse stops the simulation. */
const ROUND_CAP = 150;
const rounds: RoundRow[] = [];
const runs: RunRow[] = [];
const snapshots: { label: string; save: SaveData }[] = [];

let save = defaultSave(0);
const profile = withSkill(1);
allRuns: for (let run = 1; run <= RUNS; run++) {
  currentRun = run;
  const row: RunRow = { run, start: clock, end: clock, rounds: 0, dm: 0, mapAt: { suburb: 0 }, roundsOn: {}, goalRounds: {}, goalPct: {}, stuckBefore: 0, after: 0, gateDm: null, capped: false, firstPrestigeReady: -1 };
  runs.push(row);
  let stuck = 0;
  events.push(`--- run ${run} (DM ${save.dm}, total DM ${save.dmTotal}, tier ${save.tier}) ---`);
  while (true) {
    save.selectedMap = bestMap(save);
    const before = save.selectedMap;
    const levelBefore = save.mapLevel[before];
    const r = playRound(save, profile);
    row.rounds++;
    row.roundsOn[before] = (row.roundsOn[before] ?? 0) + 1;
    clock += r.wall + profile.overhead;
    if (row.rounds === 1) mark(`first-${run}`, `round 1 done: $${formatNumber(r.cash)}`);
    if (VERBOSE || row.rounds % 5 === 0)
      events.push(
        `${formatDuration(clock).padStart(7)}    r${row.rounds} ${r.map} $${formatNumber(r.cash)} L${r.startLevel + 1}->L${r.endLevel + 1} ${(r.pct * 100).toFixed(1)}% cash ${formatNumber(save.cash)} mult x${eco.globalCashMult(save).toFixed(1)} up ${Object.values(save.upgrades).join(',')}`,
      );
    if (TRACE)
      events.push(
        `            trace ${r.map} L${r.startLevel + 1}->L${r.endLevel + 1} in ${r.played.toFixed(0)}/${r.roundTime}s dead ${r.deadTime.toFixed(0)}s: ${r.levelTimes.map((t) => t.toFixed(0)).join(' ')}`,
      );
    for (const id of r.unlocked) mark(`map-${id}-${run}`, `unlock map ${eco.mapDef(id).name}`);
    const sh = shop(save, r.cash);
    rounds.push({ ...r, ...sh, run, round: row.rounds, clock });
    const now = bestMap(save);
    if (now !== before) {
      row.mapAt[now] = clock - row.start;
      if (run === 1) snapshots.push({ label: `${now} entry`, save: structuredClone(save) });
    }
    stuck = now !== before || save.mapLevel[now] > levelBefore ? 0 : stuck + 1;
    if (row.goalRounds[before] === undefined && save.mapLevel[before] >= eco.mapDef(before).goal) {
      row.goalRounds[before] = row.roundsOn[before];
      row.goalPct[before] = r.goalPct;
    }
    const dm = eco.dmGain(save);
    if (dm > 0 && row.firstPrestigeReady < 0) {
      row.firstPrestigeReady = clock - row.start;
      mark(`pready-${run}`, `Singularity available (${dm} DM)`);
    }
    // Prestige once the panel calls the gain a good time (the formula grew PRESTIGE.goodGain since
    // the last Singularity, eco.dmGrowth; and at least +30% cash, 3 DM at +10% each: the panel shows
    // no hint before the first Singularity) and progress has stalled: the newest map's goal is reached and the next map (or, past Moon Base, the next tier)
    // needs a Singularity, or the best size on the newest map has not improved for a while.
    const next = MAPS.find((m) => !save.maps[m.id]);
    const gated = save.mapLevel[now] >= eco.mapDef(now).goal && (!next || save.stats.prestiges < next.needsSingularities);
    if (gated && row.gateDm === null) row.gateDm = save.dmTotal > 0 ? dm / save.dmTotal : Infinity;
    if (gated && row.roundsOn[now] !== row.goalRounds[now]) row.after++;
    else if (!gated) row.stuckBefore = Math.max(row.stuckBefore, stuck);
    const ready = dm >= 0.3 / PRESTIGE.bonusPerDm && eco.dmGrowth(save) >= PRESTIGE.goodGain;
    const holdForMoon = HOLD_MOON && !save.maps.moon && row.rounds < 80;
    if (row.rounds >= ROUND_CAP && !(ready && (gated || stuck >= 4))) {
      // Not a Singularity: the run is stuck, so the report fails rather than counting one.
      row.end = clock;
      row.capped = true;
      events.push(`${formatDuration(clock).padStart(7)}  run ${run} stopped at the ${ROUND_CAP}-round cap without a Singularity`);
      break allRuns;
    }
    if (!holdForMoon && ready && (gated || stuck >= 4)) {
      row.end = clock;
      row.dm = dm;
      mark(`prestige-${run}`, `SINGULARITY #${run}: +${dm} DM after ${formatDuration(clock - row.start)} (${row.rounds} rounds)`);
      save = eco.applyPrestige(save, 0);
      buyDmTree(save);
      // The game returns to the hub after a Singularity, so Head Start cash is spent before round 1.
      buyAffordable(save);
      events.push(`         DM tree: ${DM_UPGRADES.map((d) => `${d.id}=${eco.dmLevel(save, d.id)}`).join(' ')}`);
      break;
    }
  }
}
if (!JSON_OUT) console.log(events.join('\n'));

// ---------------------------------------------------------------- report

/** Median, ignoring NaN; Infinity (never happened) counts as the slowest value. */
function median(xs: number[]): number {
  const a = xs.filter((x) => !Number.isNaN(x)).sort((p, q) => p - q);
  if (!a.length) return NaN;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
const fmt = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '-');

function report(): void {
  const out: string[] = ['', `=== pacing report (${MODEL} model, ${RUNS} runs) ===`];
  const checks: [string, string, boolean][] = [];
  const check = (name: string, value: string, ok: boolean) => checks.push([name, value, ok]);

  const firstUp = median(rounds.map((r) => r.levelTimes[0] ?? Infinity));
  check('first size-up in a round (median)', `${fmt(firstUp)} s`, firstUp <= 5);

  // Gaps after each round's first size-up, which starts with SIZE.startXp and has its own check.
  // Rounded to whole steps: w.time sums DT, so 80 steps would read 3.9999999999999 s.
  const gaps = rounds.flatMap((r) => r.levelTimes.slice(1).map((t, i) => Math.round((t - r.levelTimes[i]) / DT) * DT));
  const spl = median(gaps);
  check('seconds per level after the first (median)', `${fmt(spl, 2)} s`, spl >= 4 && spl <= 8);
  // Rounds start with SIZE.startXp of the first level's XP, so the first size-up only needs the
  // rest: scale its time up to a full level before comparing it with the last one. Only rounds
  // that start past the XP ramp (SIZE.rampLevels), whose quick first levels would skew it.
  const lastOverFirst = median(
    rounds.filter((r) => r.levelTimes.length >= 3 && r.startLevel >= SIZE.rampLevels - SIZE.rampStart).map((r) => {
      const lt = r.levelTimes;
      return (lt[lt.length - 1] - lt[lt.length - 2]) / Math.max(0.5, lt[0] / (1 - SIZE.startXp));
    }),
  );
  check('last level / first level time (median)', `${fmt(lastOverFirst, 2)}x`, lastOverFirst <= 1.5);

  const growth = median(rounds.map((r) => Math.pow(SIZE.radiusGrowth, r.endLevel - r.startLevel)));
  // 12-20 sizes a round: what 4-8 s per level gives over a 60-100 s round once the first quick
  // levels are counted.
  check('radius growth per round (median)', `${fmt(growth, 2)}x`, growth >= 4 && growth <= 10);

  const dead = rounds.map((r) => r.deadTime);
  check('dead time (median / 90th pct)', `${fmt(median(dead))} / ${fmt(dead.sort((a, b) => a - b)[Math.floor(dead.length * 0.9)] ?? NaN)} s`, median(dead) <= 2);

  const buys = median(rounds.map((r) => r.purchases));
  check('purchases per shop visit (median)', fmt(buys), buys >= 1 && buys <= 3);
  const affordable = rounds.filter((r) => r.purchases > 0 || r.waitRounds <= 1).length / Math.max(1, rounds.length);
  check('visits with a purchase now or within 1 round', `${fmt(affordable * 100, 0)}%`, affordable >= 0.9);
  const sizeR = median(rounds.map((r) => r.sizeRounds));
  check('next Starting Size / last round income (median)', fmt(sizeR, 2), sizeR >= 0.3 && sizeR <= 1.5);
  // Visits with nothing left to buy (Infinity) say nothing about prices.
  const cheap = median(rounds.map((r) => r.cheapestRounds).filter((x) => Number.isFinite(x)));
  check('cheapest option left, in rounds of income (median)', fmt(cheap, 2), cheap >= 1 && cheap <= 3);

  // Rounds each map takes to reach its goal, on its first visit (the first run that plays it) and on
  // every later run. A goal that falls in one round is no step at all; many more is a grind.
  const firstVisit: string[] = [];
  let firstOk = true;
  const later: number[] = [];
  for (const m of MAPS) {
    const first = runs.find((r) => r.roundsOn[m.id] !== undefined);
    if (!first) continue;
    const n = first.goalRounds[m.id];
    firstVisit.push(`${m.id} ${n ?? '-'}`);
    if (n === undefined || n < 2 || n > 8) firstOk = false;
    for (const r of runs) if (r !== first && r.roundsOn[m.id] !== undefined) later.push(r.goalRounds[m.id] ?? Infinity);
  }
  check('rounds to each goal, first visit', firstVisit.join(', ') || '-', firstOk && firstVisit.length > 0);
  const laterSorted = [...later].sort((a, b) => a - b);
  check('rounds to each goal, later runs (min / median / max)', `${laterSorted[0] ?? '-'} / ${fmt(median(later))} / ${laterSorted[laterSorted.length - 1] ?? '-'}`, later.length > 0 && later.every((n) => n >= 2 && n <= 4));
  const stuckMax = Math.max(...runs.map((r) => r.stuckBefore));
  check('rounds in a row without a new best size, before the last goal', String(stuckMax), stuckMax <= 2);
  // Run 2 comes back to Harbor much stronger; its goal should still take a couple of rounds.
  const harbor2 = runs[1]?.goalRounds.harbor;
  check('run 2 rounds to the Harbor goal', String(harbor2 ?? '-'), harbor2 !== undefined && harbor2 >= 2 && harbor2 <= 3);
  const afterMax = Math.max(...runs.map((r) => r.after));
  check('rounds after the last goal, before the Singularity (max)', String(afterMax), afterMax <= 1);
  // Per map: a goal that needs most of the map eaten sits at its XP ceiling, where players stall.
  // Early maps reach their goal on a small share (start size, not the map, limits them), so there
  // is no floor; the rounds-to-goal checks catch goals that come too easily.
  const pctByMap = MAPS.map((m) => ({ id: m.id, pct: median(runs.map((r) => r.goalPct[m.id] ?? NaN)) })).filter((x) => !Number.isNaN(x.pct));
  check(
    'map eaten when the goal is reached, per map (median, at most 85%)',
    pctByMap.map((x) => `${x.id} ${fmt(x.pct * 100, 0)}%`).join(', ') || '-',
    pctByMap.length > 0 && pctByMap.every((x) => x.pct <= 0.85),
  );

  const capped = runs.find((r) => r.capped);
  check(`no run stuck at the ${ROUND_CAP}-round cap`, capped ? `run ${capped.run}` : 'none', !capped);

  const r1 = runs[0];
  const firstPrestige = r1.end - r1.start;
  check('first Singularity', r1.capped ? 'never' : formatDuration(firstPrestige), !r1.capped && firstPrestige >= 30 * 60 && firstPrestige <= 60 * 60);

  for (let i = 1; i <= 2; i++) {
    const prev = runs[i - 1];
    const cur = runs[i];
    // Always reported, so every seed of a --seeds run lists the same checks.
    if (!cur || prev.capped) {
      check(`run ${i + 1} reaches run ${i}'s last map in (vs run ${i})`, 'not played', false);
      continue;
    }
    const prevBest = MAPS.filter((m) => prev.mapAt[m.id] !== undefined).pop()!.id;
    const at = cur.mapAt[prevBest];
    const ratio = at === undefined ? Infinity : at / Math.max(1, prev.mapAt[prevBest] ?? prev.end - prev.start);
    const [lo, hi] = i === 1 ? [0.35, 0.65] : [0.25, 0.55];
    check(`run ${i + 1} reaches run ${i}'s last map in (vs run ${i})`, `${prevBest} ${fmt(ratio * 100, 0)}%`, ratio >= lo && ratio <= hi);
  }
  const dms = runs.filter((r) => !r.capped).map((r) => r.dm);
  const dmGrowth = Math.max(...dms.slice(1).map((d, i) => d / Math.max(1, dms[i])), 0);
  check('DM per run (growth at most x2)', dms.join(', ') || '-', dms.length > 0 && dmGrowth <= 2);
  // Moon Base needs 3 Singularities, so run 4 is the first that can reach it.
  const moonRun = runs.find((r) => r.mapAt.moon !== undefined);
  const moonClock = moonRun ? moonRun.start + moonRun.mapAt.moon! : Infinity;
  check(`all ${MAPS.length} maps reached`, moonRun ? `${formatDuration(moonClock)} (run ${moonRun.run})` : 'not reached', moonRun?.run === 4);

  // Skill band: same saves, low- vs high-skill player, no shopping in between. Round cash varies a
  // lot with the world seed, so each side averages the same 8 world seeds.
  const band: string[] = [];
  let bandOk = snapshots.length > 0;
  for (const snap of snapshots.slice(0, 3)) {
    const seeds = Array.from({ length: 8 }, () => worldRng.int(1, 1e6));
    const avg = (s: number) => {
      let total = 0;
      for (const seed of seeds) total += playRound(structuredClone(snap.save), withSkill(s), false, seed).cash;
      return total / seeds.length;
    };
    const ratio = avg(1.4) / Math.max(1, avg(0.6));
    band.push(`${snap.label} ${fmt(ratio, 2)}x`);
    if (ratio < 1.5 || ratio > 3) bandOk = false;
  }
  check('skill band (skill 1.4 vs 0.6 income)', band.join(', ') || '-', bandOk);

  const runLines = runs.map((r) => {
    const goals = MAPS.filter((m) => r.roundsOn[m.id] !== undefined).map((m) => `${m.id} ${r.goalRounds[m.id] ?? '-'}`);
    const gate = r.gateDm === null ? '-' : Number.isFinite(r.gateDm) ? `+${fmt(r.gateDm * 100, 0)}%` : 'first DM';
    return `run ${r.run}: ${formatDuration(r.end - r.start)}, ${r.rounds} rounds, DM +${r.dm}${r.capped ? ' (capped)' : ''}; rounds to goal: ${goals.join(', ')}; stuck ${r.stuckBefore}, after goal ${r.after} (DM at goal ${gate})`;
  });
  if (JSON_OUT) {
    console.log(JSON.stringify({ seed: SEED, runs: runLines, checks } satisfies SeedReport));
    return;
  }
  out.push(...runLines, '');
  const w = Math.max(...checks.map((c) => c[0].length));
  for (const [name, value, ok] of checks) out.push(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(w)}  ${value}`);
  out.push(`${checks.filter((c) => c[2]).length}/${checks.length} targets met`);
  console.log(out.join('\n'));
}

if (REPORT) report();
