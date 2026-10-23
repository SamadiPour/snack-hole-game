/**
 * Every tunable economy number lives here. Formulas that use them are in core/economy.ts.
 */

// ---------------------------------------------------------------- size & round
export const SIZE = {
  baseRadius: 0.75,
  radiusGrowth: 1.125,
  /**
   * XP needed for L -> L+1 is xpCoef * R(L)^xpExp * ramp(L), and a prop gives
   * footprint^objXpExp XP. Equal exponents keep the number of your-size props needed per level
   * constant, so growth does not stall as the hole gets bigger. ramp(L) =
   * min(1, (L + rampStart) / rampLevels) makes the first few levels quick.
   */
  xpCoef: 8,
  xpExp: 2,
  objXpExp: 2,
  rampStart: 2,
  rampLevels: 6,
  /** Fraction of the first level's XP the hole starts each round with. */
  startXp: 0.5,
  /**
   * Props close to the hole's size give extra XP: x(1 + frontierBonus * (f / (fit R))^frontierExp).
   * Sparse top tiers (a few huge landmarks) still grow you; piles of tiny props matter less.
   */
  frontierBonus: 3,
  frontierExp: 3,
  /** Object fits when footprint <= fit * R. */
  fit: 0.9,
  speedBase: 4.5,
  speedPerRadius: 2.1,
};

/**
 * Cash value of a prop: coef * footprint^exp * (1 + height / heightDiv) * type multiplier. A low
 * exponent keeps income growing steadily with size instead of jumping when a tier of big props
 * becomes edible.
 */
export const VALUE = { coef: 6, exp: 1.3, heightDiv: 20 };

export const ROUND = {
  baseTime: 60,
  perLevel: 10,
};

/**
 * A round ends early once nothing reachable is left (see World.snackedOut). It pays a bonus of
 * `bonusPerSecond` x round cash per second left, up to `bonusCap`.
 */
export const ROUND_END = {
  checkEvery: 0.5,
  endDelay: 1.6,
  bonusPerSecond: 0.01,
  bonusCap: 0.5,
};

export const COMBO = {
  baseWindow: 1.2,
  windowPerLevel: 0.15,
  perStack: 0.02,
  baseCap: 2,
  capPerLevel: 0.15,
};

export const MAGNET = {
  /** pull range = R * (rangeBase + rangePerLevel * lvl) for lvl >= 1 */
  rangeBase: 0.15,
  rangePerLevel: 0.12,
  /** pull speed = (pullBase + pullPerRadius * R) * (1 + pullPerLevel * lvl) */
  pullBase: 2,
  pullPerRadius: 1.5,
  pullPerLevel: 0.08,
};

// ---------------------------------------------------------------- upgrades
export type UpgradeId =
  | 'startSize'
  | 'roundTime'
  | 'speed'
  | 'cashValue'
  | 'growth'
  | 'magnet'
  | 'combo'
  | 'offline'
  | 'golden';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  icon: string;
  desc: string;
  base: number;
  growth: number;
  max: number;
  /** Lifetime cash this run required before the upgrade shows up. */
  unlockAt: number;
}

/**
 * Capped tracks with few, chunky levels (each one changes a round by ~10% or more). Costs grow
 * geometrically (base * growth^level) and no track has milestone multipliers. Every price here
 * is in Suburb money: the shop multiplies it by the newest unlocked map's value multiplier and
 * 4^tier (economy.ts, priceScale). Helper and ability prices are fixed instead (HELPERS, ABILITIES).
 */
