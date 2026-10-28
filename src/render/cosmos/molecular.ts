import * as THREE from 'three';
import { G, bond } from './kit';

type V3 = [number, number, number];

// Atom colours (CPK, a little brighter for the toy look).
const CARB = 0x3a3f4a;
const HYD = 0xf4f7ff;
const OXY = 0xff4d4d;
const NIT = 0x4d7dff;
const PHOS = 0xff9a2e;
const BOND = 0xd8dce6;

const add3 = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Hue sweep from blue (t = 0) to red (t = 1): the N-to-C rainbow of a protein cartoon. */
export function rainbow(t: number, s = 0.85, l = 0.56): number {
  return new THREE.Color().setHSL(0.66 * (1 - Math.min(1, Math.max(0, t))), s, l).getHex();
}

/** Open cylinder from a to b (a tube piece); slightly overlong so bends show no cracks. */
export function rod(g: G, a: V3, b: V3, r: number, color: number, seg = 6): G {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  const geo = new THREE.CylinderGeometry(r, r, len + r * 0.8, seg, 1, true);
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len)));
  return g.add(geo, color, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
}

/** A tube along a polyline, each piece coloured by `color(i, n)`. */
export function tube(g: G, pts: V3[], r: number, color: (i: number, n: number) => number, seg = 6): G {
  for (let i = 0; i + 1 < pts.length; i++) rod(g, pts[i], pts[i + 1], r, color(i, pts.length - 1), seg);
  return g;
}

/** Points on a helix round the axis a -> b (radius R, `turns` turns, `n` points). */
export function coil(a: V3, b: V3, R: number, turns: number, n: number, phase = 0): V3[] {
  const ax = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = ax.length();
  ax.normalize();
  const u = new THREE.Vector3(0, 1, 0);
  if (Math.abs(ax.dot(u)) > 0.9) u.set(1, 0, 0);
  const v = new THREE.Vector3().crossVectors(ax, u).normalize();
  u.crossVectors(v, ax).normalize();
  const out: V3[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const ang = phase + t * turns * Math.PI * 2;
    const c = Math.cos(ang) * R;
    const s = Math.sin(ang) * R;
    out.push([a[0] + ax.x * len * t + u.x * c + v.x * s, a[1] + ax.y * len * t + u.y * c + v.y * s, a[2] + ax.z * len * t + u.z * c + v.z * s]);
  }
  return out;
}

/** Atoms of a flat ring of `n` round (x, y, z), radius R, first atom at angle a0. */
function ringPts(n: number, R: number, x: number, y: number, z: number, a0 = 0): V3[] {
  return Array.from({ length: n }, (_, k): V3 => {
    const a = a0 + (k / n) * Math.PI * 2;
    return [x + Math.cos(a) * R, y, z + Math.sin(a) * R];
  });
}

function loopBonds(g: G, pts: V3[], r: number, color: number, seg = 6): void {
  for (let k = 0; k < pts.length; k++) bond(g, pts[k], pts[(k + 1) % pts.length], r, color, seg);
}

/** Polygon (convex, points in order) filled as a flat fan, facing away from `centre`. */
function fan(pts: V3[], centre: V3): THREE.BufferGeometry {
  const pos: number[] = [];
  const a = pts[0];
  for (let i = 1; i + 1 < pts.length; i++) {
    const b = pts[i];
    const c = pts[i + 1];
    const n = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).cross(new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]));
    const out = n.dot(new THREE.Vector3(a[0] - centre[0], a[1] - centre[1], a[2] - centre[2])) >= 0;
    pos.push(...a, ...(out ? b : c), ...(out ? c : b));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

