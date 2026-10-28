import { realmDef, type RealmId } from '../../../config/cosmos';
import { OBJECT_TYPES, footprintOf, typeId } from '../../../config/objects';
import { Rng } from '../../rng';
import { holeSpeed, radiusForLevel } from '../../size';
import { ringPoints, type Area, type MapBuilder, type MapData } from '../builder';
import { mapArea, nestRadius, realmBuilder, scaleFor, setStart, type Tier } from './kit';

/** A tier with a placement rule: `where(x, z, f)` says whether a prop of footprint `f` may stand at (x, z). */
export interface PlaceTier extends Tier {
  where?: (x: number, z: number, f: number) => boolean;
}

/**
 * fillTiers (kit.ts) with a placement rule per tier: cities on land, ships at sea, stars along the
 * spiral arms. Wanderers start on the spot that passed the rule, in a box `span` round it.
 */
export function fillWhere(b: MapBuilder, id: RealmId, start: { x: number; z: number }, tiers: PlaceTier[]): Map<number, number> {
  const rng = b.rng;
  const first = realmDef(id).startLevel;
  const nest = nestRadius(id);
  const H = b.half - 3;
  const all: Area = { x0: -H, x1: H, z0: -H, z1: H };
  const jobs: { t: PlaceTier; level: number }[] = [];
  for (const t of tiers) for (let l = t.levels[0]; l <= t.levels[1]; l++) jobs.push({ t, level: l });
  jobs.sort((a, c) => c.level - a.level);
  const placed = new Map<number, number>();
  for (const { t, level } of jobs) {
    const a = t.area ?? all;
    const avoid = t.avoidNest ?? level > first + 8;
    for (let k = 0; k < t.count; k++) {
      const scale = scaleFor(t.type, level, rng);
      const f = footprintOf(OBJECT_TYPES[typeId(t.type)], scale);
      const tint = t.tint ? rng.pick(t.tint) : undefined;
      for (let tries = 0; tries < 60; tries++) {
        const x = rng.range(a.x0, a.x1);
        const z = rng.range(a.z0, a.z1);
        if (avoid && Math.hypot(x - start.x, z - start.z) < nest * 0.6 + f) continue;
        if (t.where && !t.where(x, z, f)) continue;
        const rot = rng.range(0, Math.PI * 2);
        if (t.wander) {
          const span = t.wander.span ?? 14;
          const speed = t.wander.speed * holeSpeed(radiusForLevel(level), 1) * rng.range(0.8, 1.2);
          const box = { x0: Math.max(-H, x - span), x1: Math.min(H, x + span), z0: Math.max(-H, z - span), z1: Math.min(H, z + span) };
          b.put(t.type, x, z, rot, { scale, tint, move: { kind: 'wander', ...box, speed, flee: t.wander.flee } });
        } else if (!b.put(t.type, x, z, rot, { scale, tint, pad: t.pad })) continue;
        placed.set(level, (placed.get(level) ?? 0) + 1);
        break;
      }
    }
  }
  return placed;
}

interface Disc {
  x: number;
  z: number;
  r: number;
}

/** Latitude (|z|) where the polar ice starts. */
const ICE = 87;
const FOREST_TINT = [0x3f9a3a, 0x2f8a4a, 0x5cbf4a, 0x4caf50, 0x8fbf3a, 0xd9822b, 0x3f7a4a];
const START = { x: -6, z: 6 };

/** Continents as chains of [x, z, radius] (north is -z); start stays in open ocean. */
const CONTINENTS: [number, number, number][][] = [
  // North: a long continent across the top with two peninsulas reaching south.
  [[-86, -48, 13], [-66, -58, 18], [-42, -54, 21], [-16, -62, 17], [10, -57, 20], [36, -64, 16], [60, -52, 14], [82, -60, 12]],
  [[-42, -54, 21], [-44, -36, 14], [-36, -24, 9]],
  [[10, -57, 20], [20, -40, 12], [24, -28, 8]],
  // West, from the tropics into the south.
  [[-80, -14, 12], [-72, 4, 16], [-76, 24, 15], [-64, 42, 13], [-58, 60, 9]],
  // East.
  [[64, -22, 11], [74, -4, 16], [68, 18, 15], [78, 36, 12], [70, 52, 8]],
  // South.
  [[-22, 62, 12], [-2, 68, 15], [18, 62, 11], [32, 70, 8]],
];

/** Mountain ranges as polylines. */
const RANGES: [number, number][][] = [
  [[-80, -54], [-56, -62], [-30, -60], [-6, -66], [18, -62]],
  [[-80, -2], [-80, 14], [-78, 30], [-70, 44]],
  [[80, -10], [76, 8], [80, 26]],
];

