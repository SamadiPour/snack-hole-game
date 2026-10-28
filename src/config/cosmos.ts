/**
 * Cosmos: one run from a quark to the Milky Way through nine scales ("realms"). Every realm plays
 * the same band of hole sizes on its own map; when the hole reaches a realm's goal, the world
 * shrinks around it into the next realm (World.rebase, core/cosmos.ts). Real sizes are labels only.
 */
import type { MapId } from './balance';

export type RealmId = 'quantum' | 'atomic' | 'molecular' | 'microbial' | 'garden' | 'hometown' | 'earth' | 'solar' | 'galaxy';

/** Any map a World can run on: a classic map or a Cosmos realm. */
export type WorldId = MapId | RealmId;

export interface RealmDef {
  id: RealmId;
  name: string;
  icon: string;
  blurb: string;
  /** Real width of the hole in metres at `startLevel` and at `goal` (log-interpolated between). */
  real: [number, number];
  /** Size level (0-based) the hole has when it enters the realm. */
  startLevel: number;
  /** Size level that flips to the next realm, or finishes the journey on the last one. */
  goal: number;
  seed: number;
}

export const REALMS: RealmDef[] = [
  { id: 'quantum', name: 'Quantum Foam', icon: '✨', blurb: 'Quarks, gluons and flickering photons.', real: [1e-18, 1e-15], startLevel: 0, goal: 16, seed: 9101 },
  { id: 'atomic', name: 'Atomic', icon: '⚛️', blurb: 'Protons, electrons and whole atoms.', real: [1e-15, 1e-9], startLevel: 3, goal: 18, seed: 9202 },
  { id: 'molecular', name: 'Molecular', icon: '🧪', blurb: 'Water, salt, sugar and a strand of DNA.', real: [1e-9, 1e-7], startLevel: 3, goal: 18, seed: 9303 },
  { id: 'microbial', name: 'Microbial', icon: '🦠', blurb: 'Viruses, bacteria, blood cells and a tardigrade.', real: [1e-7, 1e-3], startLevel: 3, goal: 18, seed: 9404 },
  { id: 'garden', name: 'Garden', icon: '🐜', blurb: 'Ants, ladybugs, crumbs and a lost sneaker.', real: [1e-3, 0.3], startLevel: 3, goal: 18, seed: 9505 },
  { id: 'hometown', name: 'Hometown', icon: '🏘️', blurb: 'Streets, cars, houses and towers.', real: [0.3, 1e3], startLevel: 3, goal: 18, seed: 9606 },
  { id: 'earth', name: 'Planet Earth', icon: '🌍', blurb: 'Islands, mountains, cities and storms.', real: [1e3, 1.3e7], startLevel: 3, goal: 18, seed: 9707 },
  { id: 'solar', name: 'Solar System', icon: '☀️', blurb: 'Asteroids, moons, planets and the Sun.', real: [1.3e7, 9e12], startLevel: 3, goal: 18, seed: 9808 },
  { id: 'galaxy', name: 'Milky Way', icon: '🌌', blurb: 'Stars, nebulae, black holes and the galactic core.', real: [9e12, 9.5e20], startLevel: 3, goal: 18, seed: 9909 },
];

/** Every realm map is this wide, so the nest (where the previous realm lands) has a known size. */
export const REALM_SIZE = 200;

export const COSMOS = {
  /**
   * Built-in magnet (Magnet upgrade levels) and speed multiplier. A realm flips at about 60%
   * eaten, so the hole sweeps up most of each scale: a stronger pull than the Tour's and a little
   * more speed keep that within a couple of minutes.
   */
  magnetLevel: 1.5,
  speedMult: 1.25,
  /** The hole may grow this many levels past the goal while the flip waits (landmark slow-motion). */
  goalHeadroom: 2,
  /** Props smaller than this footprint after a flip are dropped: under a pixel and worth nothing. */
  minCrumb: 0.06,
  /**
   * Safety net, never catch-up: when what is left cannot take the hole to the goal for this many
   * seconds, the realm flips anyway so a run can never soft-lock.
   */
  safetyPatience: 20,
  /** Constant terms of the size formulas ease from z back to 1 at this rate (1/s), with the camera. */
  affineRate: 2,
  /** Reveal wave: radius grows at `speed` (units/s) plus `accel` (units/s²). */
  revealSpeed: 22,
  revealAccel: 26,
  /** Seconds the old realm's ground takes to blend into the new ground. */
  groundBlend: 6,
  /** Seconds sky, fog and lights take to blend into the new realm's. */
  themeBlend: 2.5,
  /** Seconds of the finale: the galaxy spirals into the hole. */
  finale: 4.5,
};

export const realmDef = (id: RealmId): RealmDef => REALMS.find((r) => r.id === id)!;

export const isRealmId = (id: string): id is RealmId => REALMS.some((r) => r.id === id);