/** Truncated icosahedron (C60): 60 atoms, with its 12 pentagons and 20 hexagons. */
function c60(R: number): { atoms: V3[]; pent: V3[][]; hex: V3[][] } {
  const p = (1 + Math.sqrt(5)) / 2;
  const base: V3[] = [];
  const perms = (v: V3) => [v, [v[1], v[2], v[0]] as V3, [v[2], v[0], v[1]] as V3];
  const signs = (v: V3): V3[] => {
    const out: V3[] = [];
    for (const sx of v[0] ? [1, -1] : [1]) for (const sy of v[1] ? [1, -1] : [1]) for (const sz of v[2] ? [1, -1] : [1]) out.push([v[0] * sx, v[1] * sy, v[2] * sz]);
    return out;
  };
  for (const v of [[0, 1, 3 * p], [1, 2 + p, 2 * p], [p, 2, 2 * p + 1]] as V3[]) for (const q of perms(v)) base.push(...signs(q));
  const k = R / Math.hypot(...base[0]);
  const atoms = base.map((v): V3 => [v[0] * k, v[1] * k, v[2] * k]);
  const faces = (dirs: V3[], n: number): V3[][] =>
    dirs.map((d) => {
      const dn = new THREE.Vector3(...d).normalize();
      const near = [...atoms].sort((a, b) => dn.dot(new THREE.Vector3(...b)) - dn.dot(new THREE.Vector3(...a))).slice(0, n);
      // Order round the face normal.
      const u = new THREE.Vector3(...near[0]).projectOnPlane(dn).normalize();
      const w = new THREE.Vector3().crossVectors(dn, u);
      return near.sort((a, b) => {
        const va = new THREE.Vector3(...a);
        const vb = new THREE.Vector3(...b);
        return Math.atan2(va.dot(w), va.dot(u)) - Math.atan2(vb.dot(w), vb.dot(u));
      });
    });
  const ico: V3[] = [];
  for (const q of perms([0, 1, p])) ico.push(...signs(q));
  const dod: V3[] = signs([1, 1, 1]);
  for (const q of perms([0, 1 / p, p])) dod.push(...signs(q));
  return { atoms, pent: faces(ico, 5), hex: faces(dod, 6) };
}

