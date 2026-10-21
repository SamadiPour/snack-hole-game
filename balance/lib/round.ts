/**
 * Layer A: plays one real round (src/core/world.ts, same map generators) with a simulated player
 * and measures it. Cash is measured at cashMult 1, tier 0 and no golden props, so Layer B can
 * scale it by the save's cash multiplier, 4^tier and the golden expectation (1 + 9p): all three
 * are linear and none of them changes what happens in the round. Combo cash is recomputed after
 * the round for every Combo Window level from the swallow times.
 */
import { COMBO, GOLDEN, HELPERS, SIZE, UPGRADES, type MapId } from '../../src/config/balance';
import { OBJECT_TYPES, footprintOf, typeId } from '../../src/config/objects';
import { comboMult, type RoundConfig } from '../../src/core/economy';
import { generateMap } from '../../src/core/mapgen';
import { levelToEat, xpForLevel } from '../../src/core/size';
import { ALIVE, World } from '../../src/core/world';
import { Pilot, SKILLS, type Skill, type SkillProfile } from './bots';
import { BASE } from './params';
import { makeView, type View } from './view';

export const COMBO_LEVELS = UPGRADES.find((u) => u.id === 'combo')!.max;
const COMBO_LEVEL_OF = (cfg: RoundConfig) => Math.max(0, Math.min(COMBO_LEVELS, Math.round((cfg.comboWindow - COMBO.baseWindow) / COMBO.windowPerLevel)));
/**
 * Expected cash factor of golden props at a golden chance p (value x GOLDEN.valueMul). `share` is
 * the part of the cash that came from props golden anyway (UFO drops), which the roll skips.
 */
export const goldFactor = (p: number, share = 0) => 1 + (GOLDEN.valueMul - 1) * p * (1 - share);

export interface RoundSpec {
  cfg: RoundConfig;
  skill: Skill;
  seed: number;
  dt?: number;
  /** Within-round metrics (view scans, reachability, Katamari loop); a few times slower. */
  detail?: boolean;
  aspect?: number;
  /** Override the skill's profile (calibration). */
  profile?: Partial<SkillProfile>;
}

export interface RoundDetail {
  /** Round time of the main hole's first swallow (null if none). */
  firstEat: number | null;
  /** Seconds of each sample (every 0.5 s) where everything visible was edible. */
  vacuumShare: number;
  /** Share of samples with a prop just too big (fit < f <= 1.27 fit, ~2 levels) on screen. */
  nextGoalShare: number;
  /** Round time when nothing worth eating was left (no growth, leftovers < 5% of cash), or null. */
  effectivelyClearedAt: number | null;
  /** Gaps (s) between "new kind of prop edible" moments; first entry from round start. */
  newTypeGaps: number[];
  /** Props touched while too big and later eaten this round: count, share of touched, median delay (s). */
  loopEaten: number;
  loopShare: number;
  loopDelay: number;
  /** Per level difference (hole level - prop level, capped at 8): swallows, mean XP as share of a level, mean cash vs a frontier prop. */
  small: { n: number; xp: number; cash: number }[];
  /** Samples (every 1 s): level, base cash, map share. */
  curve: { t: number; level: number; cash: number; pct: number }[];
}

export interface RoundResult {
  mapId: MapId;
  skill: Skill;
  seed: number;
  startLevel: number;
  endLevel: number;
  /** Seconds into the round of each main-hole level-up. */
  levelTimes: number[];
  /** Base cash (cashMult 1, tier 0, no golden) at each Combo Window level, time bonus included. */
  cashByCombo: number[];
  /** Base cash as played (the cfg's combo level). */
  cash: number;
  /** World's own cash total (parity check of the combo recompute). */
  worldCash: number;
  helperCash: number;
  /** Share of the cash from props that were golden anyway (UFO drops); see goldFactor. */
  goldShare: number;
  timeBonusFrac: number;
  pct: number;
  eaten: number;
  helperEaten: number;
  comboBest: number;
  endReason: string;
  quit: boolean;
  /** Seconds played, and until the results show (end delay included). */
  played: number;
  wall: number;
  roundTime: number;
  /** Seconds between main-hole swallows longer than 2 s, plus the time after the last one. */
  deadTime: number;
  /** Main-hole swallows by the level that first fits the prop. */
  eatenByLevel: Record<number, number>;
  /** Object type ids swallowed (any hole). */
  types: string[];
  casts: number;
  detail?: RoundDetail;
}

const views = new Map<number, View>();

