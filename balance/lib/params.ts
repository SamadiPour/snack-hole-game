/**
 * Tunable parameters: the Phase 3 whitelist, with bounds, applied at runtime by mutating the
 * config objects in src/config/balance.ts (the economy reads them on every call). Exported
 * primitives (GROWTH_PER_LEVEL) cannot be reassigned from here, so those go through `adjustCfg`,
 * which every Layer A / B caller applies after eco.buildRoundConfig.
 *
 * `BASE` is the config as loaded, so the round model and Layer B can convert between baseline
 * units (what Layer A measured) and the tuned ones.
 */
import { ABILITIES, CASH_VALUE, GOLDEN, GROWTH_PER_LEVEL, HELPERS, MAPS, PRESTIGE, SIZE, UPGRADES, VALUE, type MapId, type UpgradeId } from '../../src/config/balance';
import type { RoundConfig } from '../../src/core/economy';
import type { SaveData } from '../../src/core/save';

export interface Param {
  id: string;
  group: string;
  label: string;
  lo: number;
  hi: number;
  /** Searched on a log scale (multiplicative ranges). */
  log?: boolean;
  int?: boolean;
  get(): number;
  set(v: number): void;
  /** Changes what happens inside a round in a way the fitted model cannot see (Layer A only). */
  dynamic?: boolean;
}

const map = (id: MapId) => MAPS.find((m) => m.id === id)!;
const upg = (id: UpgradeId) => UPGRADES.find((u) => u.id === id)!;
/** Capped tracks whose cost growth `upgrades.growthScale` scales together. */
const CAPPED: UpgradeId[] = ['speed', 'cashValue', 'roundTime', 'growth', 'magnet', 'combo', 'golden'];

export const BASE = {
  goal: Object.fromEntries(MAPS.map((m) => [m.id, m.goal])) as Record<MapId, number>,
  xpMul: Object.fromEntries(MAPS.map((m) => [m.id, m.xpMul])) as Record<MapId, number>,
  valueMul: Object.fromEntries(MAPS.map((m) => [m.id, m.valueMul])) as Record<MapId, number>,
  upgradeGrowth: Object.fromEntries(UPGRADES.map((u) => [u.id, u.growth])) as Record<UpgradeId, number>,
  helperShare: HELPERS.roundCashShare,
  growthPerLevel: GROWTH_PER_LEVEL,
};

/** Overrides that cannot be written into the config objects (see adjustCfg). */
const over = { growthPerLevel: GROWTH_PER_LEVEL };