export const UPGRADES: UpgradeDef[] = [
  { id: 'startSize', name: 'Starting Size', icon: '⭕', desc: 'Begin each round one size bigger.', base: 55, growth: 1.25, max: 50, unlockAt: 0 },
  { id: 'speed', name: 'Speed', icon: '💨', desc: 'Glide around the map 8% faster.', base: 75, growth: 3.25, max: 8, unlockAt: 0 },
  { id: 'cashValue', name: 'Cash Value', icon: '💰', desc: 'Everything you eat is worth 26% more.', base: 125, growth: 2.8, max: 10, unlockAt: 0 },
  { id: 'roundTime', name: 'Round Time', icon: '⏱️', desc: '+10 seconds per round.', base: 500, growth: 2.8, max: 4, unlockAt: 0 },
  { id: 'growth', name: 'Growth Rate', icon: '📈', desc: 'Gain size 10% faster.', base: 185, growth: 2.8, max: 6, unlockAt: 100 },
  { id: 'magnet', name: 'Magnet', icon: '🧲', desc: 'Nearby edible props slide toward you.', base: 250, growth: 2.95, max: 8, unlockAt: 300 },
  { id: 'combo', name: 'Combo Window', icon: '🔥', desc: 'Longer combo window and a higher combo cap.', base: 620, growth: 2.5, max: 8, unlockAt: 1500 },
  { id: 'golden', name: 'Golden Touch', icon: '✨', desc: 'More props spawn golden. Golden props are worth x10.', base: 6200, growth: 2.35, max: 8, unlockAt: 15000 },
  { id: 'offline', name: 'Offline Vault', icon: '🌙', desc: 'Earn for 1 more hour while you are away.', base: 3700, growth: 3, max: 4, unlockAt: 5000 },
];

/** Golden props: chance per prop each round (base + per Golden Touch level) and value multiplier. */
export const GOLDEN = { baseChance: 0.01, chancePerLevel: 0.01, valueMul: 10 };

/**
 * In-round random events (not in the hub demo). At round start each event the map
 * supports rolls its `chance`; the ones that hit play one at a time, the first after `firstAt`
 * seconds and the next `gap` seconds after the previous ends, while at least `minLeft` seconds
 * remain (an event that no longer fits is skipped).
 */
export const EVENTS = {
  chance: { rush: 0.3, ufo: 0.25, stampede: 0.35 },
  firstAt: [8, 16] as [number, number],
  gap: [4, 8] as [number, number],
  minLeft: 12,
  rush: { count: 18, duration: 16 },
  ufo: { drops: 10, dropEvery: 0.8, crossTime: 13 },
  stampede: { count: 18, duration: 18, speed: [5, 6.5] as [number, number] },
};

export const CASH_VALUE = { perLevel: 0.26 };
export const SPEED_PER_LEVEL = 0.08;
export const GROWTH_PER_LEVEL = 0.1;

/**
 * Coming back pays `roundsPerHour` x the average cash of your last `recentRounds` rounds per hour
 * away, up to the cap. A full 8 h base cap is worth 4 rounds: a welcome-back bonus, never better
 * than playing.
 */
export const OFFLINE = {
  baseCapHours: 8,
  capPerLevel: 1,
  roundsPerHour: 0.5,
  minSeconds: 180,
  recentRounds: 5,
};

// ---------------------------------------------------------------- helper holes
export const HELPERS = {
  unlockAt: 800,
  /** Fixed cash prices, x4 per Singularity tier only: unlocking a map never raises them. */
  countCosts: [38000, 617000, 6560000, 177000000],
  levelBase: 132000,
  levelGrowth: 2.51,
  levelMax: 10,
  baseRadius: 0.7,
  radiusGrowth: 1.13,
  maxRadius: 2.4,
  roundCashShare: 0.84,
  speed: 5,
};

// ---------------------------------------------------------------- abilities
export type AbilityId = 'dash' | 'vortex' | 'mega';

export interface AbilityDef {
  id: AbilityId;
  name: string;
  icon: string;
  key: string;
  desc: string;
  /** Fixed cash prices, x4 per Singularity tier only: unlocking a map never raises them. */
  unlockCost: number;
  /** Price of level 2; each later level costs levelGrowth times the one before. */
  levelCost: number;
  levelGrowth: number;
  unlockAt: number;
  duration: number;
  cooldown: number;
  /** Fraction of the cooldown already charged when a round starts (1 = ready at once). */
  startCharge: number;
  maxLevel: number;
}

export const ABILITIES: AbilityDef[] = [
  { id: 'dash', name: 'Dash', icon: '⚡', key: 'Space / 1', desc: 'Burst of speed.', unlockCost: 300000, levelCost: 2.67e6, levelGrowth: 3.25, unlockAt: 2500, duration: 0.6, cooldown: 7, startCharge: 1, maxLevel: 5 },
  { id: 'vortex', name: 'Vortex', icon: '🌀', key: '2', desc: 'Powerful pull on everything edible nearby.', unlockCost: 2.22e6, levelCost: 7.41e6, levelGrowth: 3.34, unlockAt: 5e4, duration: 4, cooldown: 22, startCharge: 0, maxLevel: 5 },
  { id: 'mega', name: 'Mega Mouth', icon: '👄', key: '3', desc: 'Temporarily grow wider: +35%, and +10% more per level.', unlockCost: 36.9e6, levelCost: 85.6e6, levelGrowth: 2.32, unlockAt: 1.5e6, duration: 4, cooldown: 30, startCharge: 0, maxLevel: 5 },
];

