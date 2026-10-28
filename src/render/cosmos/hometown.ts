import * as THREE from 'three';
import { G, torus } from './kit';

const WHITE = 0xffffff;
const OFFWHITE = 0xf4f2ec;
const CONCRETE = 0xd6d0c4;

/** Ring turned round Y from a profile of (radius, height) points, stretched `sx` along X. */
function lathe(g: G, prof: [number, number][], color: number, sx: number, tint = false, seg = 24): void {
  g.add(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg), color, 0, 0, 0, { sx, tint });
}

export const HOMETOWN_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  parasol: () => {
    const g = new G();
    // Towel on the sand beside the pole.
    g.boxB(0.6, 0.03, 1.1, 0.5, 0, 0.22, WHITE, { tint: true });
    g.boxB(0.6, 0.035, 0.12, 0.5, 0, -0.18, OFFWHITE);
    g.cylB(0.035, 0.035, 1.35, 0, 0, 0, OFFWHITE, 5);
    // Canopy of eight slices, white and the tint by turns.
    for (let k = 0; k < 8; k++) {
      const geo = new THREE.ConeGeometry(0.88, 0.38, 2, 1, false, (k / 8) * Math.PI * 2, Math.PI / 4);
      g.add(geo, WHITE, 0, 1.2, 0, { tint: k % 2 === 1 });
    }
    g.ball(0.06, 0, 1.43, 0, OFFWHITE, 0);
    return g.build();
  },
  sailboat: () => {
    const g = new G();
    // Hull with a pointed bow (+X), a tinted stripe and a wooden deck.
    g.boxB(1.6, 0.4, 0.9, -0.35, 0, 0, OFFWHITE);
    g.bow(0.85, 0.4, 0.9, 0.45, 0, 0, OFFWHITE);
    g.boxB(1.62, 0.1, 0.92, -0.35, 0.2, 0, WHITE, { tint: true });
    g.boxB(1.2, 0.06, 0.7, -0.35, 0.4, 0, 0xc89a62);
    // Mast, boom, mainsail (tinted) and jib.
    g.cylB(0.04, 0.04, 2.3, 0.1, 0.4, 0, 0xd0d0d0, 5);
    g.box(1.1, 0.05, 0.05, -0.45, 0.6, 0, 0x8c939d);
    g.wedge(1.1, 2.2, 0.04, -0.45, 0.58, 0, WHITE, { tint: true, ry: Math.PI });
    g.wedge(0.7, 1.75, 0.03, 0.45, 0.58, 0, OFFWHITE);
    return g.build();
  },
  stadium: () => {
    const g = new G();
    const SX = 1.28;
    // Outer wall and rim, then tiers of seats stepping down to the pitch (seats take the tint).
    lathe(g, [
      [2.1, 0],
      [2.1, 1.12],
      [1.96, 1.12],
    ], CONCRETE, SX);
    const tiers: [number, number][] = [
      [1.96, 0.96],
      [1.82, 0.8],
      [1.68, 0.64],
      [1.54, 0.48],
      [1.42, 0.32],
    ];
    let prev: [number, number] = [1.96, 1.12];
    tiers.forEach(([r, y], k) => {
      lathe(g, [prev, [prev[0], y]], CONCRETE, SX);
      lathe(g, [[prev[0], y], [r - 0.14, y]], k % 2 ? 0xc8c8c8 : WHITE, SX, true);
      prev = [r - 0.14, y];
    });
    lathe(g, [prev, [prev[0], 0.1]], CONCRETE, SX);
    // Pitch: mown stripes, halfway line, centre circle and goals.
    g.cylB(1.3, 1.3, 0.13, 0, 0, 0, 0x4caf50, 28, { sx: SX });
    for (let k = -3; k <= 3; k += 2) {
      const x = k * 0.36;
      const half = 1.28 * Math.sqrt(Math.max(0, 1 - (x / (1.3 * SX)) ** 2));
      g.boxB(0.36, 0.01, half * 2, x, 0.13, 0, 0x5fc062);
    }
    g.boxB(0.035, 0.012, 2.3, 0, 0.13, 0, WHITE);
    torus(g, 0.32, 0.02, 0, 0.14, 0, WHITE, {}, 24);
    for (const s of [-1, 1]) g.boxB(0.06, 0.16, 0.5, s * 1.5, 0.13, 0, WHITE);
    // Roof edge round the rim and floodlights on four masts.
    torus(g, 2.03, 0.05, 0, 1.13, 0, OFFWHITE, { sx: SX }, 28);
    for (const [x, z] of [
      [1.95, 1.5],
      [-1.95, 1.5],
      [1.95, -1.5],
      [-1.95, -1.5],
    ]) {
      g.cylB(0.05, 0.06, 1.25, x, 0, z, 0x8c939d, 5).box(0.28, 0.1, 0.28, x, 1.3, z, 0xfff2a8);
    }
    return g.build();
  },
};
