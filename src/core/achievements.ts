import { ABILITIES, MAPS } from '../config/balance';
import { GULPEDIA_TYPES } from '../config/objects';
import { completedSets } from './economy';
import type { SaveData } from './save';

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  check: (s: SaveData) => boolean;
  /** Skin unlocked alongside the +2% cash bonus. */
  skin?: string;
}

const ate = (s: SaveData, ...ids: string[]) => ids.some((id) => (s.gulpedia[id] ?? 0) > 0);
const discovered = (s: SaveData) => Object.keys(s.gulpedia).length;

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'firstBite', name: 'First Bite', desc: 'Swallow your first object.', icon: '🍪', check: (s) => s.stats.totalEaten >= 1 },
  { id: 'eat100', name: 'Snacker', desc: 'Swallow 100 objects.', icon: '🍿', check: (s) => s.stats.totalEaten >= 100 },
  { id: 'eat1000', name: 'Glutton', desc: 'Swallow 1,000 objects.', icon: '🍔', check: (s) => s.stats.totalEaten >= 1000, skin: 'mint' },
  { id: 'eat10k', name: 'Bottomless', desc: 'Swallow 10,000 objects.', icon: '🕳️', check: (s) => s.stats.totalEaten >= 10000 },
  { id: 'eat100k', name: 'Black Hole', desc: 'Swallow 100,000 objects.', icon: '🌑', check: (s) => s.stats.totalEaten >= 100000 },
  { id: 'car', name: 'Road Rage', desc: 'Swallow a car.', icon: '🚗', check: (s) => ate(s, 'car', 'taxi') },
  { id: 'house', name: 'Home Wrecker', desc: 'Swallow a house.', icon: '🏠', check: (s) => ate(s, 'house', 'house2') },
  { id: 'bus', name: 'Missed the Bus', desc: 'Swallow a city bus.', icon: '🚌', check: (s) => ate(s, 'bus') },
  { id: 'skyscraper', name: 'Skyline Snack', desc: 'Swallow a skyscraper.', icon: '🏙️', check: (s) => ate(s, 'skyscraper', 'glasstower') },
  { id: 'megatower', name: 'Tallest Treat', desc: 'Swallow the Mega Tower.', icon: '🗼', check: (s) => ate(s, 'megatower') },
  { id: 'cow', name: 'Moo-ve Over', desc: 'Swallow a cow.', icon: '🐄', check: (s) => ate(s, 'cow') },
  { id: 'cargoship', name: 'Shipwrecked', desc: 'Swallow a cargo ship.', icon: '🚢', check: (s) => ate(s, 'cargoship') },
  { id: 'jumbo', name: 'Grounded', desc: 'Swallow a jumbo jet.', icon: '✈️', check: (s) => ate(s, 'jumbo') },
  { id: 'cheese', name: 'Made of Cheese', desc: 'Swallow moon cheese.', icon: '🧀', check: (s) => ate(s, 'cheese') },
  { id: 'ufo', name: 'Close Encounter', desc: 'Swallow a UFO.', icon: '🛸', check: (s) => ate(s, 'ufo') },
  { id: 'combo25', name: 'Combo Starter', desc: 'Reach a x25 combo.', icon: '🔥', check: (s) => s.stats.bestCombo >= 25 },
  { id: 'combo50', name: 'Combo Chef', desc: 'Reach a x50 combo.', icon: '🔥', check: (s) => s.stats.bestCombo >= 50, skin: 'sunset' },
  { id: 'combo150', name: 'Combo Legend', desc: 'Reach a x150 combo.', icon: '☄️', check: (s) => s.stats.bestCombo >= 150 },
  { id: 'combo500', name: 'Unstoppable', desc: 'Reach a x500 combo.', icon: '💫', check: (s) => s.stats.bestCombo >= 500 },
  { id: 'size10', name: 'Growing Up', desc: 'Reach size 10 in a round.', icon: '📏', check: (s) => s.stats.bestLevel >= 10 },
  { id: 'size20', name: 'Big Mouth', desc: 'Reach size 20 in a round.', icon: '📐', check: (s) => s.stats.bestLevel >= 20 },
  { id: 'size30', name: 'Abyss', desc: 'Reach size 30 in a round.', icon: '🌀', check: (s) => s.stats.bestLevel >= 30 },
  { id: 'round1k', name: 'Pocket Money', desc: 'Earn $1K in one round.', icon: '💵', check: (s) => s.stats.bestRoundCash >= 1e3 },
  { id: 'round100k', name: 'Payday', desc: 'Earn $100K in one round.', icon: '💰', check: (s) => s.stats.bestRoundCash >= 1e5 },
  { id: 'round10m', name: 'Jackpot', desc: 'Earn $10M in one round.', icon: '🤑', check: (s) => s.stats.bestRoundCash >= 1e7 },
  { id: 'rich', name: 'Millionaire', desc: 'Earn $1M in total.', icon: '🏦', check: (s) => s.lifetimeCash >= 1e6 },
  { id: 'billion', name: 'Billionaire', desc: 'Earn $1B in total.', icon: '💎', check: (s) => s.lifetimeCash >= 1e9 },
  { id: 'map100', name: 'Clean Plate', desc: 'Eat 100% of any map.', icon: '🍽️', check: (s) => Object.values(s.map100).some(Boolean) },
  { id: 'allmaps', name: 'World Tour', desc: 'Unlock every map.', icon: '🗺️', check: (s) => MAPS.every((m) => s.maps[m.id]) },
  { id: 'helper', name: 'Little Helper', desc: 'Buy a helper hole.', icon: '👶', check: (s) => s.helpers >= 1 },
  { id: 'helpers4', name: 'Hole Family', desc: 'Own 4 helper holes.', icon: '👨‍👩‍👧‍👦', check: (s) => s.helpers >= 4 },
  { id: 'abilities', name: 'Power Hungry', desc: 'Unlock all abilities.', icon: '⚡', check: (s) => ABILITIES.every((a) => s.abilities[a.id] > 0) },
  { id: 'gulp50', name: 'Collector', desc: 'Discover 50 Gulpedia entries.', icon: '📖', check: (s) => discovered(s) >= 50 },
  { id: 'gulpAll', name: 'Encyclopedic', desc: 'Discover every Gulpedia entry.', icon: '📚', check: (s) => discovered(s) >= GULPEDIA_TYPES.length },
  { id: 'sets3', name: 'Set Builder', desc: 'Complete 3 Gulpedia sets.', icon: '🧩', check: (s) => completedSets(s).length >= 3 },
  { id: 'prestige1', name: 'Singularity', desc: 'Collapse into a Singularity.', icon: '🌌', check: (s) => s.stats.prestiges >= 1 },
  { id: 'prestige3', name: 'Event Horizon', desc: 'Reach 3 Singularities.', icon: '🌠', check: (s) => s.stats.prestiges >= 3, skin: 'void' },
  { id: 'prestige10', name: 'Big Crunch', desc: 'Reach 10 Singularities.', icon: '💥', check: (s) => s.stats.prestiges >= 10 },
  { id: 'tier1', name: 'Bigger Universe', desc: 'Reach Singularity tier 1.', icon: '🌌', check: (s) => s.tier >= 1, skin: 'nebula' },
  { id: 'tier3', name: 'Cosmic Appetite', desc: 'Reach Singularity tier 3.', icon: '🌠', check: (s) => s.tier >= 3, skin: 'aurora' },
  { id: 'tier5', name: 'Star Eater', desc: 'Reach Singularity tier 5.', icon: '☀️', check: (s) => s.tier >= 5, skin: 'supernova' },
  { id: 'tier10', name: 'End of Everything', desc: 'Reach Singularity tier 10.', icon: '🕳️', check: (s) => s.tier >= 10, skin: 'quasar' },
  { id: 'galaxy', name: 'Galaxy Gulper', desc: 'Eat the whole Milky Way in Cosmos.', icon: '🌌', check: (s) => s.cosmos.completions > 0, skin: 'bigbang' },
];

const KNOWN = new Set(ACHIEVEMENTS.map((a) => a.id));

/**
 * Grants any newly met achievements; returns them so the UI can celebrate. Unknown ids (from an
 * edited or imported save) are dropped first, since each entry pays +2% cash.
 */
export function checkAchievements(save: SaveData): AchievementDef[] {
  if (save.achievements.some((id) => !KNOWN.has(id))) save.achievements = save.achievements.filter((id) => KNOWN.has(id));
  const got: AchievementDef[] = [];
  for (const a of ACHIEVEMENTS) {
    if (save.achievements.includes(a.id)) continue;
    if (a.check(save)) {
      save.achievements.push(a.id);
      if (a.skin && !save.skins.includes(a.skin)) save.skins.push(a.skin);
      got.push(a);
    }
  }
  return got;
}
