import { OBJECT_TYPES, footprintOf, typeId } from '../../../config/objects';
import { faceDir, type MapBuilder, type MapData } from '../builder';
import { fillTiers, mapArea, nestRadius, realmBuilder, scaleFor, setStart, speckle } from './kit';

/** Side-chain colours of the amino acids. */
const R_GROUPS = [0x4fe06a, 0xffd23d, 0xff7ab6, 0x5fd8ff, 0xb07cff, 0xff9a2e];

/** Footprint radius of `type` scaled to become edible at `level` (the scale comes with it). */
function sized(b: MapBuilder, type: string, level: number): { scale: number; f: number } {
  const scale = scaleFor(type, level, b.rng);
  return { scale, f: footprintOf(OBJECT_TYPES[typeId(type)], scale) };
}

/**
 * A free spot for a set piece of radius `r`: `d0`-`d1` from (cx, cz), inside the map and clear of
 * everything placed so far.
 */
export function spot(b: MapBuilder, cx: number, cz: number, d0: number, d1: number, r: number): { x: number; z: number } {
  const lim = b.half - r - 3;
  let best = { x: cx + d0, z: cz };
  for (let i = 0; i < 80; i++) {
    const a = b.rng.range(0, Math.PI * 2);
    const d = b.rng.range(d0, d1);
    const x = cx + Math.cos(a) * d;
    const z = cz + Math.sin(a) * d;
    if (Math.abs(x) > lim || Math.abs(z) > lim) continue;
    best = { x, z };
    if (b.isFree(x, z, r)) return best;
  }
  return best;
}

/** A wavy streak painted as a chain of thin rects (every other one when `dash`), clipped to the map. */
export function streak(
  b: MapBuilder,
  x0: number,
  z0: number,
  ang: number,
  len: number,
  amp: number,
  wave: number,
  w: number,
  color: string,
  step = 7,
  ph = b.rng.range(0, Math.PI * 2),
  dash = false,
): void {
  const ux = Math.cos(ang);
  const uz = Math.sin(ang);
  const at = (s: number): [number, number] => {
    const off = amp * Math.sin((s / wave) * Math.PI * 2 + ph);
    return [x0 + ux * s - uz * off, z0 + uz * s + ux * off];
  };
  const lim = b.half - w;
  let [px, pz] = at(0);
  let k = 0;
  for (let s = step; s <= len; s += step) {
    const [x, z] = at(s);
    const mx = (px + x) / 2;
    const mz = (pz + z) / 2;
    if ((!dash || k++ % 2 === 0) && Math.abs(mx) < lim - step / 2 && Math.abs(mz) < lim - step / 2) b.rect(mx, mz, Math.hypot(x - px, z - pz) + w * 0.6, w, color, Math.atan2(z - pz, x - px));
    px = x;
    pz = z;
  }
}