export const ABILITY_LEVEL = {
  cooldownPerLevel: 0.12,
  durationPerLevel: 0.2,
  dashSpeed: 2.8,
  vortexRange: 3,
  vortexPull: 3,
  /** Mega Mouth radius x(megaScale + megaScalePerLevel * (level - 1)): x1.35 at level 1, x1.75 at 5. */
  megaScale: 1.35,
  megaScalePerLevel: 0.1,
};

// ---------------------------------------------------------------- maps
export type MapId = 'suburb' | 'downtown' | 'farm' | 'harbor' | 'airport' | 'spaceport' | 'moon';

export interface MapDef {
  id: MapId;
  name: string;
  icon: string;
  blurb: string;
  /** Size level (0-based; shown as goal + 1) to reach on this map to unlock the next one. */
  goal: number;
  /** Singularities needed (ever) before this map can unlock. */
  needsSingularities: number;
  valueMul: number;
  /** Size levels the hole loses on this map: later maps are a bigger scale to grow into. */
  sizeOffset: number;
  /** Size XP multiplier on this map: denser maps grow you slower so each takes several rounds. */
  xpMul: number;
  seed: number;
}

export const MAPS: MapDef[] = [
  { id: 'suburb', name: 'Sunny Suburb', icon: '🏡', blurb: 'Leafy streets, parks and cosy houses.', goal: 16, needsSingularities: 0, valueMul: 1, sizeOffset: 0, xpMul: 1, seed: 1101 },
  { id: 'farm', name: 'Happy Farm', icon: '🚜', blurb: 'Barns, fields and lots of animals.', goal: 18, needsSingularities: 0, valueMul: 9.7, sizeOffset: 9, xpMul: 0.81, seed: 3303 },
  { id: 'downtown', name: 'Downtown', icon: '🏙️', blurb: 'Busy avenues and towering skyscrapers.', goal: 25, needsSingularities: 0, valueMul: 50, sizeOffset: 16, xpMul: 0.63, seed: 2202 },
  { id: 'harbor', name: 'Harbor', icon: '⚓', blurb: 'Containers, cranes and giant ships.', goal: 23, needsSingularities: 0, valueMul: 233, sizeOffset: 24, xpMul: 0.49, seed: 4404 },
  { id: 'airport', name: 'Airport', icon: '✈️', blurb: 'Jets, hangars and a huge terminal.', goal: 27, needsSingularities: 1, valueMul: 870, sizeOffset: 26, xpMul: 0.94, seed: 5505 },
  { id: 'spaceport', name: 'Spaceport', icon: '🚀', blurb: 'Launch towers, giant crawlers and rockets ready to fly.', goal: 28, needsSingularities: 2, valueMul: 970, sizeOffset: 36, xpMul: 0.87, seed: 7707 },
  { id: 'moon', name: 'Moon Base', icon: '🌙', blurb: 'Low gravity, big domes, suspicious cheese.', goal: 24, needsSingularities: 3, valueMul: 1080, sizeOffset: 37, xpMul: 0.81, seed: 6606 },
];

/**
 * Cash prices follow the newest unlocked map's value multiplier raised to this power (see
 * priceScale): below 1, unlocking a map raises prices a little less than it raises payouts.
 */
export const MAP_PRICE = { exp: 0.95 };

export const MAP_COMPLETE_BONUS = 0.25;
/** Share of a map eaten that counts as clearing it (its 100% mark and MAP_COMPLETE_BONUS). */
export const MAP_CLEARED_FRACTION = 0.9995;
/**
 * A hole stops growing this many size levels past the one that swallows the map's biggest prop
 * (see mapMaxLevel), both at round start and during the round.
 */
export const MAP_SIZE_HEADROOM = 3;
/**
 * ...but never before it spans this share of the map's width, so maps of small props (Suburb,
 * Farm) still let the hole grow about as big, next to the map, as the others do.
 */
export const MAP_SIZE_MIN_SPAN = 0.15;

