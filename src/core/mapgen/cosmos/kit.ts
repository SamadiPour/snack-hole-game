import { SIZE } from '../../../config/balance';
import { REALMS, REALM_SIZE, realmDef, type RealmId } from '../../../config/cosmos';
import { OBJECT_TYPES, footprintOf, typeId } from '../../../config/objects';
import type { Rng } from '../../rng';
import { holeSpeed, radiusForLevel } from '../../size';
import { MapBuilder, type Area } from '../builder';

/**
 * Shared kit for the Cosmos realm generators. A realm is laid out by size level instead of by
 * metres: each tier names a prop type and the levels it fills, and every prop is scaled so it
 * becomes edible exactly at its level. That keeps the size ladder full by construction and makes a
 * realm's pacing (props per level) a number in its tier list.
 */

export function realmBuilder(id: RealmId): MapBuilder {
  return new MapBuilder(id, REALM_SIZE, realmDef(id).seed);
}

/** Scale that makes `type` edible at size level `level`: its footprint lands just under that level's fit. */
export function scaleFor(type: string, level: number, rng: Rng): number {
  const f = SIZE.fit * radiusForLevel(level) * rng.range(0.9, 0.985);
  return f / footprintOf(OBJECT_TYPES[typeId(type)], 1);
}

/** Radius around a realm's start that the realm before lands on (its whole map, shrunk by the flip). */
export function nestRadius(id: RealmId): number {
  const i = REALMS.findIndex((r) => r.id === id);
  if (i <= 0) return 0;
  const z = Math.pow(SIZE.radiusGrowth, REALMS[i].startLevel - REALMS[i - 1].goal);
  return (REALM_SIZE / 2) * z * Math.SQRT2;
}

export interface Tier {
  type: string;
  /** Size levels to fill, inclusive: each gets `count` props scaled to become edible exactly there. */
  levels: [number, number];
  count: number;
  /** Per-prop tint, picked at random. */
  tint?: readonly number[];
  /**
   * Wanders a box `span` wide around its spawn. `speed` is a share of the hole's speed at the
   * prop's level: fleeing runs at 1.9x that, so keep it under about 0.3 or the hole cannot catch up.
   */
  wander?: { speed: number; flee?: boolean; span?: number };
  /** Where to place (default: the whole map but a 3-unit border). */
  area?: Area;
  /** Keep out of the middle of the nest; default for levels more than 8 above the realm's start. */
  avoidNest?: boolean;
  /** Spacing pad passed to MapBuilder.put (reservation radius = footprint * pad). */
  pad?: number;
}

/**
 * Places every tier, biggest levels first so the big props find room. Returns how many props were
 * placed per level (for tuning).
 */
export function fillTiers(b: MapBuilder, id: RealmId, tiers: Tier[]): Map<number, number> {
  const rng = b.rng;
  const start = realmDef(id).startLevel;
  const nest = nestRadius(id);
  const H = b.half - 3;
  const all: Area = { x0: -H, x1: H, z0: -H, z1: H };
  const jobs: { t: Tier; level: number }[] = [];
  for (const t of tiers) for (let l = t.levels[0]; l <= t.levels[1]; l++) jobs.push({ t, level: l });
  jobs.sort((a, c) => c.level - a.level);
  const placed = new Map<number, number>();
  const { x: sx, z: sz } = startOf(b);
  for (const { t, level } of jobs) {
    const a = t.area ?? all;
    const avoid = t.avoidNest ?? level > start + 8;
    for (let k = 0; k < t.count; k++) {
      const scale = scaleFor(t.type, level, rng);
      const f = footprintOf(OBJECT_TYPES[typeId(t.type)], scale);
      const tint = t.tint ? rng.pick(t.tint) : undefined;
      for (let tries = 0; tries < 10; tries++) {
        const x = rng.range(a.x0, a.x1);
        const z = rng.range(a.z0, a.z1);
        // The realm before lands in the nest: big props stay out of its middle, where the hole arrives small.
        if (avoid && Math.hypot(x - sx, z - sz) < nest * 0.6 + f) continue;
        if (t.wander) {
          const span = t.wander.span ?? 14;
          const box: Area = { x0: Math.max(-H, x - span), x1: Math.min(H, x + span), z0: Math.max(-H, z - span), z1: Math.min(H, z + span) };
          b.wanderer(t.type, box, t.wander.speed * holeSpeed(radiusForLevel(level), 1), { scale, tint, flee: t.wander.flee });
          placed.set(level, (placed.get(level) ?? 0) + 1);
          break;
        }
        if (b.put(t.type, x, z, rng.range(0, Math.PI * 2), { scale, tint, pad: t.pad })) {
          placed.set(level, (placed.get(level) ?? 0) + 1);
          break;
        }
      }
    }
  }
  return placed;
}

/** Each generator sets its start before filling tiers; the nest is kept around it. */
const starts = new WeakMap<MapBuilder, { x: number; z: number }>();

export function setStart(b: MapBuilder, x: number, z: number): { x: number; z: number } {
  const s = { x, z };
  starts.set(b, s);
  return s;
}

function startOf(b: MapBuilder): { x: number; z: number } {
  return starts.get(b) ?? { x: 0, z: 0 };
}

/** `n` painted circles of random radius in `r`, colours from `colors`, anywhere in `a` (ground texture). */
export function speckle(b: MapBuilder, a: Area, n: number, r: [number, number], colors: readonly string[]): void {
  for (let i = 0; i < n; i++) b.circle(b.rng.range(a.x0, a.x1), b.rng.range(a.z0, a.z1), b.rng.range(r[0], r[1]), b.rng.pick(colors));
}

/** The whole map as an area, `m` units in from the edge. */
export function mapArea(b: MapBuilder, m = 0): Area {
  const H = b.half - m;
  return { x0: -H, x1: H, z0: -H, z1: H };
}
