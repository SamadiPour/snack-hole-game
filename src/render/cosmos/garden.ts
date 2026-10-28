import type * as THREE from 'three';
import { G, bond, torus } from './kit';

type V3 = [number, number, number];

const BLACK = 0x26221f;
const WHITE = 0xffffff;
const SOIL = 0xa0784a;

/**
 * Three pairs of jointed legs, front pair first: hips at (x, hipY, ±hipZ), knees lifted to kneeY,
 * feet on the ground `reach` out, the front pair splayed forward and the back pair backward.
 */
function legs(g: G, xs: number[], hipY: number, hipZ: number, kneeY: number, reach: number, r: number, color: number, splay = 0.5): void {
  xs.forEach((x, i) => {
    const phi = (1 - i) * splay;
    for (const s of [-1, 1]) {
      const knee: V3 = [x + Math.sin(phi) * reach * 0.5, kneeY, s * (hipZ + Math.cos(phi) * reach * 0.55)];
      const foot: V3 = [x + Math.sin(phi) * reach, r, s * (hipZ + Math.cos(phi) * reach)];
      bond(g, [x, hipY, s * hipZ], knee, r, color, 4);
      bond(g, knee, foot, r, color, 4);
    }
  });
}

/** Two feelers from (x, y, ±z) out to (x + dx, y + dy, ±(z + dz)), with a bead at each tip. */
function antennae(g: G, x: number, y: number, z: number, dx: number, dy: number, dz: number, r: number, color: number, tip = 0): void {
  for (const s of [-1, 1]) {
    bond(g, [x, y, s * z], [x + dx, y + dy, s * (z + dz)], r, color, 4);
    if (tip) g.ball(tip, x + dx, y + dy, s * (z + dz), color, 0);
  }
}

/** Point on an ellipsoidal dome of radii (rx, ry, rz) centred at (cx, cy, 0): polar angle t from the top, azimuth a. */
function onDome(rx: number, ry: number, rz: number, cx: number, cy: number, t: number, a: number): V3 {
  return [cx + rx * Math.sin(t) * Math.cos(a), cy + ry * Math.cos(t), rz * Math.sin(t) * Math.sin(a)];
}

