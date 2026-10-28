import { Rng } from '../../rng';
import { holeSpeed, radiusForLevel } from '../../size';
import { ringPoints, type MapBuilder, type MapData } from '../builder';
import { fillTiers, mapArea, nestRadius, realmBuilder, scaleFor, setStart } from './kit';

const SOIL = '#7a5a3a';
const LAWN = '#6fae48';
const BLADES = ['#8fcf62', '#5f9e3e', '#7cc155', '#a3d977', '#68a945'];
const ANTS = [0x2b2523, 0x2b2523, 0xb5432c, 0x6e3420];
const LEAVES = [0x6abf3a, 0x9cc93a, 0xf2c230, 0xf0852a, 0xd8432e, 0xb0703a];

type P = { x: number; z: number };

/** A clump of grass: `n` thin blades fanning out from (x, z). */
function tuft(b: MapBuilder, deco: Rng, x: number, z: number, n: number, len: [number, number], w: number): void {
  const a0 = deco.range(0, Math.PI);
  for (let k = 0; k < n; k++) {
    const a = a0 + (k / n) * Math.PI + deco.range(-0.25, 0.25);
    const L = deco.range(len[0], len[1]);
    const off = deco.range(-0.4, 0.4);
    b.rect(x + Math.cos(a) * off, z + Math.sin(a) * off, L, w, deco.pick(BLADES), a);
  }
}

/** A puddle: a dark wet rim with moss, water, a sky reflection and a glint. Wanderers walk round it. */
function puddle(b: MapBuilder, deco: Rng, x: number, z: number, r: number): void {
  b.circle(x, z, r + 1.8, '#5d4329');
  for (let k = 0; k < 4; k++) {
    const a = deco.range(0, Math.PI * 2);
    b.circle(x + Math.cos(a) * r * 0.55, z + Math.sin(a) * r * 0.55, r * deco.range(0.45, 0.6) + 1.4, '#5d4329');
  }
  for (let k = 0; k < 6; k++) {
    const a = deco.range(0, Math.PI * 2);
    const d = r + deco.range(0.6, 2.2);
    b.circle(x + Math.cos(a) * d, z + Math.sin(a) * d, deco.range(0.5, 1.2), deco.pick(['#5a7a34', '#6b8a3a', '#4f6a2e']));
  }
  b.circle(x, z, r, '#4f8fbf');
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + deco.range(-0.4, 0.4);
    b.circle(x + Math.cos(a) * r * 0.5, z + Math.sin(a) * r * 0.5, r * 0.5, '#4f8fbf');
  }
  b.circle(x - r * 0.25, z - r * 0.2, r * 0.55, '#6aaad6');
  b.circle(x - r * 0.35, z - r * 0.3, r * 0.22, '#9fd2f0');
  b.rect(x + r * 0.2, z + r * 0.35, r * 0.5, 0.35, '#cfeaf8', -0.5);
  b.blockCircle(x, z, r + 0.6);
}

/** A flat stepping stone set in the lawn. */
function steppingStone(b: MapBuilder, deco: Rng, x: number, z: number, r: number): void {
  b.circle(x + 0.7, z + 0.7, r + 0.5, '#4f5a3c');
  b.circle(x, z, r, '#a8a49a');
  b.circle(x - r * 0.15, z - r * 0.15, r * 0.78, '#b8b4a9');
  for (let k = 0; k < 4; k++) {
    const a = deco.range(0, Math.PI * 2);
    const d = deco.range(0, r * 0.7);
    b.circle(x + Math.cos(a) * d, z + Math.sin(a) * d, deco.range(0.3, 0.8), deco.pick(['#9a968c', '#c6c2b8', '#8e8a80']));
  }
}

/** A dry twig: a stick with a side shoot. */
function twig(b: MapBuilder, deco: Rng, x: number, z: number): void {
  const a = deco.range(0, Math.PI);
  const L = deco.range(3, 8);
  const c = deco.pick(['#5a3f26', '#6e4c2e', '#4e3520']);
  b.rect(x, z, L, deco.range(0.3, 0.45), c, a);
  if (deco.chance(0.7)) {
    const t = deco.range(-0.3, 0.3) * L;
    const a2 = a + deco.sign() * deco.range(0.5, 0.9);
    const l2 = L * deco.range(0.25, 0.45);
    b.rect(x + Math.cos(a) * t + (Math.cos(a2) * l2) / 2, z + Math.sin(a) * t + (Math.sin(a2) * l2) / 2, l2, 0.25, c, a2);
  }
}

