import * as THREE from 'three';
import { G, bond, cluster, spikes, torus } from './kit';
import { tube } from './molecular';

type V3 = [number, number, number];

/** Flat ring with a round tube (the kit's torus has a square section), lying in XZ. */
function roundRing(g: G, R: number, t: number, x: number, y: number, z: number, color: number, flat = 1): G {
  const geo = new THREE.TorusGeometry(R, t, 8, 24);
  geo.rotateX(Math.PI / 2);
  return g.add(geo, color, x, y, z, { sy: flat });
}

/** A short stubby limb from `a` to `b` with a rounded end. */
function limb(g: G, a: V3, b: V3, r: number, color: number): G {
  bond(g, a, b, r, color, 5);
  return g.ball(r * 1.05, b[0], b[1], b[2], color, 0);
}

export const MICROBIAL_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  phage: () => {
    const g = new G();
    // Bacteriophage T4: capsid head, ringed tail, base plate and six spidery legs.
    g.ball(0.46, 0, 1.82, 0, 0x8fd8f0, 0, { sy: 1.22 });
    g.ball(0.16, -0.14, 2.1, -0.16, 0xe0f8ff, 0);
    g.cylB(0.17, 0.21, 0.12, 0, 1.2, 0, 0x5aa8c8, 6);
    for (let i = 0; i < 6; i++) g.cylB(0.15, 0.15, 0.1, 0, 0.5 + i * 0.12, 0, i % 2 ? 0x74c0e0 : 0x4a90b8, 8);
    g.cylB(0.3, 0.3, 0.1, 0, 0.38, 0, 0x3a6f98, 6);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const hip: V3 = [c * 0.26, 0.44, s * 0.26];
      const knee: V3 = [c * 0.72, 0.66, s * 0.72];
      const foot: V3 = [c * 0.94, 0.05, s * 0.94];
      bond(g, hip, knee, 0.045, 0x2f5f88, 4);
      bond(g, knee, foot, 0.045, 0x2f5f88, 4);
      g.ball(0.07, knee[0], knee[1], knee[2], 0x5aa8c8, 0);
    }
    return g.build();
  },

  coccus: () => {
    const g = new G();
    // Streptococcus: a curved chain of round cells.
    for (let i = 0; i < 5; i++) {
      const t = i - 2;
      const x = t * 0.56;
      const z = 0.07 * t * t - 0.14;
      g.sphere(0.32, x, 0.34, z, 0xffffff, 10, 7, { tint: true });
      g.ball(0.08, x - 0.1, 0.56, z - 0.1, 0xffffff, 0);
    }
    return g.build();
  },

  bacterium: () => {
    const g = new G();
    // Rod-shaped cell (+X ahead) trailing three whip-like flagella.
    const y = 0.38;
    const r = 0.36;
    g.cyl(r, r, 1.4, 0.62, y, 0, 0xffffff, 10, { rz: Math.PI / 2, tint: true });
    g.sphere(r, -0.08, y, 0, 0xffffff, 10, 7, { tint: true }).sphere(r, 1.32, y, 0, 0xffffff, 10, 7, { tint: true });
    g.sphere(0.12, 0.62, y + 0.3, -0.1, 0xffffff, 8, 5, { sx: 6, sy: 0.35 });
    for (const [x, z] of [[0.25, 0.14], [1.0, 0.1]] as const) g.ball(0.1, x, y + 0.3, z, 0xf4ffe8, 0);
    for (const [z0, ph] of [[-0.14, 0], [0, 2], [0.14, 4]] as const) {
      const pts: V3[] = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        pts.push([-0.35 - t * 1.33, y - 0.05 - t * 0.12, z0 * (1 + t) + Math.sin(ph + t * Math.PI * 3) * 0.14 * t]);
      }
      tube(g, pts, 0.035, () => 0x8a4a6a, 4);
    }
    return g.build();
  },

  redcell: () => {
    const g = new G();
    // Biconcave disc: a fat red rim round a thin, darker dimple.
    roundRing(g, 0.58, 0.3, 0, 0.25, 0, 0xe0303a, 0.72);
    g.cylB(0.6, 0.6, 0.18, 0, 0.06, 0, 0xb81f2c, 16);
    return g.build();
  },

  platelet: () => {
    const g = new G();
    g.sphere(0.5, 0, 0.2, 0, 0xf5d67a, 10, 6, { sy: 0.36, sz: 0.8 });
    for (const [x, z, c] of [[0.15, 0.1, 0xb07cff], [-0.2, -0.05, 0x9b5de5], [0.05, -0.2, 0xd9a0ff], [-0.1, 0.22, 0xb07cff]] as const) g.ball(0.08, x, 0.33, z, c, 0);
    // Pseudopods: an activated platelet's little spikes.
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      const c = Math.cos(a);
      const s = Math.sin(a) * 0.8;
      g.cone(0.07, 0.34, c * 0.58, 0.16, s * 0.58, 0xf8e4a4, 5, { rz: -Math.PI / 2, ry: -Math.atan2(s, c) });
    }
    return g.build();
  },

  yeast: () => {
    const g = new G();
    // Budding yeast: a mother cell and her daughter, with old bud scars.
    g.sphere(0.62, -0.32, 0.58, 0, 0xf2dfa6, 12, 8, { sx: 1.1, sy: 0.92 });
    g.sphere(0.4, 0.62, 0.42, 0.08, 0xfaecc4, 10, 7);
    g.cylB(0.16, 0.18, 0.2, 0.26, 0.36, 0.04, 0xe8d090, 8, { rz: Math.PI / 2 });
    torus(g, 0.1, 0.03, -0.5, 1.12, -0.12, 0xc9a86a, { rz: 0.2 }, 10);
    torus(g, 0.09, 0.03, -0.2, 1.1, 0.22, 0xc9a86a, { rx: 0.25 }, 10);
    torus(g, 0.08, 0.03, -0.75, 0.95, 0.2, 0xc9a86a, { rz: 0.5, rx: 0.3 }, 10);
    return g.build();
  },

  pollengrain: () => {
    const g = new G();
    // Sunflower pollen: a golden spiky ball with pores.
    const y = 0.92;
    g.ball(0.68, 0, y, 0, 0xffb627, 1);
    spikes(g, 30, 0.64, 0.24, 0.075, 0, y, 0, 0xffd45a);
    for (const [x, yy, z] of cluster(5, 0.66).filter((p) => p[1] > -0.2)) g.ball(0.09, x, y + yy, z, 0xc86f10, 0);
    return g.build();
  },

  diatom: () => {
    const g = new G();
    // Centric diatom: a glass pillbox with radial ribs and a gold rim.
    g.cylB(1.05, 1.1, 0.34, 0, 0.02, 0, 0x7fd8cc, 24);
    torus(g, 1.06, 0.07, 0, 0.36, 0, 0xe8c35a, {}, 36);
    torus(g, 0.68, 0.05, 0, 0.37, 0, 0xbff2ea, {}, 30);
    g.cylB(0.24, 0.3, 0.1, 0, 0.36, 0, 0xf4fffb, 12);
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      g.box(0.68, 0.04, 0.05, Math.cos(a) * 0.66, 0.38, Math.sin(a) * 0.66, 0x3fa8a0, { ry: -a });
      const b = a + Math.PI / 18;
      g.ball(0.05, Math.cos(b) * 0.88, 0.38, Math.sin(b) * 0.88, 0xe8fffb, 0);
    }
    return g.build();
  },

  paramecium: () => {
    const g = new G();
    // Slipper-shaped ciliate (+X ahead): oral groove, purple nucleus, contractile vacuoles, cilia.
    const y = 0.45;
    g.sphere(1, 0, y, 0, 0xa8e6c8, 14, 9, { sx: 1.5, sy: 0.42, sz: 0.62 });
    g.sphere(0.35, 0.2, y + 0.18, 0.34, 0x6fbf98, 10, 6, { sx: 1.7, sy: 0.4 });
    g.sphere(0.3, -0.25, 0.78, -0.08, 0x9b7bd8, 10, 7, { sx: 1.4, sy: 0.6 });
    g.ball(0.13, 0.95, 0.74, -0.05, 0xeafff4, 1).ball(0.13, -0.95, 0.74, 0.05, 0xeafff4, 1);
    for (let k = 0; k < 34; k++) {
      const t = (k / 34) * Math.PI * 2;
      const nx = Math.cos(t) / 1.5;
      const nz = Math.sin(t) / 0.62;
      const nl = Math.hypot(nx, nz);
      const x = Math.cos(t) * 1.5 + (nx / nl) * 0.1;
      const z = Math.sin(t) * 0.62 + (nz / nl) * 0.1;
      g.box(0.22, 0.03, 0.03, x, y, z, 0xd8fff0, { ry: -Math.atan2(nz, nx) });
    }
    return g.build();
  },

  amoeba: () => {
    const g = new G();
    // A shapeless blob reaching out with pseudopods; nucleus and food vacuoles show through.
    const BODY = 0xb3c2f2;
    g.sphere(1, 0, 0.42, 0, BODY, 14, 8, { sx: 1.05, sy: 0.42 });
    const pods: [number, number, number][] = [
      [0.15, 1.55, 0.42],
      [1.35, 1.15, 0.36],
      [2.45, 1.45, 0.4],
      [3.55, 1.1, 0.34],
      [4.75, 1.4, 0.38],
    ];
    pods.forEach(([a, L, w], i) => {
      const c = Math.cos(a);
      const s = Math.sin(a);
      const col = i % 2 ? 0xa6b6ec : BODY;
      g.sphere(1, c * L * 0.55, 0.3, s * L * 0.55, col, 10, 6, { sx: L * 0.55, sy: 0.27, sz: w, ry: -a });
      g.sphere(w * 0.85, c * L, 0.24, s * L, col, 8, 6, { sy: 0.55 });
    });
    g.sphere(0.36, -0.2, 0.72, 0.15, 0x6a5acd, 10, 7, { sy: 0.6 });
    g.ball(0.13, -0.32, 0.86, 0.04, 0x9d8cf0, 0);
    for (const [x, z, r, c] of [[0.45, -0.3, 0.18, 0x7ed957], [0.3, 0.45, 0.15, 0xffd23d], [-0.55, -0.35, 0.16, 0xff8fa8]] as const) g.ball(r, x, 0.72, z, c, 1);
    g.ball(0.2, 0.62, 0.66, 0.12, 0xeef3ff, 1);
    return g.build();
  },

  whitecell: () => {
    const g = new G();
    // Lymphocyte: a big ruffled white ball, with a foot reaching out (+X).
    const y = 1.3;
    const R = 1.22;
    g.sphere(R, 0, y, 0, 0xece6ff, 14, 9);
    cluster(40, R * 0.98)
      .filter((p) => p[1] > -0.6)
      .forEach(([x, yy, z], i) => g.ball(0.19, x, y + yy, z, i % 3 ? 0xffffff : 0xd8ceff, 0));
    g.sphere(0.5, 0.85, 0.32, 0.25, 0xe2daff, 10, 7, { sx: 1.25, sy: 0.55 });
    return g.build();
  },

  tardigrade: () => {
    const g = new G();
    // Water bear: four plump segments, a round head with a snout, eight stubby clawed legs.
    const SKIN = 0xf4e3c6;
    const FOLD = 0xd8c09a;
    const y = 0.72;
    const segs: [number, number][] = [
      [-1.15, 0.55],
      [-0.5, 0.62],
      [0.15, 0.62],
      [0.75, 0.56],
    ];
    for (const [x, r] of segs) g.sphere(r, x, y, 0, SKIN, 10, 6, { sx: 0.78, sy: 0.86 });
    for (let i = 0; i + 1 < segs.length; i++) {
      const x = (segs[i][0] + segs[i + 1][0]) / 2;
      torus(g, 0.5, 0.045, x, y + 0.02, 0, FOLD, { rz: Math.PI / 2 }, 16);
    }
    g.sphere(0.46, 1.25, y + 0.06, 0, SKIN, 10, 7);
    g.cyl(0.16, 0.2, 0.22, 1.72, y - 0.02, 0, 0xe8c8a8, 8, { rz: -Math.PI / 2 });
    g.cyl(0.1, 0.1, 0.03, 1.84, y - 0.02, 0, 0x6a3a3a, 8, { rz: -Math.PI / 2 });
    g.ball(0.07, 1.55, y + 0.3, 0.2, 0x1e1e28, 0).ball(0.07, 1.55, y + 0.3, -0.2, 0x1e1e28, 0);
    g.ball(0.025, 1.6, y + 0.34, 0.17, 0xffffff, 0).ball(0.025, 1.6, y + 0.34, -0.23, 0xffffff, 0);
    // Legs: three pairs to the sides, the last pair pointing back.
    const legs: [V3, V3][] = [
      [[0.75, 0.42, 0.38], [0.85, 0.16, 0.82]],
      [[0.15, 0.42, 0.42], [0.18, 0.16, 0.86]],
      [[-0.5, 0.42, 0.42], [-0.55, 0.16, 0.86]],
      [[-1.3, 0.42, 0.3], [-1.62, 0.16, 0.52]],
    ];
    for (const [a, b] of legs)
      for (const s of [1, -1]) {
        const a2: V3 = [a[0], a[1], a[2] * s];
        const b2: V3 = [b[0], b[1], b[2] * s];
        limb(g, a2, b2, 0.15, SKIN);
        const dx = b[0] - a[0];
        const dz = (b[2] - a[2]) * s;
        const l = Math.hypot(dx, dz);
        for (const k of [-0.5, 0.5]) {
          const ang = Math.atan2(dz / l, dx / l) + k * 0.45;
          g.cone(0.025, 0.14, b2[0] + Math.cos(ang) * 0.17, 0.06, b2[2] + Math.sin(ang) * 0.17, 0x4a3030, 4, { rz: -Math.PI / 2, ry: -ang });
        }
      }
    return g.build();
  },

  dustmite: () => {
    const g = new G();
    // House dust mite: a ridged oval body, mouthparts ahead (+X), eight jointed legs, rear bristles.
    const BODY = 0xead6b0;
    const LEG = 0xc8a070;
    const y = 0.58;
    g.sphere(1, 0, y, 0, BODY, 14, 9, { sx: 1.1, sy: 0.55, sz: 0.85 });
    for (const z of [-0.5, -0.25, 0, 0.25, 0.5]) {
      const top = y + 0.55 * Math.sqrt(1 - (z / 0.85) ** 2);
      g.sphere(1, -0.05, top - 0.02, z, 0xd2b88a, 8, 4, { sx: 0.8, sy: 0.035, sz: 0.06 });
    }
    g.sphere(0.24, 1.12, 0.44, 0, 0xc89a6a, 8, 6, { sx: 1.3, sy: 0.7 });
    g.cone(0.06, 0.2, 1.4, 0.42, 0.08, 0xa87a4a, 5, { rz: -Math.PI / 2 }).cone(0.06, 0.2, 1.4, 0.42, -0.08, 0xa87a4a, 5, { rz: -Math.PI / 2 });
    const legs: [number, number][] = [
      [0.7, 0.9],
      [0.32, 0.45],
      [-0.32, -0.45],
      [-0.7, -0.9],
    ];
    for (const [x, fx] of legs)
      for (const s of [1, -1]) {
        const hip: V3 = [x, 0.42, 0.62 * s];
        const knee: V3 = [x + (fx - x) * 0.5, 0.62, 1.0 * s];
        const foot: V3 = [fx, 0.03, 1.2 * s];
        bond(g, hip, knee, 0.075, LEG, 5);
        bond(g, knee, foot, 0.06, LEG, 5);
        g.ball(0.09, knee[0], knee[1], knee[2], 0xb08858, 0);
      }
    for (const z of [-0.35, -0.12, 0.12, 0.35]) bond(g, [-1.0, 0.72, z], [-1.48, 1.02, z * 1.6], 0.025, 0xf6ead0, 3);
    return g.build();
  },

  sandgrain: () => {
    const g = new G();
    // A rounded quartz grain: a faceted amber pebble with a glassy facet.
    g.ball(0.6, 0, 0.44, 0, 0xe8c98a, 0, { sx: 1.15, sy: 0.72, sz: 0.98 });
    g.ball(0.3, 0.3, 0.66, 0.12, 0xf8e8c0, 0);
    g.ball(0.18, -0.42, 0.5, -0.25, 0xc9a560, 0);
    return g.build();
  },

  crumb: () => {
    const g = new G();
    // Bread crumb: pale soft crumb with a brown crust side and a few pores.
    g.ball(0.56, 0.08, 0.38, 0, 0xf0d9a8, 0, { sx: 1.1, sy: 0.66, sz: 0.88 });
    g.ball(0.44, -0.3, 0.36, 0.02, 0xb36f32, 0, { sx: 0.9, sy: 0.75, sz: 0.95 });
    for (const [x, z] of [[0.3, 0.1], [0.05, -0.22], [0.4, -0.18]] as const) g.ball(0.07, x, 0.71, z, 0xc9a26a, 0);
    return g.build();
  },
};
