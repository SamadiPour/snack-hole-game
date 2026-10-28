import { realmDef } from '../../../config/cosmos';
import { OBJECT_TYPES, footprintOf, typeId } from '../../../config/objects';
import { Rng } from '../../rng';
import type { MapData } from '../builder';
import { fillWhere } from './earth';
import { mapArea, realmBuilder, scaleFor, setStart } from './kit';

/** Planets on their orbits round the Sun at the centre: [type, orbit radius, levels, count per level]. */
const PLANETS: [string, number, [number, number], number][] = [
  ['mercury', 14, [8, 11], 2],
  ['venus', 22, [10, 13], 2],
  ['earthplanet', 31, [10, 13], 1],
  ['mars', 40, [9, 12], 2],
  ['jupiter', 63, [15, 19], 1],
  ['saturn', 74, [14, 19], 1],
  ['uranus', 84, [13, 16], 1],
  ['neptune', 93, [12, 15], 1],
];
const BELT: [number, number] = [47, 55];
const STAR_COLORS = ['#ffffff', '#cfe0ff', '#ffe9b0', '#ffc8e0', '#9fb8ff'];

/** Angular speed of an orbit of radius r (inner planets faster, as Kepler would have it). */
const orbitSpeed = (r: number) => 0.3 * Math.pow(14 / r, 1.2);