/** Wiggly path from a to b: `n` legs with sideways jitter, as points (ends included). */
function wiggle(rng: Rng, a: P, b: P, n: number, jitter: number): P[] {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const L = Math.hypot(dx, dz);
  const pts: P[] = [a];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const j = rng.range(-jitter, jitter);
    pts.push({ x: a.x + dx * t + (-dz / L) * j, z: a.z + dz * t + (dx / L) * j });
  }
  pts.push(b);
  return pts;
}

/** Garden: a sunny soil bed in a lawn, criss-crossed by ant trails. Hole width 1 mm to 30 cm. */
export function generateGarden(): MapData {
  const b = realmBuilder('garden');
  const rng = b.rng;
  const all = mapArea(b, 1);
  const start = setStart(b, 0, 0);
  const nest = nestRadius('garden');
  const at = (type: string, level: number) => scaleFor(type, level, rng);
  const BED = 92;

  // ------------------------------------------------------------ ground
  // Ground paint draws from its own random stream, so repainting never moves a prop.
  const deco = new Rng(95051);
  const inBed = (k: number) => {
    const a = deco.range(0, Math.PI * 2);
    const d = Math.sqrt(deco.next()) * k;
    return { x: Math.cos(a) * d, z: Math.sin(a) * d };
  };
  // Soil: big clods of darker and lighter earth, and damp patches.
  for (let i = 0; i < 50; i++) b.circle(deco.range(all.x0, all.x1), deco.range(all.z0, all.z1), deco.range(5, 13), deco.pick(['#6f5033', '#83613f', '#735436', '#7e5c3b', '#86653f']));
  for (let i = 0; i < 10; i++) {
    const p = inBed(BED - 10);
    b.circle(p.x, p.z, deco.range(3, 7), '#664a2f');
  }
  // The lawn round the bed, its edge nibbled in and out.
  b.ring(0, 0, BED, 150, LAWN);
  for (let k = 0; k < 34; k++) {
    const a = (k / 34) * Math.PI * 2 + deco.range(-0.05, 0.05);
    const d = BED + deco.range(-3, 2);
    b.circle(Math.cos(a) * d, Math.sin(a) * d, deco.range(3, 8), deco.chance(0.55) ? LAWN : SOIL);
  }
  for (let k = 0; k < 30; k++) {
    const a = deco.range(0, Math.PI * 2);
    const d = deco.range(BED + 10, 140);
    b.circle(Math.cos(a) * d, Math.sin(a) * d, deco.range(4, 10), deco.pick(['#78b94f', '#659f42', '#74b34b']));
  }
  // Stepping stones across the lawn in one corner.
  for (const [x, z, r] of [
    [62, 96, 6.5],
    [76, 82, 7],
    [90, 66, 6.8],
  ]) {
    steppingStone(b, deco, x, z, r);
  }
  // Grit, tiny stones and dry twigs in the soil.
  for (let i = 0; i < 150; i++) {
    const p = inBed(BED - 2);
    b.circle(p.x, p.z, deco.range(0.12, 0.42), deco.pick(['#a3825c', '#5c4229', '#c4a57c', '#8f8a80', '#4e3a26']));
  }
  for (let i = 0; i < 22; i++) {
    const p = inBed(BED - 4);
    if (Math.hypot(p.x - start.x, p.z - start.z) > nest * 0.65) twig(b, deco, p.x, p.z);
  }
  // Petals blown down from the flowers.
  for (let i = 0; i < 8; i++) {
    const p = inBed(BED - 6);
    const c = deco.pick(['#ff9ec4', '#ffffff', '#ffd23d', '#ffb3d0']);
    for (let k = 0; k < 5; k++) b.circle(p.x + deco.range(-2.5, 2.5), p.z + deco.range(-2.5, 2.5), deco.range(0.35, 0.6), c);
  }
  // Damp, sandy ground where the hole comes in (the Microbial realm lands here).
  b.circle(start.x, start.z, nest * 0.62, '#80603f');
  b.circle(start.x, start.z, nest * 0.45, '#8a6a45');
  for (let i = 0; i < 25; i++) b.circle(start.x + deco.range(-1, 1) * nest * 0.4, start.z + deco.range(-1, 1) * nest * 0.4, deco.range(0.1, 0.3), deco.pick(['#d8c08a', '#c9ad78', '#e6d3a4']));

  // Puddles from the last rain.
  const puddles: [number, number, number][] = [
    [-40, -50, 9],
    [54, 18, 7],
    [-66, 26, 5.5],
  ];
  for (const [x, z, r] of puddles) puddle(b, deco, x, z, r);

  // Grass: tufts in the bed and a thick sward on the lawn.
  for (let i = 0; i < 26; i++) {
    const a = deco.range(0, Math.PI * 2);
    const d = deco.range(nest * 0.7, BED - 6);
    tuft(b, deco, Math.cos(a) * d, Math.sin(a) * d, deco.int(4, 6), [2.5, 5], 0.32);
  }
  for (let i = 0; i < 42; i++) {
    let x = 0;
    let z = 0;
    for (let t = 0; t < 8; t++) {
      x = deco.range(all.x0, all.x1);
      z = deco.range(all.z0, all.z1);
      if (Math.hypot(x, z) > BED + 4) break;
    }
    if (Math.hypot(x, z) <= BED + 4) continue;
    tuft(b, deco, x, z, 5, [3, 6], 0.38);
  }

  // ------------------------------------------------------------ ant trails
  // Two anthills, linked to each other through the crumbs at the middle and to the fallen apple.
  const hill1: P = { x: -52, z: 50 };
  const hill2: P = { x: 58, z: -44 };
  const crumbs: P = { x: 10, z: -8 };
  const apple: P = { x: 46, z: 54 };
  const leafPile: P = { x: -70, z: -24 };
  const nodes: P[] = [];
  const edges: [number, number][] = [];
  const node = (p: P) => nodes.push(p) - 1;
  const hubs = new Map<P, number>();
  const hub = (p: P) => {
    if (!hubs.has(p)) hubs.set(p, node(p));
    return hubs.get(p)!;
  };
  const trail = (a: P, c: P, legs: number) => {
    const pts = wiggle(rng, a, c, legs, 4);
    let prev = hub(a);
    for (let i = 1; i < pts.length; i++) {
      const cur = i === pts.length - 1 ? hub(c) : node(pts[i]);
      edges.push([prev, cur]);
      prev = cur;
    }
  };
  trail(hill1, crumbs, 8);
  trail(crumbs, hill2, 8);
  trail(hill1, apple, 9);
  trail(apple, hill2, 10);
  trail(hill1, leafPile, 7);
  trail(leafPile, crumbs, 8);
  const graph = b.addGraph(nodes, edges);
  // Paint the trails as trodden paths and keep props off them.
  for (const [i, j] of edges) {
    const p = nodes[i];
    const q = nodes[j];
    const L = Math.hypot(q.x - p.x, q.z - p.z);
    const ang = Math.atan2(q.z - p.z, q.x - p.x);
    b.rect((p.x + q.x) / 2, (p.z + q.z) / 2, L + 1.4, 1.6, '#634528', ang);
    b.circle(p.x, p.z, 0.8, '#634528');
    for (let s = 0; s < L; s += 2.6) b.reserve(p.x + ((q.x - p.x) * s) / L, p.z + ((q.z - p.z) * s) / L, 0.9);
  }

  // ------------------------------------------------------------ set pieces
  b.put('anthill', hill1.x, hill1.z, 0.4, { force: true, scale: at('anthill', 16) });
  b.put('anthill', hill2.x, hill2.z, 2.1, { force: true, scale: at('anthill', 15) });
  b.put('apple', apple.x + 4, apple.z + 3, 0.7, { force: true, scale: at('apple', 15), tint: 0xe8322a });
  b.put('sneaker', -58, -78, 2.5, { force: true, scale: at('sneaker', 17), tint: 0xe84a4a });
  // A frog sits at the edge of the big puddle, facing the water.
  b.put('frog', -40 + 12, -50 + 4, Math.PI - 0.3, { force: true, scale: at('frog', 16) });
  // Leaves blown into a pile where one trail ends.
  for (let k = 0; k < 3; k++) {
    const p = ringPoints(3, leafPile.x - 6, leafPile.z, 4)[k];
    b.put('leaf', p.x, p.z, rng.range(0, Math.PI * 2), { force: true, scale: at('leaf', 10 + k), tint: rng.pick(LEAVES) });
  }
  // A spill of crumbs and grains round the start: the first seconds are all snacks.
  for (const p of ringPoints(10, start.x, start.z, 3.2)) {
    const t = p.k % 2 ? 'crumb' : 'sandgrain';
    b.put(t, p.x, p.z, p.ang, { force: true, scale: at(t, 3) });
  }

  // ------------------------------------------------------------ the size ladder
  fillTiers(b, 'garden', [
    { type: 'sandgrain', levels: [3, 6], count: 9 },
    { type: 'crumb', levels: [3, 7], count: 7 },
    { type: 'sunseed', levels: [3, 8], count: 3 },
    { type: 'aphid', levels: [3, 7], count: 3, wander: { speed: 0.12, span: 8 } },
    { type: 'pebble', levels: [5, 10], count: 2, tint: [0xa9a49c, 0xc9a77a, 0xe8e4dc, 0xc79a8f, 0x7f848c] },
    { type: 'grasstuft', levels: [5, 9], count: 2, tint: [0x6fc24a, 0x5aa83c, 0x8fd45a, 0x4f9a36] },
    { type: 'ladybug', levels: [6, 10], count: 2, tint: [0xe8322a, 0xe8322a, 0xf08a24, 0xf5c542], wander: { speed: 0.18, flee: true } },
    { type: 'caterpillar', levels: [7, 10], count: 1, wander: { speed: 0.1, span: 10 } },
    { type: 'button', levels: [7, 10], count: 1, tint: [0xe84a4a, 0x3b82f6, 0xf5c542, 0xff7eb6, 0x9b5de5, 0xf7f7f2, 0x38c172] },
    { type: 'beetle', levels: [8, 11], count: 2, tint: [0x2fbf71, 0x3b6fd8, 0x8a4fd0, 0x2a3138], wander: { speed: 0.18, flee: true } },
    { type: 'coin', levels: [8, 11], count: 1, tint: [0xf2c443, 0xd8dde3, 0xd9844a] },
    { type: 'leaf', levels: [9, 13], count: 1, tint: LEAVES },
    { type: 'acorn', levels: [10, 12], count: 1 },
    { type: 'earthworm', levels: [10, 13], count: 1, wander: { speed: 0.1, span: 10 } },
    { type: 'bee', levels: [10, 14], count: 1, wander: { speed: 0.22, flee: true, span: 20 } },
    { type: 'butterfly', levels: [11, 15], count: 1, tint: [0xff8a2a, 0x4aa8ff, 0xffd23d, 0xff6ab0, 0x9b5de5], wander: { speed: 0.2, flee: true, span: 24 } },
    { type: 'snail', levels: [12, 15], count: 1, tint: [0xc77d3a, 0xd9a35a, 0xb0603a, 0xe6c17a], wander: { speed: 0.07, span: 8 } },
    { type: 'mushroom', levels: [12, 15], count: 1, tint: [0xe8322a, 0xd83a2a, 0xf08a24, 0xb8763a] },
    { type: 'dandelion', levels: [13, 16], count: 1, tint: [0xffd23d, 0xffc020, 0xf8f8f0] },
    { type: 'apple', levels: [14, 16], count: 1, tint: [0xe8322a, 0x8fd14f, 0xf5d442] },
    // Top tier: the Hometown realm starts with them.
    { type: 'rock', levels: [15, 20], count: 1 },
    { type: 'bush', levels: [16, 20], count: 1 },
    { type: 'flower', levels: [17, 20], count: 1, tint: [0xff5fa2, 0xffd23d, 0xff7a45, 0xb37bff, 0xffffff] },
    { type: 'gnome', levels: [18, 20], count: 1 },
  ]);

  // Ants march along the trails, a few at each small size.
  for (let level = 4; level <= 8; level++) {
    for (let k = 0; k < 4; k++) {
      const speed = 0.16 * holeSpeed(radiusForLevel(level), 1);
      b.graphMover('ant', graph, rng.sign() * 0.35, speed, { scale: at('ant', level), tint: rng.pick(ANTS) });
    }
  }

  return b.build(
    SOIL,
    '#7fb85a',
    {
      sky: '#a8d8f0',
      fog: '#cfe6d0',
      sun: '#fff1d0',
      hemiSky: '#fff6dc',
      hemiGround: '#5a4426',
      sunIntensity: 2.3,
      motes: { colors: ['#fff3a0', '#ffe27a', '#ffffff', '#f6d36b'], count: 200, size: 0.9, drift: 0.5, rise: 0.12, twinkle: 0.5 },
    },
    start,
  );
}