const P: Param[] = [];
for (const m of MAPS) {
  P.push({ id: `map.${m.id}.goal`, group: 'maps', label: `${m.name} goal (size, 0-based)`, lo: BASE.goal[m.id] - 4, hi: BASE.goal[m.id], int: true, get: () => map(m.id).goal, set: (v) => (map(m.id).goal = Math.round(v)) });
  // Never below today's value: slower growth inside a round would fix pacing by making play duller.
  P.push({ id: `map.${m.id}.xpMul`, group: 'maps', label: `${m.name} XP multiplier`, lo: BASE.xpMul[m.id], hi: BASE.xpMul[m.id] * 1.6, log: true, get: () => map(m.id).xpMul, set: (v) => (map(m.id).xpMul = v) });
  if (m.id !== 'suburb')
    P.push({ id: `map.${m.id}.sizeOffset`, group: 'maps', label: `${m.name} size offset`, lo: m.sizeOffset - 6, hi: m.sizeOffset + 2, int: true, get: () => map(m.id).sizeOffset, set: (v) => (map(m.id).sizeOffset = Math.round(v)) });
  if (m.id !== 'suburb')
    P.push({ id: `map.${m.id}.valueMul`, group: 'maps', label: `${m.name} value multiplier`, lo: BASE.valueMul[m.id] * 0.5, hi: BASE.valueMul[m.id] * 2, log: true, get: () => map(m.id).valueMul, set: (v) => (map(m.id).valueMul = v) });
}
P.push({ id: 'upgrades.startSize.growth', group: 'upgrades', label: 'Starting Size cost growth', lo: 1.4, hi: 1.8, get: () => upg('startSize').growth, set: (v) => (upg('startSize').growth = v) });
P.push({
  id: 'upgrades.growthScale',
  group: 'upgrades',
  label: 'Capped tracks: cost growth scale (growth = 1 + (g - 1) x k)',
  lo: 0.6,
  hi: 1.2,
  get: () => (upg('speed').growth - 1) / (BASE.upgradeGrowth.speed - 1),
  set: (k) => {
    for (const id of CAPPED) upg(id).growth = 1 + (BASE.upgradeGrowth[id] - 1) * k;
  },
});
P.push({ id: 'cashValue.perLevel', group: 'upgrades', label: 'Cash Value per level', lo: 0.25, hi: 0.5, get: () => CASH_VALUE.perLevel, set: (v) => (CASH_VALUE.perLevel = v) });
P.push({ id: 'golden.chancePerLevel', group: 'upgrades', label: 'Golden Touch chance per level', lo: 0.01, hi: 0.025, get: () => GOLDEN.chancePerLevel, set: (v) => (GOLDEN.chancePerLevel = v) });
P.push({ id: 'growth.perLevel', group: 'upgrades', label: 'Growth Rate XP per level', lo: 0.1, hi: 0.2, get: () => over.growthPerLevel, set: (v) => (over.growthPerLevel = v) });
P.push({ id: 'helpers.cashShare', group: 'helpers', label: 'Helper cash share', lo: 0.6, hi: 1.2, get: () => HELPERS.roundCashShare, set: (v) => (HELPERS.roundCashShare = v) });
P.push({ id: 'mega.unlockCost', group: 'abilities', label: 'Mega Mouth unlock cost', lo: 5e5, hi: 3e6, log: true, get: () => ABILITIES[2].unlockCost, set: (v) => (ABILITIES[2].unlockCost = Math.round(v / 1e4) * 1e4) });
P.push({ id: 'prestige.coef', group: 'prestige', label: 'Dark Matter coefficient', lo: 1.75, hi: 3.5, get: () => PRESTIGE.coef, set: (v) => (PRESTIGE.coef = v) });
P.push({ id: 'prestige.exponent', group: 'prestige', label: 'Dark Matter exponent', lo: 0.25, hi: 0.4, get: () => PRESTIGE.exponent, set: (v) => (PRESTIGE.exponent = v) });
P.push({ id: 'prestige.bonusPerDm', group: 'prestige', label: 'Cash bonus per Dark Matter', lo: 0.1, hi: 0.25, get: () => PRESTIGE.bonusPerDm, set: (v) => (PRESTIGE.bonusPerDm = v) });
// Layer A only: they change what happens in a round.
P.push({ id: 'SIZE.frontierBonus', group: 'growth', label: 'Frontier XP bonus', lo: 1, hi: 4, dynamic: true, get: () => SIZE.frontierBonus, set: (v) => (SIZE.frontierBonus = v) });
P.push({ id: 'VALUE.exp', group: 'value', label: 'Value exponent', lo: 1.1, hi: 1.6, dynamic: true, get: () => VALUE.exp, set: (v) => (VALUE.exp = v) });

export const PARAMS = P;
export const SEARCH = P.filter((p) => !p.dynamic);
const baseline = Object.fromEntries(P.map((p) => [p.id, p.get()]));
export const baselineValues = (): Record<string, number> => ({ ...baseline });

export function resetParams(): void {
  for (const p of P) p.set(baseline[p.id]);
}

/** Applies `values` (by id) over the baseline; unknown ids throw. */
export function applyParams(values: Record<string, number> | undefined): void {
  resetParams();
  for (const [id, v] of Object.entries(values ?? {})) {
    const p = P.find((x) => x.id === id);
    if (!p) throw new Error(`unknown param ${id}`);
    p.set(v);
  }
}

/** Overrides eco.buildRoundConfig cannot see (exported primitives). */
export function adjustCfg(cfg: RoundConfig, save: SaveData): RoundConfig {
  if (over.growthPerLevel !== BASE.growthPerLevel) cfg.xpMult = (1 + over.growthPerLevel * save.upgrades.growth) * map(cfg.mapId).xpMul;
  return cfg;
}

/** Baseline-unit cash (what Layer A measured) to the tuned map value and helper share. */
export function cashFactor(mapId: MapId, helperShare: number): number {
  return (map(mapId).valueMul / BASE.valueMul[mapId]) * (1 - helperShare + helperShare * (HELPERS.roundCashShare / BASE.helperShare));
}
