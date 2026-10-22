/**
 * Layer B: whole playthroughs. Round → settle (the game's settleRound) → shop by a purchase policy
 * → Singularity when the panel's rule says so → next round, with the game's own save, economy,
 * offline and prestige code. Each round's outcome comes either from a real Layer A round
 * (`direct`) or from the fitted model (`model`, a neighbour round drawn by weight).
 */
import { ABILITIES, DM_UPGRADES, HELPERS, MAPS, PRESTIGE, UPGRADES, type MapId } from '../../src/config/balance';
import { checkAchievements } from '../../src/core/achievements';
import * as eco from '../../src/core/economy';
import { Rng } from '../../src/core/rng';
import { settleRound } from '../../src/core/round';
import { defaultSave, type SaveData } from '../../src/core/save';
import type { Skill, SkillProfile } from './bots';
import { RoundModel, toSample, typeIds, type Sample } from './model';
import { adjustCfg, applyParams, cashFactor } from './params';
import { goldFactor, runRound, type RoundDetail } from './round';

export type Policy = 'optimizer' | 'balanced' | 'single' | 'casual';
export type Pattern = 'binge' | 'returner' | 'returner-nooff';
export const POLICIES: Policy[] = ['optimizer', 'balanced', 'single', 'casual'];
export const PATTERNS: Pattern[] = ['binge', 'returner', 'returner-nooff'];

export interface PlaySpec {
  /** Tuned parameter values by id (lib/params.ts); baseline when absent. */
  params?: Record<string, number>;
  skill: Skill;
  policy: Policy;
  pattern: Pattern;
  seed: number;
  mode: 'direct' | 'model';
  /** Option key the single-stat policy dumps everything into (default Starting Size). */
  single?: string;
  /** Keep playing this many minutes after the first Moon Base goal. */
  afterFinish?: number;
  /** Stop after this many hours of play. */
  maxHours?: number;
  /** Seconds per round outside play (results + shop); default by skill. */
  overhead?: number;
  /** Returner: play minutes per session; sessions start at these hours of the day. */
  sessionMinutes?: number;
  sessionHours?: number[];
  /** Direct mode: within-round detail every n-th round (0 = never). */
  detailEvery?: number;
  profile?: Partial<SkillProfile>;
}

export interface Purchase {
  key: string;
  name: string;
  cost: number;
  /** Fitted-model change in cash per round on the next map, and in mean end size. */
  dIncome: number;
  dLevel: number;
}

export interface RoundLog {
  i: number;
  run: number;
  tier: number;
  /** Seconds of play so far (rounds + overhead), at the end of this round's shop visit. */
  clock: number;
  /** Calendar seconds since the start (returner: includes time away). */
  cal: number;
  map: MapId;
  startLevel: number;
  endLevel: number;
  goal: number;
  cash: number;
  /** Fitted-model expected cash per round before and after the shop visit (next map). */
  expBefore: number;
  expAfter: number;
  wall: number;
  pct: number;
  quit: boolean;
  offline: number;
  purchases: Purchase[];
  /** After the shop visit: cash left and the cheapest option still for sale (Infinity if none). */
  cashLeft: number;
  cheapest: number;
  unlocked: MapId[];
  newTypes: string[];
  noticeable: string[];
  detail?: RoundDetail;
  dead: number;
}

export interface RunLog {
  run: number;
  tier: number;
  start: number;
  end: number;
  rounds: number;
  dm: number;
  /** Play seconds from run start to each map unlock and to each goal. */
  mapAt: Partial<Record<MapId, number>>;
  goalAt: Partial<Record<MapId, number>>;
  capped: boolean;
}

export interface PlayResult {
  spec: PlaySpec;
  rounds: RoundLog[];
  runs: RunLog[];
  events: { clock: number; cal: number; kind: string; text: string }[];
  /** Play seconds at the first Moon Base goal (null if never). */
  finish: number | null;
  finishCal: number | null;
  stalled: string | null;
  offlineTotal: number;
  roundTotal: number;
  /** Direct mode: the rounds as model training samples. */
  samples: Sample[];
  /** The save before the first round on each map in each run (for paired Layer A experiments). */
  snapshots: { label: string; clock: number; save: SaveData }[];
}