export const MOLECULAR_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  methane: () => {
    const g = new G();
    const c: V3 = [0, 0.75, 0];
    g.sphere(0.44, c[0], c[1], c[2], CARB, 14, 9);
    const dirs: V3[] = [[0, 1, 0]];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + Math.PI / 6;
      dirs.push([Math.cos(a) * 0.943, -0.333, Math.sin(a) * 0.943]);
    }
    for (const d of dirs) {
      const p = add3(c, d, 0.68);
      bond(g, c, p, 0.08, BOND);
      g.sphere(0.3, p[0], p[1], p[2], HYD, 12, 8);
    }
    return g.build();
  },

  saltcrystal: () => {
    const g = new G();
    // Rock salt: Na+ and Cl- alternating on a cube lattice.
    const s = 0.5;
    const y = 0.78;
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (let k = -1; k <= 1; k++) {
          if (i === 0 && j === 0 && k === 0) continue;
          const cl = (i + j + k + 3) % 2 === 0;
          if (cl) g.ball(0.29, i * s, y + j * s, k * s, 0x52e07a, 1);
          else g.ball(0.19, i * s, y + j * s, k * s, 0xb07cff, 0);
        }
    // Lattice edges on the top face, so the cube reads from above.
    for (const t of [-1, 0, 1]) {
      bond(g, [-s, y + s, t * s], [s, y + s, t * s], 0.05, 0xe8fff0, 4);
      bond(g, [t * s, y + s, -s], [t * s, y + s, s], 0.05, 0xe8fff0, 4);
    }
    return g.build();
  },

  glucose: () => {
    const g = new G();
    const SUGAR = 0xffb53d;
    const y = 0.42;
    const ring = ringPts(6, 0.56, -0.17, y, 0, Math.PI / 6).map((p, k): V3 => [p[0], p[1] + (k % 2 ? 0.06 : -0.06), p[2]]);
    // A pale plate inside the ring, so the hexagon reads from above.
    g.cyl(0.5, 0.5, 0.1, -0.17, y, 0, 0xfff0c0, 6);
    loopBonds(g, ring, 0.11, 0xffe2a0);
    ring.forEach((p, k) => g.ball(k === 0 ? 0.3 : 0.28, p[0], p[1], p[2], k === 0 ? OXY : SUGAR, 1));
    for (let k = 1; k < 6; k++) {
      const a = Math.PI / 6 + (k / 6) * Math.PI * 2;
      const out: V3 = [Math.cos(a), 0, Math.sin(a)];
      const up = k % 2 ? 0.22 : 0.05;
      if (k === 5) {
        // CH2OH on carbon 5.
        const c2 = add3(add3(ring[k], out, 0.42), [0, 1, 0], 0.25);
        bond(g, ring[k], c2, 0.09, 0xffe2a0);
        g.ball(0.24, c2[0], c2[1], c2[2], SUGAR, 1);
        const o = add3(c2, [Math.cos(a + 0.7), 0.25, Math.sin(a + 0.7)], 0.38);
        bond(g, c2, o, 0.08, BOND);
        g.ball(0.21, o[0], o[1], o[2], OXY, 1);
        const h = add3(o, out, 0.2);
        g.ball(0.12, h[0], h[1] + 0.05, h[2], HYD, 0);
        continue;
      }
      const o = add3(add3(ring[k], out, 0.4), [0, 1, 0], up);
      bond(g, ring[k], o, 0.08, BOND);
      g.ball(0.21, o[0], o[1], o[2], OXY, 1);
      const h = add3(o, out, 0.2);
      g.ball(0.12, h[0], h[1] + 0.05, h[2], HYD, 0);
    }
    return g.build();
  },

  aminoacid: () => {
    const g = new G();
    const y = 0.5;
    const n: V3 = [-0.8, y, 0.12];
    const ca: V3 = [-0.22, y + 0.06, -0.12];
    const r: V3 = [-0.18, y + 0.52, -0.42];
    const c: V3 = [0.36, y, 0.12];
    const o1: V3 = [0.42, y + 0.42, 0.42];
    const o2: V3 = [0.92, y - 0.06, -0.12];
    for (const [a, b] of [[n, ca], [ca, r], [ca, c], [c, o1], [c, o2]] as [V3, V3][]) bond(g, a, b, 0.08, BOND);
    g.sphere(0.3, n[0], n[1], n[2], NIT, 12, 8);
    g.sphere(0.3, ca[0], ca[1], ca[2], CARB, 12, 8);
    // The side chain: what makes each amino acid different (tinted per prop).
    g.sphere(0.36, r[0], r[1], r[2], 0xffffff, 12, 8, { tint: true });
    g.sphere(0.29, c[0], c[1], c[2], CARB, 12, 8);
    g.sphere(0.27, o1[0], o1[1], o1[2], OXY, 12, 8);
    g.sphere(0.27, o2[0], o2[1], o2[2], OXY, 12, 8);
    g.sphere(0.14, 1.18, y + 0.1, -0.3, HYD, 8, 6);
    g.sphere(0.14, -1.12, y + 0.12, 0.32, HYD, 8, 6).sphere(0.14, -0.98, y + 0.24, -0.18, HYD, 8, 6);
    return g.build();
  },

  lipid: () => {
    const g = new G();
    // Phospholipid lying on its side: choline and phosphate head (+X), two fatty tails (-X).
    const head: V3 = [1.08, 0.4, 0];
    const phos: V3 = [0.56, 0.36, 0];
    bond(g, head, phos, 0.09, BOND);
    g.sphere(0.36, head[0], head[1], head[2], 0x6f8cff, 12, 8);
    g.sphere(0.3, phos[0], phos[1], phos[2], PHOS, 12, 8);
    const gly: V3[] = [[0.12, 0.3, -0.2], [0.14, 0.32, 0.22]];
    for (const p of gly) {
      bond(g, phos, p, 0.07, BOND);
      g.sphere(0.15, p[0], p[1], p[2], 0xffe6f0, 8, 6);
    }
    for (const [z0, kink] of [[-0.26, false], [0.18, true]] as const) {
      let p: V3 = [0.0, 0.26, z0];
      let dz = 0;
      for (let i = 0; i < 9; i++) {
        if (kink && i === 4) dz = 0.08;
        const q: V3 = [p[0] - 0.16, 0.26 + (i % 2 ? 0.07 : -0.03), p[2] + dz];
        g.ball(0.13, q[0], q[1], q[2], i % 2 ? 0xffd84d : 0xffc22e, 0);
        p = q;
      }
    }
    return g.build();
  },

  atp: () => {
    const g = new G();
    const y = 0.34;
    const atom = (p: V3, r: number, c: number) => g.sphere(r, p[0], p[1], p[2], c, 7, 5);
    // Adenine: a hexagon and a pentagon sharing an edge, on pale blue plates.
    const hr = 0.36;
    const hx = -1.22;
    const hex = ringPts(6, hr, hx, y, 0, Math.PI / 6);
    const px = hx + 1.554 * hr;
    const pr = hr / 1.1756;
    const pent = ringPts(5, pr, px, y, 0, (Math.PI * 4) / 5);
    g.cyl(hr * 0.88, hr * 0.88, 0.08, hx, y, 0, 0xbfd0ff, 6);
    g.cyl(pr * 0.86, pr * 0.86, 0.08, px, y, 0, 0xbfd0ff, 5, { ry: Math.PI / 10 });
    loopBonds(g, hex, 0.07, 0x9fb8ff, 4);
    loopBonds(g, pent, 0.07, 0x9fb8ff, 4);
    hex.forEach((p, k) => atom(p, 0.2, k % 2 ? CARB : NIT));
    pent.forEach((p, k) => k > 1 && atom(p, 0.2, k === 3 ? CARB : NIT));
    const nh2 = add3(hex[2], [-0.12, 0.05, 0.34]);
    bond(g, hex[2], nh2, 0.07, BOND, 4);
    atom(nh2, 0.2, NIT);
    // Ribose: a pale gold sugar ring.
    const rx = -0.04;
    const rib = ringPts(5, 0.3, rx, y + 0.04, -0.2, Math.PI);
    g.cyl(0.25, 0.25, 0.08, rx, y + 0.04, -0.2, 0xfff0c0, 5, { ry: Math.PI / 10 });
    bond(g, pent[2], rib[0], 0.07, BOND, 4);
    loopBonds(g, rib, 0.07, 0xffe2a0, 4);
    rib.forEach((p, k) => g.ball(0.17, p[0], p[1], p[2], k === 2 ? OXY : 0xffb53d, 0));
    // Three phosphates: the energy is in the last bonds.
    let prev = rib[4];
    for (let i = 0; i < 3; i++) {
      const p: V3 = [0.53 + i * 0.42, y + 0.06, 0.02];
      bond(g, prev, p, 0.08, i === 2 ? 0xfff27a : BOND, 4);
      g.sphere(0.27, p[0], p[1], p[2], PHOS, 8, 6);
      for (const s of [-1, 1]) g.ball(0.15, p[0] + 0.04, p[1] + 0.1, p[2] + s * 0.3, OXY, 0);
      prev = p;
    }
    g.ball(0.15, prev[0] + 0.34, prev[1] + 0.04, prev[2], OXY, 0);
    return g.build();
  },

  protein: () => {
    const g = new G();
    // A cartoon of a small fold: helix, three-stranded sheet, helix packed on top; rainbow N to C.
    const T = 0.12;
    const seg = (pts: V3[], t0: number, t1: number) => tube(g, pts, T, (i, n) => rainbow(t0 + ((t1 - t0) * i) / n), 6);
    const helixA = coil([-1.05, 0.6, -0.8], [0.6, 0.6, -0.8], 0.3, 3.5, 36);
    seg(helixA, 0, 0.28);
    const end = helixA[helixA.length - 1];
    seg([end, [0.95, 0.5, -0.65], [1.05, 0.36, -0.3]], 0.28, 0.32);
    // Beta strands: flat arrows, joined by hairpins.
    const strands: [number, number, number][] = [
      [1.0, -0.7, -0.22],
      [-0.7, 1.0, 0.18],
      [1.0, -0.7, 0.58],
    ];
    strands.forEach(([x0, x1, z], i) => {
      const t = 0.34 + i * 0.12;
      const dir = Math.sign(x1 - x0);
      const len = Math.abs(x1 - x0) - 0.3;
      g.box(len, 0.11, 0.3, (x0 + x1) / 2 - dir * 0.15, 0.34, z, rainbow(t));
      g.bow(0.32, 0.11, 0.48, x1 - dir * 0.3, 0.285, z, rainbow(t + 0.04), { ry: dir > 0 ? 0 : Math.PI });
      if (i < 2) {
        const zn = strands[i + 1][2];
        const xe = x1 + dir * 0.05;
        seg([[xe, 0.34, z], [xe + dir * 0.18, 0.38, (z + zn) / 2], [xe, 0.34, zn]], t + 0.06, t + 0.12);
      }
    });
    seg([[-0.75, 0.34, 0.58], [-0.95, 0.6, 0.85], [-0.75, 0.9, 0.95]], 0.7, 0.74);
    const helixB = coil([-0.65, 1.0, 0.85], [0.85, 1.0, -0.05], 0.27, 3, 30, Math.PI);
    seg([[-0.75, 0.9, 0.95], helixB[0]], 0.74, 0.75);
    seg(helixB, 0.75, 1);
    const tail = helixB[helixB.length - 1];
    seg([tail, [1.1, 0.75, 0.25], [1.15, 0.45, 0.75]], 1, 1);
    return g.build();
  },

  antibody: () => {
    const g = new G();
    const y = 0.42;
    const HEAVY = 0x4f7dff;
    const HEAVY2 = 0x3d63e0;
    const LIGHT = 0x9fd4ff;
    const dom = (x: number, z: number, ang: number, col: number) => g.sphere(0.25, x, y, z, col, 8, 6, { sx: 1.4, sy: 0.75, ry: ang });
    // Stem (Fc): two heavy chains side by side.
    for (const [d, col] of [[0.17, HEAVY], [-0.17, HEAVY2]] as const) {
      dom(-0.4, d, 0, col);
      dom(-0.95, d, 0, col);
    }
    // Hinge.
    bond(g, [-0.1, y, 0.17], [0.2, y, 0.26], 0.06, 0xc8d8ff);
    bond(g, [-0.1, y, -0.17], [0.2, y, -0.26], 0.06, 0xc8d8ff);
    // Two arms (Fab): heavy chain inside, light chain outside, antigen sites at the tips.
    for (const s of [1, -1]) {
      const a = s * 0.62;
      const ux = Math.cos(a);
      const uz = Math.sin(a);
      const ox = 0.2;
      const oz = s * 0.22;
      for (const [t, col] of [[0.4, HEAVY], [0.92, HEAVY]] as const) dom(ox + ux * t + uz * 0.16 * s, oz + uz * t - ux * 0.16 * s, -a, col);
      for (const t of [0.4, 0.92]) dom(ox + ux * t - uz * 0.16 * s, oz + uz * t + ux * 0.16 * s, -a, LIGHT);
      g.ball(0.13, ox + ux * 1.3, y + 0.08, oz + uz * 1.3, 0xffd23d, 1);
    }
    return g.build();
  },

  ribosome: () => {
    const g = new G();
    // Large subunit: a lumpy blue body.
    const big: [number, number, number, number][] = [
      [0, 0.75, 0, 0.78],
      [-0.55, 0.62, 0.45, 0.55],
      [0.5, 0.62, 0.5, 0.52],
      [-0.5, 0.6, -0.5, 0.55],
      [0.55, 0.65, -0.45, 0.5],
      [0, 1.05, -0.35, 0.5],
    ];
    big.forEach(([x, y, z, r], i) => g.sphere(r, x, y + 0.06, z, i % 2 ? 0x7fa2ff : 0x93b4ff, 10, 7));
    // Small subunit: a peach cap on top.
    const small: [number, number, number, number][] = [
      [0.1, 1.5, 0.15, 0.48],
      [-0.4, 1.42, 0.35, 0.36],
      [0.55, 1.4, 0.3, 0.34],
    ];
    small.forEach(([x, y, z, r], i) => g.sphere(r, x, y, z, i ? 0xffc98a : 0xffd8a8, 10, 7));
    // mRNA threading between the two, and the new protein coming out.
    const CODON = [0xff5f6d, 0x4fe06a, 0xffd23d, 0x4dc8ff];
    for (let i = 0; i < 16; i++) {
      const t = i / 15;
      const x = -1.2 + 2.4 * t;
      g.ball(0.1, x, 1.2 + Math.sin(t * Math.PI * 3) * 0.06, 0.62 + Math.sin(t * Math.PI) * 0.15, CODON[i % 4], 0);
    }
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      g.ball(0.11, -0.7 - t * 0.55, 0.9 - t * 0.6, -0.55 - Math.sin(t * Math.PI) * 0.35, rainbow(t), 0);
    }
    return g.build();
  },

  buckyball: () => {
    const g = new G();
    const R = 1.15;
    const cy = R + 0.12;
    const { atoms, pent, hex } = c60(R);
    const centre: V3 = [0, 0, 0];
    // Faces a little inside the atoms: black pentagons, white hexagons, like a football.
    for (const f of pent) g.add(fan(f.map((p): V3 => [p[0] * 0.97, p[1] * 0.97, p[2] * 0.97]), centre), 0x2b3550, 0, cy, 0);
    for (const f of hex) g.add(fan(f.map((p): V3 => [p[0] * 0.97, p[1] * 0.97, p[2] * 0.97]), centre), 0xf2f6ff, 0, cy, 0);
    for (const a of atoms) g.ball(0.11, a[0], a[1] + cy, a[2], 0x59657f, 0);
    return g.build();
  },

  dna: () => {
    const g = new G();
    const y = 0.8;
    const R = 0.62;
    const x0 = -3.1;
    const x1 = 3.1;
    const turns = 2;
    const n = 40;
    const off = Math.PI * 0.8;
    const strand = (ph: number) =>
      Array.from({ length: n }, (_, i): V3 => {
        const t = i / (n - 1);
        const a = ph + t * turns * Math.PI * 2;
        return [x0 + (x1 - x0) * t, y + Math.cos(a) * R, Math.sin(a) * R];
      });
    tube(g, strand(0), 0.12, () => 0xff8a3d, 6);
    tube(g, strand(off), 0.12, () => 0x8a6bff, 6);
    // Base pairs: A-T and G-C rungs, each half its own colour.
    const PAIRS: [number, number][] = [
      [0x4fe06a, 0xff4d6d],
      [0xffd23d, 0x4dc8ff],
    ];
    const rungs = 16;
    for (let i = 0; i < rungs; i++) {
      const t = (i + 0.5) / rungs;
      const x = x0 + (x1 - x0) * t;
      const a = t * turns * Math.PI * 2;
      const p: V3 = [x, y + Math.cos(a) * R, Math.sin(a) * R];
      const q: V3 = [x, y + Math.cos(a + off) * R, Math.sin(a + off) * R];
      const m = lerp3(p, q, 0.5);
      const [c1, c2] = PAIRS[(i * 7) % 3 === 0 ? 1 : 0];
      const flip = i % 2 === 0;
      bond(g, p, m, 0.075, flip ? c1 : c2, 4);
      bond(g, m, q, 0.075, flip ? c2 : c1, 4);
    }
    return g.build();
  },

  virus: () => {
    const g = new G();
    const R = 0.78;
    const cy = 0.86;
    // Icosahedral capsid: its capsomers in two shades, a fibre with a knob at each of the 12 corners.
    const ico = new THREE.IcosahedronGeometry(R, 1);
    const pos = ico.getAttribute('position');
    const corners = new THREE.IcosahedronGeometry(R, 0);
    const cp = corners.getAttribute('position');
    const tips: THREE.Vector3[] = [];
    for (let i = 0; i < cp.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(cp, i);
      if (!tips.some((t) => t.distanceTo(v) < 1e-3)) tips.push(v);
    }
    corners.dispose();
    const isCorner = (v: THREE.Vector3) => tips.some((t) => t.distanceTo(v) < 1e-3);
    for (let f = 0; f < pos.count; f += 3) {
      const vs = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(pos, f + k));
      const tri = new THREE.BufferGeometry();
      tri.setAttribute('position', new THREE.Float32BufferAttribute(vs.flatMap((v) => [v.x, v.y, v.z]), 3));
      tri.computeVertexNormals();
      g.add(tri, vs.some(isCorner) ? 0xa05cf0 : 0xc99cff, 0, cy, 0);
    }
    ico.dispose();
    for (const t of tips) {
      const d = t.clone().normalize();
      const a: V3 = [d.x * R * 0.95, cy + d.y * R * 0.95, d.z * R * 0.95];
      const b: V3 = [d.x * (R + 0.13), cy + d.y * (R + 0.13), d.z * (R + 0.13)];
      bond(g, a, b, 0.045, 0xffd0e8, 4);
      g.ball(0.085, b[0], b[1], b[2], 0xff5f8f, 0);
    }
    return g.build();
  },
};
