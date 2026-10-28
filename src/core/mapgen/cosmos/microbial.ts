import { holeSpeed, radiusForLevel } from '../../size';
import type { MapBuilder, MapData } from '../builder';
import { fillTiers, mapArea, nestRadius, realmBuilder, scaleFor, setStart, speckle } from './kit';
import { spot, streak } from './molecular';

const COCCI = [0x9b5de5, 0x5fd36f, 0xf2c94c, 0x3fc8b8];
const BACTERIA = [0x9be564, 0x5fd8ff, 0xb58cff, 0xffa64d];

/** Speed (units/s) of a mover that is `share` of the hole's speed at `level`. */
const moverSpeed = (level: number, share: number) => share * holeSpeed(radiusForLevel(level), 1);

/** A polyline painted as a band `w` wide, with round joints. */
function band(b: MapBuilder, pts: { x: number; z: number }[], w: number, color: string, closed: boolean): void {
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    b.rect((p.x + q.x) / 2, (p.z + q.z) / 2, Math.hypot(q.x - p.x, q.z - p.z), w, color, Math.atan2(q.z - p.z, q.x - p.x));
  }
  for (const p of pts) b.circle(p.x, p.z, w / 2, color);
}

/** A leaf-shaped patch along `ang` from (x, z): a chain of circles, wide in the middle. */
function leaf(b: MapBuilder, x: number, z: number, ang: number, len: number, wide: number, color: string, rib: string): void {
  const ux = Math.cos(ang);
  const uz = Math.sin(ang);
  const n = 11;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const r = Math.max(0.6, Math.sin(Math.PI * Math.pow(t, 0.8)) * wide);
    b.circle(x + ux * (t - 0.5) * len, z + uz * (t - 0.5) * len, r, color);
  }
  b.rect(x, z, len * 0.9, 0.5, rib, ang);
}