/** Level at which each prop type on a map first becomes edible (smallest instance). */
const typeLevels = new Map<MapId, Map<number, number>>();
function firstLevels(mapId: MapId): Map<number, number> {
  let m = typeLevels.get(mapId);
  if (!m) {
    m = new Map();
    for (const s of generateMap(mapId).spawns) {
      const t = typeId(s.type);
      const l = levelToEat(footprintOf(OBJECT_TYPES[t], s.scale));
      m.set(t, Math.min(m.get(t) ?? Infinity, l));
    }
    typeLevels.set(mapId, m);
  }
  return m;
}

export function runRound(spec: RoundSpec): RoundResult {
  const dt = spec.dt ?? 1 / 30;
  // Baseline units: the map's untuned value multiplier and (below) the untuned helper share.
  const cfg: RoundConfig = { ...spec.cfg, cashMult: 1, mapMul: BASE.valueMul[spec.cfg.mapId], goldChance: 0 };
  const map = generateMap(cfg.mapId);
  const w = new World(map, cfg, { seed: spec.seed });
  const aspect = spec.aspect ?? 16 / 9;
  let view = views.get(aspect);
  if (!view) views.set(aspect, (view = makeView(aspect)));
  const profile = { ...SKILLS[spec.skill], ...spec.profile };
  const pilot = new Pilot(profile, view, spec.seed * 7919 + 17);

  const levelTimes: number[] = [];
  /** Main-hole swallows: step index and cash before combo. */
  const mainEats: { step: number; v: number }[] = [];
  let stepNo = 0;
  const eatenByLevel: Record<number, number> = {};
  const types = new Set<number>();
  let lastEat = 0;
  let dead = 0;
  let endAt = 0;
  let quit = false;
  let casts = 0;
  let quitCheck = 0.5;
  let eatCash = 0;
  let goldCash = 0;
  let firstEat: number | null = null;

  // Detail state.
  const detail = spec.detail;
  let samples = 0;
  let vacuum = 0;
  let nextGoal = 0;
  let effCleared: number | null = null;
  const firstLv = detail ? firstLevels(cfg.mapId) : null;
  const newTypeTimes: number[] = [];
  const touched = new Map<number, number>();
  const loopDelays: number[] = [];
  const small = Array.from({ length: 9 }, () => ({ n: 0, xp: 0, cash: 0 }));
  const curve: RoundDetail['curve'] = [];
  let nextSample = 0;
  let nextCurve = 0;
  let knownLevel = w.main.level;

  while (!w.ended) {
    w.input = pilot.steer(w, dt);
    pilot.abilities(w);
    const levelBefore = w.main.level;
    const need = xpForLevel(levelBefore);
    const baseR = w.main.baseR;
    w.step(dt);
    stepNo++;
    if (w.running && (quitCheck -= dt) <= 0) {
      quitCheck = 0.5;
      if (pilot.wantsQuit(w)) {
        quit = true;
        w.timeLeft = 0;
      }
    }
    for (const e of w.events) {
      if (e.k === 'level') levelTimes.push(w.time);
      else if (e.k === 'ability') casts++;
      else if (e.k === 'eat') {
        types.add(e.o.t);
        eatCash += e.cash;
        if (e.o.gold) goldCash += e.cash;
        if (e.hole !== 0) continue;
        mainEats.push({ step: stepNo, v: e.o.value * cfg.cashMult });
        firstEat ??= w.time;
        const pl = levelToEat(e.o.f);
        eatenByLevel[pl] = (eatenByLevel[pl] ?? 0) + 1;
        if (w.time - lastEat > 2) dead += w.time - lastEat;
        lastEat = w.time;
        if (detail) {
          const k = Math.max(0, Math.min(8, levelBefore - pl));
          const xp = (e.o.xp * cfg.xpMult * (1 + SIZE.frontierBonus * Math.pow(Math.min(1, e.o.f / (SIZE.fit * baseR)), SIZE.frontierExp))) / need;
          const ref = 6 * Math.pow(SIZE.fit * baseR, 1.3) * cfg.mapMul;
          small[k].n++;
          small[k].xp += xp;
          small[k].cash += e.o.value / ref;
          const tt = touched.get(e.o.id);
          if (tt !== undefined) loopDelays.push(w.time - tt);
        }
      } else if ((e.k === 'timeUp' || e.k === 'cleared' || e.k === 'snackedOut') && !endAt) endAt = w.time;
    }
    w.events.length = 0;

    if (detail && w.running) {
      if (w.main.level > knownLevel) {
        for (let l = knownLevel + 1; l <= w.main.level; l++) {
          let fresh = false;
          for (const lv of firstLv!.values()) if (lv === l) fresh = true;
          if (fresh) newTypeTimes.push(w.time);
        }
        knownLevel = w.main.level;
      }
      if (w.time >= nextSample) {
        nextSample += 0.5;
        samples++;
        const h = w.main;
        const fit = SIZE.fit * h.r;
        let inView = 0;
        let edible = 0;
        let goal = false;
        const wob2 = (o: { f: number }) => h.r + o.f * 0.7;
        for (const o of w.objects) {
          if (o.state !== ALIVE || o.event) continue;
          const dx = o.x - h.x;
          const dz = o.z - h.z;
          if (o.f > fit) {
            const reach = wob2(o);
            if (dx * dx + dz * dz < reach * reach && !touched.has(o.id)) touched.set(o.id, w.time);
          }
          if (!view.visible(dx, dz, h.r)) continue;
          inView++;
          if (o.f <= fit) edible++;
          else if (o.f <= fit * 1.27) goal = true;
        }
        if (inView > 0 && edible === inView) vacuum++;
        if (goal) nextGoal++;
        if (effCleared === null) {
          const r = w.reachable();
          if (r.levels === 0 && r.cash * cfg.comboCap < w.cash * 0.05) effCleared = w.time;
        }
      }
      if (w.time >= nextCurve) {
        nextCurve += 1;
        curve.push({ t: w.time, level: w.main.level, cash: w.cash, pct: w.percentEaten });
      }
    }
  }
  if (!endAt) endAt = w.time;
  dead += Math.max(0, endAt - lastEat);

  // Combo cash for every Combo Window level, from the main hole's swallow times.
  const bonusFrac = w.cash > 0 ? w.timeBonus / (w.cash - w.timeBonus) : 0;
  const helperCash = (w.helperCash * BASE.helperShare) / HELPERS.roundCashShare;
  const cashByCombo: number[] = [];
  for (let c = 0; c <= COMBO_LEVELS; c++) {
    const win = COMBO.baseWindow + COMBO.windowPerLevel * c;
    const cap = COMBO.baseCap + COMBO.capPerLevel * c;
    let stack = 0;
    let prev = -1;
    let total = helperCash;
    for (const e of mainEats) {
      // As World does: a swallow sets the timer to the window, and every step ends by taking dt off
      // it (the same float steps, so a gap of exactly one window breaks the chain the same way).
      let timer = prev < 0 ? 0 : win;
      for (let k = prev; k >= 0 && k < e.step && timer > 0; k++) timer -= dt;
      stack = timer > 0 ? stack + 1 : 1;
      prev = e.step;
      total += e.v * comboMult(stack, cap);
    }
    cashByCombo.push(total * (1 + bonusFrac));
  }

  const res: RoundResult = {
    mapId: cfg.mapId,
    skill: spec.skill,
    seed: spec.seed,
    startLevel: cfg.startLevel,
    endLevel: w.main.level,
    levelTimes,
    cashByCombo,
    cash: cashByCombo[COMBO_LEVEL_OF(cfg)],
    worldCash: w.cash,
    helperCash: helperCash * (1 + bonusFrac),
    goldShare: eatCash > 0 ? goldCash / eatCash : 0,
    timeBonusFrac: bonusFrac,
    pct: w.percentEaten,
    eaten: w.eaten,
    helperEaten: w.helperEaten,
    comboBest: w.comboBest,
    endReason: w.endReason ?? 'timeUp',
    quit,
    played: endAt,
    wall: w.time,
    roundTime: cfg.roundTime,
    deadTime: dead,
    eatenByLevel,
    types: [...types].map((t) => OBJECT_TYPES[t].id),
    casts,
  };
  if (detail) {
    const sorted = [...loopDelays].sort((a, b) => a - b);
    res.detail = {
      firstEat,
      vacuumShare: samples ? vacuum / samples : 0,
      nextGoalShare: samples ? nextGoal / samples : 0,
      effectivelyClearedAt: effCleared,
      newTypeGaps: newTypeTimes.map((t, i) => t - (i ? newTypeTimes[i - 1] : 0)),
      loopEaten: loopDelays.length,
      loopShare: touched.size ? loopDelays.length / touched.size : NaN,
      loopDelay: sorted.length ? sorted[sorted.length >> 1] : NaN,
      small: small.map((s) => ({ n: s.n, xp: s.n ? s.xp / s.n : 0, cash: s.n ? s.cash / s.n : 0 })),
      curve,
    };
  }
  return res;
}