// ---------------------------------------------------------------- casual tour
/**
 * Casual Tour: the maps in order with the base hole (no upgrades, abilities, helpers or golden
 * props), no timer and no cash. The first map starts at size 1 and every later one at
 * `entryLevel`, so the hole never drops back to a speck. Reaching a map's size goal opens the next
 * one. Props give XP without the map's `xpMul`, which only slows upgraded players. Once what is
 * left cannot grow the hole, it grows a level every ROUND_END.checkEvery seconds while a prop is
 * still too big to fit, after waiting up to `catchUpPatience` for the props its size brought
 * within reach to be eaten (World catch-up): no crumb hunt between size tiers, and every map can
 * be cleared. `par` is the clear time in seconds for a map's third star: the casual player's
 * median clear in `npm run sim:tour`, rounded up to 30 s, plus 30 s. Moon Base is 30 s over that,
 * so third stars earned before `catchUpPatience` existed stay earned.
 */
export const TOUR = {
  entryLevel: 10,
  /** Built-in magnet (Magnet upgrade levels; fractions allowed): the base hole has no upgrades. */
  magnetLevel: 0.5,
  /** Seconds catch-up waits for the player to eat the props the hole's size brought within reach. */
  catchUpPatience: 15,
  par: { suburb: 420, farm: 510, downtown: 300, harbor: 330, airport: 450, spaceport: 390, moon: 540 } as Record<MapId, number>,
};

// ---------------------------------------------------------------- prestige
/**
 * Singularity. Dark Matter is based on lifetime cash: you have earned
 * floor(coef * (lifetimeCash / divisor)^exponent) DM in total, and each Singularity pays what you
 * have not claimed yet, so resetting at the same point again pays less and less. It becomes
 * available once `unlockMap` is unlocked. After the first run that reaches the Moon Base goal,
 * every such run raises the tier: maps start min(tier, tierSizeCap) sizes smaller, pay and cost
 * tierScale^tier times more, and Dark Matter gains are x(1 + tierDmBonus * tier). The size cap
 * keeps tiers endless: past it a tier only scales the numbers, so every map goal stays reachable
 * (uncapped, Moon Base would start at size 1 from about tier 33). Each Singularity already done,
 * up to `singularityDmCap`, also raises Dark Matter gains by `singularityDmBonus`: the first
 * Singularity (and so the second run) pays as before, later ones pay x2 for the same lifetime
 * cash. A higher cap keeps raising gains after the first ones, so later runs shrink fast
 * (balance/NOTES.md).
 */
export const PRESTIGE = {
  coef: 1.75,
  divisor: 1e6,
  exponent: 0.25,
  bonusPerDm: 0.1,
  unlockMap: 'downtown' as MapId,
  tierScale: 4,
  tierDmBonus: 0.1,
  singularityDmBonus: 1,
  singularityDmCap: 1,
  tierSizeCap: 10,
  /**
   * The Singularity panel calls it a good time to collapse once the Dark Matter formula has grown by
   * this share since the last Singularity (dmGrowth: before multipliers, so they do not move it).
   */
  goodGain: 0.5,
};

export type DmUpgradeId =
  | 'eventHorizon'
  | 'denseCore'
  | 'quantumHelpers'
  | 'hawking'
  | 'headStart'
  | 'gravityWell'
  | 'wormhole';

export interface DmUpgradeDef {
  id: DmUpgradeId;
  name: string;
  icon: string;
  desc: string;
  base: number;
  growth: number;
  max: number;
}

export const DM_UPGRADES: DmUpgradeDef[] = [
  { id: 'eventHorizon', name: 'Event Horizon', icon: '🕳️', desc: '+25% cash per level.', base: 2, growth: 1.5, max: 10 },
  { id: 'denseCore', name: 'Dense Core', icon: '🟣', desc: '+1 starting size per level.', base: 3, growth: 1.7, max: 10 },
  { id: 'headStart', name: 'Head Start', icon: '🎁', desc: 'Start each run with cash (x10 per level).', base: 2, growth: 2, max: 6 },
  { id: 'quantumHelpers', name: 'Quantum Helpers', icon: '👯', desc: 'Helper holes are 50% bigger and faster per level.', base: 3, growth: 1.8, max: 2 },
  { id: 'gravityWell', name: 'Gravity Well', icon: '🌌', desc: '+1 magnet level for free, per level.', base: 3, growth: 1.8, max: 6 },
  { id: 'hawking', name: 'Hawking Radiation', icon: '☢️', desc: '+4 h offline cap.', base: 10, growth: 1, max: 1 },
  { id: 'wormhole', name: 'Wormhole', icon: '🌀', desc: 'Keep unlocked maps through Singularity.', base: 40, growth: 1, max: 1 },
];