interface Option {
  key: string;
  name: string;
  cost: number;
  /** Fill of the track, 0..1, for the balanced policy. */
  fill: number;
  apply: (s: SaveData) => void;
  buy: (s: SaveData) => boolean;
}

const DEFAULT_OVERHEAD: Record<Skill, number> = { strong: 12, average: 20, weak: 25 };
/** Optimizer: levels of one track it scores as a bundle. */
const LOOKAHEAD = 10;
const ROUND_CAP = 150;
/** The first Singularity waits for at least this cash bonus (3 DM at +10% each), as scripts/sim.ts does. */
const FIRST_GAIN = 0.3;

function options(s: SaveData, withOffline: boolean): Option[] {
  const out: Option[] = [];
  for (const u of UPGRADES) {
    if (!eco.isUpgradeVisible(s, u) || s.upgrades[u.id] >= u.max) continue;
    if (u.id === 'offline' && !withOffline) continue;
    out.push({
      key: `u-${u.id}`,
      name: u.name,
      cost: eco.upgradeCost(u.id, s.upgrades[u.id], eco.priceScale(s)),
      fill: s.upgrades[u.id] / u.max,
      apply: (t) => (t.upgrades[u.id] += 1),
      buy: (t) => eco.buyUpgrade(t, u.id, 1) > 0,
    });
  }
  if (s.runCash >= HELPERS.unlockAt && s.helpers < HELPERS.countCosts.length)
    out.push({ key: 'h-count', name: `Helper #${s.helpers + 1}`, cost: eco.helperCountCost(s.helpers, eco.fixedPriceScale(s)), fill: s.helpers / 4, apply: (t) => (t.helpers += 1), buy: (t) => eco.buyHelper(t) });
  if (s.helpers > 0 && s.helperLevel < HELPERS.levelMax)
    out.push({ key: 'h-level', name: 'Helper training', cost: eco.helperLevelCost(s.helperLevel, eco.fixedPriceScale(s)), fill: s.helperLevel / HELPERS.levelMax, apply: (t) => (t.helperLevel += 1), buy: (t) => eco.buyHelperLevel(t) });
  for (const a of ABILITIES) {
    if (!eco.isAbilityVisible(s, a) || s.abilities[a.id] >= a.maxLevel) continue;
    out.push({
      key: `a-${a.id}`,
      name: `${a.name} ${s.abilities[a.id] === 0 ? 'unlock' : `L${s.abilities[a.id] + 1}`}`,
      cost: eco.abilityCost(a.id, s.abilities[a.id], eco.fixedPriceScale(s)),
      fill: s.abilities[a.id] / a.maxLevel,
      apply: (t) => (t.abilities[a.id] += 1),
      buy: (t) => eco.buyAbility(t, a.id),
    });
  }
  return out;
}

/** Shallow copy with the parts purchases touch. */
function fork(s: SaveData): SaveData {
  return { ...s, upgrades: { ...s.upgrades }, abilities: { ...s.abilities } };
}

function bestMap(s: SaveData): MapId {
  let best: MapId = 'suburb';
  for (const m of MAPS) if (s.maps[m.id]) best = m.id;
  return best;
}

/** First size level at which each prop type on a map becomes edible. */
const typeLevelCache = new Map<MapId, Map<string, number>>();
function typeLevels(map: MapId, model: RoundModel | null): Map<string, number> {
  let m = typeLevelCache.get(map);
  if (m) return m;
  m = new Map();
  if (model) {
    // From the training rounds: the smallest end size seen with each type eaten.
    for (const skill of ['strong', 'average', 'weak'] as const) {
      for (const s of model.file.samples[`${map}/${skill}`] ?? []) for (const id of typeIds(s)) m.set(id, Math.min(m.get(id) ?? Infinity, s.endLevel));
    }
  }
  typeLevelCache.set(map, m);
  return m;
}

