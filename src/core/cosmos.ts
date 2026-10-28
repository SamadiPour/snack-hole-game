import { SIZE } from '../config/balance';
import { COSMOS, REALMS, isRealmId, realmDef, type WorldId } from '../config/cosmos';
import { buildRoundConfig, mapDef, type RoundConfig } from './economy';
import { generateRealm } from './mapgen/cosmos';
import { defaultSave, type SaveData } from './save';
import { radiusForLevel } from './size';
import type { World } from './world';

/**
 * Cosmos: one run through the realms in REALMS (config/cosmos.ts) with the base hole, no timer,
 * cash or catch-up growth. At a realm's goal size the game calls flipScale, which shrinks the world
 * around the hole into the next realm. Records live in `save.cosmos` and touch nothing else, except
 * the trophy for finishing (core/achievements.ts).
 */

/** Display name of any world: a classic map or a Cosmos realm. */
export function worldName(id: WorldId): string {
  return isRealmId(id) ? realmDef(id).name : mapDef(id).name;
}

/** A Cosmos round in realm `realm`: the base hole (as in the Tour), no events, no early end. */
export function cosmosConfig(realm = 0): RoundConfig {
  const r = REALMS[realm];
  return {
    ...buildRoundConfig(defaultSave(0)),
    mapId: r.id,
    casual: true,
    catchUp: false,
    events: false,
    cosmos: { realm, goal: r.goal },
    roundTime: Infinity,
    startLevel: r.startLevel,
    maxLevel: r.goal + COSMOS.goalHeadroom,
    mapMul: 1,
    mapCleared: false,
    xpMult: 1,
    magnetLevel: COSMOS.magnetLevel,
    speedMult: COSMOS.speedMult,
    cashMult: 0,
    goldChance: 0,
  };
}

/** Scale factor from realm `i` at its goal to realm `i + 1` at its start. */
export function flipFactor(i: number): number {
  return Math.pow(SIZE.radiusGrowth, REALMS[i + 1].startLevel - REALMS[i].goal);
}

export interface Flip {
  /** Everything shrank by z around the old origin, which landed on (nx, nz). */
  z: number;
  nx: number;
  nz: number;
  /** Realm index the world is in now. */
  realm: number;
  /** Props carried over from the realm before; the new realm's props start at this index. */
  carried: number;
}

/**
 * Moves a Cosmos world into its next realm (World.rebase): the old realm's centre lands on the next
 * realm's start, so the hole arrives in the next realm's nest. Null on the last realm.
 */
export function flipScale(w: World): Flip | null {
  const c = w.cfg.cosmos;
  if (!c || c.realm + 1 >= REALMS.length) return null;
  const realm = c.realm + 1;
  const next = REALMS[realm];
  const z = flipFactor(c.realm);
  const map = generateRealm(next.id);
  const { x: nx, z: nz } = map.start;
  const dLevel = REALMS[c.realm].goal - next.startLevel;
  const carried = w.rebase(map, z, nx, nz, dLevel, { realm, goal: next.goal }, next.goal + COSMOS.goalHeadroom);
  return { z, nx, nz, realm, carried };
}

/** The size number shown in Cosmos (0-based): it keeps climbing across realms instead of dropping at each flip. */
export function cosmicLevel(realm: number, level: number): number {
  let off = 0;
  for (let i = 0; i < realm; i++) off += REALMS[i].goal - REALMS[i + 1].startLevel;
  return level + off;
}

/**
 * Real width in metres of a hole of radius `r` in realm `realm`: log-interpolated from the realm's
 * start size to its goal size, so it carries on smoothly through a flip (the radius shrinks by
 * exactly the factor the next realm's range starts from).
 */
export function realSize(realm: number, r: number): number {
  const d = REALMS[realm];
  // Past the goal (the flip waits for a landmark's slow-motion) the next realm's scale applies, and
  // below the start (the drawn radius still easing up after a flip) the previous realm's.
  if (r > radiusForLevel(d.goal) && realm + 1 < REALMS.length) return realSize(realm + 1, r * flipFactor(realm));
  if (r < radiusForLevel(d.startLevel) && realm > 0) return realSize(realm - 1, r / flipFactor(realm - 1));
  // Past the last goal (the finale swells the hole) it just grows in proportion.
  if (r > radiusForLevel(d.goal)) return d.real[1] * (r / radiusForLevel(d.goal));
  const r0 = radiusForLevel(d.startLevel);
  const t = Math.log(r / r0) / Math.log(radiusForLevel(d.goal) / r0);
  return d.real[0] * Math.pow(d.real[1] / d.real[0], t);
}

/** How far the journey has come, 0 (a quark) to 1 (the galaxy), on a log scale of real size. */
export function journeyProgress(realm: number, r: number): number {
  const lo = Math.log(REALMS[0].real[0]);
  const hi = Math.log(REALMS[REALMS.length - 1].real[1]);
  return Math.min(1, Math.max(0, (Math.log(realSize(realm, r)) - lo) / (hi - lo)));
}

/** A finished (or abandoned) Cosmos run, for settleCosmos and the results screen. */
export interface CosmosRun {
  /** Furthest realm reached (index into REALMS). */
  realm: number;
  /** Seconds played. */
  time: number;
  /** The galaxy was eaten. */
  finished: boolean;
  /** Seconds spent in each realm reached. */
  splits: number[];
}

export interface CosmosSettlement {
  /** Fastest finished journey so far. */
  bestTime: boolean;
  /** Further than any run before (not reported on the first run). */
  bestRealm: boolean;
  /** First journey ever finished: the trophy and skin come with it. */
  firstFinish: boolean;
}

/** Books a Cosmos run into `save.cosmos`. */
export function settleCosmos(save: SaveData, run: CosmosRun): CosmosSettlement {
  const c = save.cosmos;
  const played = c.runs > 0;
  const bestRealm = played && run.realm > c.bestRealm;
  const bestTime = run.finished && c.bestTime > 0 && run.time < c.bestTime;
  const firstFinish = run.finished && c.completions === 0;
  c.runs++;
  c.bestRealm = Math.max(c.bestRealm, run.realm);
  if (run.finished) {
    c.completions++;
    if (c.bestTime === 0 || run.time < c.bestTime) c.bestTime = run.time;
  }
  return { bestTime, bestRealm, firstFinish };
}
