import {
  ABILITIES,
  DM_UPGRADES,
  HELPERS,
  MAPS,
  OFFLINE,
  SAVE_VERSION,
  SKINS,
  UPGRADES,
  type AbilityId,
  type DmUpgradeId,
  type MapId,
  type UpgradeId,
} from '../config/balance';
import { OBJECT_TYPES } from '../config/objects';

/** Render resolution: `auto` steps the pixel ratio down while frames run slow. */
export type Quality = 'auto' | 'high' | 'low';
/** Corner of the ability buttons on screens that take touch; elsewhere they always stay right. */
export type AbilitySide = 'right' | 'left';

export interface Settings {
  volume: number;
  muted: boolean;
  /** Ambient sound beds (key kept as `music` for old saves). */
  music: boolean;
  /** Background music. */
  tunes: boolean;
  scientific: boolean;
  shadows: boolean;
  shake: boolean;
  floaters: boolean;
  quality: Quality;
  abilitySide: AbilitySide;
}

export interface Stats {
  rounds: number;
  totalEaten: number;
  bestCombo: number;
  biggestF: number;
  biggestType: string;
  bestLevel: number;
  bestRoundCash: number;
  prestiges: number;
  playSeconds: number;
  abilitiesUsed: number;
}

/** Casual Tour progress (core/tour.ts). Tour rounds book nothing else: no cash, Gulpedia, stats or trophies. */
export interface TourSave {
  /** The hub is in Tour mode: PLAY starts a Tour round and the panel lists the Tour maps. */
  active: boolean;
  /** Tour map PLAY starts; always an open one. */
  selectedMap: MapId;
  /** Maps opened in the Tour; the first is always open. */
  maps: Record<MapId, boolean>;
  /** Biggest size level reached on each map. */
  bestLevel: Record<MapId, number>;
  /** Best share of each map eaten. */
  bestPct: Record<MapId, number>;
  /** Fastest clear of each map in seconds; 0 until it is cleared. */
  bestClear: Record<MapId, number>;
}

export interface SaveData {
  version: number;
  cash: number;
  /** Cash earned since the last Singularity (drives Dark Matter). */
  runCash: number;
  lifetimeCash: number;
  dm: number;
  /** All Dark Matter ever gained (sets the permanent cash bonus). */
  dmTotal: number;
  /** Dark Matter already claimed from the lifetime-cash formula (before tier bonuses). */
  dmClaimed: number;
  /** Singularity tier: +1 for every run that reached the Moon Base goal. */
  tier: number;
  upgrades: Record<UpgradeId, number>;
  helpers: number;
  helperLevel: number;
  abilities: Record<AbilityId, number>;
  maps: Record<MapId, boolean>;
  selectedMap: MapId;
  mapBest: Record<MapId, number>;
  map100: Record<MapId, boolean>;
  /** Biggest size level reached on each map this run (unlocks the next map at its goal). */
  mapLevel: Record<MapId, number>;
  /** Cash from the last few rounds, newest last (sets the offline payout). */
  recentRoundCash: number[];
  dmUpgrades: Record<DmUpgradeId, number>;
  skins: string[];
  skin: string;
  /** Kept through Singularities: the Tour is apart from runs. */
  tour: TourSave;
  gulpedia: Record<string, number>;
  achievements: string[];
  /** Misc one-shot UI flags (tabs seen, tutorial hints). */
  flags: Record<string, boolean>;
  stats: Stats;
  settings: Settings;
  lastSeen: number;
  created: number;
}

function record<K extends string, V>(keys: readonly K[], v: V): Record<K, V> {
  const r = {} as Record<K, V>;
  for (const k of keys) r[k] = v;
  return r;
}

