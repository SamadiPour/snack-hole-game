import * as THREE from 'three';
import { G } from './geo';

/** Toy palette. */
const C = {
  white: 0xf7f7f2,
  offwhite: 0xeae6dc,
  black: 0x24262b,
  dark: 0x3a3f47,
  grey: 0x8c939d,
  lightgrey: 0xc4c9d0,
  steel: 0xa9b3bf,
  glass: 0x7ec8f0,
  glassDark: 0x3f7fb0,
  wood: 0xa8703f,
  woodDark: 0x7a4e2a,
  red: 0xe84a4a,
  darkred: 0xa83232,
  orange: 0xf58a2c,
  yellow: 0xf5c542,
  green: 0x4caf50,
  leaf: 0x5cbf4a,
  leafDark: 0x3f9a3a,
  pine: 0x2f8a4a,
  blue: 0x3b82f6,
  navy: 0x2a3f6e,
  skin: 0xf2c49b,
  brown: 0x8a5a33,
  pink: 0xff9ec4,
  purple: 0x9b5de5,
  stone: 0xd6d0c4,
  brick: 0xc0583e,
  gold: 0xf0c040,
  cyan: 0x45e0e8,
  lamp: 0xfff2a8,
};

type Builder = () => THREE.BufferGeometry;

function person(shirt: number, opts: { hat?: number; vest?: boolean; tint?: boolean; cap?: number } = {}): THREE.BufferGeometry {
  const g = new G();
  g.boxB(0.18, 0.82, 0.16, 0, 0, -0.1, C.navy).boxB(0.18, 0.82, 0.16, 0, 0, 0.1, C.navy);
  g.boxB(0.26, 0.62, 0.42, 0, 0.8, 0, shirt, { tint: opts.tint });
  g.boxB(0.14, 0.55, 0.12, 0, 0.85, -0.28, shirt, { tint: opts.tint }).boxB(0.14, 0.55, 0.12, 0, 0.85, 0.28, shirt, { tint: opts.tint });
  if (opts.vest) g.boxB(0.28, 0.4, 0.44, 0, 0.95, 0, C.orange);
  g.box(0.28, 0.3, 0.28, 0, 1.57, 0, C.skin);
  if (opts.hat !== undefined) g.cylB(0.2, 0.22, 0.14, 0, 1.71, 0, opts.hat, 10);
  else if (opts.cap !== undefined) g.boxB(0.34, 0.1, 0.32, 0.02, 1.72, 0, opts.cap);
  else g.boxB(0.3, 0.08, 0.3, -0.01, 1.72, 0, C.woodDark);
  return g.build();
}

function car(body: number, tint: boolean, extra?: (g: G) => void): THREE.BufferGeometry {
  const g = new G();
  g.boxB(4.1, 0.75, 1.85, 0, 0.3, 0, body, { tint });
  g.boxB(2.2, 0.55, 1.65, -0.25, 1.05, 0, C.glass);
  g.boxB(2.0, 0.1, 1.6, -0.25, 1.58, 0, body, { tint });
  g.box(0.06, 0.18, 0.4, 2.06, 0.75, -0.6, C.lamp).box(0.06, 0.18, 0.4, 2.06, 0.75, 0.6, C.lamp);
  g.box(0.06, 0.16, 0.36, -2.06, 0.78, -0.62, C.red).box(0.06, 0.16, 0.36, -2.06, 0.78, 0.62, C.red);
  for (const x of [-1.35, 1.35]) for (const z of [-0.85, 0.85]) g.wheel(0.38, 0.3, x, 0.38, z);
  extra?.(g);
  return g.build();
}

function bandedTower(g: G, w: number, d: number, y0: number, h: number, wall: number, glass: number, floor: number, tint: boolean): void {
  g.boxB(w, h, d, 0, y0, 0, wall, { tint });
  for (let y = y0 + floor * 0.45; y < y0 + h - floor * 0.4; y += floor) {
    g.boxB(w + 0.08, floor * 0.5, d + 0.08, 0, y, 0, glass);
  }
}

/**
 * Airliner, nose toward +X, in units of `scale`: fuselage radius 1 centred at y = 2, low wings
 * swept back, engines hanging under the wings, a swept fin and tailplane, and wheeled gear.
 */
function plane(scale: number, livery: number, engines: number, hump = false): THREE.BufferGeometry {
  const g = new G();
  const s = scale;
  const fy = 2.0 * s;
  // Fuselage with a nose cone (+X) and a tail cone (-X).
  g.cyl(1.0 * s, 1.0 * s, 13 * s, 0, fy, 0, C.white, 14, { rz: Math.PI / 2 });
  g.cone(1.0 * s, 2.0 * s, 7.5 * s, fy, 0, C.white, 14, { rz: -Math.PI / 2 });
  g.cone(1.0 * s, 2.4 * s, -7.7 * s, fy, 0, C.white, 14, { rz: Math.PI / 2 });
  // Livery cheat line and the row of cabin windows on both sides.
  g.box(12.6 * s, 0.22 * s, 2.03 * s, -0.2 * s, fy - 0.15 * s, 0, livery, { tint: true });
  g.box(10.5 * s, 0.13 * s, 2.02 * s, -0.4 * s, fy + 0.3 * s, 0, C.dark);
  if (hump) {
    // 747-style upper deck: a rounded hump over the front third, faired into the nose.
    g.cyl(0.72 * s, 0.72 * s, 4.6 * s, 3.5 * s, fy + 0.55 * s, 0, C.white, 12, { rz: Math.PI / 2 });
    g.cone(0.72 * s, 1.6 * s, 6.6 * s, fy + 0.55 * s, 0, C.white, 12, { rz: -Math.PI / 2 });
    g.cone(0.72 * s, 2.4 * s, 0.0, fy + 0.55 * s, 0, C.white, 12, { rz: Math.PI / 2 });
    g.box(0.4 * s, 0.24 * s, 1.0 * s, 6.1 * s, fy + 0.95 * s, 0, C.glassDark);
  } else {
    // Windshield on top of the nose cone, just poking through its surface.
    g.box(0.5 * s, 0.26 * s, 1.0 * s, 6.65 * s, fy + 0.82 * s, 0, C.glassDark);
  }
  // Wings: chord along X, span along Z, swept back (tips behind the roots).
  const sweep = 0.35;
  const wingX = -0.6 * s;
  const wingY = 1.55 * s;
  const span = 7.0 * s;
  const wingZ = 4.1 * s;
  for (const side of [-1, 1]) {
    g.box(3.2 * s, 0.16 * s, span, wingX, wingY, side * wingZ, C.offwhite, { ry: -side * sweep });
    g.box(1.4 * s, 0.12 * s, 2.6 * s, -7.4 * s, fy + 0.35 * s, side * 1.5 * s, C.offwhite, { ry: -side * 0.4 });
  }
  // Engines under the wings, slightly ahead of the leading edge.
  const wingCentreX = (z: number) => wingX - (Math.abs(z) - wingZ) * Math.tan(sweep);
  const engZ = (engines === 4 ? [-5.3, -2.9, 2.9, 5.3] : [-3.0, 3.0]).map((z) => z * s);
  for (const z of engZ) {
    const x = wingCentreX(z) + 1.1 * s;
    g.cyl(0.4 * s, 0.46 * s, 1.9 * s, x, 1.05 * s, z, C.lightgrey, 12, { rz: Math.PI / 2 });
    g.cyl(0.36 * s, 0.36 * s, 0.05 * s, x + 0.96 * s, 1.05 * s, z, C.dark, 12, { rz: Math.PI / 2 });
    g.box(0.9 * s, 0.35 * s, 0.12 * s, x - 0.1 * s, 1.4 * s, z, C.lightgrey);
  }
  // Swept fin: tall at the tail, sloping down toward the nose; its base sits in the tail cone.
  g.wedge(3.2 * s, 2.7 * s, 0.22 * s, -6.4 * s, fy + 0.3 * s, 0, livery, { tint: true });
  // Landing gear with wheels: nose leg under the fuselage, main legs up into the wings.
  const leg = (x: number, z: number, h: number) => {
    g.cylB(0.07 * s, 0.07 * s, h, x, 0, z, C.dark, 6);
    g.wheel(0.26 * s, 0.22 * s, x, 0.26 * s, z);
  };
  leg(5.2 * s, 0, 1.1 * s);
  for (const z of [-1.1, 1.1]) leg(-0.9 * s, z * s, 1.5 * s);
  return g.build();
}