/** Graphene: a honeycomb of carbon bonds painted round (cx, cz) out to radius R. */
function honeycomb(b: MapBuilder, cx: number, cz: number, R: number, a: number, bondC: string, atomC: string): void {
  const seen = new Set<string>();
  const atoms = new Set<string>();
  const h = Math.sqrt(3) * a;
  const n = Math.ceil(R / a) + 1;
  for (let q = -n; q <= n; q++)
    for (let r = -n; r <= n; r++) {
      const hx = cx + 1.5 * a * q;
      const hz = cz + h * (r + q / 2);
      for (let k = 0; k < 6; k++) {
        const a0 = (k / 6) * Math.PI * 2;
        const a1 = ((k + 1) / 6) * Math.PI * 2;
        const x0 = hx + Math.cos(a0) * a;
        const z0 = hz + Math.sin(a0) * a;
        const x1 = hx + Math.cos(a1) * a;
        const z1 = hz + Math.sin(a1) * a;
        const mx = (x0 + x1) / 2;
        const mz = (z0 + z1) / 2;
        if (Math.hypot(mx - cx, mz - cz) > R) continue;
        const key = `${Math.round(mx * 10)},${Math.round(mz * 10)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        b.rect(mx, mz, a, a * 0.16, bondC, Math.atan2(z1 - z0, x1 - x0));
        for (const [vx, vz] of [[x0, z0], [x1, z1]]) {
          const vk = `${Math.round(vx * 10)},${Math.round(vz * 10)}`;
          if (atoms.has(vk)) continue;
          atoms.add(vk);
          b.circle(vx, vz, a * 0.16, atomC);
        }
      }
    }
}

/** Molecular: a deep teal liquid of water, salt, sugars and proteins, with DNA and buckyballs. */
export function generateMolecular(): MapData {
  const b = realmBuilder('molecular');
  const rng = b.rng;
  const all = mapArea(b, 1);
  const start = setStart(b, 0, 0);
  const nest = nestRadius('molecular');

  // Ground: deep liquid with darker eddies, slow currents, bubbles and a dust of solute.
  speckle(b, all, 56, [7, 17], ['#0d434b', '#11525b', '#0c3e46', '#135a63']);
  // Slow currents: broad faint bands, and thin flow lines running in pairs.
  const across = (ang: number) => {
    const cx = rng.range(-75, 75);
    const cz = rng.range(-75, 75);
    return { x: cx - Math.cos(ang) * 150, z: cz - Math.sin(ang) * 150 };
  };
  for (let i = 0; i < 4; i++) {
    const ang = rng.range(-0.6, 0.6) + (i % 2 ? Math.PI / 2 : 0);
    const p = across(ang);
    streak(b, p.x, p.z, ang, 300, rng.range(6, 12), rng.range(70, 110), rng.range(6, 9), '#11515a', 10);
  }
  for (let i = 0; i < 5; i++) {
    const ang = rng.range(-0.6, 0.6) + (i % 2 ? 0 : Math.PI / 2);
    const p = across(ang);
    const amp = rng.range(5, 10);
    const wave = rng.range(60, 100);
    const ph = rng.range(0, Math.PI * 2);
    for (const o of [0, 1.6]) streak(b, p.x - Math.sin(ang) * o, p.z + Math.cos(ang) * o, ang, 300, amp, wave, 0.34, o ? '#1a6973' : '#1f7680', 5, ph + o * 0.15, true);
  }

  // Set pieces first, so the tiers fill in round them.
  const lm = (type: string, level: number, x: number, z: number, rot: number, tint?: number) =>
    b.put(type, x, z, rot, { scale: scaleFor(type, level, rng), force: true, tint });

  // A graphene sheet with buckyballs resting on it.
  const gs = spot(b, start.x, start.z, nest + 22, 72, 14);
  b.circle(gs.x, gs.z, 13.5, '#0e4850');
  honeycomb(b, gs.x, gs.z, 12.5, 2.3, '#24808a', '#3a9aa3');
  lm('buckyball', 13, gs.x - 5, gs.z + 3, 0);
  lm('buckyball', 14, gs.x + 5, gs.z - 2, 0.4);
  lm('buckyball', 15, gs.x - 1, gs.z - 6.5, 0.8);

  // A rock-salt reef: a chequered lattice floor strewn with crystals.
  const sr = spot(b, start.x, start.z, nest + 18, 80, 12);
  const sa = rng.range(0, Math.PI / 2);
  const cell = 2.6;
  b.rect(sr.x, sr.z, cell * 8.6, cell * 8.6, '#1f5a6e', sa);
  for (let i = -4; i < 4; i++)
    for (let j = -4; j < 4; j++) {
      if ((i + j) % 2 === 0) continue;
      const lx = (i + 0.5) * cell;
      const lz = (j + 0.5) * cell;
      b.rect(sr.x + lx * Math.cos(sa) - lz * Math.sin(sa), sr.z + lx * Math.sin(sa) + lz * Math.cos(sa), cell, cell, '#1d6a5f', sa);
    }
  for (let k = 0; k < 9; k++) {
    const t = sized(b, 'saltcrystal', 4 + (k % 5));
    const x = sr.x + rng.range(-10, 10);
    const z = sr.z + rng.range(-10, 10);
    b.put('saltcrystal', x, z, sa + rng.pick([0, Math.PI / 2]), { scale: t.scale });
  }

  // A micelle: phospholipids in a ring, heads out, tails in.
  const mc = spot(b, start.x, start.z, nest + 10, 75, 9);
  b.circle(mc.x, mc.z, 7.5, '#145a63');
  b.ring(mc.x, mc.z, 7.2, 7.8, '#2a8a94');
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    lm('lipid', 7 + (k % 4), mc.x + Math.cos(a) * 3.6, mc.z + Math.sin(a) * 3.6, faceDir(Math.cos(a), Math.sin(a)));
  }

  // DNA: two long helices lying in the current.
  for (const level of [16, 17]) {
    const p = spot(b, start.x, start.z, nest + 20, 80, 12);
    const ang = rng.range(0, Math.PI);
    for (let s = -2; s <= 2; s++) b.circle(p.x + Math.cos(ang) * s * 3.4, p.z + Math.sin(ang) * s * 3.4, 4.2 - Math.abs(s) * 0.5, '#13535c');
    lm('dna', level, p.x, p.z, faceDir(Math.cos(ang), Math.sin(ang)));
  }

  // A virus caught by antibodies, arms reaching in.
  const vc = spot(b, start.x, start.z, nest + 15, 80, 9);
  b.ring(vc.x, vc.z, 6.5, 7.0, '#2a8a94');
  lm('virus', 16, vc.x, vc.z, 0);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    lm('antibody', 10 + (k % 2), vc.x + Math.cos(a) * 5.4, vc.z + Math.sin(a) * 5.4, faceDir(-Math.cos(a), -Math.sin(a)));
  }

  // Bubbles: rims with a glint, then a fine dust of solute.
  for (let i = 0; i < 56; i++) {
    const x = rng.range(all.x0 + 4, all.x1 - 4);
    const z = rng.range(all.z0 + 4, all.z1 - 4);
    const r = rng.range(0.6, 3.4);
    b.circle(x, z, r, '#145c66');
    b.ring(x, z, r - Math.max(0.12, r * 0.08), r, rng.pick(['#3f9ea6', '#2f8a93', '#4fb0b6']));
    b.circle(x - r * 0.38, z - r * 0.38, r * 0.2, '#9fe4e6');
  }
  speckle(b, all, 160, [0.12, 0.4], ['#1d727b', '#2a8790', '#3fa3aa', '#7fd0d4', '#b8f0ee']);
  b.ring(start.x, start.z, nest * 0.62, nest * 0.62 + 0.35, '#1a6a73');

  // A loose ring of the smallest snacks round the start, for the first seconds.
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const d = rng.range(3.5, 8);
    const type = ['water', 'co2', 'methane'][k % 3];
    b.put(type, start.x + Math.cos(a) * d, start.z + Math.sin(a) * d, rng.range(0, Math.PI * 2), { scale: scaleFor(type, 3, rng), force: true });
  }

  // The first sizes crowd the middle a little, where the hole arrives.
  const inner = { x0: start.x - 40, x1: start.x + 40, z0: start.z - 40, z1: start.z + 40 };
  fillTiers(b, 'molecular', [
    { type: 'water', levels: [3, 7], count: 3 },
    { type: 'water', levels: [3, 6], count: 1, area: inner },
    // Dissolved gas zips about.
    { type: 'o2', levels: [3, 6], count: 12, wander: { speed: 0.2, flee: true } },
    { type: 'co2', levels: [3, 6], count: 3 },
    { type: 'methane', levels: [3, 8], count: 4 },
    { type: 'saltcrystal', levels: [5, 9], count: 1 },
    { type: 'glucose', levels: [6, 10], count: 2 },
    { type: 'aminoacid', levels: [6, 12], count: 2, tint: R_GROUPS, wander: { speed: 0.18, flee: true } },
    { type: 'lipid', levels: [7, 11], count: 2 },
    { type: 'atp', levels: [8, 12], count: 2 },
    { type: 'protein', levels: [10, 15], count: 1 },
    { type: 'protein', levels: [12, 14], count: 1 },
    { type: 'antibody', levels: [12, 16], count: 1, wander: { speed: 0.18, flee: true } },
    { type: 'ribosome', levels: [13, 17], count: 1 },
    { type: 'virus', levels: [15, 20], count: 2 },
    { type: 'virus', levels: [15, 20], count: 1, wander: { speed: 0.1 } },
    { type: 'virus', levels: [18, 20], count: 1 },
    { type: 'glucose', levels: [7, 9], count: 1 },
  ]);

  return b.build(
    '#0f4a52',
    '#d8909c',
    {
      sky: '#06262c',
      fog: '#0f4a52',
      sun: '#e6fffb',
      hemiSky: '#b8fff4',
      hemiGround: '#0c3a40',
      sunIntensity: 2.1,
      motes: { colors: ['#bff8f4', '#7fe0e0', '#ffffff'], count: 170, size: 1.0, drift: 0.3, rise: 0.5, twinkle: 0.3 },
    },
    start,
  );
}