/** Microbial: pink plasma and agar, blood cells streaming round a capillary, microbes everywhere. */
export function generateMicrobial(): MapData {
  const b = realmBuilder('microbial');
  const rng = b.rng;
  const all = mapArea(b, 1);
  const start = setStart(b, 0, 0);
  const nest = nestRadius('microbial');

  // Ground: soft plasma, faint fibres, ghosts of tissue cells.
  speckle(b, all, 50, [7, 16], ['#d2889a', '#de9ca8', '#cf8294', '#e2a2ac']);
  for (let i = 0; i < 5; i++) {
    const ang = rng.range(0, Math.PI);
    const cx = rng.range(-70, 70);
    const cz = rng.range(-70, 70);
    streak(b, cx - Math.cos(ang) * 150, cz - Math.sin(ang) * 150, ang, 300, rng.range(4, 9), rng.range(40, 80), 0.38, i % 2 ? '#eab8c0' : '#e6aeb8', 9);
  }
  const cellAt = (x: number, z: number, r: number) => {
    const a = rng.range(0, Math.PI * 2);
    b.circle(x, z, r, rng.pick(['#e3a6b0', '#e6acb6', '#dfa0ac']));
    b.ring(x, z, r - Math.max(0.35, r * 0.08), r, '#c27186');
    b.circle(x + Math.cos(a) * r * 0.3, z + Math.sin(a) * r * 0.3, r * 0.32, '#c4839a');
  };
  for (let i = 0; i < 42; i++) {
    const x = rng.range(all.x0 + 6, all.x1 - 6);
    const z = rng.range(all.z0 + 6, all.z1 - 6);
    if (Math.hypot(x - start.x, z - start.z) < nest * 0.7) continue;
    cellAt(x, z, rng.range(2, 7));
  }
  // Patches of tissue: cells packed side by side.
  for (let i = 0; i < 5; i++) {
    const cx = rng.range(-80, 80);
    const cz = rng.range(-80, 80);
    if (Math.hypot(cx - start.x, cz - start.z) < nest) continue;
    const r = rng.range(2.6, 3.6);
    cellAt(cx, cz, r);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + i;
      cellAt(cx + Math.cos(a) * r * 1.9, cz + Math.sin(a) * r * 1.9, r * rng.range(0.85, 1.05));
    }
  }
  // Loose debris.
  speckle(b, all, 60, [0.4, 1.3], ['#e6aab4', '#cc8090', '#e9b6be']);

  // A capillary loops round the middle: blood cells stream along it.
  const ph1 = rng.range(0, Math.PI * 2);
  const ph2 = rng.range(0, Math.PI * 2);
  const vessel: { x: number; z: number }[] = [];
  const N = 40;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    const R = 60 + 9 * Math.sin(2 * t + ph1) + 5 * Math.sin(3 * t + ph2);
    vessel.push({ x: start.x + Math.cos(t) * R, z: start.z + Math.sin(t) * R });
  }
  band(b, vessel, 15, '#ecb4be', true);
  band(b, vessel, 12, '#c55c72', true);
  for (let i = 0; i < N; i += 2) {
    const p = vessel[i];
    const q = vessel[(i + 1) % N];
    b.rect((p.x + q.x) / 2, (p.z + q.z) / 2, Math.hypot(q.x - p.x, q.z - p.z) * 0.6, 0.5, '#d27084', Math.atan2(q.z - p.z, q.x - p.x));
  }
  const g = b.addGraph(vessel, vessel.map((_, i): [number, number] => [i, (i + 1) % N]), true);
  for (let level = 6; level <= 11; level++)
    for (let k = 0; k < 2; k++) b.graphMover('redcell', g, rng.pick([-2.6, 2.6]), moverSpeed(level, 0.22), { scale: scaleFor('redcell', level, rng) });

  // Set pieces first, so the tiers fill in round them.
  const lm = (type: string, level: number, x: number, z: number, rot: number, tint?: number) =>
    b.put(type, x, z, rot, { scale: scaleFor(type, level, rng), force: true, tint });
  const roam = (type: string, level: number, x: number, z: number, span: number, share: number) => {
    const box = { x0: x - span, x1: x + span, z0: z - span, z1: z + span };
    b.wanderer(type, box, moverSpeed(level, share), { scale: scaleFor(type, level, rng) });
  };

  // A bacterial colony on a cream patch of agar.
  const col = spot(b, start.x, start.z, nest + 20, 85, 10);
  b.circle(col.x, col.z, 10, '#e9c9a4');
  b.ring(col.x, col.z, 9.4, 10, '#d4a47e');
  b.ring(col.x, col.z, 6.2, 6.6, '#e0b892');
  for (let k = 0; k < 6; k++) {
    const level = 5 + (k % 5);
    const s = scaleFor('coccus', level, rng);
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(0, 8);
    b.put('coccus', col.x + Math.cos(a) * d, col.z + Math.sin(a) * d, rng.range(0, Math.PI * 2), { scale: s, tint: COCCI[k % 2 ? 0 : 1], pad: 0.6 });
  }
  for (let k = 0; k < 4; k++) {
    const a = rng.range(0, Math.PI * 2);
    lm('bacterium', 7 + k, col.x + Math.cos(a) * 6, col.z + Math.sin(a) * 6, rng.range(0, Math.PI * 2), BACTERIA[k]);
  }

  // Phages landing on a big bacterium.
  const pa = spot(b, start.x, start.z, nest + 12, 85, 9);
  lm('bacterium', 11, pa.x, pa.z, rng.range(0, Math.PI * 2), BACTERIA[2]);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    lm('phage', 5 + (k % 2), pa.x + Math.cos(a) * 4.6, pa.z + Math.sin(a) * 4.6, 0);
  }

  // A tardigrade on a moss leaf, a dust mite on skin flakes.
  const tl = spot(b, start.x, start.z, nest + 30, 95, 15);
  const ta = rng.range(0, Math.PI);
  leaf(b, tl.x, tl.z, ta, 30, 7.5, '#8fb070', '#7a9a5e');
  leaf(b, tl.x + Math.cos(ta + 0.9) * 9, tl.z + Math.sin(ta + 0.9) * 9, ta + 0.7, 20, 5, '#9cbc7c', '#86a668');
  roam('tardigrade', 17, tl.x, tl.z, 4, 0.08);
  b.reserve(tl.x, tl.z, 10);

  const dm = spot(b, start.x, start.z, nest + 30, 95, 12);
  for (let k = 0; k < 6; k++) {
    const x = dm.x + rng.range(-7, 7);
    const z = dm.z + rng.range(-7, 7);
    const r = rng.range(0, Math.PI);
    const w = rng.range(6, 10);
    const d = rng.range(4, 7);
    b.rect(x, z, w + 0.8, d + 0.8, '#e2c2b6', r);
    b.rect(x, z, w, d, k % 2 ? '#f4e2d8' : '#f0dad0', r);
  }
  roam('dustmite', 16, dm.x, dm.z, 4, 0.08);
  b.reserve(dm.x, dm.z, 8);

  // An amoeba hunting cocci on a slime trail.
  const am = spot(b, start.x, start.z, nest + 20, 90, 12);
  b.circle(am.x, am.z, 9, '#e0a6b2');
  b.ring(am.x, am.z, 8.6, 9, '#cf8ea0');
  roam('amoeba', 15, am.x, am.z, 5, 0.07);
  b.reserve(am.x, am.z, 7);

  // White blood cells patrolling.
  for (const level of [14, 16]) {
    const w = spot(b, start.x, start.z, nest + 15, 90, 9);
    b.ring(w.x, w.z, 7, 7.4, '#efc4cc');
    roam('whitecell', level, w.x, w.z, 6, 0.1);
    b.reserve(w.x, w.z, 6);
  }

  // A drift of pollen.
  const po = spot(b, start.x, start.z, nest + 10, 90, 8);
  for (let k = 0; k < 4; k++) lm('pollengrain', 9 + k, po.x + rng.range(-6, 6), po.z + rng.range(-6, 6), rng.range(0, Math.PI * 2));

  // Floating specks over everything.
  speckle(b, all, 180, [0.1, 0.35], ['#f2c6cc', '#c26e82', '#b0607a', '#f8dde0', '#e8b0b8']);
  b.ring(start.x, start.z, nest * 0.62, nest * 0.62 + 0.35, '#e8b2bc');

  // A loose ring of the smallest snacks round the start, for the first seconds.
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const d = rng.range(3.5, 8);
    const type = k % 3 ? 'virus' : 'protein';
    b.put(type, start.x + Math.cos(a) * d, start.z + Math.sin(a) * d, rng.range(0, Math.PI * 2), { scale: scaleFor(type, 3, rng), force: true });
  }

  fillTiers(b, 'microbial', [
    { type: 'virus', levels: [3, 7], count: 3 },
    { type: 'protein', levels: [3, 4], count: 2 },
    { type: 'antibody', levels: [3, 5], count: 8, wander: { speed: 0.2, flee: true } },
    { type: 'phage', levels: [3, 8], count: 3 },
    { type: 'platelet', levels: [4, 8], count: 4, wander: { speed: 0.12 } },
    { type: 'coccus', levels: [5, 9], count: 2, tint: COCCI },
    { type: 'redcell', levels: [6, 10], count: 1, wander: { speed: 0.12 } },
    { type: 'bacterium', levels: [6, 11], count: 2, tint: BACTERIA, wander: { speed: 0.2, flee: true } },
    { type: 'yeast', levels: [8, 13], count: 2 },
    { type: 'pollengrain', levels: [9, 14], count: 1 },
    { type: 'diatom', levels: [10, 15], count: 2 },
    { type: 'paramecium', levels: [11, 16], count: 1, wander: { speed: 0.15 } },
    { type: 'sandgrain', levels: [15, 20], count: 2 },
    { type: 'crumb', levels: [15, 20], count: 2 },
    { type: 'yeast', levels: [6, 9], count: 1 },
  ]);

  return b.build(
    '#d8909c',
    '#7a5a3a',
    {
      sky: '#5a2a38',
      fog: '#d8909c',
      sun: '#fff2ec',
      hemiSky: '#ffe4ea',
      hemiGround: '#8a4a5a',
      sunIntensity: 2.0,
      motes: { colors: ['#fff6f2', '#ffd6de', '#f6e6b8'], count: 190, size: 0.9, drift: 0.6, rise: 0.08, twinkle: 0.35 },
    },
    start,
  );
}

