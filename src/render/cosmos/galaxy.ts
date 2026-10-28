import type * as THREE from 'three';
import { G, cluster, torus } from './kit';
import { bandedSphere, spots } from './solar';

/** Diffraction spikes: a long cross and a short diagonal one through (x, y, z). */
function cross(g: G, x: number, y: number, z: number, len: number, w: number, color: number, tint = false): G {
  g.box(len, w * 0.6, w, x, y, z, color, { tint }).box(w, w * 0.6, len, x, y, z, color, { tint });
  g.box(len * 0.55, w * 0.5, w * 0.8, x, y, z, color, { ry: Math.PI / 4, tint }).box(len * 0.55, w * 0.5, w * 0.8, x, y, z, color, { ry: -Math.PI / 4, tint });
  return g;
}

/** Accretion disk round (x, y, z): flat rings from white hot inside to deep orange outside. */
function disk(g: G, x: number, y: number, z: number, rings: [number, number, number][], tilt: number, seg = 32): G {
  for (const [R, t, c] of rings) torus(g, R, t, x, y, z, c, { sy: 0.14, rx: tilt }, seg);
  return g;
}

export const GALAXY_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  star: () => {
    const g = new G();
    // The instance tint sets the colour: red, orange, yellow, white or blue.
    g.sphere(0.4, 0, 0.65, 0, 0xe8e8e8, 12, 8, { tint: true });
    cross(g, 0, 0.65, 0, 1.38, 0.07, 0xe8e8e8, true);
    return g.build();
  },

  browndwarf: () => {
    const g = new G();
    // A failed star: dim, banded like a gas giant, a faint ember glow round it.
    bandedSphere(g, 0.52, 0, 0.58, 0, [0x9a5a3e, 0x7a3f2e, 0xb06a44, 0x5e2f24, 0x9a5a3e, 0x7a3f2e], 12, { rx: 0.8 });
    torus(g, 0.62, 0.035, 0, 0.58, 0, 0xc0503a, { rx: 0.3 }, 24);
    return g.build();
  },

  whitedwarf: () => {
    const g = new G();
    g.ball(0.24, 0, 0.5, 0, 0xffffff, 2);
    // The shell it blew off as a planetary nebula: a glowing ring round the tiny hot core.
    torus(g, 0.46, 0.09, 0, 0.5, 0, 0x5fd0d8, { sy: 0.5, rx: 0.3 }, 28);
    torus(g, 0.56, 0.05, 0, 0.5, 0, 0xd070c0, { sy: 0.5, rx: 0.3 }, 28);
    return g.build();
  },

  pulsar: () => {
    const g = new G();
    const y = 0.6;
    g.ball(0.2, 0, y, 0, 0xf4fbff, 1);
    torus(g, 0.4, 0.03, 0, y, 0, 0x7fd4ff, { rx: 0.8 }, 24);
    torus(g, 0.32, 0.025, 0, y, 0, 0xb48cff, { rx: 0.8, ry: 1.2 }, 24);
    // Two lighthouse beams out of the magnetic poles, tipped a little off the spin axis.
    const b = 0.25;
    const L = 1.3;
    for (const s of [1, -1]) {
      const ox = Math.cos(b) * s;
      const oy = Math.sin(b) * s;
      g.cone(0.17, L, ox * L * 0.5, y + oy * L * 0.5, 0, 0xaee8ff, 8, { rz: s > 0 ? Math.PI / 2 + b : b - Math.PI / 2 });
      g.cone(0.07, L * 0.9, ox * L * 0.45, y + oy * L * 0.45, 0, 0xffffff, 6, { rz: s > 0 ? Math.PI / 2 + b : b - Math.PI / 2 });
    }
    return g.build();
  },

  redgiant: () => {
    const g = new G();
    const y = 1.12;
    const r = 1.05;
    g.sphere(r, 0, y, 0, 0xff5a2a, 14, 9);
    // Boiling convection cells, brighter and darker.
    const cells: [number, number, number, number, number][] = [
      [0.3, 0.9, 0.2, 0.3, 0xff8a4a], [-0.5, 0.7, -0.3, 0.32, 0xff7a3a], [0.2, 0.6, -0.7, 0.26, 0xd8401f], [-0.4, 0.6, 0.6, 0.28, 0xff9a5a],
      [0.8, 0.4, -0.2, 0.24, 0xd8401f], [-0.85, 0.3, 0.1, 0.22, 0xff8a4a], [0.55, 0.45, 0.65, 0.22, 0xd8401f],
    ];
    spots(g, r, 0, y, 0, cells.map(([dx, dy, dz, s]) => [dx, dy, dz, s * 1.2]), cells.map((c) => c[4]));
    torus(g, 1.15, 0.04, 0, y, 0, 0xffb07a, { rx: 0.5 }, 32);
    return g.build();
  },

  starcluster: () => {
    const g = new G();
    // A young open cluster: blue-white stars in the wisps of the cloud they formed from.
    for (const [x, z, s] of [[-0.5, 0.3, 0.38], [0.6, -0.2, 0.34], [0.1, 0.7, 0.3]] as const) g.ball(s, x, 0.12, z, 0x4a64a8, 1, { sy: 0.25, sx: 1.4 });
    const pts: [number, number, number][] = [
      [0, 0, 0.26], [0.55, 0.35, 0.2], [-0.6, -0.3, 0.22], [0.3, -0.75, 0.18], [-0.35, 0.75, 0.17], [0.95, -0.35, 0.15],
      [-1.0, 0.35, 0.15], [0.75, 0.85, 0.13], [-0.8, -0.85, 0.13], [1.15, 0.3, 0.12], [-0.2, -1.1, 0.12], [0.2, 1.15, 0.11],
      [-1.15, -0.2, 0.11], [0.45, 0.05, 0.12], [-0.3, 0.3, 0.13],
    ];
    const cols = [0xcfe6ff, 0xffffff, 0x9fc8ff, 0xfff2c0, 0xbfd8ff];
    pts.forEach(([x, z, s], i) => g.ball(s, x, 0.35 + ((i * 37) % 7) * 0.08, z, cols[i % cols.length], 1));
    return g.build();
  },

  nebula: () => {
    const g = new G();
    // Glowing gas in puffs, three dark dust pillars and the newborn stars inside.
    const puffs: [number, number, number, number][] = [
      [-1.2, -0.6, 0.85, 0xd04ad0], [-0.3, -0.9, 0.75, 0xff6ad5], [0.7, -0.6, 0.8, 0x7a3ad0], [1.5, -0.1, 0.65, 0x5a7aff],
      [-1.6, 0.4, 0.6, 0xff9a5a], [-0.7, 0.4, 0.85, 0xff6ad5], [0.3, 0.3, 0.9, 0x3ad0c8], [1.2, 0.8, 0.7, 0x5a7aff],
      [-0.1, 1.1, 0.6, 0xd04ad0], [0.95, -1.25, 0.5, 0xff6ad5], [-1.0, 1.25, 0.45, 0x3ad0c8], [1.8, 0.6, 0.4, 0xb48cff],
    ];
    puffs.forEach(([x, z, r, c], i) => g.ball(r, x, 0.35 + (i % 3) * 0.08, z, c, 1, { sy: 0.38 }));
    // A second, smaller layer of brighter cores.
    for (const [x, z, r, c] of [[-0.5, -0.4, 0.42, 0xffa8e8], [0.5, 0.2, 0.45, 0x8ff0e8], [1.25, 0.4, 0.32, 0xa8b8ff], [-1.2, 0.6, 0.3, 0xffc090]] as const) {
      g.ball(r, x, 0.62, z, c, 0, { sy: 0.4 });
    }
    for (const [x, z, h] of [[-0.25, -0.2, 1.1], [0.05, -0.05, 1.4], [0.35, -0.3, 0.95]]) g.cone(0.17, h, x, h / 2 + 0.05, z, 0x3a2030, 5);
    for (const [x, z] of [[-0.9, -0.2], [0.9, 0.0], [0.2, 0.9], [-0.4, 0.95], [1.4, -0.6]]) g.ball(0.08, x, 0.95, z, 0xffffff, 1);
    return g.build();
  },

  blackhole: () => {
    const g = new G();
    const y = 0.9;
    disk(g, 0, y, 0, [[0.82, 0.12, 0xfff6e0], [1.1, 0.15, 0xffd27a], [1.4, 0.15, 0xff9a3a], [1.68, 0.13, 0xd0502a]], 0.2, 24);
    g.sphere(0.55, 0, y, 0, 0x050308, 14, 9);
    // The disk's far side bent up over the top by the lensing, the photon ring and a jet.
    torus(g, 0.74, 0.07, 0, y, 0, 0xffe6a8, { rx: Math.PI / 2 }, 28);
    torus(g, 0.6, 0.03, 0, y, 0, 0xffffff, {}, 28);
    g.cone(0.08, 0.5, 0, y + 0.55 + 0.25, 0, 0x9fd4ff, 6);
    return g.build();
  },

  globular: () => {
    const g = new G();
    // An old, tight ball of thousands of stars: gold and orange, densest at the core.
    const y = 1.5;
    g.sphere(0.55, 0, y, 0, 0xfff6d8, 10, 7);
    const cols = [0xfff0c0, 0xffc070, 0xfff8e8, 0xffd890];
    cluster(44, 1.3).forEach(([x, py, z], i) => g.ball(0.1, x, y + py, z, cols[i % cols.length], 0));
    cluster(18, 0.82).forEach(([x, py, z], i) => g.ball(0.12, x, y + py, z, cols[(i + 2) % cols.length], 0));
    return g.build();
  },

  sgra: () => {
    const g = new G();
    // The galactic bulge (a bright bar inside a golden halo of stars) with the black hole on top.
    g.sphere(3.0, 0, 0.84, 0, 0xc88c3c, 14, 8, { sy: 0.28 });
    g.sphere(1.8, 0, 0.95, 0, 0xffcf70, 12, 8, { sx: 1.55, sy: 0.4, sz: 0.65, ry: 0.5 });
    g.sphere(1.25, 0, 1.0, 0, 0xfff0c0, 12, 8, { sy: 0.75 });
    const y = 2.2;
    disk(g, 0, y, 0, [[0.66, 0.1, 0xffffff], [0.9, 0.12, 0xffc860], [1.12, 0.1, 0xff8a3a]], 0.2, 22);
    g.sphere(0.42, 0, y, 0, 0x050308, 12, 8);
    torus(g, 0.52, 0.05, 0, y, 0, 0xffe6a8, { rx: Math.PI / 2 }, 24);
    for (let k = 0; k < 11; k++) {
      const a = k * 2.39996;
      const R = 2.2 + (k % 4) * 0.25;
      g.ball(0.11, Math.cos(a) * R, 0.55 + (k % 3) * 0.12, Math.sin(a) * R, k % 3 ? 0xffffff : 0xbfd8ff, 0);
    }
    return g.build();
  },
};
