import * as THREE from 'three';
import { type PartOpts } from '../geo';
import { G, chain, spikes, torus } from './kit';

/**
 * Sphere of radius `r` at (x, y, z) made of latitude bands, one colour each from pole to pole (a
 * banded gas giant). `o` tilts it: rx = 1 leans the poles toward the viewer.
 */
export function bandedSphere(g: G, r: number, x: number, y: number, z: number, cols: number[], ws = 14, o: PartOpts = {}): G {
  const n = cols.length;
  const hs = Math.max(1, Math.round(9 / n));
  for (let i = 0; i < n; i++) {
    g.add(new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, (i / n) * Math.PI, Math.PI / n), cols[i], x, y, z, o);
  }
  return g;
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Patches painted on a sphere of radius `r` centred at (x, y, z): caps lying just on its surface
 * in the given directions (craters, continents, storms). Each spot is [dx, dy, dz, radius].
 */
export function spots(g: G, r: number, x: number, y: number, z: number, list: [number, number, number, number][], color: number | number[]): G {
  list.forEach(([dx, dy, dz, s], i) => {
    const geo = new THREE.SphereGeometry(r * (1.012 + i * 0.004), 10, 2, 0, Math.PI * 2, 0, Math.min(1.3, s / r));
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(dx, dy, dz).normalize()));
    g.add(geo, Array.isArray(color) ? color[i % color.length] : color, x, y, z);
  });
  return g;
}

/** Cratered rocky ball resting on the ground. */
function rocky(r: number, base: number, crater: number, list: [number, number, number, number][]): THREE.BufferGeometry {
  const g = new G();
  g.sphere(r, 0, r + 0.02, 0, base, 14, 9);
  spots(g, r, 0, r + 0.02, 0, list, crater);
  return g.build();
}

const CRATERS: [number, number, number, number][] = [
  [0.3, 0.8, 0.2, 0.2], [-0.4, 0.7, -0.3, 0.24], [0.1, 0.5, -0.8, 0.16], [-0.6, 0.5, 0.5, 0.15],
  [0.75, 0.4, -0.35, 0.14], [0.2, 0.9, 0.55, 0.12], [-0.8, 0.3, -0.1, 0.13], [0.55, 0.3, 0.75, 0.13],
];

