import {
  MapBuilder,
  PALETTE,
  buildRoadGrid,
  center,
  decorateWalks,
  faceDir,
  parkCars,
  parkingRow,
  ringPoints,
  shrink,
  type Area,
  type MapData,
} from './builder';

/** Beach from here east, then the ocean to the map edge. */
const COAST_X = 112;
const PADS = [
  { x: 82, z: -72 },
  { x: 82, z: 66 },
];
const HALL = { x: -55, z: -5 };
/** Astrovan stripe colour (its stripe is tinted; untinted it would be white on silver). */
const VAN_STRIPE = 0x3b82f6;

export function generateSpaceport(seed: number): MapData {
  const size = 300;
  const b = new MapBuilder('spaceport', size, seed);
  const rng = b.rng;
  const H = size / 2 - 1;
  const land: Area = { x0: -H, x1: COAST_X - 4, z0: -H, z1: H };

  // ---------------------------------------------------------------- coast
  b.rect((COAST_X + size / 2) / 2, 0, size / 2 - COAST_X, size, '#e8d7a2');
  b.rect((COAST_X + 10 + size / 2) / 2, 0, size / 2 - COAST_X - 10, size, '#3d8ed6');
  for (let z = -140; z <= 140; z += 14) b.rect(COAST_X + 12 + rng.range(0, 6), z, rng.range(6, 12), 0.6, '#9fd0f0');
  b.reserveArea({ x0: COAST_X - 2, x1: size / 2, z0: -size / 2, z1: size / 2 });
  const sea: Area = { x0: COAST_X + 16, x1: H - 6, z0: -H + 10, z1: H - 10 };
  for (let i = 0; i < 3; i++) b.wanderer('fishingboat', sea, 2.2, { tint: b.tint([0xffffff, 0x3b82f6, 0xe84a4a]) });
  for (let i = 0; i < 5; i++) b.wanderer('boat', sea, 2, { tint: b.tint(PALETTE.container) });

  // ---------------------------------------------------------------- crawlerway
  // Gravel road from the Rocket Hall's doors to both pads; the crawler drives it slowly.
  const way = [
    { x: HALL.x + 30, z: HALL.z },
    { x: 25, z: HALL.z },
    { x: PADS[0].x - 22, z: PADS[0].z + 22 },
    { x: PADS[1].x - 22, z: PADS[1].z - 22 },
  ];
  const wayEdges: [number, number][] = [
    [0, 1],
    [1, 2],
    [1, 3],
  ];
  const crawlerway = b.addGraph(way, wayEdges);
  for (const [p, q] of wayEdges) {
    const A = way[p];
    const B = way[q];
    const L = Math.hypot(B.x - A.x, B.z - A.z);
    const rot = Math.atan2(B.z - A.z, B.x - A.x);
    b.rect((A.x + B.x) / 2, (A.z + B.z) / 2, L + 18, 18, '#d6ccb4', rot);
    b.rect((A.x + B.x) / 2, (A.z + B.z) / 2, L + 10, 4, '#9cc46a', rot);
    for (let t = 0; t <= L; t += 4) b.reserve(A.x + ((B.x - A.x) * t) / L, A.z + ((B.z - A.z) * t) / L, 9);
  }
  for (const n of way) b.circle(n.x, n.z, 9, '#d6ccb4');
  b.graphMover('crawler', crawlerway, 0, 1.6);

  // ---------------------------------------------------------------- launch pads
  PADS.forEach((p, i) => {
    b.circle(p.x, p.z, 27, '#c9c8c2');
    b.ring(p.x, p.z, 25, 26, '#f5c542');
    b.rect(p.x, p.z, 44, 7, '#55585e');
    const s = i === 0 ? 1 : 0.9;
    b.put('moonrocket', p.x, p.z, 0, { force: true, scale: s });
    // Tower beside the rocket: its swing arms (5 m out from its centre) touch the body (radius 4.6 m).
    b.put('launchtower', p.x - 5 - 4.6 * s, p.z, 0, { force: true });
    for (const q of ringPoints(6, p.x, p.z, 31)) b.put('lamp', q.x, q.z, 0, { force: true, scale: 2.4 });
    // Fuel farm on the inland side: big spheres and smaller ones.
    const side = i === 0 ? -1 : 1;
    b.put('cryotank', p.x - 30, p.z + side * 34, 0, { force: true });
    b.put('cryotank', p.x + 6, p.z + side * 40, 0, { force: true, scale: 0.85 });
    b.put('cryotank', p.x - 12, p.z + side * 46, 0, { force: true, scale: 0.7 });
    b.scatter('barrel', { x0: p.x - 40, x1: p.x + 20, z0: p.z + side * 30 - 12, z1: p.z + side * 30 + 12 }, 18, { tint: () => b.tint(PALETTE.container) });
    b.scatter('crate', { x0: p.x - 40, x1: p.x + 20, z0: p.z + side * 30 - 12, z1: p.z + side * 30 + 12 }, 10);
  });

  // ---------------------------------------------------------------- Rocket Hall
  b.rect(HALL.x, HALL.z, 74, 64, '#c4c2ba');
  b.put('rockethall', HALL.x, HALL.z, 0, { force: true });
  b.put('rocketstage', HALL.x + 4, HALL.z + 36, 0, { force: true });
  b.put('rocketstage', HALL.x - 6, HALL.z - 36, Math.PI, { force: true, scale: 0.85 });
  b.put('crawler', HALL.x - 2, HALL.z + 62, faceDir(1, 0), { force: true });
  for (let k = 0; k < 8; k++) b.put('rocketengine', HALL.x - 30 + k * 5, HALL.z - 50, 0, { force: true, scale: 1 + (k % 4) * 0.2 });
  const yard = shrink({ x0: HALL.x - 37, x1: HALL.x + 37, z0: HALL.z - 32, z1: HALL.z + 32 }, 2);
  b.scatter('forklift', yard, 10, { scale: [1, 1.4] });
  b.scatter('container', yard, 12, { tint: () => b.tint(PALETTE.container) });
  b.scatter('crate', yard, 30);
  b.scatter('cone', yard, 40);
  for (let i = 0; i < 16; i++) b.wanderer('engineer', yard, 1.2, { flee: true, tint: b.tint([0xffffff, 0x3b82f6, 0xf08a24]) });
  for (let i = 0; i < 4; i++) b.wanderer('buggy', yard, 3.5, { tint: b.tint([0xffffff, 0xf5c542, 0x3b82f6]) });

  // ---------------------------------------------------------------- tracking station
  b.circle(-100, -108, 34, '#b9c98e');
  b.put('telescope', -112, -118, faceDir(1, 1), { force: true });
  b.put('telescope', -78, -124, faceDir(0, 1), { force: true, scale: 0.9 });
  b.put('telescope', -118, -84, faceDir(1, 0), { force: true, scale: 0.85 });
  for (let i = 0; i < 6; i++) b.put('radar', -96 + (i % 3) * 9, -100 + Math.floor(i / 3) * 9, rng.range(0, Math.PI * 2), { force: true, scale: 0.8 });
  b.scatter('satellite', { x0: -135, x1: -65, z0: -140, z1: -75 }, 14);
  b.scatter('balloon', { x0: -135, x1: -65, z0: -140, z1: -75 }, 6, { tint: () => b.tint([0xffffff, 0xf08a24]) });

  // ---------------------------------------------------------------- landing strip
  const STRIP_Z = -134;
  b.rect(10, STRIP_Z, 150, 16, '#5c6068');
  for (let x = -60; x <= 80; x += 10) b.rect(x, STRIP_Z, 5, 0.6, '#f4f4f4');
  b.reserveArea({ x0: -66, x1: 86, z0: STRIP_Z - 9, z1: STRIP_Z + 9 });
  b.put('shuttle', 15, -104, 0, { force: true });
  b.put('stairtruck', 22, -94, faceDir(0, -1), { force: true });
  b.put('astrovan', -2, -88, 0, { force: true, tint: VAN_STRIPE });
  b.put('astrovan', 8, -86, 0, { force: true, scale: 1.2, tint: VAN_STRIPE });

  // ---------------------------------------------------------------- rocket garden (start)
  const START = { x: 0, z: 42 };
  b.circle(START.x, START.z, 24, '#e2ddd1');
  b.ring(START.x, START.z, 24, 25, '#c9c3b5');
  for (const p of ringPoints(8, START.x, START.z, 17)) {
    const k = p.k % 4;
    if (k === 0) b.put('capsule', p.x, p.z, p.ang, { force: true });
    else if (k === 1) b.put('rocketengine', p.x, p.z, p.ang, { force: true, scale: 1.3 });
    else if (k === 2) b.put('satellite', p.x, p.z, p.ang, { force: true, scale: 1.6 });
    else b.put('balloon', p.x, p.z, 0, { force: true, tint: b.tint([0xffffff, 0xf08a24]) });
  }
  b.put('rocketstage', START.x, START.z - 32, 0, { force: true, scale: 0.6 });
  for (const p of ringPoints(12, START.x, START.z, 3.6)) b.put(p.k % 3 ? 'hardhat' : 'satellite', p.x, p.z, p.ang, { force: true, tint: b.tint([0xf5c542, 0xffffff, 0xf08a24]), scale: p.k % 3 ? 1 : 0.7 });
  const garden = shrink({ x0: START.x - 22, x1: START.x + 22, z0: START.z - 22, z1: START.z + 22 }, 2);
  b.scatter('bench', garden, 6);
  b.scatter('trash', garden, 4);
  b.scatter('hardhat', garden, 30, { tint: () => b.tint([0xf5c542, 0xffffff, 0xf08a24, 0x3b82f6]) });
  for (let i = 0; i < 24; i++) b.wanderer('person', garden, 1.1, { flee: true, tint: b.tint(PALETTE.shirt) });

  // ---------------------------------------------------------------- marsh
  for (const [px, pz, r] of [
    [30, 114, 13],
    [12, -58, 10],
    [-128, 30, 11],
  ]) {
    b.circle(px, pz, r + 5, '#86a85a');
    b.circle(px, pz, r, '#5aa3c9');
    b.blockCircle(px, pz, r);
    const shore: Area = { x0: px - r - 12, x1: px + r + 12, z0: pz - r - 12, z1: pz + r + 12 };
    for (let i = 0; i < 5; i++) b.wanderer('gator', shore, 1.2, { flee: true });
    b.scatter('bush', shore, 10, { scale: [0.6, 1.2] });
  }
  b.herd = [['gator', 1]];

  // ---------------------------------------------------------------- visitor complex & roads
  const xs = [-140, -95, -50, -5];
  const zs = [98, 140];
  const grid = buildRoadGrid(b, xs, zs, { roadW: 10, walkW: 2.4, asphalt: '#5a5f68', walk: '#d3cec2', line: '#f4f0e0', crosswalk: '#f2f2f2' });
  const hw = grid.style.roadW / 2;
  grid.blocks.forEach((blk, i) => {
    const c = center(blk);
    if (i === 1) {
      b.rectArea(blk, '#d2ccbf');
      b.put('shop', c.x, c.z, faceDir(0, -1), { force: true, tint: b.tint(PALETTE.building), scale: 1.2 });
      b.scatter('palm', blk, 4);
    } else {
      const lot = shrink(blk, 1);
      b.rectArea(lot, '#6b7079');
      for (let z = lot.z0 + 4; z < lot.z1 - 2; z += 9) parkingRow(b, lot.x0 + 2, lot.x1 - 1, z, 5, 0.6);
    }
  });
  decorateWalks(b, grid, 6, (r) =>
    r.weighted([
      ['lamp', 10],
      ['palm', 6],
      ['trash', 4],
      ['bench', 3],
      ['busstop', 2],
      ['hydrant', 3],
      [null, 20],
    ] as [string | null, number][]),
  );
  parkCars(b, grid, 0.3, [
    ['car', 4],
    ['van', 1],
  ]);
  const lane = 1.8;
  b.traffic = { graph: grid.graph, lane, speed: 9, types: ['astrovan', 'car', 'car', 'bus'] };
  for (let i = 0; i < 6; i++) b.graphMover('astrovan', grid.graph, lane, 8, { tint: VAN_STRIPE });
  for (let i = 0; i < 8; i++) b.graphMover('car', grid.graph, lane, 9, { tint: b.tint(PALETTE.car) });
  for (let i = 0; i < 3; i++) b.graphMover('bus', grid.graph, lane, 6.5);
  for (let i = 0; i < 16; i++) b.graphMover('person', grid.graph, rng.sign() * (hw + 1.2), 1.4, { flee: true, tint: b.tint(PALETTE.shirt) });
  b.put('missioncontrol', -100, 60, faceDir(1, 0), { force: true });

  // ---------------------------------------------------------------- scrub
  b.scatter('cryotank', land, 5, { scale: [0.6, 0.95] });
  b.scatter('rocketstage', land, 4, { scale: [0.65, 0.95] });
  b.scatter('astrovan', land, 10, { scale: [1, 1.35], tint: () => VAN_STRIPE });
  b.scatter('capsule', land, 8, { scale: [0.8, 1.4] });
  b.scatter('rocketengine', land, 16, { scale: [0.8, 1.6] });
  b.scatter('buggy', land, 16, { tint: () => b.tint([0xffffff, 0xf5c542, 0x3b82f6]) });
  b.scatter('balloon', land, 10, { tint: () => b.tint([0xffffff, 0xf08a24]) });
  b.scatter('satellite', land, 16, { scale: [0.7, 1.4] });
  b.scatter('hardhat', land, 90, { tint: () => b.tint([0xf5c542, 0xffffff, 0xf08a24, 0x3b82f6]) });
  b.scatter('cone', land, 50);
  b.scatter('crate', land, 25);
  b.scatter('palm', land, 70, { scale: [0.7, 1.2] });
  b.scatter(() => rng.weighted([['bush', 4], ['rock', 1]] as [string, number][]), land, 240, { scale: [0.6, 1.5] });
  for (let i = 0; i < 40; i++) b.wanderer('engineer', shrink(land, 10), 1.2, { flee: true, tint: b.tint([0xffffff, 0x3b82f6, 0xf08a24]) });
  for (let i = 0; i < 8; i++) b.wanderer('buggy', shrink(land, 10), 3.5, { tint: b.tint([0xffffff, 0xf5c542, 0x3b82f6]) });

  return b.build(
    '#a9c97a',
    '#8fb866',
    { sky: '#9fd3f5', fog: '#d6ecf7', sun: '#fff4e0', hemiSky: '#e2f2ff', hemiGround: '#7d8a5a', sunIntensity: 2.3 },
    START,
  );
}