export const HEAD_START_BASE = 300;
/** Quantum Helpers: helper radius and speed bonus per level. */
export const QUANTUM_PER_LEVEL = 0.5;
/** Hawking Radiation: offline cap hours per level. */
export const HAWKING_HOURS = 4;

// ---------------------------------------------------------------- skins
export interface SkinDef {
  id: string;
  name: string;
  rim: string;
  glow: string;
  swirl: 'spiral' | 'rings' | 'stars' | 'none' | 'galaxy';
  swirlColor: string;
  cost: number; // DM, 0 = free/achievement
  achievement?: string;
}

export const SKINS: SkinDef[] = [
  { id: 'classic', name: 'Classic', rim: '#8a5cff', glow: '#b48cff', swirl: 'spiral', swirlColor: '#4b2a9c', cost: 0 },
  { id: 'mint', name: 'Mint Chip', rim: '#3be0b0', glow: '#8affd9', swirl: 'rings', swirlColor: '#14715a', cost: 0, achievement: 'eat1000' },
  { id: 'sunset', name: 'Sunset', rim: '#ff8a3d', glow: '#ffc06b', swirl: 'spiral', swirlColor: '#8c2f1b', cost: 0, achievement: 'combo50' },
  { id: 'ocean', name: 'Deep Ocean', rim: '#2fa8ff', glow: '#85d4ff', swirl: 'rings', swirlColor: '#0c3d7a', cost: 3 },
  { id: 'candy', name: 'Candy', rim: '#ff5fb4', glow: '#ffa6d8', swirl: 'stars', swirlColor: '#8c1d63', cost: 6 },
  { id: 'gold', name: 'Golden Gulp', rim: '#ffd23d', glow: '#fff09a', swirl: 'stars', swirlColor: '#8c6a00', cost: 15 },
  { id: 'toxic', name: 'Toxic', rim: '#9dff2f', glow: '#d6ff8a', swirl: 'spiral', swirlColor: '#3b7a0c', cost: 10 },
  { id: 'galaxy', name: 'Galaxy', rim: '#d38cff', glow: '#ffffff', swirl: 'galaxy', swirlColor: '#2a1a6e', cost: 30 },
  { id: 'void', name: 'True Void', rim: '#222233', glow: '#8888aa', swirl: 'none', swirlColor: '#000000', cost: 0, achievement: 'prestige3' },
  { id: 'nebula', name: 'Nebula', rim: '#5ad1ff', glow: '#c7a4ff', swirl: 'galaxy', swirlColor: '#3a1f7a', cost: 0, achievement: 'tier1' },
  { id: 'aurora', name: 'Aurora', rim: '#4dffb8', glow: '#a3f7ff', swirl: 'rings', swirlColor: '#0f5c63', cost: 0, achievement: 'tier3' },
  { id: 'supernova', name: 'Supernova', rim: '#ffef5a', glow: '#ff9a3d', swirl: 'stars', swirlColor: '#a3200f', cost: 0, achievement: 'tier5' },
  { id: 'quasar', name: 'Quasar', rim: '#ffffff', glow: '#7ae3ff', swirl: 'galaxy', swirlColor: '#06123a', cost: 0, achievement: 'tier10' },
];

// ---------------------------------------------------------------- bonuses
export const ACHIEVEMENT_BONUS = 0.02;
export const SET_BONUS = 0.05;

export const AUTOSAVE_SECONDS = 20;
export const SAVE_KEY = 'snack-hole-save';
/** Key used while the game was called Hungry Hole; read only when SAVE_KEY is empty. */
export const LEGACY_SAVE_KEY = 'hungry-hole-save';
/** The save replaced by the last import or restore, so Settings can undo it. */
export const BACKUP_SAVE_KEY = 'snack-hole-save-backup';
/** A stored save that could not be read, kept as-is instead of being overwritten. */
export const UNREADABLE_SAVE_KEY = 'snack-hole-save-unreadable';
export const SAVE_VERSION = 4;
