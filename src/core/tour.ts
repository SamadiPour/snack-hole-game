import { MAPS, MAP_CLEARED_FRACTION, TOUR, type MapDef, type MapId } from '../config/balance';
import { buildRoundConfig, mapDef, mapMaxLevel, type RoundConfig } from './economy';
import type { RoundSummary } from './round';
import { defaultSave, type SaveData } from './save';

/**
 * Casual Tour: the maps in order with the base hole and no timer, cash or shop (TOUR in
 * config/balance.ts). Progress lives in `save.tour` and touches nothing else in the save.
 */

/** Size level (0-based) the hole starts at on a Tour map. */
export function tourStartLevel(mapId: MapId): number {
  return mapId === MAPS[0].id ? 0 : Math.min(TOUR.entryLevel, mapMaxLevel(mapId));
}

export function nextTourMap(mapId: MapId): MapDef | undefined {
  return MAPS[MAPS.findIndex((m) => m.id === mapId) + 1];
}

/** A Tour round: the base hole (no upgrades, abilities, helpers or golden props), no timer, no cash. */
export function tourRoundConfig(mapId: MapId): RoundConfig {
  return {
    ...buildRoundConfig(defaultSave(0), mapId),
    casual: true,
    roundTime: Infinity,
    startLevel: tourStartLevel(mapId),
    xpMult: 1,
    magnetLevel: TOUR.magnetLevel,
    cashMult: 0,
    goldChance: 0,
  };
}

/** Why a Tour map is still closed, or null once it is open. */
export function tourLockReason(save: SaveData, id: MapId): string | null {
  if (save.tour.maps[id]) return null;
  const prev = MAPS[MAPS.findIndex((m) => m.id === id) - 1];
  return `Reach size ${prev.goal + 1} on ${prev.name}`;
}

/**
 * Opens the map after `mapId` once `level` reaches its goal, and selects it for the next PLAY;
 * returns it when it was closed until now.
 */
export function openNextTourMap(save: SaveData, mapId: MapId, level: number): MapId | null {
  const next = nextTourMap(mapId);
  if (!next || save.tour.maps[next.id] || level < mapDef(mapId).goal) return null;
  save.tour.maps[next.id] = true;
  save.tour.selectedMap = next.id;
  return next.id;
}

/** Every Tour map's goal is reached: the Tour is complete. */
export function tourComplete(save: SaveData): boolean {
  return MAPS.every((m) => save.tour.bestLevel[m.id] >= m.goal);
}

/** Stars across every Tour map. */
export function tourStarTotal(save: SaveData): number {
  return MAPS.reduce((n, m) => n + tourStars(save, m.id), 0);
}

/** Stars on a Tour map: goal reached, map cleared, cleared within par. */
export function tourStars(save: SaveData, id: MapId): number {
  const t = save.tour;
  const clear = t.bestClear[id];
  return (t.bestLevel[id] >= mapDef(id).goal ? 1 : 0) + (clear > 0 ? 1 : 0) + (clear > 0 && clear <= TOUR.par[id] ? 1 : 0);
}

/** What settling a Tour round changed, for the results screen. */
export interface TourSettlement {
  cleared: boolean;
  starsBefore: number;
  stars: number;
  /** New records (not reported the first time the map is played). */
  bestLevel: boolean;
  bestPercent: boolean;
  bestTime: boolean;
  /** Map opened by this round, if any. */
  opened: MapId | null;
  /** This round completed the Tour, or earned its last missing star. */
  finished: boolean;
  perfect: boolean;
}

/** Books a finished Tour round into `save.tour`: records, clear time and the next map. */
export function settleTour(save: SaveData, r: RoundSummary): TourSettlement {
  const t = save.tour;
  const id = r.mapId;
  const starsBefore = tourStars(save, id);
  const finishedBefore = tourComplete(save);
  const allBefore = tourStarTotal(save);
  const played = t.bestPct[id] > 0;
  const cleared = r.percentEaten >= MAP_CLEARED_FRACTION;
  const bestLevel = played && r.level > t.bestLevel[id];
  const bestPercent = played && r.percentEaten > t.bestPct[id] + 1e-6;
  const bestTime = cleared && t.bestClear[id] > 0 && r.time < t.bestClear[id];
  t.bestLevel[id] = Math.max(t.bestLevel[id], r.level);
  t.bestPct[id] = Math.max(t.bestPct[id], r.percentEaten);
  if (cleared && (t.bestClear[id] === 0 || r.time < t.bestClear[id])) t.bestClear[id] = r.time;
  const opened = openNextTourMap(save, id, r.level);
  const allStars = MAPS.length * 3;
  return {
    cleared,
    starsBefore,
    stars: tourStars(save, id),
    bestLevel,
    bestPercent,
    bestTime,
    opened,
    finished: !finishedBefore && tourComplete(save),
    perfect: allBefore < allStars && tourStarTotal(save) === allStars,
  };
}
