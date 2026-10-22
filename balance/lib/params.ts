/**
 * Tunable parameters: the Phase 3 whitelist, with bounds, applied at runtime by mutating the
 * config objects in src/config/balance.ts (the economy reads them on every call). Exported
 * primitives (GROWTH_PER_LEVEL) cannot be reassigned from here, so those go through `adjustCfg`,
 * which every Layer A / B caller applies after eco.buildRoundConfig.
 *
 * `BASE` is the config as loaded, so the round model and Layer B can convert between baseline
 * units (what Layer A measured) and the tuned ones.
 */
import { ABILITIES, ABILITY_LEVEL, CASH_VALUE, DM_UPGRADES, GOLDEN, GROWTH_PER_LEVEL, HELPERS, MAPS, MAP_PRICE, PRESTIGE, SIZE, UPGRADES, VALUE, type DmUpgradeId, type MapId, type UpgradeId } from '../../src/config/balance';
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
  /** Set by hand for experiments; the search leaves it alone. */
  manual?: boolean;
}

const map = (id: MapId) => MAPS.find((m) => m.id === id)!;
const upg = (id: UpgradeId) => UPGRADES.find((u) => u.id === id)!;
const dmUpg = (id: DmUpgradeId) => DM_UPGRADES.find((u) => u.id === id)!;
/** Late maps, where a maxed Starting Size used to start the hole close to the goal. */
const LATE: MapId[] = ['spaceport', 'moon'];
/** Capped tracks whose cost growth `upgrades.growthScale` scales together. */
const CAPPED: UpgradeId[] = ['speed', 'cashValue', 'roundTime', 'growth', 'magnet', 'combo', 'golden'];

export const BASE = {
  goal: Object.fromEntries(MAPS.map((m) => [m.id, m.goal])) as Record<MapId, number>,
  xpMul: Object.fromEntries(MAPS.map((m) => [m.id, m.xpMul])) as Record<MapId, number>,
  valueMul: Object.fromEntries(MAPS.map((m) => [m.id, m.valueMul])) as Record<MapId, number>,
  upgradeGrowth: Object.fromEntries(UPGRADES.map((u) => [u.id, u.growth])) as Record<UpgradeId, number>,
  upgradeBase: Object.fromEntries(UPGRADES.map((u) => [u.id, u.base])) as Record<UpgradeId, number>,
  unlockCost: ABILITIES.map((a) => a.unlockCost),
  abilityGrowth: ABILITIES.map((a) => a.levelGrowth),
  helperCounts: [...HELPERS.countCosts],
  helperLevelBase: HELPERS.levelBase,
  helperShare: HELPERS.roundCashShare,
  growthPerLevel: GROWTH_PER_LEVEL,
  dmBase: Object.fromEntries(DM_UPGRADES.map((u) => [u.id, u.base])) as Record<DmUpgradeId, number>,
  dmGrowth: Object.fromEntries(DM_UPGRADES.map((u) => [u.id, u.growth])) as Record<DmUpgradeId, number>,
  dmCoef: PRESTIGE.coef,
  bonusPerDm: PRESTIGE.bonusPerDm,
};
/** Multi-level DM tree tracks whose price growth `dm.growthScale` scales together. */
const DM_TRACKS: DmUpgradeId[] = ['eventHorizon', 'denseCore', 'headStart', 'gravityWell'];

/** Overrides that cannot be written into the config objects (see adjustCfg). */
const over = { growthPerLevel: GROWTH_PER_LEVEL };