export const BUILDERS: Record<string, Builder> = {
  // ------------------------------------------------------------ street
  cone: () =>
    new G().boxB(0.5, 0.05, 0.5, 0, 0, 0, C.orange).cone(0.2, 0.68, 0, 0.39, 0, C.orange, 8).cyl(0.13, 0.15, 0.12, 0, 0.4, 0, C.white, 8).build(),
  hydrant: () =>
    new G()
      .cylB(0.2, 0.22, 0.08, 0, 0, 0, C.darkred, 8)
      .cylB(0.15, 0.15, 0.55, 0, 0.08, 0, C.red, 8)
      .cylB(0.17, 0.17, 0.08, 0, 0.6, 0, C.darkred, 8)
      .ball(0.15, 0, 0.72, 0, C.red)
      .box(0.36, 0.1, 0.1, 0, 0.45, 0, C.darkred)
      .build(),
  trash: () => new G().cylB(0.26, 0.22, 0.88, 0, 0, 0, 0x4f8a5b, 8).cylB(0.29, 0.29, 0.1, 0, 0.88, 0, 0x3c6b46, 8).build(),
  mailbox: () =>
    new G()
      .boxB(0.1, 0.85, 0.1, 0, 0, 0, C.woodDark)
      .boxB(0.48, 0.28, 0.32, 0, 0.82, 0, C.blue)
      .cyl(0.16, 0.16, 0.48, 0, 1.1, 0, C.blue, 10, { rz: Math.PI / 2 })
      .boxB(0.04, 0.22, 0.08, -0.1, 1.05, 0.2, C.red)
      .build(),
  sign: () =>
    new G()
      .cylB(0.04, 0.04, 2.0, 0, 0, 0, C.grey, 6)
      .cyl(0.32, 0.32, 0.05, 0.06, 2.05, 0, C.red, 8, { rz: Math.PI / 2, rx: Math.PI / 8 })
      .cyl(0.26, 0.26, 0.06, 0.07, 2.05, 0, C.white, 8, { rz: Math.PI / 2, rx: Math.PI / 8 })
      .cyl(0.24, 0.24, 0.07, 0.075, 2.05, 0, C.red, 8, { rz: Math.PI / 2, rx: Math.PI / 8 })
      .build(),
  lamp: () =>
    new G()
      .cylB(0.12, 0.14, 0.3, 0, 0, 0, C.dark, 8)
      .cylB(0.06, 0.07, 4.1, 0, 0.3, 0, C.dark, 6)
      .box(0.9, 0.08, 0.08, 0.4, 4.35, 0, C.dark)
      .box(0.5, 0.16, 0.3, 0.75, 4.28, 0, C.dark)
      .box(0.42, 0.06, 0.24, 0.75, 4.18, 0, C.lamp)
      .build(),
  bench: () => {
    const g = new G();
    g.boxB(1.8, 0.07, 0.5, 0, 0.42, 0.05, C.wood).boxB(1.8, 0.35, 0.06, 0, 0.5, -0.24, C.wood);
    for (const x of [-0.75, 0.75]) g.boxB(0.07, 0.45, 0.45, x, 0, 0.05, C.dark).boxB(0.07, 0.37, 0.08, x, 0.45, -0.24, C.dark);
    return g.build();
  },
  barrier: () => {
    const g = new G();
    for (const x of [-0.75, 0.75]) g.boxB(0.08, 1.0, 0.35, x, 0, 0, C.dark);
    for (const y of [0.55, 0.85]) {
      for (let i = 0; i < 6; i++) g.box(0.3, 0.2, 0.06, -0.75 + i * 0.3, y, 0.05, i % 2 ? C.white : C.red);
    }
    return g.build();
  },
  phonebooth: () =>
    new G()
      .boxB(0.95, 2.25, 0.95, 0, 0, 0, C.red)
      .boxB(0.97, 1.4, 0.7, 0, 0.6, 0, C.glass)
      .boxB(0.7, 1.4, 0.97, 0, 0.6, 0, C.glass)
      .boxB(1.0, 0.15, 1.0, 0, 2.25, 0, C.darkred)
      .boxB(0.6, 0.12, 0.98, 0, 2.05, 0, C.white)
      .build(),
  busstop: () => {
    const g = new G();
    g.boxB(3.2, 2.1, 0.06, 0, 0.2, -0.6, C.glass).boxB(3.3, 0.1, 1.4, 0, 2.4, -0.05, C.dark);
    for (const x of [-1.55, 1.55]) g.boxB(0.08, 2.4, 0.08, x, 0, -0.6, C.dark).boxB(0.08, 2.4, 0.08, x, 0, 0.55, C.dark);
    g.boxB(0.06, 1.6, 1.0, 1.58, 0.5, 0, C.yellow);
    g.boxB(2.2, 0.08, 0.4, -0.3, 0.45, -0.35, C.wood);
    return g.build();
  },
  kiosk: () => {
    const g = new G();
    g.boxB(2.0, 1.9, 1.7, -0.1, 0, 0, 0x2e8b57).boxB(2.1, 0.12, 1.8, -0.1, 1.9, 0, 0x236b43);
    g.box(0.9, 0.08, 1.9, 1.15, 1.75, 0, C.red, { rz: -0.35 });
    for (let i = 0; i < 5; i++) g.boxB(0.15, 0.6, 0.22, 0.95, 0.6, -0.6 + i * 0.3, [C.yellow, C.blue, C.pink, C.white, C.orange][i]);
    return g.build();
  },

  // ------------------------------------------------------------ nature
  flower: () => {
    const g = new G();
    g.cylB(0.28, 0.2, 0.32, 0, 0, 0, 0xc2693e, 8).ball(0.28, 0, 0.45, 0, C.leaf);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.ball(0.1, Math.cos(a) * 0.18, 0.6, Math.sin(a) * 0.18, C.pink, 0, { tint: true });
    }
    return g.build();
  },
  rock: () => new G().ball(0.45, 0, 0.22, 0, 0x9aa0a6, 0, { sy: 0.6, sz: 0.9 }).build(),
  bush: () => new G().ball(0.5, -0.1, 0.42, 0, C.leaf).ball(0.38, 0.25, 0.38, 0.15, C.leafDark).ball(0.35, 0.05, 0.6, -0.2, C.leaf).build(),
  tree: () =>
    new G()
      .cylB(0.18, 0.26, 2.3, 0, 0, 0, C.brown, 7)
      .ball(1.25, 0, 3.5, 0, C.leaf, 1)
      .ball(0.85, 0.55, 3.0, 0.45, C.leafDark, 0)
      .ball(0.8, -0.5, 4.1, -0.3, 0x6fd15a, 0)
      .build(),
  pine: () =>
    new G()
      .cylB(0.16, 0.22, 1.4, 0, 0, 0, C.brown, 6)
      .cone(1.1, 2.4, 0, 2.4, 0, C.pine, 8)
      .cone(0.85, 2.0, 0, 3.7, 0, 0x37a055, 8)
      .cone(0.58, 1.6, 0, 4.9, 0, C.pine, 8)
      .build(),
  palm: () => {
    const g = new G();
    for (let i = 0; i < 6; i++) g.cylB(0.2 - i * 0.015, 0.22 - i * 0.015, 1.0, i * 0.12, i * 0.98, 0, 0x9c7a4a, 7, { rz: -0.12 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.box(2.2, 0.08, 0.5, 0.7 + Math.cos(a) * 1.0, 5.9, Math.sin(a) * 1.0, C.leafDark, { ry: -a, rz: -0.35 });
    }
    g.ball(0.3, 0.7, 5.95, 0, C.brown);
    return g.build();
  },

  // ------------------------------------------------------------ people
  person: () => person(C.red, { tint: true }),
  worker: () => person(C.blue, { hat: C.yellow, vest: true }),
  pilot: () => person(C.white, { cap: C.navy }),
  dog: () => {
    const g = new G();
    g.boxB(0.6, 0.26, 0.24, 0, 0.3, 0, C.white, { tint: true });
    g.box(0.26, 0.24, 0.22, 0.38, 0.62, 0, C.white, { tint: true }).box(0.12, 0.1, 0.12, 0.54, 0.58, 0, C.dark);
    for (const x of [-0.22, 0.22]) for (const z of [-0.08, 0.08]) g.boxB(0.07, 0.3, 0.07, x, 0, z, C.white, { tint: true });
    g.box(0.25, 0.06, 0.06, -0.38, 0.6, 0, C.white, { tint: true, rz: 0.7 });
    return g.build();
  },

  // ------------------------------------------------------------ park
  gnome: () =>
    new G()
      .cylB(0.12, 0.14, 0.2, 0, 0, 0, C.blue, 8)
      .ball(0.09, 0, 0.27, 0, C.skin)
      .cone(0.075, 0.16, 0.08, 0.2, 0, C.white, 6, { rx: Math.PI })
      .cone(0.1, 0.22, 0, 0.42, 0, C.red, 8)
      .build(),
  picnic: () => {
    const g = new G();
    g.boxB(2.0, 0.08, 0.8, 0, 0.72, 0, C.wood);
    for (const z of [-0.65, 0.65]) g.boxB(2.0, 0.06, 0.3, 0, 0.42, z, C.wood);
    for (const x of [-0.8, 0.8]) {
      g.box(0.08, 0.86, 0.08, x, 0.39, -0.3, C.woodDark, { rx: 0.5 }).box(0.08, 0.86, 0.08, x, 0.39, 0.3, C.woodDark, { rx: -0.5 });
      // Cross beam carrying both seats.
      g.boxB(0.08, 0.06, 1.6, x, 0.36, 0, C.woodDark);
    }
    return g.build();
  },
  slide: () => {
    const g = new G();
    for (const z of [-0.4, 0.4]) g.boxB(0.08, 2.2, 0.08, -1.4, 0, z, C.blue).boxB(0.08, 1.6, 0.08, -0.9, 0, z, C.blue);
    for (let y = 0.3; y < 1.6; y += 0.35) g.box(0.06, 0.06, 0.8, -1.4, y, 0, C.yellow);
    g.boxB(0.6, 0.1, 0.9, -1.15, 1.55, 0, C.yellow);
    g.box(2.7, 0.08, 0.7, 0.35, 0.85, 0, C.red, { rz: -0.55 });
    g.box(2.7, 0.2, 0.06, 0.35, 0.95, -0.36, C.red, { rz: -0.55 }).box(2.7, 0.2, 0.06, 0.35, 0.95, 0.36, C.red, { rz: -0.55 });
    return g.build();
  },
  swing: () => {
    const g = new G();
    // A-frames at both ends: two legs from the feet (z = ±spread) up to the top beam (z = 0).
    const top = 2.35;
    const spread = 0.85;
    const lean = Math.atan2(spread, top);
    const len = Math.hypot(spread, top) + 0.06;
    for (const x of [-1.55, 1.55]) {
      for (const s of [-1, 1]) {
        g.box(0.12, len, 0.12, x, top / 2, (s * spread) / 2, C.red, { rx: -s * lean });
        g.cylB(0.11, 0.13, 0.08, x, 0, s * spread, C.darkred, 8);
      }
      const braceY = 0.9;
      g.box(0.08, 0.08, 2 * spread * (1 - braceY / top) + 0.1, x, braceY, 0, C.darkred);
      g.ball(0.11, x, top, 0, C.darkred);
    }
    g.cyl(0.08, 0.08, 3.3, 0, top, 0, C.red, 8, { rz: Math.PI / 2 });
    const seatY = 0.55;
    const chain = top - seatY - 0.05;
    for (const [x, seat] of [
      [-0.7, C.yellow],
      [0.7, C.blue],
    ] as const) {
      g.box(0.03, chain, 0.03, x - 0.2, seatY + chain / 2 + 0.03, 0, C.grey).box(0.03, chain, 0.03, x + 0.2, seatY + chain / 2 + 0.03, 0, C.grey);
      g.boxB(0.52, 0.06, 0.26, x, seatY, 0, seat);
    }
    return g.build();
  },
  statue: () =>
    new G()
      .boxB(1.6, 1.2, 1.6, 0, 0, 0, C.stone)
      .boxB(1.8, 0.15, 1.8, 0, 1.2, 0, C.offwhite)
      .cylB(0.3, 0.4, 1.6, 0, 1.35, 0, 0x6aa38a, 8)
      .ball(0.28, 0, 3.2, 0, 0x6aa38a)
      .box(0.15, 0.9, 0.15, 0, 3.3, 0.38, 0x6aa38a, { rx: 0.3 })
      .cone(0.12, 0.35, 0, 3.85, 0.52, C.gold, 6)
      .build(),
  fountain: () =>
    new G()
      .cylB(2.0, 2.0, 0.55, 0, 0, 0, C.stone, 16)
      .cylB(1.75, 1.75, 0.08, 0, 0.52, 0, 0x5cc0f0, 16)
      .cylB(0.3, 0.38, 1.5, 0, 0.5, 0, C.stone, 8)
      .cylB(0.85, 0.4, 0.3, 0, 1.6, 0, C.stone, 12)
      .cylB(0.72, 0.72, 0.06, 0, 1.87, 0, 0x5cc0f0, 12)
      .cone(0.25, 0.7, 0, 2.25, 0, 0xbde9ff, 8)
      .build(),

  // ------------------------------------------------------------ vehicles
  bike: () => {
    const g = new G();
    g.cyl(0.33, 0.33, 0.05, -0.55, 0.33, 0, C.black, 12, { rx: Math.PI / 2 }).cyl(0.33, 0.33, 0.05, 0.55, 0.33, 0, C.black, 12, { rx: Math.PI / 2 });
    g.box(1.1, 0.06, 0.06, 0, 0.6, 0, C.red, { tint: true }).box(0.06, 0.6, 0.06, -0.15, 0.55, 0, C.red, { tint: true, rz: 0.3 });
    g.box(0.06, 0.6, 0.06, 0.5, 0.65, 0, C.red, { tint: true, rz: -0.2 });
    g.box(0.25, 0.06, 0.12, -0.25, 0.9, 0, C.black).box(0.06, 0.06, 0.5, 0.58, 0.98, 0, C.dark);
    return g.build();
  },
  car: () => car(C.red, true),
  taxi: () => car(C.yellow, false, (g) => g.boxB(0.6, 0.18, 0.35, -0.25, 1.68, 0, C.white).box(4.12, 0.12, 1.87, 0, 0.75, 0, C.black)),
  van: () => {
    const g = new G();
    g.boxB(4.7, 1.75, 2.05, 0, 0.35, 0, C.white, { tint: true });
    g.boxB(0.6, 0.8, 1.9, 2.1, 1.1, 0, C.glass, { rz: 0.15 });
    g.boxB(3.4, 0.5, 2.08, -0.5, 1.35, 0, C.glass);
    for (const x of [-1.5, 1.6]) for (const z of [-0.95, 0.95]) g.wheel(0.4, 0.3, x, 0.4, z);
    return g.build();
  },
  icecream: () => {
    const g = new G();
    g.boxB(4.9, 2.0, 2.15, 0, 0.35, 0, C.white);
    g.boxB(4.92, 0.35, 2.17, 0, 0.9, 0, C.pink);
    g.boxB(0.7, 0.8, 2.0, 2.15, 1.3, 0, C.glass, { rz: 0.15 });
    g.boxB(1.8, 0.9, 0.05, -0.6, 1.25, 1.08, C.glassDark);
    g.cone(0.35, 0.8, -0.8, 2.75, 0, 0xf2c070, 8, { rx: Math.PI }).ball(0.42, -0.8, 3.2, 0, C.pink, 1);
    for (const x of [-1.6, 1.6]) for (const z of [-1.0, 1.0]) g.wheel(0.42, 0.3, x, 0.42, z);
    return g.build();
  },
  truck: () => {
    const g = new G();
    g.boxB(1.9, 2.3, 2.4, 3.0, 0.5, 0, C.red, { tint: true });
    g.boxB(0.1, 0.9, 2.1, 3.96, 1.6, 0, C.glass);
    g.boxB(5.8, 2.8, 2.55, -1.0, 0.6, 0, C.offwhite);
    for (const x of [-3.0, -1.9, 3.0]) for (const z of [-1.15, 1.15]) g.wheel(0.5, 0.35, x, 0.5, z);
    return g.build();
  },
  schoolbus: () => {
    const g = new G();
    g.boxB(7.4, 2.3, 2.45, -0.7, 0.45, 0, C.yellow);
    // Side windows stop short of the front so the windshield gets yellow corner pillars.
    g.boxB(7.31, 0.7, 2.47, -0.755, 1.75, 0, C.glassDark);
    g.boxB(7.42, 0.12, 2.49, -0.72, 1.2, 0, C.black);
    // Split windshield with red warning lights above it.
    g.boxB(0.06, 0.7, 2.2, 3.02, 1.75, 0, C.glass).boxB(0.08, 0.72, 0.08, 3.03, 1.74, 0, C.yellow);
    for (const z of [-0.9, 0.9]) g.boxB(0.06, 0.16, 0.26, 3.02, 2.52, z, C.red);
    // Hood with grille, headlights and bumper.
    g.boxB(1.5, 1.05, 2.2, 3.75, 0.45, 0, C.yellow);
    g.boxB(0.06, 0.55, 1.1, 4.52, 0.75, 0, C.dark);
    for (const z of [-0.8, 0.8]) g.box(0.06, 0.22, 0.28, 4.52, 1.15, z, C.lamp);
    g.boxB(0.2, 0.22, 2.35, 4.58, 0.38, 0, C.black);
    for (const x of [-3.0, 3.7]) for (const z of [-1.1, 1.1]) g.wheel(0.5, 0.35, x, 0.5, z);
    return g.build();
  },
  bus: () => {
    const g = new G();
    g.boxB(9.9, 2.6, 2.55, 0, 0.45, 0, C.blue, { tint: false });
    g.boxB(9.92, 0.9, 2.57, 0, 1.6, 0, C.glassDark);
    g.boxB(0.1, 1.6, 2.2, 4.96, 0.95, 0, C.glass);
    g.boxB(9.0, 0.2, 2.0, 0, 3.05, 0, C.offwhite);
    g.boxB(9.94, 0.25, 2.59, 0, 0.75, 0, C.white);
    for (const x of [-3.4, 3.2]) for (const z of [-1.15, 1.15]) g.wheel(0.5, 0.35, x, 0.5, z);
    return g.build();
  },

  // ------------------------------------------------------------ buildings
  shed: () => new G().boxB(2.4, 1.7, 2.0, 0, 0, 0, C.wood).roof(2.6, 2.3, 0.7, 0, 1.7, 0, C.darkred).boxB(0.06, 1.2, 0.7, 1.21, 0, 0, C.woodDark).build(),
  house: () => {
    const g = new G();
    g.boxB(6.0, 3.4, 5.6, 0, 0, 0, C.offwhite, { tint: true });
    g.roof(6.6, 6.8, 2.4, 0, 3.4, 0, C.red, { ry: Math.PI / 2 });
    g.boxB(0.1, 2.0, 1.1, 3.0, 0, 0, C.woodDark);
    for (const z of [-1.8, 1.8]) g.boxB(0.1, 1.0, 1.1, 3.0, 1.4, z, C.glass);
    for (const x of [-1.5, 1.2]) g.boxB(1.1, 1.0, 5.65, x, 1.4, 0, C.glass);
    g.boxB(0.7, 1.6, 0.7, -1.4, 4.2, 1.6, C.brick);
    return g.build();
  },
  house2: () => {
    const g = new G();
    g.boxB(7.0, 5.6, 6.2, -0.3, 0, 0, C.offwhite, { tint: true });
    g.roof(7.8, 7.2, 2.8, -0.3, 5.6, 0, C.navy, { ry: Math.PI / 2 });
    g.boxB(1.2, 0.2, 3.6, 3.5, 2.6, 0, C.white);
    for (const z of [-1.5, 1.5]) g.boxB(0.15, 2.6, 0.15, 3.9, 0, z, C.white);
    g.boxB(0.1, 2.1, 1.1, 3.22, 0, 0, C.woodDark);
    for (const y of [1.2, 3.8]) for (const z of [-2.0, 2.0]) g.boxB(0.1, 1.0, 1.0, 3.22, y, z, C.glass);
    g.boxB(0.1, 1.0, 1.0, 3.22, 3.8, 0, C.glass);
    for (const y of [1.2, 3.8]) for (const x of [-2.2, 0.8]) g.boxB(1.0, 1.0, 6.25, x, y, 0, C.glass);
    return g.build();
  },
  shop: () => {
    const g = new G();
    g.boxB(8.4, 4.4, 6.6, -0.2, 0, 0, C.offwhite, { tint: true });
    g.boxB(0.1, 2.0, 5.6, 4.02, 0.3, 0, C.glass);
    g.boxB(0.12, 2.2, 1.0, 4.05, 0, 0, C.woodDark);
    for (let i = 0; i < 7; i++) g.box(1.3, 0.1, 0.94, 4.4, 2.7, -2.85 + i * 0.95, i % 2 ? C.white : C.red, { rz: -0.4 });
    g.boxB(0.3, 0.9, 5.0, 4.05, 3.2, 0, C.yellow);
    g.boxB(8.6, 0.25, 6.8, -0.2, 4.4, 0, C.lightgrey);
    return g.build();
  },
  gasstation: () => {
    const g = new G();
    g.boxB(4.0, 3.2, 7.0, -3.8, 0, 0, C.offwhite);
    g.boxB(0.1, 1.6, 4.5, -1.78, 0.4, 0, C.glass);
    g.boxB(4.2, 0.4, 7.2, -3.8, 3.2, 0, C.red);
    for (const x of [0.6, 4.4]) for (const z of [-2.8, 2.8]) g.boxB(0.3, 4.2, 0.3, x, 0, z, C.white);
    g.boxB(5.6, 0.6, 8.0, 2.5, 4.2, 0, C.red).boxB(5.7, 0.15, 8.1, 2.5, 4.1, 0, C.white);
    for (const z of [-1.4, 1.4]) g.boxB(0.6, 1.4, 0.4, 2.5, 0, z, C.blue).boxB(0.62, 0.3, 0.42, 2.5, 1.0, z, C.white);
    g.boxB(0.2, 1.5, 0.8, -1.7, 3.6, 0, C.yellow);
    return g.build();
  },
  apartment: () => {
    const g = new G();
    bandedTower(g, 11, 9.4, 0, 16.5, C.offwhite, C.glassDark, 3.2, true);
    g.boxB(11.4, 0.4, 9.8, 0, 16.5, 0, C.lightgrey);
    g.cylB(1.0, 1.0, 1.4, -2.5, 16.9, 2, C.wood, 8).boxB(1.6, 0.8, 1.2, 2.5, 16.9, -2, C.grey);
    g.boxB(0.15, 2.4, 1.8, 5.55, 0, 0, C.woodDark);
    return g.build();
  },
  office: () => {
    const g = new G();
    bandedTower(g, 13, 13, 0, 27, C.lightgrey, C.glass, 3, true);
    g.boxB(9, 2.5, 9, 0, 27, 0, C.grey);
    g.cylB(0.15, 0.15, 3, 2, 29.5, 2, C.dark, 6);
    return g.build();
  },
  skyscraper: () => {
    const g = new G();
    bandedTower(g, 15, 15, 0, 22, C.lightgrey, C.glassDark, 3.2, true);
    bandedTower(g, 12.5, 12.5, 22, 18, C.lightgrey, C.glassDark, 3.2, true);
    bandedTower(g, 9.5, 9.5, 40, 11, C.lightgrey, C.glassDark, 3.2, true);
    g.boxB(6, 1.5, 6, 0, 51, 0, C.grey).cylB(0.25, 0.4, 3.5, 0, 52.5, 0, C.dark, 6).ball(0.35, 0, 56, 0, C.red);
    return g.build();
  },
  glasstower: () => {
    const g = new G();
    g.cylB(8.6, 9.0, 70, 0, 0, 0, C.glass, 8, { tint: false });
    for (let y = 4; y < 70; y += 5) g.cylB(8.9, 9.1, 0.5, 0, y, 0, C.white, 8);
    g.cylB(6, 8.6, 4, 0, 70, 0, C.steel, 8).cylB(0.3, 0.6, 6, 0, 74, 0, C.dark, 6);
    return g.build();
  },
  townhall: () => {
    const g = new G();
    g.boxB(18, 9, 14, -1, 0, 0, C.stone);
    for (let z = -5.5; z <= 5.5; z += 2.2) g.cylB(0.5, 0.55, 7.5, 9.2, 0.6, z, C.offwhite, 10);
    g.boxB(2.5, 0.6, 15, 9.0, 0, 0, C.offwhite).boxB(3, 0.8, 15, 9.0, 8, 0, C.offwhite);
    // Pediment over the portico: gable faces the front (+X).
    g.roof(3, 15, 2.6, 9, 8.8, 0, C.stone);
    for (const y of [2, 5.5]) g.boxB(18.1, 1.4, 14.1, -1, y, 0, C.glassDark);
    // Clock tower with the clock face on its front wall.
    g.boxB(5, 5, 5, -1, 9, 0, C.offwhite).dome(2.6, -1, 14, 0, 0x6aa38a).cyl(0.9, 0.9, 0.12, 1.56, 11.5, 0, C.white, 12, { rz: Math.PI / 2 });
    g.cylB(0.15, 0.15, 3, -1, 16.4, 0, C.gold, 6);
    return g.build();
  },
  megatower: () => {
    const g = new G();
    bandedTower(g, 25, 25, 0, 30, C.steel, C.glassDark, 4, false);
    bandedTower(g, 21, 21, 30, 30, C.steel, C.glassDark, 4, false);
    bandedTower(g, 16, 16, 60, 28, C.steel, C.glassDark, 4, false);
    bandedTower(g, 11, 11, 88, 18, C.steel, C.glassDark, 4, false);
    g.cylB(0.6, 1.6, 14, 0, 106, 0, C.lightgrey, 8).ball(0.8, 0, 120, 0, C.red);
    return g.build();
  },

  // ------------------------------------------------------------ farm
  chicken: () =>
    new G()
      .ball(0.2, 0, 0.28, 0, C.white, 0, { sx: 1.2 })
      .ball(0.11, 0.17, 0.45, 0, C.white)
      .box(0.05, 0.08, 0.04, 0.17, 0.57, 0, C.red)
      .cone(0.04, 0.1, 0.29, 0.44, 0, C.orange, 4, { rz: -Math.PI / 2 })
      .boxB(0.03, 0.12, 0.03, 0, 0, -0.06, C.orange)
      .boxB(0.03, 0.12, 0.03, 0, 0, 0.06, C.orange)
      .build(),
  pumpkin: () => new G().ball(0.34, 0, 0.24, 0, C.orange, 1, { sy: 0.7 }).cylB(0.04, 0.05, 0.14, 0, 0.42, 0, C.green, 5).build(),
  pig: () => {
    const g = new G();
    g.boxB(0.95, 0.5, 0.55, 0, 0.22, 0, C.pink).box(0.3, 0.32, 0.4, 0.55, 0.52, 0, C.pink).box(0.06, 0.14, 0.2, 0.72, 0.48, 0, 0xff7aa8);
    for (const x of [-0.3, 0.3]) for (const z of [-0.18, 0.18]) g.boxB(0.12, 0.24, 0.12, x, 0, z, C.pink);
    g.box(0.1, 0.12, 0.08, 0.5, 0.74, -0.14, C.pink).box(0.1, 0.12, 0.08, 0.5, 0.74, 0.14, C.pink);
    return g.build();
  },
  sheep: () => {
    const g = new G();
    g.ball(0.45, 0, 0.6, 0, C.white, 1, { sx: 1.35, sz: 0.9 });
    g.box(0.25, 0.3, 0.26, 0.6, 0.72, 0, C.black);
    for (const x of [-0.3, 0.3]) for (const z of [-0.18, 0.18]) g.boxB(0.09, 0.35, 0.09, x, 0, z, C.black);
    return g.build();
  },
  fence: () => {
    const g = new G();
    for (const x of [-1.4, 0, 1.4]) g.boxB(0.14, 1.1, 0.14, x, 0, 0, C.white);
    g.box(3.0, 0.12, 0.06, 0, 0.45, 0, C.white).box(3.0, 0.12, 0.06, 0, 0.85, 0, C.white);
    return g.build();
  },
  haybale: () => new G().cyl(0.75, 0.75, 1.5, 0, 0.75, 0, 0xe8c25a, 12, { rx: Math.PI / 2 }).cyl(0.6, 0.6, 1.52, 0, 0.75, 0, 0xd4a843, 12, { rx: Math.PI / 2 }).build(),
  scarecrow: () =>
    new G()
      .cylB(0.06, 0.06, 2.0, 0, 0, 0, C.woodDark, 6)
      .box(0.08, 0.08, 1.5, 0, 1.6, 0, C.woodDark)
      .boxB(0.3, 0.7, 0.6, 0, 1.15, 0, C.red, { tint: true })
      .ball(0.22, 0, 2.05, 0, 0xe0c58a)
      .cylB(0.32, 0.32, 0.04, 0, 2.2, 0, 0xc9a24a, 10)
      .cone(0.18, 0.3, 0, 2.38, 0, 0xc9a24a, 8)
      .build(),
  corn: () => {
    const g = new G();
    const pts = [[0, 0], [0.45, 0.3], [-0.4, 0.35], [0.3, -0.45], [-0.35, -0.35]];
    for (const [x, z] of pts) {
      g.cylB(0.05, 0.07, 2.2, x, 0, z, 0x5ca83a, 5).cone(0.25, 0.7, x, 1.6, z, 0x74c24e, 5);
      g.cyl(0.07, 0.07, 0.3, x + 0.08, 1.3, z, C.yellow, 5);
    }
    return g.build();
  },
  cow: () => {
    const g = new G();
    g.boxB(1.6, 0.8, 0.8, 0, 0.7, 0, C.white);
    g.boxB(0.5, 0.4, 0.82, -0.2, 0.95, 0, C.black).boxB(0.35, 0.3, 0.82, 0.45, 0.8, 0, C.black);
    g.box(0.5, 0.45, 0.45, 1.0, 1.35, 0, C.white).box(0.2, 0.25, 0.42, 1.28, 1.26, 0, C.pink);
    g.box(0.06, 0.15, 0.06, 0.9, 1.65, -0.18, C.offwhite).box(0.06, 0.15, 0.06, 0.9, 1.65, 0.18, C.offwhite);
    for (const x of [-0.6, 0.6]) for (const z of [-0.28, 0.28]) g.boxB(0.15, 0.7, 0.15, x, 0, z, C.white);
    g.box(0.25, 0.12, 0.3, -0.2, 0.66, 0, C.pink);
    return g.build();
  },
  horse: () => {
    const g = new G();
    g.boxB(1.5, 0.65, 0.55, 0, 0.95, 0, C.brown);
    g.box(0.3, 0.8, 0.3, 0.8, 1.7, 0, C.brown, { rz: -0.5 }).box(0.55, 0.28, 0.28, 1.15, 2.0, 0, C.brown);
    g.box(0.12, 0.5, 0.08, 0.7, 1.9, 0, C.woodDark, { rz: -0.5 });
    for (const x of [-0.55, 0.55]) for (const z of [-0.18, 0.18]) g.boxB(0.12, 0.95, 0.12, x, 0, z, C.brown);
    // Tail hangs from the rump, trailing back.
    g.box(0.1, 0.6, 0.1, -0.84, 1.17, 0, C.woodDark, { rz: -0.4 });
    return g.build();
  },
  tractor: () => {
    const g = new G();
    g.boxB(2.0, 0.9, 1.0, 0.7, 0.5, 0, C.green);
    g.boxB(1.2, 1.4, 1.5, -0.6, 0.6, 0, C.green);
    g.boxB(1.0, 0.9, 1.4, -0.6, 1.5, 0, C.glass).boxB(1.2, 0.1, 1.6, -0.6, 2.4, 0, C.green);
    g.wheel(0.75, 0.45, -0.7, 0.75, -0.95, C.black).wheel(0.75, 0.45, -0.7, 0.75, 0.95, C.black);
    g.wheel(0.42, 0.3, 1.25, 0.42, -0.7, C.black).wheel(0.42, 0.3, 1.25, 0.42, 0.7, C.black);
    g.cylB(0.06, 0.06, 0.9, 1.2, 1.4, 0.3, C.dark, 6);
    return g.build();
  },
  greenhouse: () =>
    new G()
      .boxB(10, 0.4, 6, 0, 0, 0, C.stone)
      .boxB(9.8, 2.4, 5.8, 0, 0.4, 0, 0xbfe9ea)
      .roof(9.8, 5.8, 1.2, 0, 2.8, 0, 0xd5f4f4)
      .boxB(0.12, 2.4, 1.2, 4.95, 0.4, 0, C.white)
      .build(),
  silo: () => {
    const g = new G();
    g.cylB(2.4, 2.4, 12, 0, 0, 0, C.lightgrey, 12);
    for (let y = 2; y < 12; y += 2.5) g.cylB(2.45, 2.45, 0.25, 0, y, 0, C.grey, 12);
    g.dome(2.4, 0, 12, 0, C.steel, 12, 5);
    return g.build();
  },
  watertower: () => {
    const g = new G();
    for (const [x, z] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) g.boxB(0.3, 10.5, 0.3, x, 0, z, C.dark);
    g.cylB(2.8, 2.8, 4, 0, 10.5, 0, C.red, 12).cone(3.0, 1.6, 0, 15.3, 0, C.darkred, 12);
    g.box(3.8, 0.15, 0.15, 0, 5, -1.8, C.dark).box(3.8, 0.15, 0.15, 0, 5, 1.8, C.dark);
    return g.build();
  },
  windmill: () => {
    const g = new G();
    // Tower turned so a flat face (not an edge) looks forward, where the door sits.
    g.cylB(1.6, 2.6, 10, 0, 0, 0, C.offwhite, 8, { ry: Math.PI / 8 }).cone(2.0, 2.4, 0, 11.2, 0, C.darkred, 8, { ry: Math.PI / 8 });
    g.cyl(0.3, 0.3, 1.2, 1.9, 10.2, 0, C.dark, 6, { rz: Math.PI / 2 });
    for (let i = 0; i < 4; i++) g.box(0.12, 4.8, 0.7, 2.4, 10.2, 0, C.wood, { rx: (i * Math.PI) / 2 + 0.3, sy: 1 });
    // Door leans with the tapered wall.
    g.box(0.1, 1.8, 1.0, 2.35, 0.9, 0, C.woodDark, { rz: 0.092 });
    return g.build();
  },
  farmhouse: () => {
    const g = new G();
    g.boxB(8, 4.6, 7, 0, 0, 0, C.offwhite);
    g.roof(8.6, 7.8, 3.0, 0, 4.6, 0, C.brick);
    g.boxB(1.4, 0.2, 7.1, 4.6, 2.6, 0, C.wood).boxB(0.15, 2.6, 0.15, 5.2, 0, -3.2, C.wood).boxB(0.15, 2.6, 0.15, 5.2, 0, 3.2, C.wood);
    g.boxB(0.1, 2.0, 1.0, 4.02, 0, 0, C.woodDark);
    for (const z of [-2.2, 2.2]) g.boxB(0.1, 1.0, 1.0, 4.02, 1.4, z, C.glass).boxB(0.1, 1.0, 1.0, 4.02, 3.2, z, C.glass);
    g.boxB(0.8, 2, 0.8, -2, 5.5, 2, C.brick);
    return g.build();
  },
  barn: () => {
    const g = new G();
    g.boxB(11, 5.5, 8.5, 0, 0, 0, C.darkred);
    g.roof(11.6, 9.2, 3.4, 0, 5.5, 0, 0x6e2a2a, { ry: 0 });
    g.boxB(0.15, 4, 4, 5.52, 0, 0, C.red);
    g.box(0.18, 5.4, 0.25, 5.56, 2, 0, C.white, { rx: 0.78 }).box(0.18, 5.4, 0.25, 5.56, 2, 0, C.white, { rx: -0.78 });
    // Hay loft door sits on the gable, which overhangs the wall.
    g.boxB(0.2, 0.25, 4.2, 5.56, 4, 0, C.white).boxB(0.18, 1.2, 1.4, 5.86, 5.6, 0, C.white);
    return g.build();
  },

  // ------------------------------------------------------------ harbor
  seagull: () =>
    new G()
      .ball(0.16, 0, 0.2, 0, C.white, 0, { sx: 1.6 })
      .ball(0.1, 0.22, 0.3, 0, C.white)
      .cone(0.04, 0.12, 0.34, 0.29, 0, C.yellow, 4, { rz: -Math.PI / 2 })
      .box(0.25, 0.04, 0.38, -0.05, 0.28, -0.2, C.lightgrey, { rx: 0.3 })
      .box(0.25, 0.04, 0.38, -0.05, 0.28, 0.2, C.lightgrey, { rx: -0.3 })
      .boxB(0.03, 0.1, 0.03, 0, 0, -0.05, C.yellow)
      .boxB(0.03, 0.1, 0.03, 0, 0, 0.05, C.yellow)
      .build(),
  barrel: () => new G().cylB(0.33, 0.33, 0.95, 0, 0, 0, C.blue, 10, { tint: true }).cylB(0.34, 0.34, 0.06, 0, 0.25, 0, C.dark, 10).cylB(0.34, 0.34, 0.06, 0, 0.65, 0, C.dark, 10).build(),
  buoy: () => new G().cylB(0.38, 0.32, 0.5, 0, 0, 0, C.red, 10).cylB(0.36, 0.38, 0.2, 0, 0.5, 0, C.white, 10).cone(0.3, 0.4, 0, 0.9, 0, C.red, 10).ball(0.08, 0, 1.15, 0, C.lamp).build(),
  crate: () =>
    new G()
      .boxB(1.2, 1.2, 1.2, 0, 0, 0, C.wood)
      .boxB(1.22, 0.12, 1.22, 0, 0.1, 0, C.woodDark)
      .boxB(1.22, 0.12, 1.22, 0, 1.0, 0, C.woodDark)
      .box(0.1, 1.5, 1.22, 0, 0.6, 0, C.woodDark, { rz: 0.78 })
      .build(),
  fishstall: () => {
    const g = new G();
    g.boxB(2.6, 0.9, 1.4, 0, 0, 0, C.wood);
    // Posts stop under the canopy, which slopes down toward +Z.
    for (const x of [-1.3, 1.3]) for (const z of [-0.7, 0.7]) g.boxB(0.08, z < 0 ? 2.48 : 2.2, 0.08, x, 0, z, C.dark);
    for (let i = 0; i < 6; i++) g.box(0.5, 0.08, 2.0, -1.25 + i * 0.5, 2.35, 0, i % 2 ? C.white : C.blue, { rx: 0.2 });
    for (let i = 0; i < 6; i++) g.box(0.45, 0.1, 0.18, -0.9 + (i % 3) * 0.8, 0.95, -0.3 + Math.floor(i / 3) * 0.5, 0x8fa8c0);
    return g.build();
  },
  forklift: () => {
    const g = new G();
    g.boxB(1.8, 0.9, 1.2, -0.3, 0.3, 0, C.yellow).boxB(0.7, 0.6, 1.24, -0.95, 0.4, 0, C.dark);
    for (const [x, z] of [[-0.9, -0.5], [-0.9, 0.5], [0.3, -0.5], [0.3, 0.5]]) g.boxB(0.06, 1.3, 0.06, x, 1.2, z, C.dark);
    g.boxB(1.4, 0.08, 1.2, -0.3, 2.45, 0, C.yellow);
    g.boxB(0.12, 2.2, 1.0, 0.75, 0.1, 0, C.dark).box(1.0, 0.06, 0.15, 1.25, 0.15, -0.3, C.grey).box(1.0, 0.06, 0.15, 1.25, 0.15, 0.3, C.grey);
    for (const x of [-0.8, 0.4]) for (const z of [-0.55, 0.55]) g.wheel(0.28, 0.2, x, 0.28, z);
    return g.build();
  },
  boat: () => {
    const g = new G();
    g.boxB(3.4, 0.8, 1.9, -0.6, 0, 0, C.white).bow(1.4, 0.8, 1.9, 1.1, 0, 0, C.white);
    g.boxB(3.42, 0.2, 1.92, -0.61, 0.35, 0, C.blue, { tint: true }).bow(1.44, 0.2, 1.92, 1.1, 0.35, 0, C.blue, { tint: true });
    g.boxB(0.15, 0.5, 1.4, 0.4, 0.8, 0, C.glass, { rz: 0.4 });
    g.boxB(0.6, 0.35, 1.2, -0.8, 0.8, 0, C.offwhite).boxB(0.4, 0.6, 0.35, -2.4, 0.3, 0, C.dark);
    return g.build();
  },
  container: () => {
    const g = new G();
    g.boxB(6, 2.6, 2.4, 0, 0, 0, C.red, { tint: true });
    for (let x = -2.6; x <= 2.6; x += 0.65) g.boxB(0.12, 2.5, 2.46, x, 0.05, 0, C.darkred, { tint: true });
    g.boxB(0.06, 2.4, 2.2, 3.02, 0.1, 0, C.dark);
    return g.build();
  },
  fishingboat: () => {
    const g = new G();
    g.boxB(6.5, 1.6, 3.3, -0.9, 0, 0, C.blue, { tint: true }).bow(2.4, 1.6, 3.3, 2.35, 0, 0, C.blue, { tint: true });
    g.boxB(6.52, 0.25, 3.32, -0.91, 1.55, 0, C.white).bow(2.44, 0.2, 3.32, 2.35, 1.6, 0, C.white);
    g.boxB(2.4, 1.8, 2.4, -1.8, 1.8, 0, C.offwhite).boxB(2.42, 0.6, 2.42, -1.8, 2.8, 0, C.glassDark).boxB(2.6, 0.15, 2.6, -1.8, 3.6, 0, C.red);
    g.cylB(0.1, 0.1, 4.2, 1.3, 1.8, 0, C.dark, 6).box(3, 0.08, 0.08, 1.3, 4.6, 0, C.dark, { rz: 0.6 });
    return g.build();
  },
  lighthouse: () => {
    const g = new G();
    g.cylB(3.0, 3.0, 1.2, 0, 0, 0, C.stone, 10);
    for (let i = 0; i < 6; i++) g.cylB(2.2 - i * 0.18, 2.4 - i * 0.18, 2.8, 0, 1.2 + i * 2.8, 0, i % 2 ? C.white : C.red, 10);
    g.cylB(1.8, 1.8, 0.3, 0, 18, 0, C.dark, 10).cylB(1.1, 1.1, 1.8, 0, 18.3, 0, C.lamp, 10).cone(1.4, 1.6, 0, 20.9, 0, C.red, 10);
    return g.build();
  },
  yacht: () => {
    const g = new G();
    g.boxB(10.5, 2.0, 4.4, -1.6, 0, 0, C.white).bow(3.5, 2.0, 4.4, 3.65, 0, 0, C.white);
    g.boxB(10.52, 0.3, 4.42, -1.61, 0.6, 0, C.navy).bow(3.56, 0.3, 4.43, 3.65, 0.6, 0, C.navy);
    g.boxB(7, 1.3, 3.6, -2.0, 2.0, 0, C.offwhite).boxB(7.02, 0.6, 3.62, -2.0, 2.4, 0, C.glassDark);
    g.boxB(4.5, 1.1, 3.0, -2.6, 3.3, 0, C.white).boxB(4.52, 0.5, 3.02, -2.6, 3.6, 0, C.glassDark);
    g.cylB(0.08, 0.08, 1.2, -3, 4.4, 0, C.dark, 6);
    return g.build();
  },
  crane: () => {
    const g = new G();
    for (const x of [-4, 4]) for (const z of [-4, 4]) g.boxB(0.8, 22, 0.8, x, 0, z, C.orange);
    for (const x of [-4, 4]) g.box(0.5, 0.5, 8.6, x, 8, 0, C.orange).box(0.5, 0.5, 8.6, x, 16, 0, C.orange);
    // Top beams across each leg pair carry the boom.
    for (const x of [-4, 4]) g.box(0.8, 0.8, 8.8, x, 21.6, 0, C.orange);
    g.boxB(28, 1.6, 2.4, 6, 22, 0, C.orange).boxB(4, 2.6, 3.4, -3, 23.6, 0, C.yellow).boxB(1.6, 1.4, 1.6, 2, 21.4, 0, C.glassDark);
    g.box(0.1, 8, 0.1, 14, 18, 0, C.dark).boxB(2.4, 0.4, 1.4, 14, 13.8, 0, C.yellow);
    return g.build();
  },
  warehouse: () => {
    const g = new G();
    g.boxB(19.6, 7, 13.6, 0, 0, 0, C.steel, { tint: true });
    for (let x = -9; x <= 9; x += 1.5) g.boxB(0.2, 7, 13.7, x, 0, 0, C.grey, { tint: true });
    g.roof(19.8, 14, 2.0, 0, 7, 0, C.lightgrey);
    for (const z of [-4, 0, 4]) g.boxB(0.15, 4.5, 3.2, 9.82, 0, z, C.dark);
    return g.build();
  },
  cargoship: () => {
    const g = new G();
    g.boxB(50, 5, 11.6, -4, 0, 0, C.navy).bow(9, 5, 11.6, 21, 0, 0, C.navy);
    g.boxB(50.1, 1.6, 11.7, -4.05, 0, 0, C.darkred).bow(9.1, 1.6, 11.7, 21, 0, 0, C.darkred);
    g.boxB(50.1, 0.6, 11.8, -3.95, 5, 0, C.white).bow(9.1, 0.6, 11.8, 21, 5, 0, C.white);
    const cols = [C.red, C.blue, C.green, C.orange, C.yellow, C.purple, 0x2bb3b1];
    let k = 0;
    for (let x = -14; x <= 20; x += 6.3) {
      for (let z = -4.2; z <= 4.3; z += 2.8) {
        const h = 1 + ((k * 7) % 3);
        for (let y = 0; y < h; y++) g.boxB(6, 2.5, 2.6, x, 5.6 + y * 2.55, z, cols[(k + y * 3) % cols.length]);
        k++;
      }
    }
    g.boxB(7, 9, 10, -24, 5.6, 0, C.white).boxB(7.1, 1.4, 10.1, -24, 12, 0, C.glassDark).boxB(8, 0.5, 11.6, -24, 14.2, 0, C.white);
    g.cylB(1.4, 1.6, 4, -26, 14.6, 0, C.red, 10);
    return g.build();
  },

  // ------------------------------------------------------------ airport
  runwaylight: () => new G().cylB(0.12, 0.14, 0.25, 0, 0, 0, C.dark, 6).ball(0.1, 0, 0.32, 0, C.lamp).build(),
  suitcase: () => {
    const g = new G();
    g.boxB(0.55, 0.65, 0.28, 0, 0.05, 0, C.blue, { tint: true });
    for (const x of [-0.2, 0.2]) {
      g.boxB(0.06, 0.05, 0.06, x, 0, 0, C.dark);
      g.boxB(0.03, 0.08, 0.03, x * 0.4, 0.7, 0, C.dark);
    }
    g.boxB(0.2, 0.04, 0.05, 0, 0.76, 0, C.dark);
    return g.build();
  },
  windsock: () => {
    const g = new G();
    g.cylB(0.06, 0.08, 3.8, 0, 0, 0, C.white, 6);
    // Sock tapers away from the pole in orange/white bands.
    for (let i = 0; i < 3; i++) g.cyl(0.25 - i * 0.05, 0.3 - i * 0.05, 0.5, 0.3 + i * 0.5, 3.6, 0, i % 2 ? C.white : C.orange, 8, { rz: -Math.PI / 2 });
    return g.build();
  },
  luggagecart: () => {
    const g = new G();
    g.boxB(2.3, 0.15, 1.3, 0, 0.35, 0, C.grey).box(0.6, 0.06, 0.06, 1.4, 0.4, 0, C.dark);
    for (const x of [-0.8, 0.8]) for (const z of [-0.55, 0.55]) g.wheel(0.18, 0.12, x, 0.18, z);
    const cols = [C.red, C.blue, C.yellow, C.green, C.purple];
    // Two layers of bags, the top ones stacked on the bottom ones.
    for (let i = 0; i < 5; i++) g.boxB(0.6, 0.45, 0.35, -0.8 + (i % 3) * 0.75, 0.5 + Math.floor(i / 3) * 0.45, ((i % 3) % 2) * 0.4 - 0.2, cols[i]);
    return g.build();
  },
  stairtruck: () => {
    const g = new G();
    g.boxB(4.8, 0.8, 2.1, 0, 0.4, 0, C.white).boxB(1.4, 1.2, 2.0, 1.7, 1.2, 0, C.yellow).boxB(0.1, 0.6, 1.8, 2.42, 1.6, 0, C.glass);
    g.box(4.2, 0.2, 1.2, -0.4, 2.2, 0, C.lightgrey, { rz: 0.45 });
    g.box(4.2, 0.6, 0.06, -0.4, 2.6, -0.6, C.dark, { rz: 0.45 }).box(4.2, 0.6, 0.06, -0.4, 2.6, 0.6, C.dark, { rz: 0.45 });
    // Frame holding up the raised end of the stairs.
    g.boxB(0.15, 1.4, 1.0, 0.6, 1.2, 0, C.grey);
    for (const x of [-1.5, 1.5]) for (const z of [-1.0, 1.0]) g.wheel(0.4, 0.3, x, 0.4, z);
    return g.build();
  },
  radar: () =>
    new G()
      .boxB(1.6, 3.6, 1.6, 0, 0, 0, C.offwhite)
      .cylB(0.3, 0.3, 0.8, 0, 3.6, 0, C.dark, 6)
      .box(3.8, 1.6, 0.25, 0, 4.9, 0, C.white, { rx: 0.25 })
      .box(0.3, 0.3, 0.8, 0, 4.9, 0.4, C.dark)
      .build(),
  fueltruck: () => {
    const g = new G();
    g.boxB(1.9, 2.1, 2.4, 3.0, 0.5, 0, C.yellow).boxB(0.1, 0.8, 2.1, 3.96, 1.5, 0, C.glass);
    g.cyl(1.2, 1.2, 5.6, -1.0, 1.75, 0, C.lightgrey, 12, { rz: Math.PI / 2 }).boxB(5.5, 0.3, 2.0, -1.0, 0.5, 0, C.dark);
    g.cyl(1.22, 1.22, 0.3, -1.0, 1.75, 0, C.red, 12, { rz: Math.PI / 2 });
    for (const x of [-3.0, -1.8, 3.0]) for (const z of [-1.1, 1.1]) g.wheel(0.5, 0.35, x, 0.5, z);
    return g.build();
  },
  smallplane: () => {
    const g = new G();
    // Fuselage tapers toward the tail (-X); the nose cone continues the thick front end.
    g.cyl(0.4, 0.55, 6.5, -0.3, 1.3, 0, C.white, 10, { rz: Math.PI / 2 }).cone(0.55, 0.9, 3.4, 1.3, 0, C.white, 10, { rz: -Math.PI / 2 });
    g.box(6.6, 0.1, 1.0, -0.3, 1.32, 0, C.red, { tint: true });
    g.box(1.5, 0.15, 9, 0.6, 1.85, 0, C.white).box(1.52, 0.17, 1.22, 0.6, 1.85, -3.9, C.red, { tint: true }).box(1.52, 0.17, 1.22, 0.6, 1.85, 3.9, C.red, { tint: true });
    g.box(1.2, 0.5, 0.9, 1.0, 1.75, 0, C.glass);
    g.boxB(1.0, 1.3, 0.12, -3.3, 1.3, 0, C.red, { tint: true }).box(0.9, 0.1, 3.0, -3.3, 1.45, 0, C.white);
    g.box(0.08, 1.8, 0.2, 3.9, 1.3, 0, C.dark);
    g.cylB(0.05, 0.05, 1.0, 1.0, 0, -0.9, C.dark).cylB(0.05, 0.05, 1.0, 1.0, 0, 0.9, C.dark);
    // Strut tying the main legs into the belly.
    g.box(0.1, 0.08, 1.85, 1.0, 0.95, 0, C.dark);
    // Tail wheel on its own strut, touching the ground.
    g.wheel(0.25, 0.15, 1.0, 0.25, -0.9).wheel(0.25, 0.15, 1.0, 0.25, 0.9).wheel(0.15, 0.1, -3.0, 0.15, 0);
    g.cylB(0.04, 0.04, 0.75, -3.0, 0.15, 0, C.dark, 6);
    return g.build();
  },
  controltower: () => {
    const g = new G();
    g.boxB(7, 3, 7, 0, 0, 0, C.offwhite);
    g.cylB(1.8, 2.3, 23, 0, 3, 0, C.offwhite, 10);
    g.cylB(3.6, 2.4, 1.2, 0, 25.5, 0, C.offwhite, 10).cylB(3.8, 3.6, 3.2, 0, 26.7, 0, C.glassDark, 10);
    g.cylB(4.0, 4.0, 0.6, 0, 29.9, 0, C.offwhite, 10).cylB(0.15, 0.15, 1.6, 0, 30.5, 0, C.red, 6);
    return g.build();
  },
  hangar: () => {
    const g = new G();
    g.boxB(24, 0.6, 20, 0, 0, 0, C.lightgrey);
    g.add(new THREE.CylinderGeometry(10, 10, 23, 14, 1, false, 0, Math.PI), C.steel, 0, 0.6, 0, { rz: Math.PI / 2 });
    g.add(new THREE.CylinderGeometry(9.2, 9.2, 0.3, 14, 1, false, 0, Math.PI), C.dark, 11.45, 0.6, 0, { rz: Math.PI / 2 });
    for (let x = -9; x <= 9; x += 4.5) g.add(new THREE.CylinderGeometry(10.15, 10.15, 0.4, 14, 1, true, 0, Math.PI), C.lightgrey, x, 0.6, 0, { rz: Math.PI / 2 });
    g.boxB(0.4, 2.0, 12, 11.7, 8.4, 0, C.blue);
    return g.build();
  },
  jet: () => plane(1.9, C.blue, 2),
  jumbo: () => plane(2.9, C.red, 4, true),
  terminal: () => {
    const g = new G();
    g.boxB(48, 10, 20, 0, 0, 0, C.offwhite);
    g.boxB(48.2, 6, 20.2, 0, 2, 0, C.glass);
    for (let x = -21; x <= 21; x += 6) g.box(6.2, 0.6, 22, x, 11, 0, C.steel, { rx: x % 12 === 0 ? 0.12 : -0.12 });
    // Jet bridges, each rotunda on a support leg.
    for (let x = -16; x <= 16; x += 16) g.boxB(2.2, 2.6, 7, x, 4, 13, C.lightgrey).boxB(2.4, 2.4, 2.4, x, 4, 16.5, C.dark).cylB(0.3, 0.4, 4, x, 0, 16.5, C.grey, 6);
    g.boxB(10, 2, 0.4, 0, 12, -10.3, C.blue);
    return g.build();
  },

  // ------------------------------------------------------------ spaceport
  hardhat: () =>
    new G()
      .cylB(0.21, 0.21, 0.04, 0, 0, 0, C.yellow, 12, { tint: true })
      .boxB(0.1, 0.03, 0.24, 0.18, 0, 0, C.yellow, { tint: true })
      .dome(0.16, 0, 0.04, 0, C.yellow, 12, 5, { tint: true })
      // Ridge front to back: a thin slice of a slightly bigger dome, so it follows the crown.
      .dome(0.175, 0, 0.04, 0, C.yellow, 12, 5, { sz: 0.3, tint: true })
      .build(),
  engineer: () => person(C.white, { hat: C.yellow, tint: true }),
  satellite: () => {
    const g = new G();
    g.cylB(0.06, 0.12, 0.3, 0, 0, 0, C.grey, 6);
    g.boxB(0.5, 0.5, 0.5, 0, 0.3, 0, C.gold);
    // Solar wings out along X on short struts.
    for (const s of [-1, 1]) g.box(0.2, 0.04, 0.04, s * 0.35, 0.55, 0, C.lightgrey).box(0.34, 0.03, 0.9, s * 0.61, 0.55, 0, 0x22337a);
    // Dish on top, its point set into the body, and the feed rod standing in it.
    g.cone(0.22, 0.12, 0, 0.84, 0, C.white, 10, { rx: Math.PI }).cylB(0.02, 0.02, 0.36, 0, 0.8, 0, C.dark, 4);
    return g.build();
  },
  gator: () => {
    const g = new G();
    const skin = 0x4f6b3a;
    g.boxB(1.2, 0.3, 0.56, 0, 0.08, 0, skin);
    g.boxB(0.55, 0.22, 0.4, 0.82, 0.08, 0, skin).boxB(0.36, 0.12, 0.3, 1.1, 0.08, 0, 0x5d7a45);
    g.box(0.9, 0.16, 0.3, -0.85, 0.2, 0, skin);
    for (const z of [-0.12, 0.12]) g.ball(0.07, 0.95, 0.33, z, C.yellow);
    for (const x of [-0.4, 0.4]) for (const z of [-0.33, 0.33]) g.boxB(0.16, 0.12, 0.14, x, 0, z, skin);
    // Ridged back.
    for (let x = -0.45; x <= 0.46; x += 0.3) g.box(0.12, 0.08, 0.3, x, 0.42, 0, 0x3e5630);
    return g.build();
  },
  balloon: () =>
    new G()
      .boxB(0.5, 0.3, 0.5, 0, 0, 0, C.grey)
      .cylB(0.015, 0.015, 3.2, 0, 0.3, 0, C.dark, 4)
      .boxB(0.3, 0.3, 0.3, 0, 3.5, 0, C.orange)
      .cylB(0.015, 0.015, 0.6, 0, 3.8, 0, C.dark, 4)
      .sphere(0.95, 0, 5.0, 0, C.white, 12, 9, { sy: 1.05, tint: true })
      .build(),
  buggy: () => {
    const g = new G();
    g.boxB(2.4, 0.4, 1.3, 0, 0.25, 0, C.white, { tint: true }).boxB(0.6, 0.35, 1.2, 0.85, 0.65, 0, C.white, { tint: true });
    // Bench seat, its backrest, and a cargo box behind.
    g.boxB(0.5, 0.45, 1.2, -0.1, 0.65, 0, C.navy).boxB(0.15, 0.6, 1.2, -0.35, 0.65, 0, C.navy).boxB(0.6, 0.4, 1.2, -0.85, 0.65, 0, C.grey);
    for (const x of [-0.95, 0.75]) for (const z of [-0.6, 0.6]) g.cylB(0.04, 0.04, 0.95, x, 0.65, z, C.dark, 4);
    g.boxB(2.2, 0.08, 1.4, -0.1, 1.6, 0, C.white, { tint: true });
    // Windshield from the hood up to the roof, leaning back.
    g.box(0.05, 0.6, 1.2, 0.8, 1.3, 0, C.glass, { rz: 0.15 });
    for (const x of [-0.8, 0.8]) for (const z of [-0.6, 0.6]) g.wheel(0.27, 0.2, x, 0.27, z);
    return g.build();
  },
  rocketengine: () => {
    const g = new G();
    g.boxB(2.2, 0.3, 2.2, 0, 0, 0, C.yellow);
    // Stand: a post at each corner with an arm reaching in to hold the bell.
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      g.cylB(0.07, 0.07, 1.0, Math.cos(a) * 1.27, 0.3, Math.sin(a) * 1.27, C.dark, 6);
      g.box(0.7, 0.12, 0.12, Math.cos(a) * 0.96, 1.24, Math.sin(a) * 0.96, C.dark, { ry: -a });
    }
    // Bell (wide end down), throat, then the turbopump and its feed pipes on top.
    g.cylB(0.38, 1.0, 1.7, 0, 0.45, 0, C.dark, 16).cylB(1.03, 1.03, 0.1, 0, 0.45, 0, C.steel, 16);
    g.cylB(0.45, 0.38, 0.5, 0, 2.15, 0, C.steel, 12).cylB(0.6, 0.6, 0.35, 0, 2.65, 0, C.gold, 12);
    // Feed pipes from the pump down into the top of the bell.
    for (const z of [-0.36, 0.36]) g.cylB(0.12, 0.12, 0.9, 0.42, 1.75, z, C.lightgrey, 6);
    return g.build();
  },
  capsule: () => {
    const g = new G();
    g.cylB(1.75, 1.8, 0.35, 0, 0, 0, C.brown, 16).cylB(0.55, 1.75, 2.2, 0, 0.35, 0, C.offwhite, 16);
    g.cylB(0.5, 0.55, 0.45, 0, 2.55, 0, C.lightgrey, 12).cylB(0.3, 0.3, 0.2, 0, 3.0, 0, C.dark, 10);
    // Windows set into the sloped side (tilted back with it).
    for (const a of [0.3, 1.9, 4.4]) g.box(0.05, 0.32, 0.3, Math.cos(a) * 1.12, 1.55, Math.sin(a) * 1.12, C.glassDark, { ry: -a, rz: 0.5 });
    return g.build();
  },
  astrovan: () => {
    const g = new G();
    const silver = 0xd8dde3;
    g.boxB(6.0, 1.9, 2.3, 0, 0.45, 0, silver);
    // Rounded roof: a cylinder along X, squashed to half its height.
    g.cyl(1.15, 1.15, 5.8, 0, 2.35, 0, silver, 14, { rz: Math.PI / 2, sx: 0.5 });
    g.box(5.9, 0.3, 2.32, 0, 1.0, 0, C.blue, { tint: true }).box(4.4, 0.55, 2.33, -0.5, 1.75, 0, C.glassDark);
    g.box(0.06, 0.7, 1.9, 3.02, 1.8, 0, C.glass).box(0.06, 0.18, 0.4, 3.02, 0.9, -0.75, C.lamp).box(0.06, 0.18, 0.4, 3.02, 0.9, 0.75, C.lamp);
    // Wheels stand a little proud of the body sides (flush caps would z-fight with them).
    for (const x of [-2.0, 2.0]) for (const z of [-1.05, 1.05]) g.wheel(0.45, 0.3, x, 0.45, z);
    return g.build();
  },
  cryotank: () => {
    const g = new G();
    g.cylB(4.3, 4.4, 0.4, 0, 0, 0, C.lightgrey, 16);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.cylB(0.22, 0.22, 4.8, Math.cos(a) * 3.3, 0.4, Math.sin(a) * 3.3, C.steel, 6);
    }
    g.sphere(4.2, 0, 5.6, 0, C.white, 16, 12).cyl(4.25, 4.25, 0.3, 0, 5.6, 0, C.steel, 16).cylB(0.7, 0.7, 0.2, 0, 9.75, 0, C.grey, 10);
    g.cylB(0.3, 0.3, 5.6, 4.0, 0, 0, C.yellow, 6);
    return g.build();
  },
  rocketstage: () => {
    const g = new G();
    // Stage lying on a transporter: flatbed, wheels, two cradles, then the stage along X.
    g.boxB(19.4, 0.5, 3.6, 0, 0.3, 0, C.dark);
    for (const x of [-8, -6.6, 6.6, 8]) for (const z of [-1.7, 1.7]) g.wheel(0.4, 0.4, x, 0.4, z);
    for (const x of [-5, 5]) g.boxB(1.0, 1.0, 4.4, x, 0.8, 0, C.yellow);
    g.cyl(2.1, 2.1, 16.5, 0.6, 2.9, 0, C.white, 16, { rz: Math.PI / 2 });
    for (const x of [-4, 3]) g.cyl(2.13, 2.13, 1.2, x, 2.9, 0, C.dark, 16, { rz: Math.PI / 2 });
    g.cyl(2.13, 2.13, 0.6, 8.55, 2.9, 0, C.lightgrey, 16, { rz: Math.PI / 2 });
    // Five engine bells at the tail (-X), opening backward.
    for (const [y, z] of [[2.9, 0], [4.0, 1.1], [4.0, -1.1], [1.8, 1.1], [1.8, -1.1]]) g.cone(0.55, 1.4, -8.35, y, z, C.dark, 10, { rz: -Math.PI / 2 });
    return g.build();
  },
  launchtower: () => {
    const g = new G();
    const red = 0xd4542f;
    g.boxB(10, 2, 10, 0, 0, 0, C.grey);
    for (const x of [-3, 3]) for (const z of [-3, 3]) g.boxB(0.8, 54, 0.8, x, 2, z, red);
    // Lattice: a ring of girders every 6 m, with a cross brace on each face.
    for (let y = 8; y < 56; y += 6) {
      for (const s of [-3, 3]) g.box(6.8, 0.5, 0.5, 0, y, s, red).box(0.5, 0.5, 6.8, s, y, 0, red);
      if (y < 50) for (const s of [-3, 3]) g.box(8.4, 0.3, 0.3, 0, y + 3, s, red, { rz: Math.PI / 4 }).box(0.3, 0.3, 8.4, s, y + 3, 0, red, { rx: Math.PI / 4 });
    }
    // Swing arms reaching toward the rocket (+X).
    for (const y of [20, 33, 45]) g.boxB(2.0, 1.4, 1.6, 4.0, y, 0, C.lightgrey);
    g.boxB(7.5, 2, 7.5, 0, 56, 0, red).cylB(0.25, 0.25, 2, 0, 58, 0, C.lightgrey, 6);
    return g.build();
  },
  telescope: () => {
    const g = new G();
    g.cylB(4, 4.5, 3, 0, 0, 0, C.offwhite, 12).cylB(2.5, 2.5, 3, 0, 3, 0, C.lightgrey, 10);
    // Yoke: a cross beam on the pedestal carrying the two arms.
    g.boxB(1.6, 1.0, 8.2, 0, 6, 0, C.offwhite);
    for (const z of [-3.5, 3.5]) g.boxB(1.2, 5, 1.2, 0, 7, z, C.offwhite);
    g.box(1.6, 1.6, 8.2, 0, 12, 0, C.steel);
    // Dish tilted up toward +X, with the receiver held out over its centre.
    g.cone(8.6, 3.6, 0.8, 12, 0, C.white, 20, { rz: Math.PI / 2 + 0.6 });
    g.box(5.2, 0.3, 0.3, 4.35, 14.43, 0, C.grey, { rz: 0.6 }).ball(0.6, 6.41, 15.84, 0, C.grey);
    return g.build();
  },
  moonrocket: () => {
    const g = new G();
    g.boxB(12, 3, 12, 0, 0, 0, C.grey);
    // First stage with its black roll pattern and fins, then the second and third stages.
    g.cylB(4.6, 4.6, 40, 0, 3, 0, C.white, 16);
    for (const y of [3, 37]) g.cylB(4.65, 4.65, 3, 0, y, 0, C.black, 16);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      g.boxB(1.6, 6, 0.3, Math.cos(a) * 5.2, 3, Math.sin(a) * 5.2, C.black, { ry: -a });
    }
    g.cylB(4.6, 4.6, 25, 0, 43, 0, C.white, 16).cylB(4.65, 4.65, 1.5, 0, 43, 0, C.black, 16);
    g.cylB(3.3, 4.6, 4, 0, 68, 0, C.white, 16).cylB(3.3, 3.3, 16, 0, 72, 0, C.white, 16).cylB(3.35, 3.35, 2, 0, 80, 0, C.black, 16);
    // Instrument ring, the capsule cone, then the red escape tower.
    g.cylB(3.0, 3.3, 8, 0, 88, 0, C.offwhite, 16).cylB(1.0, 3.0, 5, 0, 96, 0, C.lightgrey, 16);
    g.cylB(0.4, 0.4, 10, 0, 101, 0, 0xd4542f, 6).cone(0.6, 4, 0, 113, 0, 0xd4542f, 8);
    return g.build();
  },
  missioncontrol: () => {
    const g = new G();
    g.boxB(34, 7, 22, 0, 0, 0, C.offwhite);
    for (const y of [1.5, 4.3]) g.box(34.1, 1.4, 22.1, 0, y, 0, C.glassDark);
    g.boxB(14, 3.5, 12, -4, 7, 0, C.lightgrey).box(14.1, 1.2, 12.1, -4, 8.8, 0, C.glass);
    // Rooftop dishes and a mast.
    for (const [x, z] of [[9, 5], [12, -6]]) g.cylB(0.15, 0.15, 1.2, x, 7, z, C.grey, 6).cone(1.5, 0.8, x, 8.4, z, C.white, 12, { rx: Math.PI });
    g.cylB(0.15, 0.15, 1.5, -8, 10.5, 0, C.dark, 6);
    // Entrance on the front (+X): glass doors under a blue canopy.
    g.boxB(0.2, 2.1, 4, 17.02, 0, 0, C.glassDark).boxB(1.2, 0.3, 8, 17.6, 3, 0, C.blue);
    return g.build();
  },
  shuttle: () => {
    const g = new G();
    const fy = 4.5;
    // Fuselage, nose cone with a black tip, and the black belly: a shell over the lower sides,
    // its facets lined up with the fuselage's just outside them.
    g.cyl(2.6, 2.6, 25, -1.5, fy, 0, C.white, 14, { rz: Math.PI / 2 });
    g.cone(2.6, 6, 14, fy, 0, C.white, 14, { rz: -Math.PI / 2 }).cone(1.05, 2.4, 15.8, fy, 0, C.black, 14, { rz: -Math.PI / 2 });
    const seg = (Math.PI * 2) / 14;
    g.add(new THREE.CylinderGeometry(2.65, 2.65, 25, 5, 1, true, 8 * seg, 5 * seg), C.black, -1.5, fy, 0, { rz: Math.PI / 2 });
    // Delta wing under the fuselage, black underneath.
    g.bow(20, 0.6, 24, -14, fy - 1.6, 0, C.white).bow(20, 0.2, 24, -14, fy - 1.8, 0, C.black);
    g.wedge(7, 10, 0.6, -10.5, fy + 2.4, 0, C.white);
    for (const z of [-1.6, 1.6]) g.cyl(1.0, 1.0, 6, -11, fy + 1.8, z, C.offwhite, 10, { rz: Math.PI / 2 });
    for (const [y, z] of [[fy + 1.2, 0], [fy - 0.6, -1.0], [fy - 0.6, 1.0]]) g.cone(0.9, 1.8, -14.9, y, z, C.dark, 10, { rz: -Math.PI / 2 });
    // Cockpit windows hugging the top of the nose, then the payload bay seam.
    g.box(1.2, 0.5, 1.6, 11.8, fy + 1.98, 0, C.glassDark, { rz: -0.4 }).box(14, 0.08, 0.1, -2, fy + 2.6, 0, C.lightgrey);
    // Landing gear: nose leg up into the fuselage, main legs up to the underside of the wing.
    for (const [x, z, h] of [[10, 0, fy - 2.4], [-4, -3, fy - 1.8], [-4, 3, fy - 1.8]]) g.cylB(0.15, 0.15, h, x, 0, z, C.dark, 6).wheel(0.5, 0.4, x, 0.5, z);
    return g.build();
  },
  crawler: () => {
    const g = new G();
    // Four track units at the corners, each with tread lines and a jacking block on top.
    for (const x of [-13, 13]) {
      for (const z of [-12, 12]) {
        g.boxB(12, 2.6, 9, x, 0, z, C.dark);
        for (let k = -5; k <= 5; k += 1.25) g.box(0.4, 2.7, 9.1, x + k, 1.3, z, 0x2a2d33);
        g.boxB(5, 1.4, 6, x, 2.6, z, C.grey);
      }
    }
    g.boxB(40, 2.4, 33, 0, 4.0, 0, C.lightgrey).box(40.1, 0.5, 33.1, 0, 5.6, 0, C.grey);
    for (const [x, z] of [[18.4, -15.8], [-18.4, 15.8]]) g.boxB(3, 1.6, 3, x, 6.4, z, C.offwhite).box(0.1, 0.8, 2.6, x + Math.sign(x) * 1.55, 7.3, z, C.glass);
    for (const x of [-4, 4]) g.cylB(0.5, 0.5, 1.6, x, 6.4, -14, C.dark, 8);
    return g.build();
  },
  rockethall: () => {
    const g = new G();
    // High bay (the doors and a striped flag on its side) with the low bay against it on +X.
    g.boxB(40, 59.4, 42, -6, 0, 0, C.offwhite).boxB(40.2, 0.6, 42.2, -6, 59.4, 0, C.lightgrey);
    g.boxB(12, 22, 42, 20, 0, 0, C.offwhite).boxB(12.2, 0.6, 42.2, 20, 22, 0, C.lightgrey);
    for (let x = -24; x <= 12; x += 6) g.boxB(0.6, 59.4, 42.2, x, 0, 0, C.lightgrey);
    for (const x of [-18, -4]) {
      for (const s of [-1, 1]) {
        g.boxB(10, 52, 0.3, x, 0, s * 21.05, C.lightgrey);
        for (let y = 4; y < 52; y += 4) g.box(10.05, 0.2, 0.35, x, y, s * 21.05, C.grey);
      }
    }
    for (let k = 0; k < 7; k++) g.boxB(10, 2.6, 0.3, 8, 30 + k * 2.6, 21.15, k % 2 ? C.white : C.red);
    g.boxB(4.4, 7.8, 0.35, 5.2, 40.4, 21.2, C.navy);
    return g.build();
  },

  // ------------------------------------------------------------ moon
  moonrock: () => new G().ball(0.5, 0, 0.22, 0, 0x8e8f97, 0, { sy: 0.55, sz: 0.85 }).build(),
  flag: () =>
    new G()
      .cylB(0.03, 0.03, 2.2, -0.45, 0, 0, C.lightgrey, 6)
      .boxB(0.9, 0.55, 0.03, 0, 1.55, 0, C.red, { tint: true })
      .boxB(0.35, 0.29, 0.05, -0.25, 1.8, 0, C.navy)
      .build(),
  astronaut: () => {
    const g = new G();
    g.boxB(0.22, 0.75, 0.2, 0, 0, -0.13, C.white).boxB(0.22, 0.75, 0.2, 0, 0, 0.13, C.white);
    g.boxB(0.42, 0.7, 0.55, 0, 0.72, 0, C.white).boxB(0.3, 0.6, 0.5, -0.32, 0.8, 0, C.lightgrey);
    g.boxB(0.16, 0.6, 0.16, 0, 0.8, -0.36, C.white).boxB(0.16, 0.6, 0.16, 0, 0.8, 0.36, C.white);
    g.ball(0.3, 0, 1.6, 0, C.white, 1).box(0.12, 0.26, 0.38, 0.24, 1.6, 0, C.gold);
    g.box(0.05, 0.2, 0.2, 0.22, 1.05, 0.15, C.red, { tint: true });
    return g.build();
  },
  alienplant: () => {
    const g = new G();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      g.cylB(0.05, 0.08, 1.4 + i * 0.1, Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3, 0x8b4fd8, 5, { rx: Math.sin(a) * 0.3, rz: -Math.cos(a) * 0.3 });
      g.ball(0.18, Math.cos(a) * 0.5, 1.5 + i * 0.1, Math.sin(a) * 0.5, C.cyan);
    }
    return g.build();
  },
  crystal: () => {
    const g = new G();
    const pts = [[0, 0, 3.2, 0], [0.6, 0.3, 2.0, 0.4], [-0.5, 0.4, 2.3, -0.3], [0.2, -0.6, 1.6, 0.2]];
    for (const [x, z, h, t] of pts) g.cyl(0, 0.38, h, x, h / 2, z, 0xb05cff, 6, { rx: t, rz: -t * 0.5, tint: true });
    return g.build();
  },
  cheese: () => {
    const g = new G();
    // Wheel with a quarter cut away (the +X/+Z quadrant), showing the paler inside.
    g.add(new THREE.CylinderGeometry(1.5, 1.5, 1.4, 16, 1, false, Math.PI / 2, Math.PI * 1.5), 0xffd34d, 0, 0.7, 0);
    g.boxB(1.5, 1.4, 0.04, 0.75, 0, 0.02, 0xffe27a).boxB(0.04, 1.4, 1.5, 0.02, 0, 0.75, 0xffe27a);
    for (const [x, y, z] of [[1.3, 0.8, -0.5], [-0.6, 0.5, 1.35], [-1.2, 1.0, -0.8], [0.4, 1.43, -0.6]]) g.ball(0.2, x, y, z, 0xe0a820);
    return g.build();
  },
  boulder: () => new G().ball(1.9, 0, 1.2, 0, 0x7d7e86, 1, { sy: 0.75, sz: 0.85 }).ball(1.0, 1.2, 0.6, 0.6, 0x8e8f97, 0).build(),
  solarpanel: () => {
    const g = new G();
    g.cylB(0.1, 0.1, 1.0, 0, 0, 0, C.grey, 6);
    g.box(3.9, 0.1, 2.3, 0, 1.15, 0, 0x22337a, { rz: 0, rx: 0.35 });
    for (let x = -1.5; x <= 1.5; x += 1) g.box(0.04, 0.12, 2.3, x, 1.17, 0, C.lightgrey, { rx: 0.35 });
    return g.build();
  },
  rover: () => {
    const g = new G();
    g.boxB(3.2, 0.6, 2.0, 0, 0.6, 0, C.offwhite).boxB(1.3, 0.8, 1.6, 0.6, 1.2, 0, C.glass).boxB(1.0, 0.6, 1.4, -0.9, 1.2, 0, C.gold);
    for (const x of [-1.1, 0, 1.1]) for (const z of [-1.05, 1.05]) g.wheel(0.42, 0.35, x, 0.42, z, C.dark);
    g.cylB(0.04, 0.04, 1.0, -1.2, 1.8, 0.5, C.grey, 4).cone(0.35, 0.2, -1.2, 2.7, 0.5, C.white, 8, { rx: Math.PI });
    return g.build();
  },
  dish: () =>
    new G()
      .cylB(1.2, 1.5, 0.6, 0, 0, 0, C.lightgrey, 8)
      .cylB(0.3, 0.3, 2.6, 0, 0.6, 0, C.grey, 6)
      .cone(1.9, 0.9, 0.3, 3.4, 0, C.white, 14, { rz: Math.PI / 2 + 0.6 })
      .cylB(0.05, 0.05, 1.4, 0.7, 3.2, 0, C.dark, 4, { rz: -0.9 })
      .build(),
  lander: () => {
    const g = new G();
    g.boxB(3.6, 2.0, 3.6, 0, 1.6, 0, C.gold, { ry: Math.PI / 4 });
    g.cylB(1.6, 1.8, 1.8, 0, 3.6, 0, C.offwhite, 8).cone(1.0, 0.6, 0, 5.7, 0, C.lightgrey, 8);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      // Legs lean in: feet out on the pads, tops tucked under the descent stage.
      g.box(0.15, 2.6, 0.15, Math.cos(a) * 2.4, 1.2, Math.sin(a) * 2.4, C.lightgrey, { rx: -Math.sin(a) * 0.5, rz: Math.cos(a) * 0.5 });
      g.cylB(0.5, 0.5, 0.1, Math.cos(a) * 3.0, 0, Math.sin(a) * 3.0, C.lightgrey, 8);
    }
    return g.build();
  },
  rocket: () => {
    const g = new G();
    g.boxB(6, 1.0, 6, 0, 0, 0, C.grey);
    g.cylB(2.2, 2.2, 26, 0, 1, 0, C.white, 12).cone(2.2, 7, 0, 30.5, 0, C.red, 12);
    for (let y = 6; y < 26; y += 8) g.cylB(2.25, 2.25, 0.6, 0, y, 0, C.dark, 12);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      // Fins stick straight out of the body.
      g.box(1.0, 4, 0.2, Math.cos(a) * 2.6, 3.2, Math.sin(a) * 2.6, C.red, { ry: -a });
    }
    g.cylB(1.0, 1.2, 1.2, 0, 1, 0, C.dark, 10);
    return g.build();
  },
  ufo: () =>
    new G()
      .sphere(5, 0, 1.2, 0, C.steel, 20, 8, { sy: 0.22 })
      .dome(2.2, 0, 1.6, 0, 0x7cf5c8, 14, 6)
      .cyl(3.8, 3.2, 0.5, 0, 0.7, 0, C.dark, 20)
      .cyl(0.8, 0.3, 0.6, 0, 0.2, 0, C.lamp, 10)
      .build(),
  dome: () => {
    const g = new G();
    g.cylB(6, 6, 0.6, 0, 0, 0, C.lightgrey, 16).dome(5.8, 0, 0.6, 0, 0xdfe8f0, 16, 6);
    g.boxB(3, 2.4, 2.4, 6, 0, 0, C.offwhite).boxB(0.1, 1.8, 1.4, 7.52, 0, 0, C.glassDark);
    return g.build();
  },
  bigdome: () => {
    const g = new G();
    g.cylB(11, 11, 0.8, 0, 0, 0, C.lightgrey, 20).dome(10.6, 0, 0.8, 0, 0xa8f0d8, 20, 8);
    // Ribs arching over the dome, meeting at the top.
    for (let i = 0; i < 4; i++) g.add(new THREE.TorusGeometry(10.65, 0.15, 3, 12, Math.PI), C.white, 0, 0.8, 0, { ry: (i * Math.PI) / 4 });
    return g.build();
  },
  moonbase: () => {
    const g = new G();
    g.cylB(10, 11, 8, 0, 0, 0, C.offwhite, 16).dome(9, 0, 8, 0, 0xdfe8f0, 16, 6).cylB(0.4, 0.4, 6, 0, 16, 0, C.grey, 6);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      g.box(10, 4, 5, Math.cos(a) * 12, 2, Math.sin(a) * 12, C.lightgrey, { ry: -a });
      g.cylB(3, 3, 5, Math.cos(a) * 16, 0, Math.sin(a) * 16, C.white, 12).dome(3, Math.cos(a) * 16, 5, Math.sin(a) * 16, C.glass, 12, 5);
    }
    g.boxB(9.04, 1.0, 5.04, 0, 3, 0, C.cyan);
    return g.build();
  },
};
