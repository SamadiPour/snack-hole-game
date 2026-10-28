import { realmDef } from '../../../config/cosmos';
import { Rng } from '../../rng';
import { ringPoints, type MapData } from '../builder';
import { fillWhere } from './earth';
import { mapArea, realmBuilder, scaleFor, setStart } from './kit';

/** Spiral arms r = A e^(B θ), turned by `phase`; the two major arms run longer and wider. */
const A = 9;
const B = 0.3;
const ARMS = [
  { phase: 0, len: 7.6, major: true },
  { phase: Math.PI, len: 7.6, major: true },
  { phase: Math.PI / 2, len: 6.5, major: false },
  { phase: (Math.PI * 3) / 2, len: 6.5, major: false },
];
/** Half-width of an arm at radius r. */
const armWidth = (r: number) => 3.5 + r * 0.11;
const STAR_TINT = [0xff6a4a, 0xffa64d, 0xffe27a, 0xfff6e0, 0xf4f6ff, 0x9fc4ff, 0x8fb0ff];
const SPECK = ['#ffffff', '#dfe8ff', '#fff2c8', '#bcd4ff', '#ffd6e8'];

const armAt = (arm: (typeof ARMS)[number], t: number) => {
  const r = A * Math.exp(B * t);
  return { x: Math.cos(t + arm.phase) * r, z: Math.sin(t + arm.phase) * r, r };
};