/** Planet Earth from orbit: blue ocean, painted continents, ice caps, storms; ends among satellites. */
export function generateEarth(): MapData {
  const b = realmBuilder('earth');
  const rng = b.rng;
  const all = mapArea(b, 1);
  const start = setStart(b, START.x, START.z);

  // ---------------------------------------------------------------- land mask
  const land: Disc[] = [];
  for (const chain of CONTINENTS) {
    for (let i = 0; i < chain.length; i++) {
      const [x, z, r] = chain[i];
      land.push({ x, z, r });
      if (i + 1 >= chain.length) continue;
      const [x1, z1, r1] = chain[i + 1];
      const d = Math.hypot(x1 - x, z1 - z);
      const n = Math.ceil(d / Math.min(r, r1));
      for (let k = 1; k < n; k++) {
        const t = k / n;
        const rr = (r + (r1 - r) * t) * rng.range(0.7, 1.0);
        const off = rng.range(-0.35, 0.35) * rr;
        land.push({ x: x + (x1 - x) * t - ((z1 - z) / d) * off, z: z + (z1 - z) * t + ((x1 - x) / d) * off, r: rr });
      }
    }
  }
  // Ragged coasts: smaller discs pushed out round each one.
  for (const c of land.slice()) {
    for (let k = rng.chance(0.7) ? 1 : 0; k > 0; k--) {
      const a = rng.range(0, Math.PI * 2);
      const r = c.r * rng.range(0.25, 0.45);
      const x = c.x + Math.cos(a) * c.r * 0.92;
      const z = c.z + Math.sin(a) * c.r * 0.92;
      if (Math.hypot(x - start.x, z - start.z) > 32 + r && Math.abs(z) < ICE - 2) land.push({ x, z, r });
    }
  }
  // Archipelagos out in the ocean.
  for (const [cx, cz, n] of [[30, 14, 6], [-40, 22, 5], [44, 40, 5], [-30, 74, 3], [-90, 70, 3]] as const) {
    for (let k = 0; k < n; k++) land.push({ x: cx + rng.range(-9, 9), z: cz + rng.range(-7, 7), r: rng.range(1.4, 3.6) });
  }
  // The big shield volcano gets an island of its own.
  const VOLCANO = { x: 38, z: 30 };
  land.push({ x: VOLCANO.x, z: VOLCANO.z, r: 9 }, { x: VOLCANO.x + 5, z: VOLCANO.z + 4, r: 5 });

  /** How far inside the land (x, z) is: positive on land, negative out at sea. */
  const depth = (x: number, z: number) => {
    let best = -Infinity;
    for (const c of land) best = Math.max(best, c.r - Math.hypot(x - c.x, z - c.z));
    return best;
  };
  const onLand = (m: number) => (x: number, z: number, f: number) => depth(x, z) >= f * m && Math.abs(z) < ICE - f;
  const atSea = (m: number) => (x: number, z: number, f: number) => depth(x, z) <= -(f * 0.7 + m) && Math.abs(z) < ICE - f - m;
  const far = (x: number, z: number) => Math.hypot(x - start.x, z - start.z) > 60;
  const rangeDist = (x: number, z: number) => {
    let best = Infinity;
    for (const r of RANGES) for (const [px, pz] of r) best = Math.min(best, Math.hypot(x - px, z - pz));
    return best;
  };

  // ---------------------------------------------------------------- ground
  // Paint draws from its own stream, so retouching the ground never moves a prop.
  const pr = new Rng(realmDef('earth').seed + 1);
  // Ocean: deeper basins, then a chop of lighter specks.
  for (let i = 0; i < 46; i++) {
    const x = pr.range(all.x0, all.x1);
    const z = pr.range(all.z0, all.z1);
    if (Math.hypot(x - start.x, z - start.z) < 30) continue;
    b.circle(x, z, pr.range(6, 16), pr.pick(['#1a5592', '#1c5996', '#18508b']));
  }
  // Ocean gyres: faint current rings.
  for (let i = 0; i < 10; i++) {
    const x = pr.range(all.x0, all.x1);
    const z = pr.range(-70, 70);
    const r = pr.range(7, 18);
    b.ring(x, z, r - 0.35, r, pr.pick(['#2566a5', '#2363a2']));
  }
  // Wind-blown chop: little dashes and specks of lighter water.
  for (let i = 0; i < 260; i++) {
    const x = pr.range(all.x0, all.x1);
    const z = pr.range(all.z0, all.z1);
    if (depth(x, z) > -2.5 || Math.abs(z) > ICE - 2) continue;
    if (pr.chance(0.5)) b.rect(x, z, pr.range(0.8, 2.2), 0.22, pr.pick(['#3a80c2', '#2f74b6']), pr.range(-0.25, 0.25));
    else b.circle(x, z, pr.range(0.15, 0.45), pr.pick(['#3a80c2', '#2f72b4', '#4a90cc']));
  }
  // Continental shelf, shallows, then the land itself coloured by latitude.
  for (const c of land) b.circle(c.x, c.z, c.r + 3.4, '#2a73b4');
  for (const c of land) b.circle(c.x, c.z, c.r + 1.3, '#4ba4d6');
  const biome = (z: number) => {
    const lat = Math.abs(z) + pr.range(-6, 6);
    if (lat > 70) return pr.pick(['#a7b9a0', '#93aa8f', '#b9c7b3']);
    if (lat > 46) return pr.pick(['#4f9a3e', '#5aa548', '#47913a']);
    if (lat > 25) return pr.pick(['#d8c38c', '#cdb27a', '#bdb86c']);
    return pr.pick(['#2f8a3a', '#3a9640', '#2a7d36']);
  };
  for (const c of land) b.circle(c.x, c.z, c.r, biome(c.z));
  // Patches inside the land: forests, savanna, dunes.
  for (let i = 0; i < 70; i++) {
    const x = pr.range(all.x0, all.x1);
    const z = pr.range(all.z0, all.z1);
    const r = pr.range(2, 6);
    if (depth(x, z) < r * 0.8) continue;
    b.circle(x, z, r, biome(z));
  }
  // Mountain ranges: brown ridges with snow along the crest.
  for (const range of RANGES) {
    for (let i = 0; i + 1 < range.length; i++) {
      const [x0, z0] = range[i];
      const [x1, z1] = range[i + 1];
      const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 4);
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const x = x0 + (x1 - x0) * t + pr.range(-1.5, 1.5);
        const z = z0 + (z1 - z0) * t + pr.range(-1.5, 1.5);
        b.circle(x, z, pr.range(2.6, 3.8), pr.pick(['#8a7a5a', '#7d6e52', '#9a8a68']));
      }
    }
    for (let i = 0; i + 1 < range.length; i++) {
      const [x0, z0] = range[i];
      const [x1, z1] = range[i + 1];
      const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 6);
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        b.circle(x0 + (x1 - x0) * t + pr.range(-1, 1), z0 + (z1 - z0) * t + pr.range(-1, 1), pr.range(0.8, 1.5), '#eef3f6');
      }
    }
  }
  // Rivers: wandering down from the ranges until they reach the sea.
  for (const range of RANGES) {
    for (let k = 0; k < 2; k++) {
      const [px, pz] = pr.pick(range);
      let x = px;
      let z = pz;
      let a = pr.range(0, Math.PI * 2);
      for (let s = 0; s < 14 && depth(x, z) > 0.5; s++) {
        // Head downhill: away from the ridge, a little crooked.
        const nx = x + Math.cos(a) * 3.2;
        const nz = z + Math.sin(a) * 3.2;
        b.rect((x + nx) / 2, (z + nz) / 2, 3.4, 0.6 + s * 0.04, '#3f8fd2', a);
        x = nx;
        z = nz;
        a += pr.range(-0.5, 0.5);
      }
    }
  }
  // Specks of texture on the land.
  for (let i = 0; i < 220; i++) {
    const x = pr.range(all.x0, all.x1);
    const z = pr.range(all.z0, all.z1);
    if (depth(x, z) < 1) continue;
    const lat = Math.abs(z);
    b.circle(x, z, pr.range(0.25, 0.8), lat > 25 && lat < 46 ? pr.pick(['#e6d3a0', '#b89f68']) : pr.pick(['#2a7a34', '#6fb85a', '#3f8a3a']));
  }
  // Polar ice caps with a ragged edge, and floes drifting off them.
  for (const s of [-1, 1]) {
    b.rect(0, s * (ICE + 7), 200, 14, '#e8f2f8');
    for (let x = -100; x <= 100; x += 6.5) b.circle(x + pr.range(-1.5, 1.5), s * (ICE + pr.range(-1.5, 1)), pr.range(3.5, 6), pr.pick(['#e8f2f8', '#f4f9fc']));
    for (let i = 0; i < 9; i++) b.circle(pr.range(-98, 98), s * pr.range(ICE + 4, 99), pr.range(1.5, 4), '#d2e6f1');
    for (let i = 0; i < 14; i++) b.circle(pr.range(-98, 98), s * pr.range(ICE - 14, ICE - 4), pr.range(0.4, 1.4), pr.pick(['#e8f2f8', '#cfe4f0']));
  }

  // ---------------------------------------------------------------- set pieces
  const volcano = scaleFor('volcano', 14, rng);
  b.put('volcano', VOLCANO.x, VOLCANO.z, 0.4, { force: true, scale: volcano });
  // The pyramids by a desert coast.
  for (let tries = 0; tries < 400; tries++) {
    const x = rng.range(-90, 90);
    const z = rng.range(-46, -26);
    const sc = scaleFor('pyramids', 11, rng);
    const f = footprintOf(OBJECT_TYPES[typeId('pyramids')], sc);
    const d = depth(x, z);
    if (d < f * 0.9 || d > f + 6 || Math.hypot(x - start.x, z - start.z) < 34) continue;
    if (b.put('pyramids', x, z, 0, { scale: sc })) break;
  }

  // ---------------------------------------------------------------- props
  // The hole arrives small in open ocean: shipping lanes, rigs and jets all round it.
  const snack = ['cargoship', 'oilrig', 'jumbo', 'cargoship', 'whale'];
  for (const [n, r, l0] of [[8, 6.5, 3], [6, 13, 3]] as const) {
    for (const p of ringPoints(n, start.x, start.z, r)) {
      const type = snack[(p.k + n) % snack.length];
      const lv = l0 + (p.k % 2);
      b.put(type, p.x + rng.range(-1.5, 1.5), p.z + rng.range(-1.5, 1.5), p.ang + Math.PI / 2 + rng.range(-0.4, 0.4), { force: true, scale: scaleFor(type, lv, rng) });
    }
  }
  fillWhere(b, 'earth', start, [
    // Bottom tier: the towers, stadiums, ships and jets Hometown ended with.
    { type: 'megatower', levels: [3, 6], count: 3, where: onLand(0.6) },
    { type: 'stadium', levels: [3, 6], count: 3, where: onLand(0.6) },
    { type: 'cargoship', levels: [3, 6], count: 3, where: atSea(1) },
    { type: 'cargoship', levels: [3, 6], count: 2, where: atSea(8), wander: { speed: 0.12, span: 7 } },
    { type: 'jumbo', levels: [3, 6], count: 2, wander: { speed: 0.22, flee: true, span: 18 } },
    { type: 'oilrig', levels: [3, 7], count: 2, where: atSea(1) },
    { type: 'whale', levels: [3, 7], count: 3, where: atSea(9), wander: { speed: 0.2, flee: true, span: 7 } },
    { type: 'village', levels: [4, 8], count: 3, where: onLand(0.6) },
    { type: 'forest', levels: [4, 9], count: 3, where: onLand(0.5), tint: FOREST_TINT },
    { type: 'iceberg', levels: [4, 10], count: 5, where: (x, z, f) => atSea(0)(x, z, f) && Math.abs(z) > 58 },
    { type: 'cloud', levels: [5, 12], count: 2, wander: { speed: 0.12, span: 16 } },
    { type: 'island', levels: [6, 11], count: 2, where: atSea(2) },
    { type: 'city', levels: [7, 12], count: 2, where: onLand(0.7) },
    { type: 'mountain', levels: [8, 13], count: 2, where: (x, z, f) => onLand(0.5)(x, z, f) && rangeDist(x, z) < 9 },
    // Out on the far coasts: more islands and forests.
    { type: 'island', levels: [7, 12], count: 1, where: (x, z, f) => atSea(2)(x, z, f) && far(x, z) },
    { type: 'forest', levels: [8, 12], count: 1, where: (x, z, f) => onLand(0.5)(x, z, f) && far(x, z), tint: FOREST_TINT },
    { type: 'volcano', levels: [10, 12], count: 1, where: onLand(0.5) },
    { type: 'rainforest', levels: [11, 14], count: 1, where: (x, z, f) => onLand(0.6)(x, z, f) && Math.abs(z) < 26 },
    { type: 'hurricane', levels: [13, 18], count: 1, where: atSea(4), wander: { speed: 0.1, span: 20 } },
  ]);

  // In orbit: satellites, space stations and the Moon circle the planet (the map centre).
  const orbit = (type: string, levels: [number, number], count: number, r: [number, number]) => {
    for (let l = levels[0]; l <= levels[1]; l++) {
      for (let k = 0; k < count; k++) {
        const R = rng.range(r[0], r[1]);
        b.orbiter(type, 0, 0, R, rng.range(0, Math.PI * 2), rng.sign() * rng.range(0.9, 1.2) * (2.2 / R), { scale: scaleFor(type, l, rng) });
      }
    }
  };
  orbit('satellite', [14, 17], 1, [34, 86]);
  orbit('spacestation', [15, 17], 1, [40, 86]);
  orbit('satellite', [18, 20], 2, [34, 86]);
  orbit('spacestation', [18, 20], 2, [40, 86]);
  orbit('luna', [18, 20], 1, [70, 84]);

  return b.build(
    '#1f5f9e',
    '#07080f',
    {
      sky: '#06101f',
      fog: '#2a68a6',
      sun: '#fff4e2',
      hemiSky: '#d6ecff',
      hemiGround: '#1d4a78',
      sunIntensity: 2.3,
      motes: { colors: ['#ffffff', '#eaf4ff', '#d4e8ff'], count: 120, size: 0.75, drift: 0.5, rise: 0.02, twinkle: 0.3 },
    },
    start,
  );
}
