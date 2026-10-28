import * as THREE from 'three';
import { G, bond, torus } from './kit';
import { spots } from './solar';

const SNOW = 0xf4f8fb;
const SAND = 0xf2dca0;
const LEAF = 0x4caf50;
const LEAF_DARK = 0x2f8a4a;
const PINE = 0x237a3a;
const ROCK = 0x8a7560;
const SEA_FOAM = 0xd8f3ff;

/**
 * A band along a spiral round the origin: a flattened tube from radius r0 at angle a0 out to r1,
 * `turn` radians further on, its centre line falling from y0 to y1 (hurricane bands, galaxy arms).
 */
export function spiralArm(g: G, a0: number, turn: number, r0: number, r1: number, y0: number, y1: number, thick: number, color: number, flat = 0.45, seg = 18): G {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const a = a0 + t * turn;
    const r = r0 + (r1 - r0) * t;
    pts.push(new THREE.Vector3(Math.cos(a) * r, (y0 + (y1 - y0) * t) / flat, Math.sin(a) * r));
  }
  return g.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, thick, 5, false), color, 0, 0, 0, { sy: flat });
}

/** Small palm: a leaning trunk and a star of fronds, `s` tall, standing on y. */
function palm(g: G, x: number, y: number, z: number, s: number, lean = 0.25): G {
  g.cylB(0.035 * s, 0.05 * s, 0.75 * s, x, y, z, 0x9c7a4a, 5, { rz: -lean });
  const tx = x + Math.sin(lean) * 0.75 * s;
  const ty = y + Math.cos(lean) * 0.75 * s;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.box(0.5 * s, 0.03 * s, 0.13 * s, tx + Math.cos(a) * 0.2 * s, ty, z + Math.sin(a) * 0.2 * s, 0x3f9a3a, { ry: -a, rz: -0.3 });
  }
  return g;
}

/** A tiny house: walls and a gabled roof, `s` wide. */
function hut(g: G, x: number, y: number, z: number, s: number, wall: number, roof: number, ry = 0): G {
  g.boxB(0.36 * s, 0.22 * s, 0.26 * s, x, y, z, wall, { ry });
  g.roof(0.4 * s, 0.3 * s, 0.14 * s, x, y + 0.22 * s, z, roof, { ry });
  return g;
}

/** Snow-capped peak: a cone with a white tip on the same slope. */
function peak(g: G, x: number, y: number, z: number, r: number, h: number, rock: number, seg = 6, ry = 0): G {
  g.cone(r, h, x, y + h / 2, z, rock, seg, { ry });
  const ch = h * 0.34;
  g.cone(r * (ch / h) * 1.06, ch, x, y + h - ch / 2 + 0.005, z, SNOW, seg, { ry });
  return g;
}

