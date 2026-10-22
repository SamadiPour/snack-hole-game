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

const RUNWAY_Z = -118;
const TAXI_Z = -84;
/** Terminal centre. Its jet bridges (x = -16, 0, 16) end in a rotunda at z 16.3 to 18.7. */
const TERMINAL_Z = 34;
/** Apron's landside edge: the terminal and the hangar doors open onto it. */
const APRON_END = 24;
/** Where parked noses stop: beside the jet bridges, and in a line on the remote stands. */
const GATE_NOSE = 17.5;
const REMOTE_NOSE = -30;
const START = { x: 0, z: -24 };
const APRON = '#bfc3c8';
const STAND = '#b2b6bc';
const YELLOW = '#f5c542';
/** Nose and tail ahead of and behind a plane's centre, and its wingspan, at scale 1 (render/props.ts). */
const PLANE = {
  jet: { nose: 16.2, tail: 16.9, span: 28 },
  jumbo: { nose: 24.7, tail: 25.8, span: 43 },
  smallplane: { nose: 4, tail: 4, span: 9 },
};

export function generateAirport(seed: number): MapData {
  const size = 320;
  const b = new MapBuilder('airport', size, seed);
  const rng = b.rng;

  // ---------------------------------------------------------------- airside paint
  // Exit taxiways first, so the runway covers their ends.
  for (const x of [-132, 132]) b.rect(x, (RUNWAY_Z + TAXI_Z) / 2, 14, TAXI_Z - RUNWAY_Z, '#60646c');
  b.rect(0, TAXI_Z, 278, 14, '#60646c');
  b.rect(0, RUNWAY_Z, 290, 28, '#4b4f57');
  b.rect(0, RUNWAY_Z - 12.5, 286, 0.6, '#f4f4f4');
  b.rect(0, RUNWAY_Z + 12.5, 286, 0.6, '#f4f4f4');
  for (let x = -120; x <= 120; x += 10) b.rect(x, RUNWAY_Z, 5, 0.7, '#f4f4f4');
  for (const end of [-1, 1]) {
    for (let k = -4; k <= 4; k++) b.rect(end * 138, RUNWAY_Z + k * 2.6, 8, 1.2, '#f4f4f4');
  }
  // Taxiway centre line, turning onto the runway at both exits.
  b.rect(0, TAXI_Z, 264.4, 0.4, YELLOW);
  for (const x of [-132, 132]) b.rect(x, (RUNWAY_Z + TAXI_Z) / 2, 0.4, TAXI_Z - RUNWAY_Z, YELLOW);
  const apron: Area = { x0: -125, x1: 125, z0: TAXI_Z + 7, z1: APRON_END };
  b.rectArea(apron, APRON);
  b.reserveArea({ x0: -145, x1: 145, z0: RUNWAY_Z - 14, z1: TAXI_Z + 7 });

  // Runway lights and windsocks.
  for (let x = -138; x <= 138; x += 10) {
    b.put('runwaylight', x, RUNWAY_Z - 14.2, 0, { force: true });
    b.put('runwaylight', x, RUNWAY_Z + 14.2, 0, { force: true });
  }
  for (let x = -126; x <= 126; x += 14) {
    b.put('runwaylight', x, TAXI_Z - 7.6, 0, { force: true, tint: 0x3b82f6 });
    b.put('runwaylight', x, TAXI_Z + 7.6, 0, { force: true, tint: 0x3b82f6 });
  }
  b.put('windsock', -100, RUNWAY_Z - 20, 0, { force: true });
  b.put('windsock', 100, RUNWAY_Z - 20, Math.PI, { force: true });

  // Taxi loop for moving planes: one way round, as they share the centre line.
  const loop = b.addGraph(
    [
      { x: -132, z: RUNWAY_Z },
      { x: 132, z: RUNWAY_Z },
      { x: 132, z: TAXI_Z },
      { x: -132, z: TAXI_Z },
    ],
    [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
    ],
    true,
  );
  b.graphMover('jet', loop, 0, 10, { tint: 0x3b82f6, scale: 0.5 });
  b.graphMover('smallplane', loop, 0, 9, { tint: 0xe84a4a });
  b.graphMover('smallplane', loop, 0, 9, { tint: 0x38c172 });
  b.graphMover('jumbo', loop, 0, 8, { tint: 0xe84a4a, scale: 0.85 });

  // ---------------------------------------------------------------- terminal & stands
  // Parked planes and hangars come in set sizes, one per size level, so the map's size ladder
  // (fillLadder) has no reason to rescale them away from their stands.
  const liveries = [0x3b82f6, 0xe84a4a, 0x38c172, 0x9b5de5, 0xf08a24];
  // Nose-in stand: a darker pad, a lead-in line off the taxiway centre and a stop bar at the nose.
  const leads: { x: number; noseZ: number }[] = [];
  const stand = (type: keyof typeof PLANE, x: number, noseZ: number, scale: number, pad = true) => {
    const p = PLANE[type];
    const z = noseZ - p.nose * scale;
    if (pad) b.rect(x, z, p.span * scale + 6, (p.nose + p.tail) * scale + 6, STAND);
    b.rect(x, (TAXI_Z + noseZ) / 2, 0.4, noseZ - TAXI_Z, YELLOW);
    b.rect(x, noseZ + 0.6, 4, 0.5, YELLOW);
    leads.push({ x, noseZ });
    return { x, z, scale, tail: z - p.tail * scale };
  };
  // Jets at the outer bridges, each bridge beside its nose; a prop plane at the middle one.
  const gates = [stand('jet', -18.8, GATE_NOSE, 0.6), stand('jet', 18.8, GATE_NOSE, 0.55)];
  const prop = stand('smallplane', 0, GATE_NOSE, 1, false);
  const jumbo = stand('jumbo', -80, REMOTE_NOSE, 0.7);
  const remote = [stand('jet', 52, REMOTE_NOSE, 0.9), stand('jet', 92, REMOTE_NOSE, 0.7)];
  // Apron under the terminal, so the building meets it whatever its size.
  b.rect(0, (APRON_END + TERMINAL_Z) / 2, 52, TERMINAL_Z - APRON_END, APRON);

  b.put('terminal', 0, TERMINAL_Z, Math.PI, { force: true });
  for (const s of [...gates, remote[0]]) {
    const side = Math.sign(s.x);
    b.put('jet', s.x, s.z, faceDir(0, 1), { force: true, scale: s.scale, tint: b.tint(liveries), pad: 0.6 });
    // Stairs at the front door, ahead of the wing; the luggage cart behind the wing.
    b.put('stairtruck', s.x + side * (1.9 * s.scale + 1.4), s.z + 10 * s.scale, faceDir(0, 1), { force: true });
    for (let k = 0; k < 4; k++) b.put('cone', s.x - 6 + k * 4, s.tail - 3, 0, { force: true });
    b.put('luggagecart', s.x - side * 3.2, s.z - 10 * s.scale, 0, { force: true });
  }
  b.put('jumbo', jumbo.x, jumbo.z, faceDir(0, 1), { force: true, scale: jumbo.scale, tint: b.tint(liveries), pad: 0.6 });
  b.put('jet', remote[1].x, remote[1].z, faceDir(0, 1), { force: true, scale: remote[1].scale, tint: b.tint(liveries), pad: 0.6 });

  // Hangars open onto the apron: a big one for jets, a small one for the prop planes parked out front.
  for (const [x, scale] of [
    [-100, 1],
    [100, 0.5],
  ]) {
    const depth = 24 * scale;
    b.rect(x, APRON_END + depth / 2 + 1, 20 * scale + 4, depth + 2, APRON);
    b.put('hangar', x, APRON_END + depth / 2, faceDir(0, -1), { force: true, scale });
  }
  for (const [x, z, rot] of [
    [-106, 14, faceDir(0, -1)],
    [-94, 14, faceDir(0, -1)],
    [100, 14, faceDir(0, -1)],
    [prop.x, prop.z, faceDir(0, 1)],
  ]) {
    b.put('smallplane', x, z, rot, { force: true, tint: b.tint(liveries) });
  }
  b.rect(58, APRON_END + 9, 16, 18, APRON);
  b.put('controltower', 58, APRON_END + 11, 0, { force: true });
  b.put('radar', -142, -60, 0, { force: true });
  b.put('radar', 142, -60, 0, { force: true });

  // Clutter and crews keep to the apron in front of the stands, leaving the strip under the jet
  // bridges clear; their density round the start is what feeds the first sizes.
  const apronInner = shrink({ ...apron, z1: 14 }, 4);
  for (let i = 0; i < 10; i++) b.wanderer('luggagecart', apronInner, 3);
  for (let i = 0; i < 5; i++) b.wanderer('fueltruck', apronInner, 3.5);
  for (let i = 0; i < 3; i++) b.wanderer('bus', apronInner, 4);
  for (let i = 0; i < 40; i++) b.wanderer('worker', apronInner, 1.3, { flee: true });
  for (let i = 0; i < 24; i++) b.wanderer('pilot', apronInner, 1.2, { flee: true });
  // Green centre-line lights down the lead-in lines, clear of the start.
  for (const { x, noseZ } of leads) {
    for (let z = TAXI_Z + 9; z < noseZ - 3; z += 10) {
      if (Math.hypot(x - START.x, z - START.z) > 6) b.put('runwaylight', x, z, 0, { force: true, tint: 0x38c172 });
    }
  }
  b.scatter('cone', apronInner, 110);
  b.scatter('suitcase', apronInner, 120, { tint: () => b.tint(PALETTE.container) });
  b.scatter('barrier', apronInner, 14);
  b.scatter('luggagecart', apronInner, 16);
  b.scatter('barrel', apronInner, 20, { tint: () => b.tint(PALETTE.container) });
  b.scatter('crate', apronInner, 16);
  b.scatter('stairtruck', apronInner, 4);
  b.scatter('fueltruck', apronInner, 3);
  // Snacks around the start point.
  for (const p of ringPoints(12, START.x, START.z, 3.4)) b.put(p.k % 2 ? 'suitcase' : 'cone', p.x, p.z, p.ang, { force: true, tint: b.tint(PALETTE.container) });
  for (let i = 0; i < 6; i++) b.wanderer('pilot', { x0: START.x - 8, x1: START.x + 8, z0: START.z - 8, z1: START.z + 8 }, 1.1, { flee: true });

  // ---------------------------------------------------------------- landside
  const xs = [-120, -40, 40, 120];
  const zs = [62, 112, 150];
  const grid = buildRoadGrid(b, xs, zs, { roadW: 10, walkW: 2.4, asphalt: '#5a5f68', walk: '#d3cec2', line: '#f4f0e0', crosswalk: '#f2f2f2' });
  const hw = grid.style.roadW / 2;
  // Terminal forecourt with travellers, from the building's back wall to the sidewalk.
  const forecourt: Area = { x0: -30, x1: 30, z0: TERMINAL_Z + 11, z1: 62 - hw - 2.4 };
  b.rectArea({ ...forecourt, z0: TERMINAL_Z }, '#e2ddd1');
  for (let i = 0; i < 24; i++) b.wanderer('person', forecourt, 1.2, { flee: true, tint: b.tint(PALETTE.shirt) });
  b.scatter('suitcase', forecourt, 20, { tint: () => b.tint(PALETTE.container) });
  b.scatter('bench', forecourt, 4);
  b.scatter('trash', forecourt, 3);

  grid.blocks.forEach((blk, i) => {
    const c = center(blk);
    if (i % 3 === 1) {
      b.rectArea(blk, '#d2ccbf');
      b.put('apartment', c.x - 10, c.z, faceDir(0, -1), { force: true, tint: b.tint(PALETTE.building), scale: 1.1 });
      b.put('shop', c.x + 14, c.z - 4, faceDir(0, -1), { force: true, tint: b.tint(PALETTE.house) });
      b.scatter('tree', blk, 5, { scale: [0.7, 1] });
      b.scatter('palm', blk, 3);
    } else {
      const lot = shrink(blk, 1);
      b.rectArea(lot, '#6b7079');
      for (let z = lot.z0 + 4; z < lot.z1 - 2; z += 9) parkingRow(b, lot.x0 + 2, lot.x1 - 1, z, 5, 0.62);
    }
  });
  decorateWalks(b, grid, 6, (r) =>
    r.weighted([
      ['lamp', 10],
      ['palm', 5],
      ['trash', 4],
      ['bench', 3],
      ['busstop', 2],
      ['sign', 2],
      ['hydrant', 3],
      [null, 20],
    ] as [string | null, number][]),
  );
  parkCars(b, grid, 0.3, [
    ['taxi', 4],
    ['car', 3],
  ]);
  const lane = 1.8;
  b.traffic = { graph: grid.graph, lane, speed: 9, types: ['taxi', 'taxi', 'car', 'bus'] };
  for (let i = 0; i < 12; i++) b.graphMover('taxi', grid.graph, lane, 9);
  for (let i = 0; i < 10; i++) b.graphMover('car', grid.graph, lane, 9, { tint: b.tint(PALETTE.car) });
  for (let i = 0; i < 4; i++) b.graphMover('bus', grid.graph, lane, 6.5);
  for (let i = 0; i < 26; i++) b.graphMover('person', grid.graph, rng.sign() * (hw + 1.2), 1.4, { flee: true, tint: b.tint(PALETTE.shirt) });

  // Bushes and trees on the grass past the runway and down both sides of the airfield.
  const grass: Area[] = [
    { x0: -159, x1: 159, z0: -159, z1: RUNWAY_Z - 16 },
    { x0: -159, x1: -141, z0: RUNWAY_Z - 16, z1: 50 },
    { x0: 141, x1: 159, z0: RUNWAY_Z - 16, z1: 50 },
  ];
  for (const g of grass) {
    const area = (g.x1 - g.x0) * (g.z1 - g.z0);
    b.scatter(() => rng.weighted([['bush', 3], ['tree', 2], ['rock', 1]] as [string, number][]), g, Math.floor(area / 60), { scale: [0.7, 1.2] });
  }

  // Ground-service vehicles on the apron: the growth steps between the luggage carts (size 6) and
  // the car parks (size 11), which would otherwise all be landside or past the runway, far from
  // the start. Placed last so the rest of the layout keeps its random draws.
  b.scatter('forklift', apronInner, 18, { scale: [1.2, 1.45] });
  b.scatter('luggagecart', apronInner, 16, { scale: [1.3, 1.6] });
  b.scatter('car', apronInner, 12, { scale: [0.88, 1], tint: () => b.tint([0xf5c542, 0xffffff]) });
  b.scatter('van', apronInner, 10, { scale: [0.88, 0.98], tint: () => b.tint([0xffffff, 0xf5c542]) });

  return b.build(
    '#9fd06e',
    '#8cc15e',
    { sky: '#a6d6fb', fog: '#d4ebfb', sun: '#fff3e0', hemiSky: '#ddefff', hemiGround: '#7d7a6a', sunIntensity: 2.3 },
    START,
  );
}