/** The Milky Way: a spiral galaxy round a blazing core; reaching its goal ends the journey. */
export function generateGalaxy(): MapData {
  const b = realmBuilder('galaxy');
  const rng = b.rng;
  const all = mapArea(b, 1);

  // Sample the arms once for distance queries.
  const samples: { x: number; z: number; w: number; major: boolean }[] = [];
  for (const arm of ARMS) for (let t = 0; t <= arm.len; t += 0.04) {
    const p = armAt(arm, t);
    samples.push({ x: p.x, z: p.z, w: armWidth(p.r), major: arm.major });
  }
  /** How deep in an arm (x, z) is: 1 on the centre line of a major arm, falling to 0 between arms. */
  const armness = (x: number, z: number) => {
    let best = 0;
    for (const s of samples) {
      const dx = x - s.x;
      const dz = z - s.z;
      if (Math.abs(dx) > s.w * 2.5 || Math.abs(dz) > s.w * 2.5) continue;
      const k = (s.major ? 1 : 0.7) * Math.exp(-(dx * dx + dz * dz) / (s.w * s.w));
      if (k > best) best = k;
    }
    return best;
  };

  // Out in a major arm, two thirds of the way out, like our Sun.
  const sp = armAt(ARMS[0], Math.log(64 / A) / B);
  const start = setStart(b, sp.x, sp.z);

  // ---------------------------------------------------------------- ground
  // Paint draws from its own stream, so retouching the ground never moves a prop.
  const pr = new Rng(realmDef('galaxy').seed + 1);
  // The disc brightening toward the middle.
  for (const [r, c] of [[96, '#07060e'], [74, '#090713'], [54, '#0b0918'], [38, '#0f0b1e']] as const) b.circle(0, 0, r, c);
  /** Steps along an arm from t0 to t1, `step` arm-widths apart. */
  const along = (arm: (typeof ARMS)[number], t0: number, t1: number, step: number, fn: (p: { x: number; z: number; r: number }, w: number) => void) => {
    for (let t = t0; t <= t1; ) {
      const p = armAt(arm, t);
      // Arms thin out toward their tips.
      const w = armWidth(p.r) * Math.min(1, 0.35 + (arm.len - t) / 1.4);
      fn(p, w);
      t += (step * w) / (p.r * 1.044);
    }
  };
  // Arm haze: a broad glow, then a brighter band down the middle of the major arms.
  for (const arm of ARMS) along(arm, 0, arm.len, 0.75, (p, w) => b.circle(p.x, p.z, w * (arm.major ? 1.1 : 0.85), arm.major ? '#14102a' : '#110d24'));
  for (const arm of ARMS) if (arm.major) along(arm, 0.3, arm.len, 0.6, (p, w) => b.circle(p.x, p.z, w * 0.5, '#1d173c'));
  // Star-forming regions (pink) and young blue clusters on the arms' outer edges.
  for (let i = 0; i < 60; i++) {
    const arm = pr.pick(ARMS);
    const p = armAt(arm, pr.range(1, arm.len));
    const k = 1 + pr.range(0, 0.6) * (armWidth(p.r) / p.r);
    const pink = pr.chance(0.6);
    b.circle(p.x * k, p.z * k, pr.range(0.8, 2.6), pink ? pr.pick(['#5a1f4a', '#7a2a5a', '#6a2470']) : pr.pick(['#1f3a6a', '#24406f']));
    if (pink && pr.chance(0.5)) b.circle(p.x * k, p.z * k, pr.range(0.3, 0.7), '#d05aa0');
  }
  // Stars crowding the arms (Gaussian across each arm), then the thin field between them.
  for (let i = 0; i < 400; i++) {
    const arm = pr.pick(ARMS);
    const p = armAt(arm, pr.range(0, arm.len));
    const w = armWidth(p.r) * 0.6;
    const g = (pr.next() + pr.next() + pr.next() - 1.5) * 1.4;
    const a = pr.range(0, Math.PI * 2);
    b.circle(p.x + Math.cos(a) * g * w, p.z + Math.sin(a) * g * w, pr.chance(0.1) ? pr.range(0.25, 0.4) : pr.range(0.07, 0.2), pr.pick(SPECK));
  }
  for (let i = 0; i < 100; i++) b.circle(pr.range(all.x0, all.x1), pr.range(all.z0, all.z1), pr.range(0.05, 0.16), pr.pick(SPECK));
  // The bulge and bar, glowing gold toward the core.
  for (const [r, c] of [[30, '#170f24'], [22, '#251832']] as const) b.circle(0, 0, r, c);
  b.rect(0, 0, 34, 9, '#2e1f30', 0.5);
  for (const [r, c] of [[16, '#3d2a2c'], [12, '#64462a'], [9, '#94703a'], [6.5, '#c49c50'], [4.5, '#e8cc88']] as const) b.circle(0, 0, r, c);

  // ---------------------------------------------------------------- props
  // Sagittarius A*: the core, alone in the middle.
  b.put('sgra', 0, 0, 0, { force: true, scale: scaleFor('sgra', 18, rng) });
  b.reserve(0, 0, 13);
  // The hole arrives among stars (the Solar System's neighbours) in the arm.
  for (const [n, r] of [[8, 6.5]] as const) {
    for (const p of ringPoints(n, start.x, start.z, r)) {
      const type = p.k % 3 === 0 ? 'sun' : 'star';
      b.put(type, p.x + rng.range(-1.5, 1.5), p.z + rng.range(-1.5, 1.5), 0, { force: true, scale: scaleFor(type, 3 + (p.k % 2), rng), tint: rng.pick(STAR_TINT) });
    }
  }
  /** Mostly on the arms, a few between them; nothing in the core but the core. */
  const onArms = (bias: number) => (x: number, z: number) => Math.hypot(x, z) > 16 && rng.next() < bias + (1 - bias) * armness(x, z);
  const halo = (x: number, z: number, f: number) => Math.hypot(x, z) > 78 + f;
  fillWhere(b, 'galaxy', start, [
    // Bottom tier: the Sun, one star among many now.
    { type: 'sun', levels: [3, 6], count: 7, where: onArms(0.12) },
    { type: 'star', levels: [3, 6], count: 7, where: onArms(0.12), tint: STAR_TINT },
    // Runaway stars, flung out of their clusters, bolt from the hole.
    { type: 'star', levels: [3, 8], count: 4, where: onArms(0.2), tint: STAR_TINT, wander: { speed: 0.2, flee: true, span: 14 } },
    { type: 'star', levels: [7, 10], count: 4, where: onArms(0.12), tint: STAR_TINT },
    { type: 'browndwarf', levels: [3, 7], count: 5, where: onArms(0.3), wander: { speed: 0.18, flee: true, span: 12 } },
    { type: 'whitedwarf', levels: [3, 8], count: 3, where: onArms(0.15) },
    { type: 'pulsar', levels: [5, 10], count: 2, where: onArms(0.2) },
    { type: 'redgiant', levels: [6, 13], count: 2, where: onArms(0.15) },
    { type: 'starcluster', levels: [8, 14], count: 2, where: onArms(0.1) },
    // Out in the far reaches of the arms: more clusters and giants.
    { type: 'starcluster', levels: [10, 13], count: 1, where: (x, z) => Math.hypot(x, z) > 62 && onArms(0.05)(x, z) },
    { type: 'nebula', levels: [11, 18], count: 1, where: onArms(0.02) },
    { type: 'blackhole', levels: [12, 19], count: 1, where: onArms(0.25) },
    { type: 'blackhole', levels: [18, 18], count: 1, where: onArms(0.25) },
    { type: 'globular', levels: [13, 20], count: 1, where: halo },
    { type: 'globular', levels: [17, 20], count: 1, where: halo },
    { type: 'globular', levels: [18, 18], count: 1, where: halo },
    { type: 'nebula', levels: [18, 18], count: 1, where: (x, z) => Math.hypot(x, z) > 50 && onArms(0.02)(x, z) },
  ]);
  // The disc turns (slowly, trailing its arms): some stars ride round the core.
  for (let l = 3; l <= 9; l++) {
    for (let k = 0; k < 2; k++) {
      const arm = rng.pick(ARMS);
      const p = armAt(arm, rng.range(1.5, arm.len));
      b.orbiter('star', 0, 0, p.r, Math.atan2(p.z, p.x), -1.1 / p.r, { scale: scaleFor('star', l, rng), tint: rng.pick(STAR_TINT) });
    }
  }

  return b.build(
    '#05040b',
    '#000000',
    {
      sky: '#000000',
      fog: '#05040b',
      sun: '#f4ecff',
      hemiSky: '#d8c8ff',
      hemiGround: '#140c28',
      sunIntensity: 2.0,
      motes: { colors: ['#ffffff', '#ffd6f0', '#bcd4ff', '#fff0b0'], count: 240, size: 0.8, drift: 0.25, rise: 0.02, twinkle: 1.0 },
    },
    start,
  );
}
