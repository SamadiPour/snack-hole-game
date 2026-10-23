import { MAP_CLEARED_FRACTION, type MapId } from '../config/balance';
import { OBJECT_TYPES } from '../config/objects';
import { earn, noteRound, unlockMaps } from './economy';
import type { SaveData } from './save';
import type { World } from './world';

/** What a finished round did, as far as the save is concerned. */
export interface RoundSummary {
  mapId: MapId;
  /** Cash the round earned (main hole and helpers, time bonus included). */
  cash: number;
  /** Props swallowed by every hole. */
  eaten: number;
  comboBest: number;
  /** The main hole's final size level (0-based). */
  level: number;
  percentEaten: number;
  /** Biggest prop the main hole swallowed, if any. */
  biggest: { t: number; f: number } | null;
  /** Props swallowed per object type index. */
  eatenByType: ReadonlyMap<number, number>;
  /** Seconds the round ran before it stopped. */
  time: number;
}

/** What settling a round changed, for the results screen. */
export interface RoundSettlement {
  /** Cash credited: the round's cash. */
  total: number;
  /** New best combo (not reported on the first round, nor for tiny combos). */
  bestCombo: boolean;
  /** New best round cash (not reported on the first round). */
  bestRound: boolean;
  /** New best share eaten on this map (not reported the first time the map is played). */
  bestPercent: boolean;
  /** The round ate (nearly) everything on the map. */
  cleared: boolean;
  /** The map was cleared for the first time. */
  completed: boolean;
  /** Object type indices swallowed for the first time, in the order they were first eaten. */
  discovered: number[];
  /** Maps unlocked by this round; the last one is now selected. */
  unlockedMaps: MapId[];
}

export function summarizeRound(w: World): RoundSummary {
  return {
    mapId: w.cfg.mapId,
    cash: w.cash,
    eaten: w.eaten + w.helperEaten,
    comboBest: w.comboBest,
    level: w.main.level,
    percentEaten: w.percentEaten,
    biggest: w.biggest,
    eatenByType: w.eatenByType,
    time: w.endedAt || w.time,
  };
}

/**
 * Books a finished round into the save: cash, stats and records, Gulpedia counts, the map's best
 * share and size, recent income, and any maps it unlocks. Achievements are left to the caller.
 */
export function settleRound(s: SaveData, r: RoundSummary): RoundSettlement {
  const total = r.cash;
  earn(s, total);
  const st = s.stats;
  st.rounds += 1;
  st.totalEaten += r.eaten;
  const bestCombo = r.comboBest > st.bestCombo && st.rounds > 1 && r.comboBest >= 5;
  st.bestCombo = Math.max(st.bestCombo, r.comboBest);
  st.bestLevel = Math.max(st.bestLevel, r.level + 1);
  const bestRound = total > st.bestRoundCash && st.rounds > 1;
  st.bestRoundCash = Math.max(st.bestRoundCash, total);
  if (r.biggest && r.biggest.f > st.biggestF) {
    st.biggestF = r.biggest.f;
    st.biggestType = OBJECT_TYPES[r.biggest.t].id;
  }
  const discovered: number[] = [];
  for (const [t, n] of r.eatenByType) {
    const id = OBJECT_TYPES[t].id;
    if (!s.gulpedia[id]) discovered.push(t);
    s.gulpedia[id] = (s.gulpedia[id] ?? 0) + n;
  }
  const { mapId, percentEaten: pct } = r;
  const bestPercent = pct > s.mapBest[mapId] + 1e-6 && s.mapBest[mapId] > 0 && pct >= 0.001;
  s.mapBest[mapId] = Math.max(s.mapBest[mapId], pct);
  const cleared = pct >= MAP_CLEARED_FRACTION;
  const completed = cleared && !s.map100[mapId];
  if (completed) s.map100[mapId] = true;
  noteRound(s, mapId, r.level, total);
  // Reaching a map's size goal unlocks the next one; jump straight to it.
  const unlockedMaps = unlockMaps(s);
  for (const id of unlockedMaps) s.selectedMap = id;
  return { total, bestCombo, bestRound, bestPercent, cleared, completed, discovered, unlockedMaps };
}
