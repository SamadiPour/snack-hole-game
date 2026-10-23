import { DM_UPGRADES, MAPS, SKINS } from '../config/balance';
import { OBJECT_TYPES } from '../config/objects';
import { checkAchievements } from '../core/achievements';
import { defaultSave, type SaveData } from '../core/save';

/** Named starting saves for the `?save=NAME` dev flag (see flags.ts). */
const FIXTURES: Record<string, (s: SaveData) => void> = {
  /** One Singularity in, farm and downtown unlocked, farm selected; every hub tab has content. */
  midgame: (s) => {
    s.stats.rounds = 30;
    s.cash = 3.2e6;
    s.runCash = 6e7;
    s.lifetimeCash = 8e8;
    s.dm = 12;
    s.dmTotal = 20;
    s.dmClaimed = 7;
    s.stats.prestiges = 1;
    s.helpers = 3;
    s.helperLevel = 6;
    s.abilities.dash = 3;
    s.abilities.vortex = 1;
    Object.assign(s.upgrades, { startSize: 20, speed: 5, cashValue: 6, roundTime: 2, growth: 3, magnet: 4, combo: 3, offline: 1 });
    s.mapLevel.suburb = 18;
    s.mapLevel.farm = 21;
    Object.assign(s.maps, { downtown: true, farm: true });
    s.mapBest.suburb = 1;
    s.map100.suburb = true;
    s.mapBest.downtown = 0.42;
    s.selectedMap = 'farm';
    for (const id of ['cone', 'hydrant', 'person', 'car', 'bus', 'house', 'tree', 'bench', 'dog', 'cow', 'chicken', 'pig', 'barn']) s.gulpedia[id] = 12;
    s.achievements.push('firstBite', 'eat100', 'car', 'house', 'combo25');
    s.skins.push('mint');
  },
  /**
   * Calibration (`?log`): early game on the farm, about 15 minutes in. Starts at farm size 5 with
   * a few cheap upgrades, one helper and Dash; no cash, so every round plays the same upgrades.
   */
  'calib-farm': (s) => {
    s.stats.rounds = 12;
    s.runCash = s.lifetimeCash = 3e4;
    Object.assign(s.upgrades, { startSize: 12, speed: 2, cashValue: 3, roundTime: 1, growth: 2, magnet: 2, combo: 1 });
    s.helpers = 1;
    s.helperLevel = 1;
    s.abilities.dash = 1;
    s.maps.farm = true;
    s.mapLevel.suburb = 16;
    s.selectedMap = 'farm';
    for (const id of ['cone', 'hydrant', 'person', 'car', 'tree', 'bench', 'bush', 'flower']) s.gulpedia[id] = 10;
    s.achievements.push('firstBite', 'eat100', 'car', 'size10');
    s.flags.tab_upgrades = s.flags.tab_helpers = s.flags.tab_abilities = true;
  },
  /**
   * Calibration (`?log`): second run on Harbor after one Singularity, with every ability and a
   * mid-level shop. Starts at harbor size 11; no cash.
   */
  'calib-harbor': (s) => {
    s.stats.rounds = 40;
    s.stats.prestiges = 1;
    s.runCash = 2e8;
    s.lifetimeCash = 3e8;
    s.dm = 0;
    s.dmTotal = s.dmClaimed = 14;
    Object.assign(s.dmUpgrades, { denseCore: 2, eventHorizon: 1, gravityWell: 1 });
    Object.assign(s.upgrades, { startSize: 30, speed: 6, cashValue: 7, roundTime: 3, growth: 5, magnet: 6, combo: 4, golden: 2 });
    s.helpers = 3;
    s.helperLevel = 6;
    Object.assign(s.abilities, { dash: 3, vortex: 2, mega: 1 });
    Object.assign(s.maps, { farm: true, downtown: true, harbor: true });
    Object.assign(s.mapLevel, { suburb: 20, farm: 22, downtown: 26 });
    s.selectedMap = 'harbor';
    for (const t of OBJECT_TYPES) if (['street', 'nature', 'people', 'park', 'vehicles', 'farm'].includes(t.set)) s.gulpedia[t.id] = 20;
    checkAchievements(s);
    for (const id of ['upgrades', 'helpers', 'abilities', 'maps', 'singularity']) s.flags[`tab_${id}`] = true;
  },
  /**
   * Endless tiers: tier 12 (past PRESTIGE.tierSizeCap), every Dark Matter upgrade maxed, Wormhole
   * keeping all maps, Moon Base selected and one size short of its goal (tier 13 on the next
   * collapse).
   */
  endless: (s) => {
    s.tier = 12;
    s.stats = { ...s.stats, rounds: 1183, totalEaten: 644704, bestCombo: 1041, biggestF: 13.5, biggestType: 'moonbase', bestLevel: 40, bestRoundCash: 2.19e20, prestiges: 31, playSeconds: 74 * 3600, abilitiesUsed: 9300 };
    s.cash = 5.87e20;
    s.runCash = 5.87e20;
    s.lifetimeCash = 2.41e21;
    s.dm = 2400;
    s.dmTotal = 18301;
    s.dmClaimed = 11438;
    for (const u of DM_UPGRADES) s.dmUpgrades[u.id] = u.max;
    Object.assign(s.upgrades, { startSize: 40, speed: 8, cashValue: 10, roundTime: 4, growth: 6, magnet: 8, combo: 7, golden: 6, offline: 4 });
    s.helpers = 4;
    s.helperLevel = 10;
    Object.assign(s.abilities, { dash: 5, vortex: 5, mega: 4 });
    for (const m of MAPS) {
      s.maps[m.id] = true;
      s.mapBest[m.id] = 1;
      s.map100[m.id] = true;
    }
    s.mapBest.moon = 0.97;
    s.map100.moon = false;
    Object.assign(s.mapLevel, { suburb: 26, farm: 27, downtown: 30, harbor: 29, airport: 31, spaceport: 29, moon: 24 });
    s.selectedMap = 'moon';
    s.recentRoundCash = [2.19e20, 1.98e20, 1.7e20];
    for (const t of OBJECT_TYPES) s.gulpedia[t.id] = 500;
    s.skins.push(...SKINS.filter((k) => k.cost > 0).map((k) => k.id));
    for (const id of ['upgrades', 'helpers', 'abilities', 'maps', 'singularity', 'gulpedia', 'trophies', 'skins']) s.flags[`tab_${id}`] = true;
    // Granted here so the start of the game does not celebrate 42 trophies at once.
    checkAchievements(s);
    s.skin = 'quasar';
  },
  /**
   * Casual Tour with every map open: each goal before Moon Base reached (one star each, nothing
   * cleared), Moon Base open but unplayed and selected, so its goal finishes the Tour. Classic is
   * a new save.
   */
  tour: (s) => {
    const t = s.tour;
    t.active = true;
    for (const m of MAPS) t.maps[m.id] = true;
    for (const m of MAPS.slice(0, -1)) {
      t.bestLevel[m.id] = m.goal;
      t.bestPct[m.id] = 0.6;
    }
    t.selectedMap = MAPS[MAPS.length - 1].id;
  },
};

export function fixtureSave(name: string): SaveData {
  const apply = FIXTURES[name];
  if (!apply) throw new Error(`Unknown ?save fixture "${name}" (known: ${Object.keys(FIXTURES).join(', ')})`);
  const s = defaultSave();
  apply(s);
  return s;
}
