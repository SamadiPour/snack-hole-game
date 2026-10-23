import { MapBuilder, faceDir, ringPoints, shrink, type Area, type MapData } from './builder';

const HQ = { x: 0, z: -40 };
/** Beside the south spoke, so the start's snacks are not on the rover track. */
const START = { x: 14, z: 32 };
/** Inner ring road round the HQ (8 corners at this radius) and the paved base around it. */
const INNER = 22;
const PLAZA = 50;
const DOME_R = 40;
const TRACK_W = 7;
const TRACK = '#b9b6ae';
const PAVED = '#c9cbd2';

export function generateMoon(seed: number): MapData {
  const size = 300;
  const b = new MapBuilder('moon', size, seed);
  const rng = b.rng;
  const H = size / 2 - 2;

  // ---------------------------------------------------------------- layout
  // Rover tracks: an outer ring road with cut corners, an inner ring round the HQ, and four
  // spokes between them. Everything built sits in the quadrants between the spokes.
  const outer = [
    { x: 0, z: -132 },
    { x: 84, z: -132 },
    { x: 100, z: -116 },
    { x: 100, z: -40 },
    { x: 100, z: 80 },
    { x: 84, z: 96 },
    { x: 0, z: 96 },
    { x: -84, z: 96 },
    { x: -100, z: 80 },
    { x: -100, z: -40 },
    { x: -100, z: -116 },
    { x: -84, z: -132 },
  ];
  const inner = ringPoints(8, HQ.x, HQ.z, INNER).map((p) => ({ x: p.x, z: p.z }));
  const nodes = [...outer, ...inner];
  const edges: [number, number][] = [];
  for (let i = 0; i < 12; i++) edges.push([i, (i + 1) % 12]);
  for (let i = 0; i < 8; i++) edges.push([12 + i, 12 + ((i + 1) % 8)]);
  // Spokes: inner E, S, W, N corners to the outer ring's mid-sides.
  edges.push([12, 3], [14, 6], [16, 9], [18, 0]);
  const segs = edges.map(([p, q]) => ({ a: nodes[p], b: nodes[q] }));
  const distToTrack = (x: number, z: number) => {
    let d = Infinity;
    for (const { a, b: c } of segs) {
      const dx = c.x - a.x;
      const dz = c.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
      d = Math.min(d, Math.hypot(x - a.x - dx * t, z - a.z - dz * t));
    }
    return d;
  };

  // Built-up spots that craters must stay clear of.
  const solar: Area = { x0: 54, x1: 86, z0: -123, z1: -60 };
  const dishes: Area = { x0: -92, x1: -48, z0: -104, z1: -84 };
  const pads = [
    { x: 126, z: 40 },
    { x: -126, z: -80 },
    { x: -40, z: 124 },
  ];
  const landers = [
    { x: 124, z: -112 },
    { x: -70, z: -64 },
    { x: 44, z: 122 },
  ];
  const biodomes = [
    { x: -56, z: 52, scale: 0.8 },
    { x: 58, z: 36, scale: 0.7 },
  ];
  const keepOut = [
    { x: HQ.x, z: HQ.z, r: PLAZA + 4 },
    { x: START.x, z: START.z, r: 14 },
    ...pads.map((p) => ({ ...p, r: 14 })),
    ...landers.map((p) => ({ ...p, r: 8 })),
    ...biodomes.map((p) => ({ ...p, r: 16 })),
  ];
  const inArea = (a: Area, x: number, z: number, r: number) => x > a.x0 - r && x < a.x1 + r && z > a.z0 - r && z < a.z1 + r;

  // ---------------------------------------------------------------- craters (painted first)
  // Eight big ones, then small ones, none overlapping another or anything built.
  const craters: { x: number; z: number; r: number }[] = [];
  for (let i = 0; i < 600 && craters.length < 46; i++) {
    const big = craters.length < 8 && i < 200;
    const r = big ? rng.range(12, 22) : rng.range(3, 10);
    const x = rng.range(-H + r, H - r);
    const z = rng.range(-H + r, H - r);
    const R = r * 1.12;
    if (distToTrack(x, z) < R + TRACK_W / 2 + 2) continue;
    if (keepOut.some((k) => Math.hypot(x - k.x, z - k.z) < R + k.r)) continue;
    if (inArea(solar, x, z, R + 2) || inArea(dishes, x, z, R + 2)) continue;
    if (craters.some((c) => Math.hypot(x - c.x, z - c.z) < R + c.r)) continue;
    b.circle(x, z, R, '#c4c5cb');
    b.circle(x, z, r, '#8f9097');
    b.circle(x + r * 0.15, z + r * 0.15, r * 0.7, '#9c9da4');
    craters.push({ x, z, r: R });
  }

  // ---------------------------------------------------------------- base
  b.circle(HQ.x, HQ.z, PLAZA, PAVED);
  b.ring(HQ.x, HQ.z, PLAZA - 1, PLAZA, '#b0b1b8');
  b.circle(HQ.x, HQ.z, INNER - TRACK_W / 2 - 1, '#d6d8de');

  // Tracks over the plaza; reserved so nothing scattered lands on them.
  for (const { a, b: c } of segs) {
    const L = Math.hypot(c.x - a.x, c.z - a.z);
    b.rect((a.x + c.x) / 2, (a.z + c.z) / 2, L, TRACK_W, TRACK, Math.atan2(c.z - a.z, c.x - a.x));
    for (let t = 0; t <= L; t += 3) b.reserve(a.x + ((c.x - a.x) * t) / L, a.z + ((c.z - a.z) * t) / L, TRACK_W / 2 + 1);
  }
  for (const n of nodes) b.circle(n.x, n.z, TRACK_W / 2, TRACK);
  const tracks = b.addGraph(nodes, edges);

  // Moon base HQ and its habitat ring, every dome's door facing the HQ, clear of the spokes.
  b.put('moonbase', HQ.x, HQ.z, 0, { force: true, scale: 0.62 });
  [30, 150, 210, 240, 300, 330].forEach((deg, k) => {
    const a = (deg * Math.PI) / 180;
    const x = HQ.x + Math.cos(a) * DOME_R;
    const z = HQ.z + Math.sin(a) * DOME_R;
    b.put('dome', x, z, faceDir(-Math.cos(a), -Math.sin(a)), { force: true, scale: k === 0 ? 0.9 : 1 });
  });
  for (const d of biodomes) {
    b.circle(d.x, d.z, 11 * d.scale + 4, PAVED);
    b.put('bigdome', d.x, d.z, d.x > 0 ? 1 : 0, { force: true, scale: d.scale });
  }

  // Solar farm.
  b.rectArea(solar, '#b0b1b8');
  for (let x = solar.x0 + 4; x < solar.x1 - 2; x += 6) for (let z = solar.z0 + 4; z < solar.z1 - 2; z += 5) b.put('solarpanel', x, z, 0, { force: true });

  // Launch pads and landers.
  for (const { x, z } of pads) {
    b.circle(x, z, 10, '#6e6f76');
    b.ring(x, z, 9, 10, '#f5c542');
    b.put('rocket', x, z, 0, { force: true });
  }
  landers.forEach(({ x, z }, i) => {
    b.circle(x, z, 6, '#b0b1b8');
    b.put('lander', x, z, [0.4, 1.4, 0.2][i], { force: true });
  });

  // Dish array.
  b.rectArea(dishes, '#b0b1b8');
  for (let i = 0; i < 5; i++) b.put('dish', dishes.x0 + 6 + i * 8, dishes.z0 + 6 + (i % 2) * 8, faceDir(1, -1), { force: true });

  // Start area: rocks, flags and astronauts.
  for (const p of ringPoints(12, START.x, START.z, 3.6)) {
    b.put(p.k % 3 === 0 ? 'flag' : 'moonrock', p.x, p.z, p.ang, { force: true, tint: 0xe84a4a, scale: p.k % 3 === 0 ? 1 : rng.range(0.4, 0.7) });
  }
  for (let i = 0; i < 6; i++) b.wanderer('astronaut', { x0: START.x - 10, x1: START.x + 10, z0: START.z - 10, z1: START.z + 10 }, 0.9, { flee: true, tint: 0xe84a4a });

  // Scatter the surface.
  const all: Area = { x0: -H, x1: H, z0: -H, z1: H };
  b.scatter('moonrock', all, 1100, { scale: [0.35, 2.4] });
  b.scatter('boulder', all, 67, { scale: [0.6, 1.8] });
  b.scatter('crystal', all, 26, { scale: [0.7, 1.6], tint: () => rng.pick([0xb05cff, 0x45e0e8, 0xff5fb4]) });
  b.scatter('alienplant', all, 90, { scale: [0.7, 1.3] });
  b.scatter('cheese', all, 10, { scale: [0.8, 1.4] });
  b.scatter('flag', all, 40, { tint: () => rng.pick([0xe84a4a, 0x3b82f6, 0x38c172, 0xf5c542]) });
  b.scatter('solarpanel', all, 12);
  b.scatter('dish', all, 6);
  // Crystal gardens, away from the tracks.
  for (let i = 0, made = 0; i < 40 && made < 5; i++) {
    const cx = rng.range(-H + 20, H - 20);
    const cz = rng.range(-H + 20, H - 20);
    if (distToTrack(cx, cz) < 16 || keepOut.some((k) => Math.hypot(cx - k.x, cz - k.z) < k.r + 12)) continue;
    b.scatter('crystal', { x0: cx - 10, x1: cx + 10, z0: cz - 10, z1: cz + 10 }, 8, { scale: [0.5, 1.4], tint: () => rng.pick([0xb05cff, 0x45e0e8, 0xff5fb4]) });
    b.scatter('alienplant', { x0: cx - 12, x1: cx + 12, z0: cz - 12, z1: cz + 12 }, 6);
    made++;
  }

  for (let i = 0; i < 60; i++) b.wanderer('astronaut', shrink(all, 10), 1.0, { flee: true, tint: rng.pick([0xe84a4a, 0x3b82f6, 0x38c172, 0xf5c542]) });
  for (let i = 0; i < 10; i++) b.graphMover('rover', tracks, 2.2, 4);
  b.traffic = { graph: tracks, lane: 2.2, speed: 5, types: ['rover'] };
  for (let i = 0; i < 3; i++) b.wanderer('ufo', shrink(all, 30), 2.5);

  return b.build(
    '#a5a6ac',
    '#7f8087',
    { sky: '#0b0d1f', fog: '#1a1d35', sun: '#ffffff', hemiSky: '#b8c4ff', hemiGround: '#3a3a44', sunIntensity: 2.6 },
    START,
  );
}