export const EARTH_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  village: () => {
    const g = new G();
    // Fields and lanes round a little church.
    g.cylB(1.25, 1.28, 0.05, 0, 0, 0, 0x8fc25a, 10);
    g.boxB(1.0, 0.06, 0.5, -0.55, 0.0, 0.55, 0xd9c26a).boxB(0.6, 0.06, 0.7, 0.6, 0.0, -0.55, 0xb7d86a);
    g.boxB(2.3, 0.07, 0.12, 0, 0, 0.05, 0xc9b48a).boxB(0.12, 0.07, 2.2, -0.1, 0, 0, 0xc9b48a);
    const walls = [0xfff3d6, 0xffd6a5, 0xf7e1a1, 0xffffff];
    const roofs = [0xc0583e, 0xe84a4a, 0xa83232, 0x8a5a33];
    const spots: [number, number, number][] = [
      [0.35, 0.35, 0.2], [0.65, 0.3, -0.1], [0.4, -0.3, 1.4], [-0.45, -0.35, 0.3], [-0.75, -0.2, 1.6],
      [-0.4, 0.42, 0.1], [0.2, 0.75, 1.5], [-0.75, 0.25, -0.2], [0.85, -0.3, 1.5], [0.15, -0.7, 0.4],
    ];
    spots.forEach(([x, z, ry], i) => hut(g, x, 0.05, z, 1, walls[i % walls.length], roofs[(i * 3) % roofs.length], ry));
    // Church with a spire.
    g.boxB(0.5, 0.3, 0.28, 0.05, 0.05, -0.05, 0xf4ede0).roof(0.52, 0.32, 0.16, 0.05, 0.35, -0.05, 0x5a6270);
    g.boxB(0.16, 0.42, 0.16, -0.25, 0.05, -0.05, 0xf4ede0).cone(0.13, 0.36, -0.25, 0.65, -0.05, 0x5a6270, 4, { ry: Math.PI / 4 });
    for (const [x, z] of [[-1.0, 0.6], [0.95, 0.6], [-0.2, -1.05], [0.75, -0.85]]) g.ball(0.15, x, 0.18, z, LEAF_DARK);
    return g.build();
  },

  forest: () => {
    const g = new G();
    g.cylB(1.42, 1.48, 0.06, 0, 0, 0, 0x2d6b2c, 10);
    // Pines and broadleaf trees mixed; the round crowns take the instance tint (autumn, boreal...).
    const trees: [number, number, number][] = [
      [0, 0, 1.1], [0.7, 0.3, 0.9], [-0.65, 0.5, 1.0], [0.25, -0.75, 0.95], [-0.45, -0.7, 0.85], [0.95, -0.45, 0.8],
      [-1.05, -0.1, 0.8], [0.15, 0.95, 0.85], [-0.25, 0.3, 0.9], [0.45, 0.65, 0.75], [-0.85, 0.85, 0.7], [0.75, 0.95, 0.65],
      [1.15, 0.15, 0.7], [-0.15, -1.15, 0.7], [-1.0, -0.75, 0.7], [0.6, -1.0, 0.7],
    ];
    trees.forEach(([x, z, s], i) => {
      if (i % 3 === 1) {
        g.cone(0.3 * s, 0.85 * s, x, 0.06 + 0.43 * s, z, i % 2 ? PINE : LEAF_DARK, 6);
      } else {
        g.cylB(0.04, 0.05, 0.25 * s, x, 0.06, z, 0x7a4e2a, 4);
        g.ball(0.32 * s, x, 0.06 + 0.5 * s, z, 0xe8e8e8, 0, { tint: true });
      }
    });
    return g.build();
  },

  city: () => {
    const g = new G();
    g.cylB(1.55, 1.58, 0.05, 0, 0, 0, 0x8f949b, 12);
    // Street grid.
    for (const s of [-0.55, 0.55]) g.boxB(3.0, 0.06, 0.08, 0, 0, s, 0x5a5f66).boxB(0.08, 0.06, 3.0, s, 0, 0, 0x5a5f66);
    const fac = [0xd9e2ec, 0xbcccdc, 0xf0e6d8, 0xc6d8e8, 0xe8d5c4, 0xdcd3f0];
    const glass = 0x3f7fb0;
    // Towers block by block, tallest near the middle.
    const blocks: [number, number, number, number][] = [];
    for (const bx of [-1.0, 0, 1.0]) for (const bz of [-1.0, 0, 1.0]) {
      if (Math.hypot(bx, bz) > 1.3) continue;
      const mid = 1 - Math.hypot(bx, bz) / 1.6;
      for (const [dx, dz] of [[-0.2, -0.2], [0.2, 0.2], [0.2, -0.2], [-0.2, 0.2]]) blocks.push([bx + dx, bz + dz, mid, blocks.length]);
    }
    for (const [x, z, mid, i] of blocks) {
      const h = 0.25 + mid * 1.1 * (0.5 + ((i * 37) % 10) / 14);
      const w = 0.26 + ((i * 13) % 5) * 0.02;
      g.boxB(w, h, w, x, 0.05, z, fac[i % fac.length]);
      g.boxB(w * 0.82, 0.05, w * 0.82, x, 0.05 + h, z, i % 3 ? glass : 0x9fb3c8);
    }
    // The landmark spire.
    g.boxB(0.34, 1.75, 0.34, 0.05, 0.05, 0.05, 0x7ec8f0).boxB(0.22, 0.25, 0.22, 0.05, 1.8, 0.05, 0xc4c9d0).cylB(0.02, 0.04, 0.15, 0.05, 2.05, 0.05, 0xe84a4a, 4);
    for (const [x, z] of [[1.2, 0.75], [-1.25, -0.6], [0.7, -1.25], [-0.6, 1.25]]) g.ball(0.17, x, 0.15, z, LEAF);
    return g.build();
  },

  mountain: () => {
    const g = new G();
    g.cylB(1.38, 1.42, 0.08, 0, 0, 0, 0x5f8f4a, 9);
    peak(g, -0.15, 0.05, 0.05, 1.15, 2.1, ROCK, 6);
    peak(g, 0.75, 0.05, 0.55, 0.65, 1.3, 0x7a6a58, 5, 0.4);
    peak(g, 0.55, 0.05, -0.75, 0.55, 1.05, 0x9a8670, 5, 1.1);
    peak(g, -0.85, 0.05, -0.6, 0.5, 0.95, 0x7a6a58, 5, 0.7);
    return g.build();
  },

  rainforest: () => {
    const g = new G();
    g.cylB(1.65, 1.7, 0.06, 0, 0, 0, 0x1f5a2a, 12, { sz: 0.84 });
    // A brown river winds through the canopy.
    const river: [number, number][] = [[-1.9, 0.4], [-1.1, 0.1], [-0.4, 0.45], [0.35, 0.1], [1.05, -0.35], [1.85, -0.2]];
    for (let i = 0; i + 1 < river.length; i++) {
      const [x0, z0] = river[i];
      const [x1, z1] = river[i + 1];
      g.boxB(Math.hypot(x1 - x0, z1 - z0) + 0.1, 0.08, 0.16, (x0 + x1) / 2, 0, (z0 + z1) / 2, 0xa0805a, { ry: -Math.atan2(z1 - z0, x1 - x0) });
    }
    const greens = [0x1f7a3a, 0x2f8f3f, 0x3fa34a, 0x14612e, 0x4cb84a];
    let k = 0;
    for (let i = 0; i < 26; i++) {
      const a = i * 2.39996;
      const r = 1.45 * Math.sqrt((i + 0.5) / 26);
      const x = Math.cos(a) * r * 1.1;
      const z = Math.sin(a) * r * 0.95;
      // Leave the river open.
      const near = river.some(([rx, rz]) => Math.hypot(rx - x, rz - z) < 0.25);
      if (near) continue;
      const s = 0.28 + ((i * 7) % 5) * 0.03;
      g.ball(s, x, 0.25 + s * 0.6, z, greens[k++ % greens.length], 0, { sy: 0.75 });
    }
    // Morning mist over the trees.
    g.ball(0.3, -0.6, 0.95, -0.7, 0xf2f6f2, 0, { sx: 1.6, sy: 0.45 }).ball(0.25, 0.8, 0.95, 0.75, 0xf2f6f2, 0, { sx: 1.5, sy: 0.45 });
    return g.build();
  },

  volcano: () => {
    const g = new G();
    g.cylB(1.55, 1.6, 0.05, 0, 0, 0, 0x4f7a3a, 10);
    g.cyl(0.42, 1.38, 1.3, 0, 0.7, 0, 0x5a4a42, 9);
    g.cyl(0.4, 0.66, 0.3, 0, 1.2, 0, 0x463832, 9);
    // Lava in the crater and running down the slopes.
    g.cylB(0.34, 0.34, 0.06, 0, 1.31, 0, 0xff6a1a, 9).ball(0.18, 0, 1.36, 0, 0xffc040, 0, { sy: 0.5 });
    // Slope radius at height y, a little proud of the surface.
    const rho = (y: number) => 1.38 - ((y - 0.05) / 1.3) * 0.96 + 0.03;
    for (const [a, y1] of [[0.4, 0.3], [2.3, 0.5], [4.1, 0.35]] as const) {
      const p0: [number, number, number] = [Math.cos(a) * rho(1.28), 1.28, Math.sin(a) * rho(1.28)];
      const p1: [number, number, number] = [Math.cos(a + 0.15) * rho(y1), y1, Math.sin(a + 0.15) * rho(y1)];
      bond(g, p0, p1, 0.06, 0xff7a20, 4);
    }
    // Ash plume leaning downwind (-X).
    const puffs: [number, number, number, number][] = [[-0.05, 1.6, 0, 0.3], [-0.25, 1.9, 0.05, 0.36], [-0.55, 2.1, -0.05, 0.38], [-0.95, 2.2, 0.05, 0.34]];
    puffs.forEach(([x, y, z, r], i) => g.ball(r, x, y, z, i % 2 ? 0x8a8a8f : 0x6e6e74, 0));
    return g.build();
  },

  pyramids: () => {
    const g = new G();
    g.boxB(3.5, 0.05, 2.7, 0, 0, 0, 0xe8cf8f);
    // The Nile and its green banks along the -X edge.
    g.boxB(0.6, 0.06, 2.7, -1.45, 0, 0, 0x6fb24a).boxB(0.22, 0.07, 2.7, -1.5, 0, 0, 0x3d8fd0);
    // Khufu, Khafre and Menkaure on a diagonal, square bases aligned to the axes.
    const pyr: [number, number, number, number][] = [[0.75, -0.55, 0.95, 1.2], [-0.05, 0.25, 0.8, 1.0], [-0.65, 0.85, 0.48, 0.6]];
    for (const [x, z, r, h] of pyr) {
      g.cone(r, h, x, 0.05 + h / 2, z, 0xe0b866, 4, { ry: Math.PI / 4 });
      g.cone(r * 0.12, h * 0.12, x, 0.05 + h * 0.94, z, 0xfff0b0, 4, { ry: Math.PI / 4 });
    }
    // The Sphinx facing the river.
    g.boxB(0.36, 0.1, 0.14, -0.6, 0.05, -0.4, 0xd4a858).boxB(0.12, 0.14, 0.12, -0.74, 0.05, -0.4, 0xd4a858);
    palm(g, -1.15, 0.05, 0.9, 0.7).ball(0.12, -1.2, 0.15, -0.9, 0x3f9a3a);
    return g.build();
  },

  oilrig: () => {
    const g = new G();
    torus(g, 0.72, 0.035, 0, 0.02, 0, SEA_FOAM, {}, 20);
    for (const [x, z] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) g.cylB(0.07, 0.09, 0.85, x, 0, z, 0xf5c542, 6);
    g.boxB(1.25, 0.16, 1.25, 0, 0.85, 0, 0x8c939d).boxB(1.1, 0.2, 0.55, -0.05, 1.01, -0.3, 0xf7f7f2);
    // Derrick, helipad, crane and the gas flare boom.
    g.cone(0.26, 0.75, -0.3, 1.38, 0.3, 0xe84a4a, 4, { ry: Math.PI / 4 });
    g.cylB(0.3, 0.3, 0.04, 0.38, 1.21, 0.32, 0x2d3748, 10).boxB(0.16, 0.01, 0.04, 0.38, 1.25, 0.32, 0xf5c542);
    g.box(0.06, 0.06, 0.6, 0.2, 1.3, -0.35, 0xf58a2c, { rx: -0.5 });
    g.box(0.45, 0.05, 0.05, 0.72, 1.0, -0.2, 0xc4c9d0, { rz: 0.35 });
    g.ball(0.11, 0.9, 1.1, -0.2, 0xff8a2e, 0).ball(0.07, 0.9, 1.22, -0.2, 0xffd040, 0);
    return g.build();
  },

  whale: () => {
    const g = new G();
    // Foam where it breaks the surface.
    torus(g, 0.75, 0.04, 0.05, 0.02, 0, SEA_FOAM, { sx: 1.55, sz: 0.74 }, 22);
    g.sphere(0.5, 0.0, 0.3, 0, 0x4a6f8f, 12, 8, { sx: 2.0, sy: 0.6, sz: 0.9 });
    g.sphere(0.36, 0.55, 0.32, 0, 0x55789a, 10, 7, { sx: 1.4, sy: 0.55, sz: 0.85 });
    g.cone(0.1, 0.22, -0.5, 0.6, 0, 0x3d5f7c, 5);
    // Long pectoral flippers and a pale throat stripe along the side.
    for (const z of [-1, 1]) g.box(0.42, 0.04, 0.16, 0.3, 0.22, z * 0.46, 0x5f86aa, { ry: z * 0.5 });
    g.sphere(0.3, 0.4, 0.38, 0, 0x6f92b4, 8, 5, { sx: 2.2, sy: 0.35, sz: 0.5 });
    // Tail flukes at the back (-X).
    g.box(0.3, 0.06, 0.18, -0.95, 0.3, 0, 0x3d5f7c);
    g.box(0.26, 0.05, 0.5, -1.08, 0.32, 0.22, 0x3d5f7c, { ry: 0.5 }).box(0.26, 0.05, 0.5, -1.08, 0.32, -0.22, 0x3d5f7c, { ry: -0.5 });
    // Blow spout.
    g.ball(0.07, 0.55, 0.6, 0, 0xe6f8ff, 0).ball(0.1, 0.52, 0.72, 0.05, 0xffffff, 0).ball(0.08, 0.5, 0.82, -0.06, 0xe6f8ff, 0);
    return g.build();
  },

  iceberg: () => {
    const g = new G();
    // Pale shelf under the water, then the white berg.
    g.cylB(1.02, 1.05, 0.03, 0, 0, 0, 0x9fe3f0, 8, { sz: 0.74 });
    g.ball(0.62, -0.15, 0.3, 0, SNOW, 0, { sx: 1.35, sy: 0.55, sz: 1.0 });
    g.ball(0.42, 0.5, 0.28, 0.2, 0xe2f2fa, 0, { sx: 1.1, sy: 0.65 });
    g.boxB(0.5, 0.55, 0.45, -0.2, 0.1, -0.1, 0xffffff, { ry: 0.5 });
    g.cone(0.32, 0.5, 0.2, 0.62, -0.15, 0xffffff, 5);
    g.ball(0.25, -0.75, 0.15, -0.3, 0xc4e6f5, 0, { sy: 0.6 });
    return g.build();
  },

  island: () => {
    const g = new G();
    g.cylB(1.68, 1.7, 0.03, 0, 0, 0, 0x4fd6d0, 14, { sz: 0.82 });
    g.cylB(1.28, 1.35, 0.1, 0, 0.0, 0, SAND, 12, { sz: 0.78 });
    g.dome(0.85, -0.15, 0.1, -0.05, 0x4caf50, 10, 4, { sy: 0.5, sz: 0.85 });
    g.dome(0.45, -0.3, 0.3, 0.05, 0x3f9a3a, 8, 3, { sy: 0.6 });
    palm(g, 0.75, 0.1, 0.35, 1.3, 0.35);
    palm(g, 0.55, 0.1, -0.55, 1.1, 0.2);
    palm(g, -0.95, 0.1, 0.45, 1.0, -0.3);
    hut(g, 0.45, 0.1, 0.1, 0.9, 0xd9b77a, 0xa8703f, 0.4);
    return g.build();
  },

  cloud: () => {
    const g = new G();
    // Floats well above the ground: its shadow drifts under it.
    const puffs: [number, number, number, number][] = [
      [0, 0.92, 0, 0.48], [0.62, 0.82, 0.12, 0.38], [-0.62, 0.84, -0.08, 0.4], [0.25, 0.95, -0.35, 0.34],
      [-0.3, 0.98, 0.32, 0.36], [1.02, 0.72, -0.1, 0.26], [-1.05, 0.74, 0.2, 0.26],
    ];
    puffs.forEach(([x, y, z, r], i) => g.ball(r, x, y, z, i % 3 === 2 ? 0xe6eef7 : 0xffffff, 1, { sy: 0.8 }));
    g.ball(0.5, 0, 0.7, 0, 0xd6e2ee, 0, { sx: 2.0, sy: 0.35, sz: 1.2 });
    return g.build();
  },

  hurricane: () => {
    const g = new G();
    // Spiral bands of cloud winding into a dense core round a clear eye.
    g.sphere(0.66, 0, 0.32, 0, 0xffffff, 12, 8, { sy: 0.45 });
    g.cylB(0.15, 0.15, 0.03, 0, 0.6, 0, 0x2a6fb0, 10);
    torus(g, 0.2, 0.06, 0, 0.62, 0, 0xf2f6fa, {}, 16);
    for (let arm = 0; arm < 3; arm++) {
      const a0 = (arm / 3) * Math.PI * 2;
      spiralArm(g, a0, 2.0, 0.45, 1.3, 0.42, 0.34, 0.28, arm === 1 ? 0xeef3f8 : 0xffffff);
      spiralArm(g, a0 + 1.95, 1.7, 1.26, 2.05, 0.34, 0.27, 0.17, 0xdfe8f1);
    }
    return g.build();
  },

  spacestation: () => {
    const g = new G();
    // Truss along Z, pressurised modules along X, four pairs of big solar wings, white radiators.
    g.box(0.2, 0.2, 4.0, 0, 0.4, 0, 0xc4c9d0);
    g.cyl(0.28, 0.28, 2.2, 0, 0.4, 0, 0xeae6dc, 10, { rz: Math.PI / 2 });
    g.cyl(0.24, 0.24, 0.8, 0.6, 0.4, 0.45, 0xf7f7f2, 10);
    g.cyl(0.24, 0.24, 0.8, -0.5, 0.4, -0.45, 0xf7f7f2, 10);
    g.ball(0.16, 1.15, 0.4, 0, 0x7ec8f0, 1);
    for (const z of [-1.6, -0.9, 0.9, 1.6]) for (const s of [-1, 1]) g.box(1.3, 0.04, 0.55, s * 0.8, 0.42, z, 0x22337a);
    for (const z of [-1.6, -0.9, 0.9, 1.6]) for (const s of [-1, 1]) g.box(1.3, 0.05, 0.05, s * 0.8, 0.43, z, 0xf0c040);
    for (const z of [-0.45, 0.45]) g.box(0.5, 0.03, 0.22, -0.45 * Math.sign(z), 0.5, z * 1.35, 0xf7f7f2);
    return g.build();
  },

  luna: () => {
    const g = new G();
    g.sphere(0.98, 0, 1.0, 0, 0xc9c6c0, 14, 9);
    // Dark maria and the bright craters on the side we see.
    spots(g, 0.98, 0, 1.0, 0, [
      [0.4, 0.5, 0.2, 0.36], [-0.3, 0.4, -0.35, 0.42], [-0.05, 0.6, 0.05, 0.22], [0.1, 0.25, -0.65, 0.24],
      [-0.55, 0.2, 0.5, 0.22], [0.7, 0.05, -0.3, 0.2], [-0.1, 0.7, 0.4, 0.16], [0.55, -0.1, 0.6, 0.17],
    ], [0x8e8b86, 0x8e8b86, 0x9a968f, 0xa9a6a0, 0xa9a6a0, 0xb4b0a8, 0xe6e2da, 0xa9a6a0]);
    return g.build();
  },
};