export const GARDEN_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  ant: () => {
    const g = new G();
    // Abdomen, waist, thorax and head along X (front +X), all taking the tint.
    g.ball(0.26, -0.44, 0.25, 0, WHITE, 1, { tint: true, sx: 1.25, sy: 0.9 });
    g.ball(0.07, -0.1, 0.2, 0, WHITE, 0, { tint: true });
    g.ball(0.14, 0.1, 0.22, 0, WHITE, 0, { tint: true, sx: 1.5 });
    g.ball(0.17, 0.46, 0.25, 0, WHITE, 1, { tint: true });
    g.ball(0.07, -0.5, 0.42, -0.08, 0xe0d4cc, 0);
    // Mandibles, feelers and six legs.
    for (const s of [-1, 1]) bond(g, [0.58, 0.2, s * 0.07], [0.72, 0.18, s * 0.03], 0.03, BLACK, 4);
    antennae(g, 0.55, 0.36, 0.06, 0.2, 0.1, 0.16, 0.025, BLACK);
    legs(g, [0.18, 0.08, -0.02], 0.18, 0.05, 0.3, 0.42, 0.028, BLACK, 0.6);
    return g.build();
  },
  aphid: () => {
    const g = new G();
    g.ball(0.36, -0.1, 0.3, 0, 0x9fe36a, 1, { sx: 1.35, sy: 0.8 });
    g.ball(0.17, 0.38, 0.27, 0, 0x86cc52, 0);
    g.ball(0.1, -0.22, 0.52, -0.12, 0xdcffb8, 0);
    for (const s of [-1, 1]) {
      // Siphons at the back and red eyes.
      bond(g, [-0.42, 0.4, s * 0.12], [-0.56, 0.52, s * 0.16], 0.035, 0x6fae3a, 4);
      g.ball(0.045, 0.5, 0.33, s * 0.09, 0xd8322a, 0);
    }
    antennae(g, 0.48, 0.36, 0.05, 0.08, 0.2, 0.16, 0.02, 0x6fae3a);
    legs(g, [0.18, 0.0, -0.18], 0.15, 0.15, 0.26, 0.25, 0.025, 0x6fae3a, 0.5);
    return g.build();
  },
  sunseed: () => {
    const g = new G();
    g.ball(0.5, 0, 0.22, 0, 0x2f3034, 1, { sx: 1.55, sy: 0.44, sz: 0.78 });
    // Pale stripes along its length.
    for (const z of [-0.22, 0, 0.22]) g.ball(0.47, 0.02, 0.225, z * 0.85, 0xeae5d6, 1, { sx: 1.45, sy: 0.45, sz: 0.06 });
    g.ball(0.12, -0.3, 0.38, -0.12, 0x6a6c72, 0, { sy: 0.4 });
    return g.build();
  },
  grasstuft: () => {
    const g = new G();
    const blades: [number, number, number][] = [
      [0.0, 0.3, 1.45],
      [0.9, 0.55, 1.25],
      [1.7, 0.42, 1.4],
      [2.4, 0.62, 1.1],
      [3.1, 0.35, 1.45],
      [3.9, 0.58, 1.2],
      [4.6, 0.45, 1.35],
      [5.4, 0.62, 1.0],
      [6.0, 0.25, 1.3],
    ];
    blades.forEach(([a, t, L], k) => {
      const bx = Math.cos(a) * 0.15;
      const bz = Math.sin(a) * 0.15;
      const cx = bx + (L / 2) * Math.sin(t) * Math.cos(a);
      const cz = bz + (L / 2) * Math.sin(t) * Math.sin(a);
      g.cone(0.13, L, cx, 0.07 + (L / 2) * Math.cos(t), cz, k % 3 === 0 ? 0xc0c0c0 : WHITE, 4, { tint: true, sz: 0.35, rz: -t, ry: -a });
    });
    g.ball(0.22, 0, 0.11, 0, 0xa0a0a0, 0, { tint: true, sy: 0.5 });
    return g.build();
  },
  ladybug: () => {
    const g = new G();
    const cx = -0.06;
    const cy = 0.08;
    g.ball(0.42, cx, 0.12, 0, BLACK, 0, { sx: 1.3, sy: 0.3, sz: 1.2 });
    g.dome(0.55, cx, cy, 0, WHITE, 14, 6, { tint: true, sx: 1.1 });
    // Wing-case seam and seven spots.
    g.dome(0.565, cx, cy, 0, BLACK, 14, 6, { sx: 1.1, sz: 0.05 });
    const spots: [number, number][] = [
      [0.5, 0.55],
      [0.5, -0.55],
      [0.85, 1.55],
      [0.85, -1.55],
      [0.6, 2.4],
      [0.6, -2.4],
      [0.3, Math.PI],
    ];
    for (const [t, a] of spots) {
      const [x, y, z] = onDome(0.6, 0.55, 0.55, cx, cy, t, a);
      g.ball(0.1, x, y, z, BLACK, 0, { sy: 0.45 });
    }
    // Head with white cheeks, short legs.
    g.ball(0.26, 0.47, 0.18, 0, BLACK, 1, { sx: 0.7, sy: 0.65, sz: 1.2 });
    for (const s of [-1, 1]) g.ball(0.07, 0.6, 0.27, s * 0.14, 0xf4f0e6, 0, { sy: 0.6 });
    legs(g, [0.25, 0.0, -0.25], 0.12, 0.3, 0.2, 0.28, 0.03, BLACK, 0.5);
    return g.build();
  },
  pebble: () => {
    const g = new G();
    g.ball(0.6, 0, 0.29, 0, 0xc8c8c8, 1, { tint: true, sx: 1.15, sy: 0.47, sz: 0.9 });
    g.ball(0.42, -0.1, 0.4, -0.06, WHITE, 1, { tint: true, sx: 1.2, sy: 0.4, sz: 0.95 });
    g.ball(0.12, 0.25, 0.5, 0.16, 0xa8a8a8, 0, { tint: true, sy: 0.5 });
    return g.build();
  },
  caterpillar: () => {
    const g = new G();
    const n = 9;
    for (let i = 0; i < n; i++) {
      const x = -0.95 + (i / (n - 1)) * 1.65;
      const y = 0.3 + 0.06 * Math.sin(i * 1.1);
      g.ball(0.26, x, y, 0, i % 2 ? 0x8ed85a : 0x6fc24a, 0, { sz: 1.05 });
      if (i % 2) for (const s of [-1, 1]) g.ball(0.06, x, y + 0.08, s * 0.2, 0xffe04a, 0);
    }
    g.ball(0.27, 0.92, 0.3, 0, 0x3f8a2a, 1);
    for (const s of [-1, 1]) g.ball(0.05, 1.12, 0.38, s * 0.12, BLACK, 0);
    antennae(g, 1.0, 0.5, 0.08, 0.08, 0.1, 0.06, 0.025, BLACK, 0.04);
    return g.build();
  },
  button: () => {
    const g = new G();
    g.cylB(0.7, 0.68, 0.17, 0, 0, 0, 0xc4c4c4, 18, { tint: true });
    torus(g, 0.58, 0.07, 0, 0.18, 0, WHITE, { tint: true }, 24);
    g.cylB(0.5, 0.5, 0.025, 0, 0.165, 0, 0x9c9c9c, 18, { tint: true });
    const holes: [number, number][] = [
      [0.15, 0.15],
      [-0.15, 0.15],
      [0.15, -0.15],
      [-0.15, -0.15],
    ];
    for (const [x, z] of holes) g.cylB(0.07, 0.07, 0.03, x, 0.17, z, 0x2a2622, 8);
    // Thread crossing the holes.
    g.box(0.44, 0.03, 0.05, 0, 0.2, 0, 0xf4f0e6, { ry: Math.PI / 4 }).box(0.44, 0.03, 0.05, 0, 0.2, 0, 0xf4f0e6, { ry: -Math.PI / 4 });
    return g.build();
  },
  beetle: () => {
    const g = new G();
    const cx = -0.18;
    g.ball(0.42, cx, 0.12, 0, BLACK, 0, { sx: 1.4, sy: 0.3, sz: 1.15 });
    g.dome(0.5, cx, 0.1, 0, WHITE, 14, 6, { tint: true, sx: 1.3, sz: 1.1 });
    g.dome(0.508, cx, 0.1, 0, 0x5a5a5a, 14, 6, { tint: true, sx: 1.31, sz: 0.06 });
    g.ball(0.12, -0.36, 0.55, -0.2, 0xe8f6ff, 0, { sy: 0.4 });
    // Shield, head and horn.
    g.ball(0.3, 0.42, 0.28, 0, 0xb4b4b4, 1, { tint: true, sx: 0.8, sy: 0.75, sz: 1.25 });
    g.ball(0.17, 0.72, 0.25, 0, BLACK, 0);
    g.cone(0.07, 0.36, 0.78, 0.45, 0, BLACK, 5, { rz: -0.5 });
    antennae(g, 0.8, 0.3, 0.08, 0.08, 0.15, 0.2, 0.025, BLACK, 0.04);
    legs(g, [0.4, 0.05, -0.3], 0.15, 0.3, 0.3, 0.3, 0.035, BLACK, 0.5);
    return g.build();
  },
  coin: () => {
    const g = new G();
    g.cylB(0.8, 0.8, 0.13, 0, 0, 0, 0xc8c8c8, 20, { tint: true });
    torus(g, 0.74, 0.05, 0, 0.14, 0, WHITE, { tint: true }, 28);
    // Embossed star and a ring of beads.
    g.cylB(0.3, 0.3, 0.04, 0, 0.12, 0, WHITE, 5, { tint: true });
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      g.ball(0.035, Math.cos(a) * 0.55, 0.14, Math.sin(a) * 0.55, WHITE, 0, { tint: true });
    }
    return g.build();
  },
  leaf: () => {
    const g = new G();
    g.ball(0.95, 0.0, 0.12, 0, WHITE, 1, { tint: true, sx: 1.2, sy: 0.1, sz: 0.72 });
    g.bow(0.35, 0.05, 0.5, 0.95, 0.1, 0, WHITE, { tint: true });
    // Midrib, veins and stalk in a darker shade of the leaf.
    g.box(2.1, 0.05, 0.07, 0.05, 0.205, 0, 0x8a8a8a, { tint: true });
    for (const x of [-0.55, -0.1, 0.35, 0.75]) {
      for (const s of [-1, 1]) g.box(0.5, 0.03, 0.05, x + 0.14, 0.205, s * 0.18, 0x8a8a8a, { tint: true, ry: -s * 0.75 });
    }
    g.box(0.3, 0.06, 0.07, -1.13, 0.12, 0, 0x7a7a7a, { tint: true });
    return g.build();
  },
  acorn: () => {
    const g = new G();
    // Lying on its side: nut toward +X, cap and stalk at -X.
    g.ball(0.48, 0.12, 0.49, 0, 0xc98a3c, 1, { sx: 1.25 });
    g.cone(0.08, 0.14, 0.72, 0.49, 0, 0x8a5a2a, 6, { rz: -Math.PI / 2 });
    g.ball(0.15, 0.32, 0.82, -0.18, 0xeab070, 0);
    g.ball(0.5, -0.32, 0.5, 0, 0x7a5a32, 1, { sx: 0.72 });
    torus(g, 0.46, 0.05, -0.08, 0.5, 0, 0x5f4426, { rz: Math.PI / 2 }, 18);
    g.cyl(0.06, 0.07, 0.14, -0.71, 0.55, 0, 0x5f4426, 6, { rz: Math.PI / 2 });
    return g.build();
  },
  earthworm: () => {
    const g = new G();
    const n = 14;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x = -1.3 + 2.6 * t;
      const z = Math.sin(t * Math.PI * 2) * 0.28;
      const r = 0.12 + 0.08 * Math.sin(Math.PI * Math.min(1, t * 1.15));
      const c = i === 8 || i === 9 ? 0xf2b0a6 : i % 2 ? 0xe58e8a : 0xd67a7a;
      g.ball(r, x, r, z, c, 0, { sx: 1.25 });
    }
    return g.build();
  },
  bee: () => {
    const g = new G();
    g.ball(0.34, -0.08, 0.38, 0, 0xffc93a, 1, { sx: 1.35 });
    // Black bands, sting, head.
    g.cyl(0.345, 0.345, 0.11, -0.02, 0.38, 0, BLACK, 12, { rz: Math.PI / 2 });
    g.cyl(0.305, 0.305, 0.1, -0.3, 0.38, 0, BLACK, 12, { rz: Math.PI / 2 });
    g.cone(0.06, 0.14, -0.6, 0.37, 0, BLACK, 5, { rz: Math.PI / 2 });
    g.ball(0.2, 0.42, 0.42, 0, BLACK, 1);
    g.ball(0.1, -0.05, 0.66, -0.1, 0xfff0b8, 0);
    antennae(g, 0.55, 0.52, 0.07, 0.1, 0.16, 0.09, 0.022, BLACK, 0.035);
    // Glassy wings.
    for (const s of [-1, 1]) g.ball(0.3, -0.12, 0.74, s * 0.36, 0xeaf6ff, 0, { sx: 1.25, sy: 0.12, sz: 0.8, ry: s * 0.4 });
    legs(g, [0.15, 0.0, -0.15], 0.2, 0.12, 0.16, 0.2, 0.025, BLACK, 0.4);
    return g.build();
  },
  butterfly: () => {
    const g = new G();
    for (const s of [-1, 1]) {
      const fore = { sx: 0.9, sy: 0.07, rx: -s * 0.25, ry: s * 0.25 };
      const hind = { sx: 0.95, sy: 0.07, sz: 0.9, rx: -s * 0.25, ry: -s * 0.3 };
      // Dark rims under the tinted wings.
      g.ball(0.65, 0.15, 0.3, s * 0.64, BLACK, 1, fore);
      g.ball(0.6, 0.15, 0.315, s * 0.64, WHITE, 1, { ...fore, tint: true });
      g.ball(0.47, -0.32, 0.27, s * 0.5, BLACK, 1, hind);
      g.ball(0.42, -0.32, 0.285, s * 0.5, 0xd0d0d0, 1, { ...hind, tint: true });
      // Eye spots.
      g.ball(0.13, 0.22, 0.43, s * 0.92, WHITE, 0, { sy: 0.3 });
      g.ball(0.07, 0.22, 0.46, s * 0.92, BLACK, 0, { sy: 0.3 });
      g.ball(0.09, -0.4, 0.37, s * 0.66, 0xfff2a8, 0, { sy: 0.3 });
    }
    g.ball(0.08, -0.05, 0.28, 0, BLACK, 0, { sx: 5.5 });
    g.ball(0.1, 0.45, 0.29, 0, BLACK, 0);
    antennae(g, 0.5, 0.33, 0.04, 0.24, 0.12, 0.14, 0.018, BLACK, 0.04);
    return g.build();
  },
  snail: () => {
    const g = new G();
    // Foot, head and eye stalks.
    g.ball(0.4, 0.12, 0.17, 0, 0xd8c2a0, 1, { sx: 2.15, sy: 0.42, sz: 0.95 });
    g.ball(0.2, 0.76, 0.3, 0, 0xd8c2a0, 1);
    for (const s of [-1, 1]) {
      bond(g, [0.8, 0.4, s * 0.08], [0.88, 0.78, s * 0.18], 0.035, 0xc6ad88, 5);
      g.ball(0.07, 0.88, 0.8, s * 0.18, 0x3a2a20, 0);
    }
    // Shell: a tinted ball with a ridge over the top and a spiral on each side.
    const sx = -0.15;
    const sy = 0.78;
    g.sphere(0.58, sx, sy, 0, WHITE, 12, 8, { tint: true, sz: 0.85 });
    torus(g, 0.56, 0.05, sx, sy, 0, 0x9a9a9a, { tint: true, rx: Math.PI / 2 }, 28);
    for (const s of [-1, 1]) {
      torus(g, 0.22, 0.05, sx, sy, s * 0.455, 0x8a8a8a, { tint: true, rx: Math.PI / 2 }, 18);
      g.ball(0.1, sx, sy, s * 0.47, 0x8a8a8a, 0, { tint: true, sz: 0.5 });
    }
    g.ball(0.12, sx - 0.1, sy + 0.45, -0.2, 0xfff0d8, 0, { sy: 0.5 });
    return g.build();
  },
  mushroom: () => {
    const g = new G();
    g.cylB(0.22, 0.3, 1.15, 0, 0, 0, 0xf2ead8, 10);
    g.cylB(0.34, 0.24, 0.12, 0, 0.8, 0, 0xe6dcc4, 10);
    g.cylB(0.86, 0.86, 0.05, 0, 1.08, 0, 0xe8d6bc, 16);
    g.dome(0.9, 0, 1.1, 0, WHITE, 16, 6, { tint: true, sy: 0.95 });
    const spots: [number, number][] = [[0, 0]];
    for (let k = 0; k < 5; k++) spots.push([0.7, (k / 5) * Math.PI * 2]);
    for (let k = 0; k < 6; k++) spots.push([1.05, (k / 6) * Math.PI * 2 + 0.5]);
    for (const [t, a] of spots) {
      const [x, y, z] = onDome(0.9, 0.855, 0.9, 0, 1.1, t, a);
      g.ball(t > 1 ? 0.11 : 0.14, x, y, z, 0xfbf8f0, 0, { sy: 0.45 });
    }
    return g.build();
  },
  dandelion: () => {
    const g = new G();
    // Rosette of leaves flat on the ground.
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + 0.3;
      const L = k % 2 ? 0.48 : 0.42;
      g.ball(L, Math.cos(a) * (L + 0.08), 0.05, Math.sin(a) * (L + 0.08), k % 2 ? 0x4f9f3a : 0x5fb44a, 0, { sy: 0.08, sz: 0.3, ry: -a });
    }
    // Stalks: one open flower, one bud.
    bond(g, [0, 0.05, 0], [0.1, 1.95, 0.05], 0.05, 0x7cc65a, 6);
    bond(g, [0, 0.05, 0], [-0.3, 1.2, -0.25], 0.04, 0x7cc65a, 6);
    g.ball(0.12, -0.3, 1.25, -0.25, 0x5fb44a, 0, { sy: 1.3 });
    g.ball(0.34, 0.1, 2.0, 0.05, WHITE, 1, { tint: true, sy: 0.6 });
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      g.ball(0.11, 0.1 + Math.cos(a) * 0.38, 1.97, 0.05 + Math.sin(a) * 0.38, 0xe0e0e0, 0, { tint: true, sy: 0.5 });
    }
    return g.build();
  },
  apple: () => {
    const g = new G();
    g.ball(0.9, 0, 0.86, 0, WHITE, 2, { tint: true, sy: 0.95 });
    g.cylB(0.22, 0.3, 0.06, 0, 1.68, 0, 0xb0b0b0, 8, { tint: true });
    g.cylB(0.045, 0.06, 0.3, 0.02, 1.66, 0, 0x6a4424, 5);
    g.ball(0.26, 0.24, 1.86, 0.1, 0x5cbf4a, 0, { sx: 1.5, sy: 0.18, sz: 0.7, ry: 0.5 });
    g.ball(0.22, -0.32, 1.38, -0.32, 0xfff2e6, 0, { sy: 0.6 });
    return g.build();
  },
  anthill: () => {
    const g = new G();
    g.dome(2.0, 0, 0, 0, SOIL, 18, 7, { sy: 0.72 });
    g.cylB(0.62, 0.85, 0.22, 0, 1.24, 0, 0xae8656, 12);
    g.cylB(0.32, 0.38, 0.03, 0, 1.45, 0, 0x2a1a10, 10);
    // Grains of soil carried up and dropped over the mound.
    for (let k = 0; k < 22; k++) {
      const t = 0.35 + (k % 4) * 0.28;
      const a = k * 2.39996;
      const [x, y, z] = onDome(2.0, 1.44, 2.0, 0, 0, t, a);
      g.ball(0.13 + (k % 3) * 0.04, x, y, z, [0x8a643a, 0xc09060, 0x6e5034][k % 3], 0);
    }
    return g.build();
  },
  frog: () => {
    const g = new G();
    const GREEN = 0x5cbf4a;
    const DARK = 0x3f9a3a;
    // Sitting body, pale belly, broad head.
    g.ball(0.65, -0.15, 0.55, 0, GREEN, 1, { sx: 1.3, sy: 0.8, sz: 1.05 });
    g.ball(0.5, 0.1, 0.38, 0, 0xd8f0a0, 1, { sx: 1.1, sy: 0.6, sz: 0.95 });
    g.ball(0.45, 0.55, 0.66, 0, GREEN, 1, { sy: 0.7, sz: 1.2 });
    g.box(0.04, 0.05, 0.7, 0.98, 0.58, 0, 0x2f6a2a);
    // Spots on the back.
    for (const [x, z] of [
      [-0.4, 0.25],
      [-0.1, -0.3],
      [-0.6, -0.2],
      [0.1, 0.32],
    ]) {
      g.ball(0.12, x, 0.98, z, DARK, 0, { sy: 0.4 });
    }
    // Bulging eyes.
    for (const s of [-1, 1]) {
      g.ball(0.2, 0.62, 1.02, s * 0.3, 0xc8f07a, 1);
      g.ball(0.11, 0.72, 1.08, s * 0.32, BLACK, 0);
      g.ball(0.04, 0.78, 1.14, s * 0.28, WHITE, 0);
    }
    // Folded back legs and front feet.
    for (const s of [-1, 1]) {
      g.ball(0.32, -0.42, 0.28, s * 0.58, GREEN, 1, { sx: 1.5, sy: 0.7 });
      g.ball(0.2, -0.1, 0.06, s * 0.72, DARK, 0, { sx: 1.6, sy: 0.3 });
      g.box(0.12, 0.4, 0.12, 0.55, 0.2, s * 0.42, GREEN, { rz: -0.25 });
      g.ball(0.13, 0.66, 0.04, s * 0.48, DARK, 0, { sx: 1.5, sy: 0.3 });
    }
    return g.build();
  },
  sneaker: () => {
    const g = new G();
    const UP = WHITE;
    // Sole with a rounded toe (+X) and heel, dark tread underneath.
    g.boxB(2.9, 0.08, 1.56, 0, 0, 0, 0x8c8c8c);
    g.boxB(2.9, 0.26, 1.6, 0, 0.06, 0, 0xf4f2ec);
    for (const x of [1.45, -1.45]) {
      g.cylB(0.78, 0.78, 0.08, x, 0, 0, 0x8c8c8c, 14);
      g.cylB(0.8, 0.8, 0.26, x, 0.06, 0, 0xf4f2ec, 14);
    }
    // Upper: toe box, vamp and a high heel collar, tinted.
    g.ball(0.72, 1.2, 0.5, 0, UP, 1, { tint: true, sx: 1.3, sy: 0.6, sz: 1.0 });
    g.boxB(2.4, 0.62, 1.4, -0.5, 0.32, 0, UP, { tint: true });
    g.boxB(1.3, 0.55, 1.42, -1.45, 0.75, 0, UP, { tint: true });
    g.cylB(0.7, 0.7, 1.0, -1.55, 0.3, 0, UP, 14, { tint: true, sz: 1.01 });
    // Ankle opening and padded rim.
    g.cylB(0.5, 0.5, 0.06, -1.42, 1.28, 0, 0x34302c, 12, { sx: 1.35 });
    torus(g, 0.55, 0.08, -1.42, 1.3, 0, 0xf4f2ec, { sx: 1.35 }, 24);
    // Tongue and laces down the instep.
    g.box(1.3, 0.12, 0.74, -0.35, 1.02, 0, 0xf4f2ec, { rz: -0.42 });
    for (let k = 0; k < 4; k++) {
      const x = -0.75 + k * 0.33;
      g.box(0.08, 0.06, 0.86, x, 1.1 - (x + 0.35) * Math.tan(0.42), 0, WHITE, { rz: -0.42 });
    }
    // Side stripe and a heel tab.
    for (const s of [-1, 1]) g.box(1.7, 0.16, 0.03, -0.35, 0.6, s * 0.715, 0xf4f2ec, { rz: 0.28 });
    g.boxB(0.12, 0.6, 0.5, -2.2, 0.5, 0, 0xf4f2ec);
    return g.build();
  },
};