/** Solar System: the Sun at the centre, planets on their orbits, the belt, comets and neighbour stars. */
export function generateSolar(): MapData {
  const b = realmBuilder('solar');
  const rng = b.rng;
  const all = mapArea(b, 1);
  // The hole arrives where Earth orbits: the realm before (the planet) is the nest.
  const start = setStart(b, -22, 22);
  const startAng = Math.atan2(start.z, start.x);

  // ---------------------------------------------------------------- ground
  // Paint draws from its own stream, so retouching the ground never moves a prop.
  const pr = new Rng(realmDef('solar').seed + 1);
  // Faint haze, then the fabric of spacetime: a grid that dips into the Sun's well.
  for (let i = 0; i < 12; i++) b.circle(pr.range(all.x0, all.x1), pr.range(all.z0, all.z1), pr.range(14, 30), pr.pick(['#0a0b17', '#0b0a18', '#090c19']));
  for (let v = -90; v <= 90; v += 15) {
    b.rect(v, 0, 0.14, 200, '#0e1226');
    b.rect(0, v, 200, 0.14, '#0e1226');
  }
  for (const r of [5.5, 7.5, 10, 13, 17, 22, 28]) b.ring(0, 0, r - 0.14, r, '#121733');
  // The Sun's glow pooled round it.
  for (const [r, c] of [[16, '#110c0c'], [12, '#1c120b'], [9.5, '#2e1c0c'], [7.5, '#4f310e'], [5.8, '#7d5012']] as const) b.circle(0, 0, r, c);
  // Orbits, with the asteroid belt as a dusty band.
  b.ring(0, 0, BELT[0], BELT[1], '#0c0d18');
  for (const [, r] of PLANETS) b.ring(0, 0, r - 0.13, r + 0.13, '#1b2242');
  b.ring(0, 0, 31 - 0.17, 31 + 0.17, '#25305a');
  for (let i = 0; i < 130; i++) {
    const a = pr.range(0, Math.PI * 2);
    const r = pr.range(BELT[0], BELT[1]);
    b.circle(Math.cos(a) * r, Math.sin(a) * r, pr.range(0.12, 0.45), pr.pick(['#3a3640', '#4a4450', '#2e2a34', '#55505a']));
  }
  // Kuiper belt ice out in the corners.
  for (let i = 0; i < 70; i++) {
    const x = pr.range(all.x0, all.x1);
    const z = pr.range(all.z0, all.z1);
    if (Math.hypot(x, z) < 100) continue;
    b.circle(x, z, pr.range(0.15, 0.5), pr.pick(['#2a3448', '#34405a', '#22293a']));
  }
  // Background stars.
  for (let i = 0; i < 300; i++) {
    const big = pr.chance(0.08);
    b.circle(pr.range(all.x0, all.x1), pr.range(all.z0, all.z1), big ? pr.range(0.25, 0.4) : pr.range(0.06, 0.18), pr.pick(STAR_COLORS));
  }

  // ---------------------------------------------------------------- the Sun and its neighbours
  b.put('sun', 0, 0, 0, { force: true, scale: scaleFor('sun', 17, rng) });
  // Neighbour stars in the far corners, past every orbit: the Milky Way's first snacks.
  const neighbours: [number, number, number][] = [
    [84, -84, 19], [-84, -84, 20], [86, 85, 20], [-85, 86, 19], [94, -58, 16], [-60, -94, 18], [58, 94, 18], [-94, 58, 20],
  ];
  for (const [x, z, l] of neighbours) {
    for (const [r, c] of [[9, '#14100c'], [6.5, '#22180c']] as const) b.circle(x, z, r * (l / 18), c);
    b.put('sun', x, z, 0, { force: true, scale: scaleFor('sun', l, rng) });
  }

  // ---------------------------------------------------------------- planets
  const lanes: { r: number; f: number }[] = [];
  for (const [type, r, [l0, l1], per] of PLANETS) {
    const list: number[] = [];
    for (let l = l0; l <= l1; l++) for (let k = 0; k < per; k++) list.push(l);
    const w = orbitSpeed(r);
    // Start away from the nest so the arriving hole is not sat on.
    const off = startAng + Math.PI / list.length + rng.range(-0.2, 0.2);
    let fmax = 0;
    list.forEach((l, k) => {
      const scale = scaleFor(type, l, rng);
      fmax = Math.max(fmax, footprintOf(OBJECT_TYPES[typeId(type)], scale));
      b.orbiter(type, 0, 0, r, off + (k / list.length) * Math.PI * 2 + rng.range(-0.15, 0.15), w, { scale });
    });
    lanes.push({ r, f: fmax });
  }
  // The belt: slow tumbling rocks all going round together.
  const tints = [0x8a8580, 0x9c8a74, 0x6f6a66, 0xa89a88, 0x7a6e62];
  for (let l = 3; l <= 9; l++) {
    for (let k = 0; k < 4; k++) {
      const r = rng.range(BELT[0] + 1, BELT[1] - 1);
      b.orbiter('asteroid', 0, 0, r, rng.range(0, Math.PI * 2), orbitSpeed(r) * rng.range(0.9, 1.1), { scale: scaleFor('asteroid', l, rng), tint: rng.pick(tints) });
    }
  }
  // Round the Earth (the nest): satellites in low orbit and the Moon further out.
  for (let k = 0; k < 8; k++) {
    const type = k % 3 === 2 ? 'spacestation' : 'satellite';
    const r = rng.range(4, 14);
    b.orbiter(type, start.x, start.z, r, rng.range(0, Math.PI * 2), rng.sign() * rng.range(0.25, 0.4), { scale: scaleFor(type, 3 + (k % 2), rng) });
  }
  for (const [l, r] of [[7, 19], [9, 22]] as const) b.orbiter('luna', start.x, start.z, r, rng.range(0, Math.PI * 2), 0.12, { scale: scaleFor('luna', l, rng) });

  // ---------------------------------------------------------------- everything else
  /** Off the planets' orbits, so nothing sails through a parked prop. */
  const offLanes = (x: number, z: number, f: number) => {
    const d = Math.hypot(x, z);
    if (d < 9 + f) return false;
    for (const ln of lanes) if (Math.abs(d - ln.r) < ln.f * 0.6 + f * 0.5) return false;
    return true;
  };
  const outer = (x: number, z: number, f: number) => Math.hypot(x, z) > 99 + f && offLanes(x, z, f);
  fillWhere(b, 'solar', start, [
    // Bottom tier: what Planet Earth ended with.
    { type: 'satellite', levels: [3, 6], count: 3, where: offLanes },
    { type: 'spacestation', levels: [3, 6], count: 2, where: offLanes },
    { type: 'spacejunk', levels: [3, 7], count: 5, where: offLanes, tint: [0xe8e8e8, 0xf5c542, 0xe84a4a, 0x8c939d] },
    { type: 'asteroid', levels: [3, 9], count: 4, where: offLanes, tint: tints },
    { type: 'probe', levels: [4, 8], count: 2, where: offLanes },
    { type: 'probe', levels: [4, 8], count: 1, wander: { speed: 0.16, flee: true, span: 20 } },
    // Small comets swing away from the hole; the great ones just sail on.
    { type: 'comet', levels: [6, 10], count: 1, wander: { speed: 0.2, flee: true, span: 30 } },
    { type: 'comet', levels: [11, 15], count: 1, wander: { speed: 0.18, span: 30 } },
    { type: 'luna', levels: [6, 11], count: 1, where: offLanes },
    { type: 'pluto', levels: [7, 11], count: 2, where: outer },
    { type: 'asteroid', levels: [3, 10], count: 2, where: outer, tint: [0xb8c8d8, 0xa8b0c0, 0xc8d0dc] },
    // Near-Earth asteroids: the inner system stays stocked while the hole grows out of the nest.
    { type: 'asteroid', levels: [6, 10], count: 1, where: (x, z, f) => Math.hypot(x - start.x, z - start.z) < 42 && offLanes(x, z, f), tint: tints },
  ]);

  return b.build(
    '#07080f',
    '#05040b',
    {
      sky: '#020309',
      fog: '#07080f',
      sun: '#fff1d6',
      hemiSky: '#c8d4ff',
      hemiGround: '#1a1428',
      sunIntensity: 2.3,
      motes: { colors: ['#ffffff', '#bcd4ff', '#ffe9b0'], count: 200, size: 0.7, drift: 0.3, rise: 0.02, twinkle: 0.8 },
    },
    start,
  );
}