const P: Param[] = [];
for (const m of MAPS) {
  P.push({ id: `map.${m.id}.goal`, group: 'maps', label: `${m.name} goal (size, 0-based)`, lo: BASE.goal[m.id] - 4, hi: BASE.goal[m.id], int: true, get: () => map(m.id).goal, set: (v) => (map(m.id).goal = Math.round(v)) });
  // Never below today's value: slower growth inside a round would fix pacing by making play duller.
  P.push({ id: `map.${m.id}.xpMul`, group: 'maps', label: `${m.name} XP multiplier`, lo: BASE.xpMul[m.id], hi: BASE.xpMul[m.id] * 1.6, log: true, get: () => map(m.id).xpMul, set: (v) => (map(m.id).xpMul = v) });
  if (m.id !== 'suburb')
    P.push({ id: `map.${m.id}.sizeOffset`, group: 'maps', label: `${m.name} size offset`, lo: m.sizeOffset - 6, hi: m.sizeOffset + (LATE.includes(m.id) ? 10 : 2), int: true, get: () => map(m.id).sizeOffset, set: (v) => (map(m.id).sizeOffset = Math.round(v)) });
  if (m.id !== 'suburb')
    P.push({ id: `map.${m.id}.valueMul`, group: 'maps', label: `${m.name} value multiplier`, lo: BASE.valueMul[m.id] * 0.5, hi: BASE.valueMul[m.id] * 2, log: true, get: () => map(m.id).valueMul, set: (v) => (map(m.id).valueMul = v) });
}
P.push({ id: 'upgrades.startSize.growth', group: 'upgrades', label: 'Starting Size cost growth', lo: 1.1, hi: 1.5, get: () => upg('startSize').growth, set: (v) => (upg('startSize').growth = v) });
P.push({
  id: 'upgrades.baseScale',
  group: 'prices',
  label: 'Upgrades: every base price x k',
  lo: 0.3,
  hi: 3,
  log: true,
  get: () => upg('speed').base / BASE.upgradeBase.speed,
  set: (k) => {
    for (const u of UPGRADES) u.base = BASE.upgradeBase[u.id] * k;
  },
});
P.push({
  id: 'abilities.unlockScale',
  group: 'prices',
  label: 'Abilities: every unlock price x k',
  lo: 0.25,
  hi: 4,
  log: true,
  get: () => ABILITIES[0].unlockCost / BASE.unlockCost[0],
  set: (k) => ABILITIES.forEach((a, i) => (a.unlockCost = BASE.unlockCost[i] * k)),
});
P.push({ id: 'prices.mapExp', group: 'prices', label: 'Prices: newest map value multiplier ^ k', lo: 0.75, hi: 1, get: () => MAP_PRICE.exp, set: (v) => (MAP_PRICE.exp = v) });
P.push({
  id: 'abilities.levelGrowthScale',
  group: 'prices',
  label: 'Abilities: price growth per level scale (growth = 1 + (g - 1) x k)',
  lo: 0.5,
  hi: 1.5,
  get: () => (ABILITIES[0].levelGrowth - 1) / (BASE.abilityGrowth[0] - 1),
  set: (k) => ABILITIES.forEach((a, i) => (a.levelGrowth = 1 + (BASE.abilityGrowth[i] - 1) * k)),
});
P.push({
  id: 'helpers.countScale',
  group: 'prices',
  label: 'Helpers: every hole price x k',
  lo: 0.25,
  hi: 4,
  log: true,
  get: () => HELPERS.countCosts[0] / BASE.helperCounts[0],
  set: (k) => BASE.helperCounts.forEach((c, i) => (HELPERS.countCosts[i] = c * k)),
});
P.push({ id: 'helpers.levelBaseScale', group: 'prices', label: 'Helper training: first level price x k', lo: 0.25, hi: 4, log: true, get: () => HELPERS.levelBase / BASE.helperLevelBase, set: (k) => (HELPERS.levelBase = BASE.helperLevelBase * k) });
P.push({ id: 'helpers.levelGrowth', group: 'prices', label: 'Helper training: price growth per level', lo: 1.2, hi: 2.5, get: () => HELPERS.levelGrowth, set: (v) => (HELPERS.levelGrowth = v) });
P.push({
  id: 'upgrades.growthScale',
  group: 'upgrades',
  label: 'Capped tracks: cost growth scale (growth = 1 + (g - 1) x k)',
  lo: 0.5,
  hi: 1.5,
  get: () => (upg('speed').growth - 1) / (BASE.upgradeGrowth.speed - 1),
  set: (k) => {
    for (const id of CAPPED) upg(id).growth = 1 + (BASE.upgradeGrowth[id] - 1) * k;
  },
});
P.push({ id: 'cashValue.perLevel', group: 'upgrades', label: 'Cash Value per level', lo: 0.25, hi: 0.5, get: () => CASH_VALUE.perLevel, set: (v) => (CASH_VALUE.perLevel = v) });
P.push({ id: 'golden.chancePerLevel', group: 'upgrades', label: 'Golden Touch chance per level', lo: 0.01, hi: 0.025, get: () => GOLDEN.chancePerLevel, set: (v) => (GOLDEN.chancePerLevel = v) });
P.push({ id: 'growth.perLevel', group: 'upgrades', label: 'Growth Rate XP per level', lo: 0.1, hi: 0.2, get: () => over.growthPerLevel, set: (v) => (over.growthPerLevel = v) });
P.push({ id: 'helpers.cashShare', group: 'helpers', label: 'Helper cash share', lo: 0.6, hi: 1.2, get: () => HELPERS.roundCashShare, set: (v) => (HELPERS.roundCashShare = v) });
P.push({ id: 'mega.unlockCost', group: 'abilities', label: 'Mega Mouth unlock cost', lo: 1e4, hi: 3e6, log: true, manual: true, get: () => ABILITIES[2].unlockCost, set: (v) => (ABILITIES[2].unlockCost = Math.round(v / 1e3) * 1e3) });
P.push({ id: 'prestige.coef', group: 'prestige', label: 'Dark Matter coefficient', lo: 1.75, hi: 3.5, get: () => PRESTIGE.coef, set: (v) => (PRESTIGE.coef = v) });
P.push({ id: 'prestige.exponent', group: 'prestige', label: 'Dark Matter exponent', lo: 0.25, hi: 0.4, get: () => PRESTIGE.exponent, set: (v) => (PRESTIGE.exponent = v) });
P.push({ id: 'prestige.bonusPerDm', group: 'prestige', label: 'Cash bonus per Dark Matter', lo: 0.1, hi: 0.25, get: () => PRESTIGE.bonusPerDm, set: (v) => (PRESTIGE.bonusPerDm = v) });
P.push({ id: 'prestige.singularityDmBonus', group: 'prestige', label: 'Dark Matter gain per Singularity done', lo: 0, hi: 1.5, manual: true, get: () => PRESTIGE.singularityDmBonus, set: (v) => (PRESTIGE.singularityDmBonus = v) });
P.push({ id: 'prestige.singularityDmCap', group: 'prestige', label: 'Singularities that raise Dark Matter gains', lo: 1, hi: 6, int: true, manual: true, get: () => PRESTIGE.singularityDmCap, set: (v) => (PRESTIGE.singularityDmCap = Math.round(v)) });
P.push({
  id: 'dm.growthScale',
  group: 'prestige',
  label: 'DM tree: price growth scale of the multi-level tracks (growth = 1 + (g - 1) x k)',
  lo: 0.3,
  hi: 1,
  manual: true,
  get: () => (dmUpg('eventHorizon').growth - 1) / (BASE.dmGrowth.eventHorizon - 1),
  set: (k) => {
    for (const id of DM_TRACKS) dmUpg(id).growth = 1 + (BASE.dmGrowth[id] - 1) * k;
  },
});
P.push({
  // A relabel: k times the Dark Matter for the same cash, each worth 1/k of the cash bonus, and every
  // DM price k times higher. Only rounding differs.
  id: 'dm.scale',
  group: 'prestige',
  label: 'Dark Matter unit: gains x k, cash bonus per DM / k, DM prices x k',
  lo: 1,
  hi: 5,
  manual: true,
  get: () => PRESTIGE.coef / BASE.dmCoef,
  set: (k) => {
    PRESTIGE.coef = BASE.dmCoef * k;
    PRESTIGE.bonusPerDm = BASE.bonusPerDm / k;
    for (const u of DM_UPGRADES) u.base = BASE.dmBase[u.id] * k;
  },
});
for (const a of ABILITIES) {
  P.push({ id: `abilities.${a.id}.startCharge`, group: 'abilities', label: `${a.name}: share charged at round start`, lo: 0, hi: 1, manual: true, dynamic: true, get: () => ABILITIES.find((x) => x.id === a.id)!.startCharge, set: (v) => (ABILITIES.find((x) => x.id === a.id)!.startCharge = v) });
  P.push({ id: `abilities.${a.id}.cooldown`, group: 'abilities', label: `${a.name}: cooldown at level 1 (s)`, lo: 3, hi: 60, manual: true, dynamic: true, get: () => ABILITIES.find((x) => x.id === a.id)!.cooldown, set: (v) => (ABILITIES.find((x) => x.id === a.id)!.cooldown = v) });
  P.push({ id: `abilities.${a.id}.duration`, group: 'abilities', label: `${a.name}: duration at level 1 (s)`, lo: 1, hi: 10, manual: true, dynamic: true, get: () => ABILITIES.find((x) => x.id === a.id)!.duration, set: (v) => (ABILITIES.find((x) => x.id === a.id)!.duration = v) });
}
P.push({ id: 'abilities.megaScalePerLevel', group: 'abilities', label: 'Mega Mouth: extra radius per level', lo: 0, hi: 0.2, manual: true, dynamic: true, get: () => ABILITY_LEVEL.megaScalePerLevel, set: (v) => (ABILITY_LEVEL.megaScalePerLevel = v) });
P.push({ id: 'abilities.megaScale', group: 'abilities', label: 'Mega Mouth: radius at level 1', lo: 1, hi: 2, manual: true, dynamic: true, get: () => ABILITY_LEVEL.megaScale, set: (v) => (ABILITY_LEVEL.megaScale = v) });
P.push({ id: 'upgrades.startSize.max', group: 'upgrades', label: 'Starting Size levels', lo: 40, hi: 60, int: true, manual: true, get: () => upg('startSize').max, set: (v) => (upg('startSize').max = Math.round(v)) });
for (const d of DM_UPGRADES) {
  P.push({ id: `dm.${d.id}.base`, group: 'prestige', label: `${d.name}: first level (DM)`, lo: 1, hi: 100, log: true, manual: true, get: () => dmUpg(d.id).base, set: (v) => (dmUpg(d.id).base = v) });
  P.push({ id: `dm.${d.id}.growth`, group: 'prestige', label: `${d.name}: price growth per level`, lo: 1, hi: 4, manual: true, get: () => dmUpg(d.id).growth, set: (v) => (dmUpg(d.id).growth = v) });
}
P.push({ id: 'map.moon.needsSingularities', group: 'maps', label: 'Moon Base: Singularities needed', lo: 1, hi: 4, int: true, manual: true, get: () => map('moon').needsSingularities, set: (v) => (map('moon').needsSingularities = Math.round(v)) });
// Layer A only: they change what happens in a round.
P.push({ id: 'SIZE.frontierBonus', group: 'growth', label: 'Frontier XP bonus', lo: 1, hi: 4, dynamic: true, get: () => SIZE.frontierBonus, set: (v) => (SIZE.frontierBonus = v) });
P.push({ id: 'VALUE.exp', group: 'value', label: 'Value exponent', lo: 1.1, hi: 1.6, dynamic: true, get: () => VALUE.exp, set: (v) => (VALUE.exp = v) });

export const PARAMS = P;
export const SEARCH = P.filter((p) => !p.dynamic && !p.manual);
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