export function defaultSave(now = Date.now()): SaveData {
  return {
    version: SAVE_VERSION,
    cash: 0,
    runCash: 0,
    lifetimeCash: 0,
    dm: 0,
    dmTotal: 0,
    dmClaimed: 0,
    tier: 0,
    upgrades: record(UPGRADES.map((u) => u.id), 0),
    helpers: 0,
    helperLevel: 0,
    abilities: record(ABILITIES.map((a) => a.id), 0),
    maps: { ...record(MAPS.map((m) => m.id), false), suburb: true },
    selectedMap: 'suburb',
    mapBest: record(MAPS.map((m) => m.id), 0),
    map100: record(MAPS.map((m) => m.id), false),
    mapLevel: record(MAPS.map((m) => m.id), 0),
    recentRoundCash: [],
    dmUpgrades: record(DM_UPGRADES.map((u) => u.id), 0),
    skins: ['classic'],
    skin: 'classic',
    tour: {
      active: false,
      selectedMap: 'suburb',
      maps: { ...record(MAPS.map((m) => m.id), false), suburb: true },
      bestLevel: record(MAPS.map((m) => m.id), 0),
      bestPct: record(MAPS.map((m) => m.id), 0),
      bestClear: record(MAPS.map((m) => m.id), 0),
    },
    gulpedia: {},
    achievements: [],
    flags: {},
    stats: {
      rounds: 0,
      totalEaten: 0,
      bestCombo: 0,
      biggestF: 0,
      biggestType: '',
      bestLevel: 0,
      bestRoundCash: 0,
      prestiges: 0,
      playSeconds: 0,
      abilitiesUsed: 0,
    },
    settings: {
      volume: 0.7,
      muted: false,
      music: true,
      tunes: true,
      scientific: false,
      shadows: true,
      shake: true,
      floaters: true,
      quality: 'auto',
      abilitySide: 'left',
    },
    lastSeen: now,
    created: now,
  };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Deep-merge loaded data onto defaults so new fields get sane values and bad types are dropped.
 * Every number in a save is a finite count, amount or timestamp, so anything else (NaN, Infinity,
 * negatives) falls back to the default. Only the default's own keys are copied, so inherited names
 * like `constructor` or `toString` never sneak in.
 */
function mergeInto<T>(def: T, src: unknown): T {
  if (!isObj(def) || !isObj(src)) {
    // A record default never takes a non-record (`typeof null` and arrays are 'object' too).
    if (isObj(def)) return def;
    if (typeof def === 'number') return (typeof src === 'number' && Number.isFinite(src) && src >= 0 ? src : def) as T;
    if (typeof def === typeof src && !Array.isArray(def)) return src as T;
    if (Array.isArray(def) && Array.isArray(src)) return src as T;
    return def;
  }
  const out: Record<string, unknown> = { ...(def as Record<string, unknown>) };
  for (const [k, v] of Object.entries(src)) {
    if (Object.prototype.hasOwnProperty.call(out, k)) out[k] = mergeInto(out[k], v);
  }
  return out as T;
}

const OBJECT_IDS = new Set(OBJECT_TYPES.map((o) => o.id));
const SKIN_IDS = new Set(SKINS.map((s) => s.id));
const QUALITIES: readonly Quality[] = ['auto', 'high', 'low'];
const ABILITY_SIDES: readonly AbilitySide[] = ['right', 'left'];

/** Whole number in [0, max]. */
function level(v: number, max = Infinity): number {
  return Math.min(max, Math.floor(v));
}

/** No DM upgrade has ever had more levels than this, so levels past it come from edited saves. */
const DM_LEVEL_EVER = 20;

/** The price curve levels above a lowered cap were bought on, where it differs from today's. */
const DM_OLD_CURVE: Partial<Record<DmUpgradeId, { base: number; growth: number }>> = {
  // Hawking Radiation was 3 levels of +2 h at 5, 10 and 20 DM.
  hawking: { base: 5, growth: 2 },
};

/** Clamps merged numbers to what the game can actually reach and drops unknown ids. */
function clampToGame(s: SaveData): void {
  for (const u of UPGRADES) s.upgrades[u.id] = level(s.upgrades[u.id], u.max);
  for (const a of ABILITIES) s.abilities[a.id] = level(s.abilities[a.id], a.maxLevel);
  for (const u of DM_UPGRADES) {
    // Levels above a cap that was lowered give back what they cost (dmUpgradeCost's curve).
    const owned = Math.min(level(s.dmUpgrades[u.id]), DM_LEVEL_EVER);
    const c = DM_OLD_CURVE[u.id] ?? u;
    for (let l = u.max; l < owned; l++) s.dm += Math.ceil(c.base * Math.pow(c.growth, l));
    s.dmUpgrades[u.id] = level(s.dmUpgrades[u.id], u.max);
  }
  s.helpers = level(s.helpers, HELPERS.countCosts.length);
  s.helperLevel = level(s.helperLevel, HELPERS.levelMax);
  s.tier = level(s.tier);
  for (const m of MAPS) {
    s.mapBest[m.id] = Math.min(1, s.mapBest[m.id]);
    s.mapLevel[m.id] = level(s.mapLevel[m.id]);
  }
  s.recentRoundCash = s.recentRoundCash.filter((c) => typeof c === 'number' && Number.isFinite(c) && c >= 0).slice(-OFFLINE.recentRounds);
  s.skins = [...new Set(['classic', ...s.skins.filter((id) => SKIN_IDS.has(id))])];
  if (!s.skins.includes(s.skin)) s.skin = 'classic';
  s.achievements = [...new Set(s.achievements.filter((id) => typeof id === 'string'))];
  if (!OBJECT_IDS.has(s.stats.biggestType)) s.stats.biggestType = '';
  s.settings.volume = Math.min(1, s.settings.volume);
  if (!QUALITIES.includes(s.settings.quality)) s.settings.quality = 'auto';
  if (!ABILITY_SIDES.includes(s.settings.abilitySide)) s.settings.abilitySide = 'left';
  s.maps.suburb = true;
  // Every map before an unlocked one is unlocked too: a save from before a map was added in the
  // middle of MAPS gets the new map once it has passed that point.
  for (let i = MAPS.length - 2; i >= 0; i--) if (s.maps[MAPS[i + 1].id]) s.maps[MAPS[i].id] = true;
  if (!MAPS.some((m) => m.id === s.selectedMap) || s.maps[s.selectedMap] !== true) s.selectedMap = 'suburb';
  const t = s.tour;
  t.maps.suburb = true;
  for (let i = MAPS.length - 2; i >= 0; i--) if (t.maps[MAPS[i + 1].id]) t.maps[MAPS[i].id] = true;
  if (!MAPS.some((m) => m.id === t.selectedMap) || t.maps[t.selectedMap] !== true) t.selectedMap = 'suburb';
  for (const m of MAPS) {
    t.bestLevel[m.id] = level(t.bestLevel[m.id]);
    t.bestPct[m.id] = Math.min(1, t.bestPct[m.id]);
  }
}

/** Version migrations: each step upgrades from version n to n+1. */
const MIGRATIONS: Record<number, (d: Record<string, unknown>) => void> = {
  // 0 -> 1: pre-release saves had no version field; nothing to transform.
  0: () => {},
  // 1 -> 2: map % became weighted by ground area, so old best % records no longer compare.
  1: (d) => {
    if (!isObj(d.mapBest)) return;
    const done = isObj(d.map100) ? d.map100 : {};
    for (const k of Object.keys(d.mapBest)) d.mapBest[k] = done[k] === true ? 1 : 0;
  },
  // 2 -> 3: the economy was rebalanced from scratch; old progress does not fit it. Keep settings.
  2: (d) => {
    for (const k of Object.keys(d)) if (k !== 'settings') delete d[k];
  },
  // 3 -> 4: the Dark Matter curve's coefficient went from 2.5 to 1.75. Scale the DM already
  // claimed onto the new curve, so the next Singularity is as close as it was (DM held is kept).
  3: (d) => {
    if (typeof d.dmClaimed === 'number' && Number.isFinite(d.dmClaimed)) d.dmClaimed = Math.floor((d.dmClaimed * 1.75) / 2.5);
  },
};

export function migrate(raw: unknown, now = Date.now()): SaveData {
  if (!isObj(raw)) return defaultSave(now);
  const data = { ...raw };
  let v = typeof data.version === 'number' && Number.isFinite(data.version) ? Math.max(0, Math.floor(data.version)) : 0;
  while (v < SAVE_VERSION) {
    MIGRATIONS[v]?.(data);
    v++;
  }
  data.version = SAVE_VERSION;
  const merged = mergeInto(defaultSave(now), data);
  // Gulpedia keys are dynamic: keep only known prop types with whole, positive counts.
  const g: Record<string, number> = {};
  if (isObj(data.gulpedia)) {
    for (const [k, c] of Object.entries(data.gulpedia)) {
      if (OBJECT_IDS.has(k) && typeof c === 'number' && Number.isFinite(c) && c >= 1) g[k] = Math.floor(c);
    }
  }
  merged.gulpedia = g;
  const flags: Record<string, boolean> = {};
  if (isObj(data.flags)) {
    for (const [k, v] of Object.entries(data.flags)) if (v === true) flags[k] = true;
  }
  merged.flags = flags;
  clampToGame(merged);
  return merged;
}

/** True for parsed JSON that is a Snack Hole save (any version), not just any object. */
export function looksLikeSave(raw: unknown): boolean {
  return isObj(raw) && typeof raw.version === 'number';
}

export function serialize(save: SaveData): string {
  // JSON writes Infinity as null, which loads back as 0: store the largest finite number instead.
  return JSON.stringify(save, (_, v: unknown) => (v === Infinity ? Number.MAX_VALUE : v));
}

/**
 * The save in `text`, or null when it is not JSON of a save. Only unreadable text returns null: an
 * error inside migrate() is a bug and throws, so the game stops instead of starting a fresh save.
 */
export function parseSave(text: string, now = Date.now()): SaveData | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  return looksLikeSave(raw) ? migrate(raw, now) : null;
}

export function deserialize(text: string | null, now = Date.now()): SaveData {
  return (text && parseSave(text, now)) || defaultSave(now);
}

/** Export format: base64 of the save's UTF-8 JSON (copy-paste safe). */
export function encodeSaveText(json: string): string {
  let bin = '';
  for (const b of new TextEncoder().encode(json)) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Inverse of encodeSaveText; throws on text that is not base64. */
export function decodeSaveText(text: string): string {
  const bin = atob(text.replace(/\s+/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
