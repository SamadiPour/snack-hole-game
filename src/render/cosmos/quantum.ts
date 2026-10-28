import type * as THREE from 'three';
import { G, chain, helix, spikes, torus } from './kit';

const RED = 0xff4d6d;
const GREEN = 0x4dff88;
const BLUE = 0x4d8dff;
const GLUE = 0xc8ff5a;

/** Three colour-charged quarks in a triangle, held by gluon springs, inside a ring. */
function baryon(ring: number, ring2: number | null, plus: boolean): THREE.BufferGeometry {
  const g = new G();
  const y = 0.62;
  const pts: [number, number, number][] = [0, 1, 2].map((k) => {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
    return [Math.cos(a) * 0.55, y, Math.sin(a) * 0.55];
  });
  [RED, GREEN, BLUE].forEach((c, k) => g.sphere(0.4, pts[k][0], pts[k][1], pts[k][2], c, 12, 8));
  for (let k = 0; k < 3; k++) chain(g, pts[k], pts[(k + 1) % 3], 5, 0.07, GLUE);
  torus(g, 1.1, 0.06, 0, y, 0, ring, {}, 36);
  if (ring2 !== null) torus(g, 1.1, 0.05, 0, y, 0, ring2, { rz: 0.45 }, 36);
  if (plus) g.box(0.4, 0.1, 0.1, 0, 1.38, 0, 0xffffff).box(0.1, 0.1, 0.4, 0, 1.38, 0, 0xffffff);
  return g.build();
}

export const QUANTUM_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  neutrino: () => {
    const g = new G();
    g.sphere(0.2, 0.25, 0.3, 0, 0xe8f6ff, 10, 7);
    // Faint wake behind it (-X).
    g.cone(0.14, 0.7, -0.2, 0.3, 0, 0x9fc6ff, 6, { rz: Math.PI / 2 });
    return g.build();
  },
  photon: () => {
    const g = new G();
    // A short wave packet along X: taller in the middle.
    const n = 13;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x = -0.8 + 1.6 * t;
      const env = Math.sin(Math.PI * t);
      g.ball(0.07 + 0.05 * env, x, 0.35 + Math.sin(t * Math.PI * 4) * 0.22 * env, 0, 0xfff27a);
    }
    g.ball(0.12, 0, 0.35, 0, 0xffffff, 1);
    return g.build();
  },
  quark: () => {
    const g = new G();
    g.sphere(0.48, 0, 0.55, 0, 0xffffff, 14, 9, { tint: true });
    g.ball(0.16, -0.18, 0.78, -0.18, 0xffffff, 1);
    torus(g, 0.62, 0.035, 0, 0.55, 0, 0xffffff, { rx: 0.5, rz: 0.3 }, 28);
    return g.build();
  },
  electron: () => {
    const g = new G();
    g.sphere(0.32, 0, 0.5, 0, 0x5fd8ff, 12, 8);
    g.ball(0.1, -0.1, 0.68, -0.12, 0xe6fbff, 1);
    torus(g, 0.55, 0.03, 0, 0.5, 0, 0xbff4ff, { rx: 1.1 }, 28);
    return g.build();
  },
  gluon: () => {
    const g = new G();
    helix(g, -0.85, 0.85, 0.32, 0, 0.2, 3, 30, 0.08, GLUE);
    g.ball(0.11, -0.9, 0.32, 0, 0xf4ffd0, 1).ball(0.11, 0.9, 0.32, 0, 0xf4ffd0, 1);
    return g.build();
  },
  pion: () => {
    const g = new G();
    g.sphere(0.4, -0.72, 0.48, 0, RED, 12, 8);
    // The antiquark carries the anti-colour.
    g.sphere(0.4, 0.72, 0.48, 0, 0x6ff7ff, 12, 8);
    helix(g, -0.35, 0.35, 0.48, 0, 0.13, 2, 14, 0.06, GLUE);
    return g.build();
  },
  higgs: () => {
    const g = new G();
    g.sphere(0.62, 0, 0.95, 0, 0xffd23d, 16, 10);
    g.ball(0.3, -0.2, 1.2, -0.2, 0xfff6c0, 1);
    spikes(g, 14, 0.55, 0.38, 0.09, 0, 0.95, 0, 0xffb02e);
    torus(g, 1.0, 0.05, 0, 0.95, 0, 0xfff2a8, { rx: 0.35 }, 36);
    return g.build();
  },
  proton: () => baryon(0xff9ec4, null, true),
  neutron: () => baryon(0xb8c4d6, 0x8e9ab0, false),
};