export function play(spec: PlaySpec, model: RoundModel | null): PlayResult {
  applyParams(spec.params);
  const rng = new Rng(spec.seed * 104729 + 11);
  const worldSeeds = new Rng(spec.seed * 7919 + 3);
  const overhead = spec.overhead ?? DEFAULT_OVERHEAD[spec.skill];
  const afterFinish = (spec.afterFinish ?? 30) * 60;
  const maxClock = (spec.maxHours ?? 10) * 3600;
  const offlineOn = spec.pattern === 'returner';
  const sessionLen = (spec.sessionMinutes ?? 15) * 60;
  const sessionHours = spec.sessionHours ?? [8, 13, 20];
  const detailEvery = spec.detailEvery ?? 2;
  const withOffline = offlineOn && (spec.policy === 'balanced' || spec.policy === 'casual');

  let save = defaultSave(0);
  const day0 = Date.UTC(2026, 0, 1);
  let cal = sessionHours[0] * 3600;
  let clock = 0;
  let sessionStart = 0;
  let sessionIdx = 0;
  save.lastSeen = save.created = day0 + cal * 1000;

  const rounds: RoundLog[] = [];
  const runs: RunLog[] = [];
  const events: PlayResult['events'] = [];
  const samples: Sample[] = [];
  let finish: number | null = null;
  let finishCal: number | null = null;
  let stalled: string | null = null;
  let offlineTotal = 0;
  let roundTotal = 0;
  const snapshots: PlayResult['snapshots'] = [];
  const snapped = new Set<string>();
  const ev = (kind: string, text: string) => events.push({ clock, cal, kind, text });
  const seenKeys = new Set<string>();
  const seenTypes = new Set<string>();

  // ---- model helpers
  const cfgFor = (s: SaveData, map: MapId) => adjustCfg(eco.buildRoundConfig(s, map), s);
  const tierMul = (s: SaveData) => eco.tierCostMul(s.tier);
  const predCash = (s: SaveData, map: MapId, p: ReturnType<RoundModel['predict']>) =>
    p.cash(s.upgrades.combo, (r) => cashFactor(map, r.helperShare)) * eco.globalCashMult(s) * tierMul(s) * goldFactor(eco.goldChance(s.upgrades.golden));
  const income = (s: SaveData, map: MapId): number => {
    if (!model) return 0;
    return predCash(s, map, model.predict(cfgFor(s, map), spec.skill));
  };
  const value = (s: SaveData): number => {
    const map = bestMap(s);
    if (!model) return 0;
    const p = model.predict(cfgFor(s, map), spec.skill);
    const inc = predCash(s, map, p);
    const def = eco.mapDef(map);
    let bonus = 0;
    if (s.mapLevel[map] < def.goal) {
      const idx = MAPS.findIndex((m) => m.id === map);
      const next = MAPS[idx + 1];
      const pGoal = p.pAtLeast(def.goal);
      if (next && s.stats.prestiges >= next.needsSingularities) bonus = pGoal * Math.max(0, income(s, next.id) - inc) * 6;
      else bonus = pGoal * inc * 0.5;
    }
    return inc + bonus;
  };
  const meanLevel = (s: SaveData): number => (model ? model.predict(cfgFor(s, bestMap(s)), spec.skill).mean((r) => r.endLevel) : 0);

  // ---- shopping
  const shop = (s: SaveData): Purchase[] => {
    const bought: Purchase[] = [];
    const record = (o: Option, before: { v: number; l: number }) => {
      const after = { v: model ? income(s, bestMap(s)) : 0, l: meanLevel(s) };
      bought.push({ key: o.key, name: o.name, cost: o.cost, dIncome: before.v > 0 ? after.v / before.v - 1 : 0, dLevel: after.l - before.l });
      if (!seenKeys.has(o.key)) {
        seenKeys.add(o.key);
        ev('buy-first', o.name);
      }
    };
    for (let guard = 0; guard < 400; guard++) {
      const opts = options(s, withOffline);
      const affordable = opts.filter((o) => o.cost <= s.cash);
      let pick: Option | null = null;
      if (spec.policy === 'optimizer' && model) {
        // Score = rounds until affordable + rounds to pay back. Each track is also tried as a
        // bundle of up to LOOKAHEAD levels (cost summed): a level that only pays off with the
        // next few (Starting Size below a map's size offset) is still worth starting on.
        const v0 = value(s);
        const inc = Math.max(1, income(s, bestMap(s)));
        let bestScore = Infinity;
        for (const o of opts) {
          const t = fork(s);
          let cost = 0;
          let step: Option | undefined = o;
          for (let k = 0; k < LOOKAHEAD && step; k++) {
            cost += step.cost;
            step.apply(t);
            if (cost > inc * 30 && k > 0) break;
            const dv = value(t) - v0;
            if (dv > 0) {
              const score = Math.max(0, cost - s.cash) / inc + cost / dv;
              if (score < bestScore) {
                bestScore = score;
                pick = o;
              }
            }
            step = options(t, withOffline).find((x) => x.key === o.key);
          }
        }
        if (!pick) pick = affordable.sort((a, b) => a.cost - b.cost)[0] ?? null;
        if (pick && pick.cost > s.cash) break;
      } else if (spec.policy === 'single') {
        const target = spec.single ?? 'u-startSize';
        const t = opts.find((o) => o.key === target);
        if (t) {
          if (t.cost > s.cash) break;
          pick = t;
        } else pick = affordable.sort((a, b) => a.cost - b.cost)[0] ?? null;
      } else if (spec.policy === 'balanced') {
        pick = affordable.sort((a, b) => a.fill - b.fill || a.cost - b.cost)[0] ?? null;
      } else {
        // casual
        if (affordable.length) pick = rng.chance(0.3) ? rng.pick(affordable) : affordable.sort((a, b) => a.cost - b.cost)[0];
      }
      if (!pick) break;
      const before = { v: model ? income(s, bestMap(s)) : 0, l: meanLevel(s) };
      if (!pick.buy(s)) break;
      record(pick, before);
    }
    return bought;
  };

  const buyDmTree = (s: SaveData) => {
    for (let guard = 0; guard < 200; guard++) {
      const opts = DM_UPGRADES.filter((d) => eco.dmLevel(s, d.id) < d.max && (d.id !== 'hawking' || offlineOn))
        .map((d) => ({ d, c: eco.dmUpgradeCost(d.id, eco.dmLevel(s, d.id)) }))
        .filter((o) => o.c <= s.dm)
        .sort((a, b) => a.c - b.c);
      if (!opts.length) break;
      eco.buyDmUpgrade(s, opts[0].d.id);
    }
  };

  // ---- main loop
  let run: RunLog = { run: 1, tier: 0, start: 0, end: 0, rounds: 0, dm: 0, mapAt: { suburb: 0 }, goalAt: {}, capped: false };
  runs.push(run);
  let stuck = 0;
  let i = 0;
  while (clock < maxClock) {
    // Returner: a session ends after sessionLen of play; the next starts at the next session hour.
    let offline = 0;
    if (spec.pattern !== 'binge' && clock - sessionStart >= sessionLen) {
      save.lastSeen = day0 + cal * 1000;
      sessionIdx++;
      const day = Math.floor(sessionIdx / sessionHours.length);
      const nextCal = day * 86400 + sessionHours[sessionIdx % sessionHours.length] * 3600;
      cal = Math.max(cal, nextCal);
      sessionStart = clock;
      if (offlineOn) {
        const off = eco.computeOffline(save, day0 + cal * 1000);
        if (off.earned > 0) {
          eco.earn(save, off.earned);
          offline = off.earned;
          offlineTotal += off.earned;
        }
        shop(save);
      }
    }

    save.selectedMap = bestMap(save);
    const map = save.selectedMap;
    if (!snapped.has(`${run.run}/${map}`)) {
      snapped.add(`${run.run}/${map}`);
      snapshots.push({ label: `run ${run.run} ${map}`, clock, save: structuredClone(save) });
    }
    const levelBefore = save.mapLevel[map];
    const cfg = cfgFor(save, map);
    let out: Sample;
    let detail: RoundDetail | undefined;
    if (spec.mode === 'direct') {
      const r = runRound({ cfg, skill: spec.skill, seed: worldSeeds.int(1, 1e9), detail: detailEvery > 0 && i % detailEvery === 0, profile: spec.profile });
      out = toSample(r, cfg);
      samples.push(out);
      detail = r.detail;
    } else {
      out = model!.predict(cfg, spec.skill).sample(rng);
    }
    const cash = out.cash[save.upgrades.combo] * cashFactor(map, out.helperShare) * eco.globalCashMult(save) * tierMul(save) * goldFactor(eco.goldChance(save.upgrades.golden), out.goldShare);
    const types = typeIds(out);
    const eatenByType = new Map<number, number>();
    for (const t of out.types) eatenByType.set(t, 1);
    const settled = settleRound(save, {
      mapId: map,
      cash,
      eaten: out.eaten + out.helperEaten,
      comboBest: out.comboBest,
      level: Math.min(out.endLevel, eco.mapMaxLevel(map)),
      percentEaten: out.pct,
      biggest: null,
      eatenByType,
    });
    checkAchievements(save);
    roundTotal += settled.total;
    clock += out.wall + overhead;
    cal += out.wall + overhead;
    run.rounds++;
    const newTypes = types.filter((t) => !seenTypes.has(t));
    for (const t of newTypes) seenTypes.add(t);
    for (const id of settled.unlockedMaps) {
      run.mapAt[id] = clock - run.start;
      ev('map', eco.mapDef(id).name);
    }
    const def = eco.mapDef(map);
    if (run.goalAt[map] === undefined && save.mapLevel[map] >= def.goal) run.goalAt[map] = clock - run.start;
    if (finish === null && save.mapLevel.moon >= MAPS[MAPS.length - 1].goal) {
      finish = clock;
      finishCal = cal;
      ev('finish', 'Moon Base goal');
    }

    const noticeable: string[] = [];
    if (settled.unlockedMaps.length) noticeable.push('map');
    const tl = typeLevels(map, model);
    if (save.mapLevel[map] > levelBefore && [...tl.values()].some((l) => l > levelBefore && l <= save.mapLevel[map])) noticeable.push('tier');
    const expBefore = income(save, bestMap(save));
    const purchases = shop(save);
    const expAfter = income(save, bestMap(save));
    if (purchases.length && expBefore > 0 && expAfter / expBefore - 1 >= 0.1) noticeable.push('income+10%');
    if (purchases.some((p) => p.key.startsWith('a-') && p.name.endsWith('unlock'))) noticeable.push('ability');
    const left = options(save, withOffline);
    rounds.push({
      cashLeft: save.cash,
      cheapest: left.length ? Math.min(...left.map((o) => o.cost)) : Infinity,
      i: i++,
      run: run.run,
      tier: save.tier,
      clock,
      cal,
      map,
      startLevel: out.startLevel,
      endLevel: out.endLevel,
      goal: def.goal,
      cash,
      expBefore,
      expAfter,
      wall: out.wall,
      pct: out.pct,
      quit: out.quit,
      offline,
      purchases,
      unlocked: settled.unlockedMaps,
      newTypes,
      noticeable,
      detail,
      dead: out.dead,
    });

    // ---- Singularity: the sim's rule (scripts/sim.ts).
    const now = bestMap(save);
    stuck = now !== map || save.mapLevel[now] > levelBefore ? 0 : stuck + 1;
    const dm = eco.dmGain(save);
    const next = MAPS.find((m) => !save.maps[m.id]);
    const gated = save.mapLevel[now] >= eco.mapDef(now).goal && (!next || save.stats.prestiges < next.needsSingularities);
    if (dm >= FIRST_GAIN / PRESTIGE.bonusPerDm && eco.dmGrowth(save) >= PRESTIGE.goodGain && (gated || stuck >= 4)) {
      run.end = clock;
      run.dm = dm;
      ev('singularity', `#${run.run} +${dm} DM${eco.tierUpReady(save) ? ' (tier up)' : ''}`);
      if (finish !== null && clock >= finish + afterFinish) break;
      save = eco.applyPrestige(save, day0 + cal * 1000);
      buyDmTree(save);
      shop(save);
      run = { run: run.run + 1, tier: save.tier, start: clock, end: clock, rounds: 0, dm: 0, mapAt: { suburb: 0 }, goalAt: {}, capped: false };
      runs.push(run);
      stuck = 0;
      continue;
    }
    if (run.rounds >= ROUND_CAP) {
      run.capped = true;
      stalled = `run ${run.run} hit ${ROUND_CAP} rounds without a Singularity (on ${now}, best size ${save.mapLevel[now] + 1}, goal ${eco.mapDef(now).goal + 1})`;
      ev('stall', stalled);
      break;
    }
    if (finish !== null && clock >= finish + afterFinish) break;
  }
  run.end = clock;
  if (!stalled && finish === null) stalled = `no Moon Base goal within ${spec.maxHours ?? 10} h of play`;
  return { spec, rounds, runs, events, finish, finishCal, stalled, offlineTotal, roundTotal, samples, snapshots };
}