export const SOLAR_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  spacejunk: () => {
    const g = new G();
    // A spent tank, a torn solar panel and loose bits, tumbling.
    g.cyl(0.15, 0.15, 0.55, 0.15, 0.22, 0.12, 0xe8e8e8, 8, { rz: Math.PI / 2 + 0.3, ry: 0.4, tint: true });
    g.cone(0.15, 0.14, 0.45, 0.31, 0.25, 0x8c939d, 8, { rz: -Math.PI / 2 + 0.3, ry: 0.4 });
    g.box(0.5, 0.03, 0.32, -0.3, 0.28, -0.18, 0x22337a, { rx: 0.5, rz: 0.3 });
    g.box(0.5, 0.035, 0.03, -0.3, 0.29, -0.18, 0xf0c040, { rx: 0.5, rz: 0.3 });
    g.box(0.36, 0.03, 0.03, -0.25, 0.12, 0.3, 0xc4c9d0, { ry: 0.8, rz: 0.4 });
    g.box(0.1, 0.1, 0.1, -0.5, 0.1, 0.25, 0xf58a2c, { rx: 0.6, ry: 0.3 }).box(0.08, 0.08, 0.08, 0.5, 0.12, -0.3, 0xc4c9d0, { rx: 0.3, rz: 0.7 });
    return g.build();
  },

  asteroid: () => {
    const g = new G();
    g.ball(0.5, -0.05, 0.42, 0, 0xc8c8c8, 0, { sx: 1.25, sy: 0.8, tint: true });
    g.ball(0.3, 0.38, 0.5, 0.18, 0xd8d8d8, 0, { tint: true });
    g.ball(0.22, -0.45, 0.35, -0.25, 0xb8b8b8, 0, { tint: true });
    // Dark pits in the top of the main lump.
    for (const [dx, dz, s] of [[0.15, 0.05, 0.1], [-0.25, -0.15, 0.09], [0.05, 0.22, 0.08]]) g.ball(s, -0.05 + dx, 0.78, dz, 0x707070, 0, { sy: 0.4, tint: true });
    return g.build();
  },

  probe: () => {
    const g = new G();
    // Voyager: a big white dish on a gold bus, booms out to the sides.
    g.cyl(0.26, 0.26, 0.2, 0, 0.45, 0, 0xc8a040, 10);
    g.cone(0.6, 0.2, 0, 0.66, 0, 0xf4f4f2, 14, { rx: Math.PI });
    g.cylB(0.025, 0.025, 0.3, 0, 0.62, 0, 0x3a3f47, 4).ball(0.05, 0, 0.94, 0, 0xc4c9d0, 0);
    // Magnetometer boom out the back, RTGs on one side, the science boom on the other.
    g.box(0.75, 0.025, 0.025, -0.55, 0.45, 0, 0xc4c9d0);
    g.box(0.03, 0.03, 0.4, 0, 0.42, 0.42, 0xc4c9d0);
    for (const z of [0.35, 0.47, 0.59]) g.cyl(0.06, 0.06, 0.1, 0, 0.42, z, 0x3a3f47, 6, { rx: Math.PI / 2 });
    g.box(0.03, 0.03, 0.42, 0, 0.42, -0.42, 0xc4c9d0).boxB(0.18, 0.14, 0.14, 0.02, 0.35, -0.62, 0x8c939d).ball(0.05, 0.1, 0.52, -0.62, 0x3a3f47, 0);
    return g.build();
  },

  comet: () => {
    const g = new G();
    // Icy nucleus in front (+X), a glowing coma and two tails streaming back.
    g.ball(0.36, 1.2, 0.45, 0, 0xbff4ff, 1);
    g.ball(0.2, 1.28, 0.6, 0, 0xffffff, 1);
    const n = 9;
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / n;
      const r = 0.34 + Math.sin(t * Math.PI * 0.8) * 0.12 - t * 0.12;
      const c = new THREE.Color(0xfff2c8).lerp(new THREE.Color(0x4a5a90), t * 0.85).getHex();
      g.ball(r, 1.1 - t * 2.4, 0.45, -t * t * 0.35, c, 0, { sy: 0.55 });
    }
    g.cone(0.17, 2.4, -0.05, 0.5, 0.12, 0x8fd8ff, 6, { rz: -Math.PI / 2, ry: -0.06 });
    chain(g, [0.9, 0.62, 0.12], [-1.2, 0.5, 0.3], 6, 0.05, 0xffffff);
    return g.build();
  },

  pluto: () => {
    const g = new G();
    g.sphere(0.7, 0, 0.72, 0, 0xd9b48c, 12, 8);
    // Tombaugh's heart and the dark Cthulhu belt.
    spots(g, 0.7, 0, 0.72, 0, [[-0.5, 0.6, -0.4, 0.3], [-0.2, 0.5, -0.75, 0.26], [0.35, 0.8, 0.15, 0.24], [0.15, 0.8, 0.45, 0.22], [0.5, 0.7, 0.45, 0.18]], [0x7a4a32, 0x7a4a32, 0xf6efe4, 0xf6efe4, 0xf6efe4]);
    return g.build();
  },

  mercury: () => rocky(0.82, 0x9e958c, 0x6f675f, CRATERS),

  mars: () => {
    const g = new G();
    const r = 0.92;
    g.sphere(r, 0, r + 0.02, 0, 0xd0603a, 14, 9);
    // Dark plains, a polar cap and the Valles Marineris scar.
    spots(g, r, 0, r + 0.02, 0, [[-0.4, 0.6, 0.3, 0.34], [0.5, 0.5, -0.4, 0.3], [0.1, 0.4, 0.8, 0.26], [-0.6, 0.3, -0.6, 0.24], [-0.3, 1, 0.1, 0.3]], [0x9a4228, 0x8a3a24, 0x9a4228, 0x8a3a24, 0xfaf4ee]);
    spots(g, r, 0, r + 0.02, 0, [[0.45, 0.75, 0.2, 0.09], [0.6, 0.6, 0.05, 0.08], [0.3, 0.85, 0.35, 0.08]], 0x6a2a1a);
    return g.build();
  },

  venus: () => {
    const g = new G();
    const r = 1.06;
    bandedSphere(g, r, 0, r + 0.02, 0, [0xf6e6bc, 0xe8cf94, 0xf3dfae, 0xdcbc7a, 0xf6e6bc, 0xe2c48a, 0xf3dfae], 14, { rx: 0.9, rz: 0.3 });
    return g.build();
  },

  earthplanet: () => {
    const g = new G();
    const r = 1.1;
    const y = r + 0.02;
    g.sphere(r, 0, y, 0, 0x2f7fd8, 14, 9);
    // Continents, a desert, the polar cap, then cloud wisps over it all.
    spots(g, r, 0, y, 0, [[0.5, 0.6, 0.3, 0.5], [0.75, 0.35, 0.55, 0.32], [-0.5, 0.6, -0.2, 0.46], [-0.3, 0.3, 0.8, 0.34], [0.2, 0.5, -0.8, 0.4], [0.62, 0.55, 0.2, 0.22], [-0.1, 1, 0.2, 0.36]], [0x4caf50, 0x5fbf4a, 0x3f9a3a, 0x4caf50, 0x5fbf4a, 0xd8c07e, 0xffffff]);
    spots(g, r * 1.03, 0, y, 0, [[0.1, 0.6, 0.5, 0.2], [-0.6, 0.4, 0.4, 0.18], [0.6, 0.5, -0.3, 0.19], [-0.2, 0.6, -0.6, 0.16]], 0xffffff);
    return g.build();
  },

  neptune: () => {
    const g = new G();
    const r = 1.24;
    const y = r + 0.04;
    bandedSphere(g, r, 0, y, 0, [0x5a86f0, 0x4a78ea, 0x3a66e0, 0x2f58cc, 0x3a66e0, 0x4a78ea, 0x5a86f0], 14, { rx: 0.6 });
    // The Great Dark Spot and bright methane clouds.
    spots(g, r, 0, y, 0, [[0.4, 0.6, 0.5, 0.32], [0.55, 0.55, 0.3, 0.14], [-0.5, 0.6, -0.2, 0.13], [-0.2, 0.8, 0.4, 0.1]], [0x1f3a8a, 0xeaf2ff, 0xeaf2ff, 0xeaf2ff]);
    return g.build();
  },

  uranus: () => {
    const g = new G();
    // Knocked on its side: the ring stands almost upright.
    const y = 1.82;
    bandedSphere(g, 1.18, 0, y, 0, [0xbff0f2, 0xa8e8ec, 0x9fe6ea, 0x92dce2, 0x9fe6ea, 0xa8e8ec], 14, { rz: 1.35 });
    torus(g, 1.72, 0.05, 0, y, 0, 0xdff8ff, { rz: 1.35 }, 36);
    torus(g, 1.5, 0.03, 0, y, 0, 0x7fc8d8, { rz: 1.35 }, 36);
    return g.build();
  },

  saturn: () => {
    const g = new G();
    const y = 1.32;
    bandedSphere(g, 1.2, 0, y, 0, [0xf2dfae, 0xe8cf94, 0xdcbc7a, 0xf0d9a0, 0xe2c48a, 0xf2dfae, 0xd8b878], 14, { rx: 0.35 });
    // Flat ring bands with the Cassini gap between them.
    torus(g, 1.72, 0.3, 0, y, 0, 0xe6cf9a, { sy: 0.1, rx: 0.35 }, 36);
    torus(g, 2.22, 0.24, 0, y, 0, 0xc9ae78, { sy: 0.1, rx: 0.35 }, 36);
    torus(g, 2.44, 0.05, 0, y, 0, 0xa89060, { sy: 0.3, rx: 0.35 }, 36);
    return g.build();
  },

  jupiter: () => {
    const g = new G();
    const r = 1.55;
    const y = r + 0.04;
    // Poles turned sideways so the cloud belts run across the top as stripes.
    bandedSphere(g, r, 0, y, 0, [0xe8d8c0, 0xc89a6a, 0xf2e6d0, 0xb87a4a, 0xf5ead8, 0xc0844f, 0xf0e2c8, 0xc89a6a, 0xe0ccb0], 14, { rx: Math.PI / 2 });
    // The Great Red Spot, just south of the equator on the side facing up.
    spots(g, r, 0, y, 0, [[0.25, 1, 0.2, 0.36], [0.25, 1, 0.2, 0.2]], [0xd06a48, 0xb8442e]);
    return g.build();
  },

  sun: () => {
    const g = new G();
    const y = 1.8;
    g.sphere(1.55, 0, y, 0, 0xffc23d, 14, 9);
    g.ball(0.55, -0.6, y + 0.65, -0.5, 0xfff2a8, 1);
    spots(g, 1.55, 0, y, 0, [[0.5, 0.7, 0.3, 0.16], [0.6, 0.6, 0.45, 0.12], [-0.3, 0.6, 0.7, 0.14]], 0xd8701a);
    spikes(g, 18, 1.45, 0.35, 0.16, 0, y, 0, 0xff8a2e);
    torus(g, 2.0, 0.07, 0, y, 0, 0xffe27a, { rx: 0.4 }, 36);
    return g.build();
  },
};
