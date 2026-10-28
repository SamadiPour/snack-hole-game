import { Rng } from '../../rng';
import { holeSpeed, radiusForLevel } from '../../size';
import { PALETTE, center, faceDir, ringPoints, shrink, subdivide, type Area, type MapBuilder, type MapData } from '../builder';
import { realmBuilder, scaleFor, setStart } from './kit';

/**
 * Hometown: a seaside town on an island, laid out by hand. Every prop still gets the scale that
 * makes it edible at its own size level (scaleFor), so the town is built around those sizes:
 * gnomes and people at 3-6, cars at 8-10, houses at 11-14, towers, the stadium, ships and jets at
 * 15-20. Hole width 30 cm to 1 km.
 */

const OCEAN = '#1f5f9e';
const GRASS = '#7fb85a';
const SAND = '#ecd9a0';
const SHALLOW = '#2e78bb';
const QUAY = '#c4beb1';
const PLAZA = '#d4cec2';
const ASPHALT = '#5d626b';
const WALK = '#d9d3c5';
const LAWNS = ['#8ed36b', '#93d870', '#89cf66', '#97da74'];

/** Road centre lines: the park sits in the wide middle block. */
const XS = [-86, -54, -24, 24, 54];
const ZS = [-86, -54, -24, 24, 54];
const ROAD_W = 6.4;
const WALK_W = 2.2;
const HW = ROAD_W / 2;
const INSET = HW + WALK_W;
/**
 * Cars drive this far right of the centre line. No people or dogs here: placed by size level
 * they would stand taller than the houses.
 */
const LANE = 1.5;
/** Land ends here: the quay on the east, beaches elsewhere. */
const LAND: Area = { x0: -95.5, x1: 77, z0: -95.5, z1: 71 };
const CITY = XS[4] + INSET;

interface Seg {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/**
 * Placement helpers bound to one builder: every prop is scaled to become edible at its level. Props
 * given a range of levels take the level in it with the fewest props so far, so the size ladder
 * fills evenly however the town is laid out.
 */
class Town {
  rng: Rng;
  /** Randomness for ground paint only, so repainting never moves a prop. */
  readonly deco = new Rng(96061);
  private readonly perLevel = new Map<number, number>();

  constructor(readonly b: MapBuilder) {
    this.rng = b.rng;
  }

  /** Starts a zone with its own random stream, so changing one part of town never reshuffles another. */
  zone(seed: number): Rng {
    this.rng = new Rng(96060 + seed * 7919);
    return this.rng;
  }

  scale(type: string, level: number): number {
    return scaleFor(type, level, this.rng);
  }

  /** The least filled level in `lv`. */
  level(lv: [number, number]): number {
    let best = lv[0];
    for (let l = lv[0] + 1; l <= lv[1]; l++) if (this.filled(l) < this.filled(best)) best = l;
    return best;
  }

  private filled(l: number): number {
    return this.perLevel.get(l) ?? 0;
  }

  private count(l: number): void {
    this.perLevel.set(l, this.filled(l) + 1);
  }

  /** Puts a prop exactly here (overlaps allowed), at a level or the least filled one of a range. */
  at(type: string, x: number, z: number, rot: number, lv: number | [number, number], tint?: number): boolean {
    const level = typeof lv === 'number' ? lv : this.level(lv);
    this.count(level);
    return this.b.put(type, x, z, rot, { force: true, scale: this.scale(type, level), tint });
  }

  /** `n` props at random free spots of `a`. */
  scatter(type: string, a: Area, lv: [number, number], n: number, tints?: readonly number[], pad?: number): void {
    const rng = this.rng;
    for (let k = 0; k < n; k++) {
      const level = this.level(lv);
      const scale = this.scale(type, level);
      const tint = tints ? rng.pick(tints) : undefined;
      for (let tries = 0; tries < 14; tries++) {
        if (this.b.put(type, rng.range(a.x0, a.x1), rng.range(a.z0, a.z1), rng.range(0, Math.PI * 2), { scale, tint, pad })) {
          this.count(level);
          break;
        }
      }
    }
  }

  /** `n` wanderers in `a`; `share` is their speed as a share of the hole's at their level. */
  wander(type: string, a: Area, lv: [number, number], n: number, share: number, flee: boolean, tints?: readonly number[]): void {
    for (let k = 0; k < n; k++) {
      const level = this.level(lv);
      this.count(level);
      this.b.wanderer(type, a, share * holeSpeed(radiusForLevel(level), 1), { scale: this.scale(type, level), flee, tint: tints ? this.rng.pick(tints) : undefined });
    }
  }

  /** `n` graph movers. */
  drive(type: string, graph: number, lane: () => number, lv: [number, number], n: number, share: number, opts: { flee?: boolean; tints?: readonly number[] } = {}): void {
    for (let k = 0; k < n; k++) {
      const level = this.level(lv);
      this.count(level);
      this.b.graphMover(type, graph, lane(), share * holeSpeed(radiusForLevel(level), 1), {
        scale: this.scale(type, level),
        flee: opts.flee,
        tint: opts.tints ? this.rng.pick(opts.tints) : undefined,
      });
    }
  }
}

const cell = (i: number, j: number): Area => ({ x0: XS[i] + INSET, x1: XS[i + 1] - INSET, z0: ZS[j] + INSET, z1: ZS[j + 1] - INSET });

// ---------------------------------------------------------------- ground

function coast(t: Town): void {
  const { b, deco } = t;
  b.rect(0, 0, 200, 200, OCEAN);
  // Long swells far out.
  for (let i = 0; i < 30; i++) {
    const x = deco.range(-99, 99);
    const z = deco.range(-99, 99);
    const east = x > LAND.x1 + 3;
    if (!east && z < LAND.z1 + 6 && x > LAND.x0 - 3 && z > LAND.z0 - 3) continue;
    b.rect(x, z, deco.range(3, 9), 0.35, deco.pick(['#2c6dab', '#3a7fbf', '#2a68a4', '#4a8ccb']), deco.range(-0.12, 0.12) + (east && z < LAND.z1 ? Math.PI / 2 : 0));
  }
  // Shallows, surf, wet sand and a scalloped shore on the open sides; the quay on the east is straight.
  b.rectArea({ x0: -99.5, x1: LAND.x1, z0: -99.5, z1: LAND.z1 + 4.5 }, SHALLOW);
  // The south beach gets a surf line and wet sand; the narrow north and west shores just wobble.
  const south: [number, number, number][] = [];
  for (let x = LAND.x0 + 3; x < LAND.x1 - 20; ) {
    const r = deco.range(4, 9);
    south.push([x, LAND.z1 - r * deco.range(0.45, 0.8), r]);
    x += r * deco.range(0.8, 1.3);
  }
  const wob: [number, number, number][] = [...south];
  for (let x = LAND.x0 + 3; x < LAND.x1 - 2; ) {
    const r = deco.range(4, 8);
    wob.push([x, LAND.z0 + r * deco.range(0.6, 0.85), r]);
    x += r * deco.range(1, 1.5);
  }
  for (let z = LAND.z0 + 3; z < LAND.z1 - 2; ) {
    const r = deco.range(4, 8);
    wob.push([LAND.x0 + r * deco.range(0.6, 0.85), z, r]);
    z += r * deco.range(1, 1.5);
  }
  for (const [x, z, r] of wob) b.circle(x, z, r + 3.2, SHALLOW);
  for (const [x, z, r] of south) b.circle(x, z, r + 1.7, '#5aa3d8');
  b.rectArea({ ...LAND, z1: LAND.z1 + 0.6 }, '#d9c48c');
  for (const [x, z, r] of south) b.circle(x, z, r + 0.6, '#d9c48c');
  b.circle(LAND.x1 - 3, LAND.z1 - 3, 7.5, SHALLOW);
  b.circle(LAND.x1 - 3, LAND.z1 - 3, 6.2, '#5aa3d8');
  b.circle(LAND.x1 - 3, LAND.z1 - 3, 5.4, '#d9c48c');
  b.rectArea(LAND, SAND);
  b.circle(LAND.x1 - 3, LAND.z1 - 3, 4.8, SAND);
  for (const [x, z, r] of wob) b.circle(x, z, r, SAND);
  // Foam where the waves break on the south beach.
  for (let x = LAND.x0 + 2; x < LAND.x1 - 24; x += deco.range(5, 8)) b.rect(x, LAND.z1 + deco.range(1.8, 3.2), deco.range(1.5, 3.5), 0.3, '#d8ecf8');
  // Town ground up to the outer sidewalks.
  b.rectArea({ x0: XS[0] - INSET, x1: CITY, z0: ZS[0] - INSET, z1: CITY }, GRASS);
  // The quay: paving joints, crane rails, bollards and a yellow safety line along the edge.
  b.rectArea({ x0: CITY, x1: LAND.x1, z0: LAND.z0, z1: CITY }, QUAY);
  for (let z = LAND.z0 + 5; z < CITY; z += 9) b.rect((CITY + LAND.x1) / 2, z, LAND.x1 - CITY, 0.15, '#b3ad9f');
  for (const x of [LAND.x1 - 6.6, LAND.x1 - 1.9]) b.rect(x, (LAND.z0 + CITY) / 2, 0.3, CITY - LAND.z0, '#7d786e');
  b.rect(LAND.x1 - 0.35, (LAND.z0 + CITY) / 2, 0.7, CITY - LAND.z0, '#8f897c');
  b.rect(LAND.x1 - 1.2, (LAND.z0 + CITY) / 2, 0.25, CITY - LAND.z0, '#f5c542');
  for (let z = LAND.z0 + 3; z < CITY; z += 9) b.circle(LAND.x1 - 0.5, z, 0.32, '#3a3f47');
  // Container yard bays at the north end.
  for (let z = LAND.z0 + 5; z < -60; z += 6.5) {
    for (const x of [CITY + 3.2, CITY + 7.2]) {
      for (const s of [-1, 1]) b.rect(x + s * 1.4, z, 0.12, 5.8, '#eeeae0');
    }
  }
  // Sand texture and towels.
  for (let i = 0; i < 25; i++) b.circle(deco.range(LAND.x0, LAND.x1 - 20), deco.range(CITY + 1, LAND.z1 - 1), deco.range(0.2, 0.6), deco.pick(['#e0c88a', '#f4e6bc']));
  for (let i = 0; i < 14; i++) {
    b.rect(deco.range(LAND.x0 + 4, CITY - 4), deco.range(CITY + 3, LAND.z1 - 2.5), 1.1, 2.2, deco.pick(['#e84a4a', '#3b82f6', '#f5c542', '#ff7eb6', '#38c172', '#9b5de5']), deco.range(0, Math.PI));
  }
}

/** The road network minus `skip`, painted, reserved, and as a graph for traffic. */
function roads(t: Town, skip: (s: Seg) => boolean): { graph: number; segs: Seg[] } {
  const { b } = t;
  const all: Seg[] = [];
  for (const z of ZS) for (let i = 0; i + 1 < XS.length; i++) all.push({ x0: XS[i], z0: z, x1: XS[i + 1], z1: z });
  for (const x of XS) for (let j = 0; j + 1 < ZS.length; j++) all.push({ x0: x, z0: ZS[j], x1: x, z1: ZS[j + 1] });
  const segs = all.filter((s) => !skip(s));
  const strip = (s: Seg, half: number, c: string) => {
    if (s.z0 === s.z1) b.rect((s.x0 + s.x1) / 2, s.z0, s.x1 - s.x0 + half * 2, half * 2, c);
    else b.rect(s.x0, (s.z0 + s.z1) / 2, half * 2, s.z1 - s.z0 + half * 2, c);
  };
  for (const s of segs) strip(s, INSET, WALK);
  for (const s of segs) strip(s, HW, ASPHALT);
  // Dashed centre lines between the junctions.
  for (const s of segs) {
    const horiz = s.z0 === s.z1;
    const L = horiz ? s.x1 - s.x0 : s.z1 - s.z0;
    const usable = L - ROAD_W * 2;
    const n = Math.floor(usable / 6.5);
    const p0 = (horiz ? s.x0 : s.z0) + ROAD_W + (usable - n * 6.5) / 2 + 1.25;
    for (let k = 0; k < n; k++) {
      const p = p0 + k * 6.5;
      if (horiz) b.rect(p, s.z0, 2.5, 0.25, '#f6f1dc');
      else b.rect(s.x0, p, 0.25, 2.5, '#f6f1dc');
    }
  }
  // Zebra crossings round the park.
  for (const x of [XS[2], XS[3]]) {
    for (const z of [ZS[2], ZS[3]]) {
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const cx = x + dx * (HW + 1.4);
        const cz = z + dz * (HW + 1.4);
        for (let s = -HW + 0.9; s < HW - 0.4; s += 1.5) {
          if (dx) b.rect(cx, z + s, 1.8, 0.6, '#f2f2f2');
          else b.rect(x + s, cz, 0.6, 1.8, '#f2f2f2');
        }
      }
    }
  }
  const nodes: { x: number; z: number }[] = [];
  for (const z of ZS) for (const x of XS) nodes.push({ x, z });
  const id = (x: number, z: number) => XS.indexOf(x) + ZS.indexOf(z) * XS.length;
  const graph = b.addGraph(
    nodes,
    segs.map((s) => [id(s.x0, s.z0), id(s.x1, s.z1)] as [number, number]),
  );
  for (const s of segs) {
    const horiz = s.z0 === s.z1;
    b.reserveArea(
      horiz
        ? { x0: s.x0 - HW, x1: s.x1 + HW, z0: s.z0 - HW - WALK_W * 0.6, z1: s.z0 + HW + WALK_W * 0.6 }
        : { x0: s.x0 - HW - WALK_W * 0.6, x1: s.x0 + HW + WALK_W * 0.6, z0: s.z0 - HW, z1: s.z1 + HW },
    );
  }
  return { graph, segs };
}

/** Street furniture along both sidewalks of every road, at the outer (block) edge. */
function streetProps(t: Town, segs: Seg[]): void {
  const rng = t.zone(1);
  const out = HW + WALK_W - 0.75;
  const kinds: [[string, number, number] | null, number][] = [
    [['barrier', 3, 4], 1.2],
    [['flower', 3, 4], 0.7],
    [['bench', 5, 7], 1],
    [['bike', 5, 7], 1],
    [['flower', 3, 4], 0.4],
    [['tree', 8, 9], 0.1],
    [['busstop', 8, 8], 0.1],
    [null, 28],
  ];
  for (const s of segs) {
    const horiz = s.z0 === s.z1;
    const a = horiz ? s.x0 : s.z0;
    const L = (horiz ? s.x1 : s.z1) - a;
    for (const side of [-1, 1]) {
      for (let p = INSET + 2.5; p < L - INSET - 2; p += rng.range(10, 14)) {
        const k = rng.weighted(kinds);
        if (!k) continue;
        const [type, lo, hi] = k;
        const x = horiz ? a + p : s.x0 + side * out;
        const z = horiz ? s.z0 + side * out : a + p;
        const rot = horiz ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : side > 0 ? Math.PI : 0;
        t.at(type, x, z, rot + (type === 'bench' || type === 'bike' ? Math.PI / 2 : 0), [lo, hi], type === 'flower' ? rng.pick(PALETTE.flower) : type === 'bike' ? rng.pick(PALETTE.car) : undefined);
      }
    }
  }
}

// ---------------------------------------------------------------- blocks

/** The park round the start: a flower bed where the Garden realm lands, paths, a pond and a playground. */
function park(t: Town, a: Area): void {
  const { b } = t;
  const rng = t.zone(2);
  b.rectArea(a, '#86c860');
  const c = center(a);
  // Paths: a ring round the flower bed and four spokes out to the corners' crossings.
  for (const [dx, dz] of [
    [1, 0],
    [0, 1],
  ]) {
    b.rect(c.x, c.z, dx ? a.x1 - a.x0 : 2.6, dz ? a.z1 - a.z0 : 2.6, '#e8d9b0');
  }
  b.ring(c.x, c.z, 9.8, 12.4, '#e8d9b0');
  b.circle(c.x, c.z, 9.8, '#7cc456');
  // The flower bed: dark soil, a stone edge, gnomes and flowers.
  b.circle(c.x, c.z, 6.8, '#9a968c');
  b.circle(c.x, c.z, 6.2, '#7a5a3a');
  const { deco } = t;
  for (let k = 0; k < 18; k++) {
    const r = Math.sqrt(deco.next()) * 5.8;
    const ang = deco.range(0, Math.PI * 2);
    b.circle(c.x + Math.cos(ang) * r, c.z + Math.sin(ang) * r, deco.range(0.15, 0.4), deco.pick(['#6a4c30', '#8a6a45', '#5f8f3a']));
  }
  // Flower borders along the outer edge of the ring path.
  for (let k = 0; k < 36; k++) {
    const ang = deco.range(0, Math.PI * 2);
    if (Math.abs(Math.sin(ang * 2)) < 0.25) continue;
    const r = 12.9 + deco.range(0, 0.9);
    b.circle(c.x + Math.cos(ang) * r, c.z + Math.sin(ang) * r, deco.range(0.25, 0.45), deco.pick(['#ff5fa2', '#ffd23d', '#ff7a45', '#b37bff', '#ffffff']));
  }
  for (const p of ringPoints(6, c.x, c.z, 4.6)) t.at(p.k % 2 ? 'flower' : 'gnome', p.x, p.z, p.ang + Math.PI, 3, p.k % 2 ? rng.pick(PALETTE.flower) : undefined);
  for (const p of ringPoints(6, c.x, c.z, 8.2)) t.at(p.k % 2 === 0 ? 'bush' : 'flower', p.x, p.z, p.ang, p.k % 2 === 0 ? 4 : [3, 4], rng.pick(PALETTE.flower));
  const quads = subdivide(a, 2, 2).map((q) => shrink(q, 1.6));
  // Pond (north-east) with rocks round it.
  const pq = center(quads[1]);
  const px = pq.x + 1.5;
  const pz = pq.z - 1.5;
  b.circle(px, pz, 4.6, '#e6d5a8');
  b.circle(px, pz, 3.9, '#5cb8e6');
  b.circle(px - 0.8, pz - 0.6, 1.8, '#7cc8ee');
  b.blockCircle(px, pz, 4.4);
  for (const p of ringPoints(4, px, pz, 5.3)) t.at('rock', p.x, p.z, p.ang + 0.4, [3, 4]);
  // Playground (south-west) on sand.
  const gq = quads[2];
  const g = center(gq);
  b.rect(g.x, g.z, 9, 8, '#f2dfa7');
  t.at('swing', g.x - 1.5, g.z - 2, 0, 8);
  t.at('slide', g.x + 1.5, g.z + 2.2, Math.PI, 8);
  // Fountain plaza (north-west).
  const fq = center(quads[0]);
  b.circle(fq.x, fq.z, 4.2, '#e8d9b0');
  t.at('fountain', fq.x, fq.z, 0, 10);
  // Picnic lawn (south-east) under two big trees.
  const lq = quads[3];
  const l = center(lq);
  t.at('picnic', l.x, l.z, 0.3, 8);
  t.at('tree', l.x + 4, l.z - 3, 0, 10);
  t.at('tree', l.x - 4, l.z + 3.5, 0, 9);
  t.scatter('rock', a, [4, 5], 1);
  t.at('bench', c.x + 15, c.z - 2.4, 0, 6);
  t.at('bench', c.x - 2.4, c.z + 15, Math.PI / 2, 5);
}

/** A lot without a house: a vegetable patch, a tennis court or a community pool. */
function emptyLot(t: Town, lot: Area): void {
  const { b, rng } = t;
  const c = center(lot);
  const w = lot.x1 - lot.x0 - 2;
  const d = lot.z1 - lot.z0 - 2;
  const kind = rng.int(0, 2);
  if (kind === 0) {
    b.rect(c.x, c.z, w * 0.8, d * 0.7, '#7a5a3a');
    for (let r = -2; r <= 2; r++) b.rect(c.x, c.z + r * d * 0.13, w * 0.72, 0.5, '#5f9e3e');
    t.scatter('gnome', lot, [3, 3], 1);
  } else if (kind === 1) {
    b.rect(c.x, c.z, w, d, '#c96a4a');
    b.rect(c.x, c.z, w - 1.2, d - 1.2, '#3f8f6a');
    b.rect(c.x, c.z, 0.12, d - 1.2, '#f4f4f4');
    b.rect(c.x, c.z, w - 1.2, 0.12, '#f4f4f4');
    b.rect(c.x, c.z, w - 1.6, d - 1.6, '#4a9a74');
    b.rect(c.x, c.z, 0.15, d - 1.2, '#f4f4f4');
  } else {
    b.rect(c.x, c.z, w, d, '#e8e2d4');
    b.rect(c.x, c.z, w - 2, d - 2.4, '#4fc3f0');
    for (let k = -1; k <= 1; k++) b.rect(c.x, c.z + k * (d - 2.4) * 0.3, w - 2.2, 0.12, '#f4f4f4');
    t.scatter('parasol', { x0: lot.x0 + 0.5, x1: lot.x1 - 0.5, z0: lot.z0 + 0.3, z1: lot.z0 + 1.6 }, [6, 7], 1, PALETTE.shirt);
  }
  b.reserve(c.x, c.z, Math.min(w, d) * 0.4);
}

/** Houses with lawns, driveways and back yards, facing the roads on the block's west and east sides. */
function residential(t: Town, a: Area, rows: number, levels: (number | undefined)[]): void {
  const { b } = t;
  const rng = t.zone(Math.round(a.x0 * 31 + a.z0));
  b.rectArea(a, '#7cbf55');
  subdivide(a, 2, rows).forEach((lot, k) => {
    b.rectArea(shrink(lot, 0.3), rng.pick(LAWNS));
    const side = k % 2 === 0 ? -1 : 1;
    const c = center(lot);
    const edge = side < 0 ? lot.x0 : lot.x1;
    const back = side < 0 ? lot.x1 : lot.x0;
    const level = levels.pop();
    if (level === undefined) {
      emptyLot(t, lot);
      return;
    }
    const type = level > 12 || (level === 12 && rng.chance(0.5)) ? 'house2' : 'house';
    const big = type === 'house2';
    const s = t.scale(type, level);
    const depth = (big ? 8 : 7) * s;
    const lat = (big ? 7 : 6.5) * s;
    const ds = rng.sign();
    const hx = edge - side * (1.5 + depth / 2);
    const hz = c.z - ds * 1.1;
    // Driveway beside the house, out to the sidewalk, with the car in it.
    const dz = hz + ds * (lat / 2 + 1.3);
    const dLen = 1.5 + depth * 0.85;
    b.rect(edge - (side * dLen) / 2, dz, dLen, 2.3, '#c9c4b8');
    b.put(type, hx, hz, faceDir(side, 0), { force: true, scale: s, tint: rng.pick(PALETTE.house) });
    if (rng.chance(0.15)) t.at(rng.chance(0.85) ? 'car' : 'van', edge - side * 2.4, dz, rng.chance(0.5) ? 0 : Math.PI, [8, 9], rng.pick(PALETTE.car));
    // Back yard: a pool, a shed or a swing, a tree, bushes, flowers, sometimes a gnome and a dog.
    const yard: Area = {
      x0: Math.min(back, hx - side * (depth / 2 + 0.3)) + 0.4,
      x1: Math.max(back, hx - side * (depth / 2 + 0.3)) - 0.4,
      z0: lot.z0 + 0.5,
      z1: lot.z1 - 0.5,
    };
    const yc = center(yard);
    const roll = rng.next();
    if (roll < 0.3 && yard.x1 - yard.x0 > 2.6) {
      b.rect(yc.x, yc.z, Math.min(3, yard.x1 - yard.x0 - 0.4), 4.2, '#f2f2f2');
      b.rect(yc.x, yc.z, Math.min(3, yard.x1 - yard.x0 - 0.4) - 0.6, 3.6, '#4fc3f0');
      b.reserve(yc.x, yc.z, 2);
    } else if (roll < 0.34) t.scatter('shed', yard, [9, 9], 1);
    else if (roll < 0.39) t.scatter('swing', yard, [8, 8], 1);
    if (rng.chance(0.2)) t.scatter('tree', yard, [8, 9], 1, undefined, 0.7);
    if (rng.chance(0.7)) t.scatter('bush', lot, [5, 6], 1);
    if (rng.chance(0.15)) t.at('bike', edge - side * 4.6, dz, Math.PI / 2, [5, 6], rng.pick(PALETTE.car));
    if (rng.chance(0.25)) t.scatter('flower', lot, [3, 4], 1, PALETTE.flower);
    if (rng.chance(0.1)) t.scatter('gnome', lot, [3, 3], 1);
    if (rng.chance(0.1)) t.scatter('rock', lot, [3, 4], 1);
  });
  // Hedges between the back yards and between neighbours.
  const mx = (a.x0 + a.x1) / 2;
  b.rect(mx, (a.z0 + a.z1) / 2, 0.7, a.z1 - a.z0 - 0.6, '#4f9a3a');
  for (let r = 1; r < rows; r++) b.rect(mx, a.z0 + ((a.z1 - a.z0) * r) / rows, a.x1 - a.x0 - 0.6, 0.6, '#4f9a3a');
}

/** Shops facing the road to the south, a car park behind and a petrol station. */
function shops(t: Town, a: Area): void {
  const { b } = t;
  const rng = t.zone(4);
  b.rectArea(a, PLAZA);
  const front = a.z1 - 3.4;
  const n = 2;
  const w = (a.x1 - a.x0) / n;
  for (let i = 0; i < n; i++) t.at('shop', a.x0 + w * (i + 0.5), front, faceDir(0, 1), 12, rng.pick(PALETTE.house));
  // Car park.
  const lot: Area = { x0: a.x0 + 0.8, x1: a.x1 - 0.8, z0: a.z0 + 0.8, z1: a.z0 + 8 };
  b.rectArea(lot, '#6b7079');
  for (let x = lot.x0 + 2.2; x < lot.x1 - 1; x += 3.2) {
    b.rect(x - 1.6, (lot.z0 + lot.z1) / 2, 0.15, 4.5, '#f4f4f4');
    if (rng.chance(0.25)) t.at(rng.chance(0.85) ? 'car' : 'van', x, (lot.z0 + lot.z1) / 2, Math.PI / 2 + (rng.chance(0.5) ? Math.PI : 0), [8, 9], rng.pick(PALETTE.car));
  }
  t.scatter('flower', a, [3, 4], 1, PALETTE.flower);
  t.scatter('bike', { x0: a.x0, x1: a.x1, z0: a.z1 - 1.2, z1: a.z1 }, [5, 6], 2, PALETTE.car);
}

/** Paved plaza with one or two towers and some street life. */
function downtown(t: Town, a: Area, towers: [string, number, number][]): void {
  const { b } = t;
  const rng = t.zone(Math.round(a.z0 * 13 + 5));
  b.rectArea(a, PLAZA);
  for (let x = a.x0 + 2; x < a.x1; x += 4) b.rect(x, (a.z0 + a.z1) / 2, 0.12, a.z1 - a.z0, '#c6c0b3');
  planters(t, a);
  for (const [type, z, level] of towers) t.at(type, (a.x0 + a.x1) / 2, z, rng.pick([0, Math.PI / 2]), level, rng.pick(PALETTE.building));
  t.scatter('bench', a, [5, 6], 1);
  t.scatter('kiosk', a, [7, 8], 1);
}

/** Round planters with shrubs in the corners of a paved block. */
function planters(t: Town, a: Area): void {
  for (const x of [a.x0 + 1.6, a.x1 - 1.6]) {
    for (const z of [a.z0 + 1.6, a.z1 - 1.6]) {
      t.b.circle(x, z, 1.2, '#9a968c');
      t.b.circle(x, z, 0.95, '#6fae48');
    }
  }
}

/** The school's sports ground: a running track round a pitch, and a bench or two. */
function sportsGround(t: Town, a: Area): void {
  const { b } = t;
  t.zone(13);
  const c = center(a);
  const w = a.x1 - a.x0;
  const d = a.z1 - a.z0;
  b.rectArea(a, '#7cbf55');
  const rx = w / 2 - 1;
  const rz = d / 2 - 1;
  const r = Math.min(rx, rz);
  // Track: two half rings joined by straights, then the infield.
  for (const [col, inset] of [
    ['#c96a4a', 0],
    ['#7fc456', 2.2],
  ] as const) {
    const rr = r - inset;
    const sx = rx - r;
    const sz = rz - r;
    b.rect(c.x, c.z, (sx + rr) * 2, sz * 2 + 0.01, col);
    b.rect(c.x, c.z, sx * 2 + 0.01, (sz + rr) * 2, col);
    for (const ex of [-sx, sx]) for (const ez of [-sz, sz]) b.circle(c.x + ex, c.z + ez, rr, col);
  }
  b.rect(c.x, c.z, 0.12, d - 6.4, '#f4f4f4');
  b.ring(c.x, c.z, 1.6, 1.75, '#f4f4f4');
  t.scatter('bench', { x0: a.x0 + 0.4, x1: a.x1 - 0.4, z0: a.z0 + 0.2, z1: a.z0 + 0.9 }, [5, 6], 1);
}

/** Allotments: rows of vegetables, a greenhouse, a shed and pumpkins. */
function allotments(t: Town, a: Area): void {
  const { b, deco } = t;
  const rng = t.zone(14);
  b.rectArea(a, '#7cbf55');
  const plots = subdivide(shrink(a, 0.8), 2, 4);
  for (const p of plots) {
    const q = shrink(p, 0.5);
    b.rectArea(q, '#7a5a3a');
    const n = Math.floor((q.z1 - q.z0) / 1.4);
    for (let k = 0; k < n; k++) b.rect((q.x0 + q.x1) / 2, q.z0 + 0.7 + k * 1.4, q.x1 - q.x0 - 0.8, 0.55, deco.pick(['#5f9e3e', '#7cc456', '#4f8a30', '#9acb4a']));
  }
  const g = plots[rng.int(0, plots.length - 1)];
  t.at('greenhouse', (g.x0 + g.x1) / 2, (g.z0 + g.z1) / 2, Math.PI / 2, 13);
  t.scatter('shed', a, [9, 9], 1);
  t.scatter('pumpkin', a, [3, 4], 3);
  t.scatter('scarecrow', a, [5, 5], 1);
}

/** A stadium in its car park. */
function arena(t: Town, a: Area, level: number, rot: number): void {
  const { b } = t;
  const rng = t.zone(Math.round(a.x0 * 17 + 6));
  const c = center(a);
  b.rectArea(a, '#6b7079');
  for (let x = a.x0 + 1.6; x < a.x1; x += 3.2) b.rect(x, (a.z0 + a.z1) / 2, 0.14, a.z1 - a.z0 - 1, '#9aa0a8');
  const s = t.scale('stadium', level);
  b.circle(c.x, c.z, Math.max(5.4, 4.2) * s * 0.62, PLAZA);
  b.put('stadium', c.x, c.z, rot, { force: true, scale: s, tint: rng.pick([0xe84a4a, 0x3b82f6, 0xf5c542, 0x9b5de5]) });
  const r = 2.9 * s * 1.1;
  t.scatter('car', { x0: a.x0 + 1, x1: c.x - r, z0: a.z0 + 1, z1: a.z1 - 1 }, [8, 9], 1, PALETTE.car);
  t.scatter('car', { x0: c.x + r, x1: a.x1 - 1, z0: a.z0 + 1, z1: a.z1 - 1 }, [8, 9], 1, PALETTE.car);
}

/** Runway, taxiway and apron with the jumbo jet, a jet, a prop plane and the terminal. */
function airfield(t: Town, a: Area): void {
  const { b } = t;
  t.zone(3);
  const rz = a.z1 - 4;
  const len = a.x1 - a.x0 - 3;
  const cx = (a.x0 + a.x1) / 2;
  for (let x = a.x0 + 1.5; x < a.x1; x += 6) b.rect(x, (a.z0 + a.z1) / 2, 3, a.z1 - a.z0, '#8acb62');
  b.rect(cx, rz, len, 5.4, '#4a4e55');
  for (let x = a.x0 + 7; x < a.x1 - 6; x += 5) b.rect(x, rz, 2.4, 0.25, '#f4f4f4');
  for (const end of [-1, 1]) {
    for (let k = -2; k <= 2; k++) b.rect(cx + end * (len / 2 - 1.6), rz + k * 0.9, 2.2, 0.4, '#f4f4f4');
  }
  b.rect(cx, rz - 2.5, len, 0.15, '#f4f4f4');
  b.rect(cx, rz + 2.5, len, 0.15, '#f4f4f4');
  const tz = rz - 6.3;
  b.rect(cx, tz, len - 6, 3, '#5a5e66');
  b.rect(cx, tz, len - 6, 0.12, '#f5c542');
  for (const end of [-1, 1]) b.rect(cx + end * (len / 2 - 4), (rz + tz) / 2, 3, rz - tz, '#5a5e66');
  const apron: Area = { x0: a.x0 + 0.5, x1: a.x1 - 0.5, z0: a.z0 + 0.3, z1: tz - 1.6 };
  b.rectArea(apron, '#8c9098');
  b.reserveArea({ x0: a.x0, x1: a.x1, z0: tz - 1.6, z1: rz + 2.8 });
  // Runway lights down both edges.
  for (let x = a.x0 + 3; x < a.x1 - 2; x += 26) for (const s of [-1, 1]) t.at('runwaylight', x, rz + s * 3.1, 0, s > 0 ? 3 : 4);
  // Planes on the runway and the apron, the terminal at the west end.
  t.at('jumbo', cx + 8, rz, 0, 20, 0x3b82f6);
  t.at('jumbo', a.x0 + 30, (apron.z0 + apron.z1) / 2, 0, 19, 0xe84a4a);
  t.at('jet', a.x0 + 42, (apron.z0 + apron.z1) / 2, 0, 16, 0x38c172);
  t.at('smallplane', a.x0 + 52, (apron.z0 + apron.z1) / 2, Math.PI, 14, 0xf5c542);
  t.at('terminal', a.x0 + 7, (apron.z0 + apron.z1) / 2, Math.PI / 2, 17);
  t.at('hangar', a.x1 - 6, (apron.z0 + apron.z1) / 2, Math.PI, 15);
  t.scatter('luggagecart', apron, [6, 7], 2);
  t.scatter('suitcase', apron, [3, 4], 1, PALETTE.car);
  t.scatter('stairtruck', apron, [9, 9], 1);
  t.scatter('fueltruck', apron, [10, 10], 1);
}

/** Quay with containers, cranes and warehouses; piers and ships in the harbour. */
function harbour(t: Town): void {
  const { b } = t;
  const rng = t.zone(8);
  const q: Area = { x0: CITY + 0.6, x1: LAND.x1 - 2, z0: LAND.z0 + 1, z1: CITY - 1 };
  // Container stacks at the north end.
  for (let z = q.z0 + 4; z < -60; z += 6.5) for (const x of [q.x0 + 2.6, q.x0 + 6.6]) if (rng.chance(0.3)) t.at('container', x, z, Math.PI / 2, [10, 11], rng.pick(PALETTE.container));
  // Piers with a crane each and ships alongside.
  for (const [pz, crane, ship] of [
    [-40, 15, 19],
    [12, 16, 0],
  ] as const) {
    b.rect((LAND.x1 + 96) / 2, pz, 96 - LAND.x1, 4, '#a9a399');
    b.reserveArea({ x0: LAND.x1, x1: 96, z0: pz - 2, z1: pz + 2 });
    t.at('crane', LAND.x1 - 4, pz - 7, Math.PI / 2, crane);
    if (ship) t.at('cargoship', 87, pz - 2 - 1.8, 0, ship, rng.pick(PALETTE.container));
    else t.at('fishingboat', 86, pz + 2 + 1.6, Math.PI, 12, rng.pick(PALETTE.container));
  }
  // The biggest ship moored along the quay.
  t.at('cargoship', LAND.x1 + 2.2, -78, Math.PI / 2, 20, 0xe84a4a);
  t.at('warehouse', (q.x0 + q.x1) / 2, -16, Math.PI / 2, 15, rng.pick([0xa9b3bf, 0x8fb3d9, 0xc9a07a]));
  t.at('warehouse', (q.x0 + q.x1) / 2, 32, Math.PI / 2, 16, rng.pick([0xa9b3bf, 0x8fb3d9, 0xc9a07a]));
  t.scatter('crate', q, [6, 7], 5);
  t.scatter('barrel', q, [5, 6], 4, PALETTE.container);
  t.scatter('fishstall', { ...q, z0: 40 }, [7, 8], 1);
  t.wander('forklift', q, [8, 8], 1, 0.15, false);
  t.wander('seagull', q, [5, 5], 2, 0.2, true);
}

/** The south beach, the marina, the breakwater with its lighthouse, and boats at sea. */
function seaside(t: Town): void {
  const { b } = t;
  const rng = t.zone(9);
  const beach: Area = { x0: LAND.x0 + 2, x1: CITY - 2, z0: CITY + 0.8, z1: LAND.z1 - 1 };
  // A promenade of palms, parasols and towels, people and gulls.
  for (let x = beach.x0 + 6; x < beach.x1; x += rng.range(24, 30)) t.at('palm', x, beach.z0 + 1.2, rng.range(0, 6), [9, 11]);
  t.scatter('parasol', { ...beach, z0: beach.z0 + 3 }, [7, 8], 5, PALETTE.shirt);
  t.scatter('rock', beach, [3, 5], 3);
  t.scatter('boat', { ...beach, z0: beach.z1 - 3 }, [8, 9], 2, PALETTE.container);
  t.scatter('crate', beach, [6, 6], 1);
  t.wander('seagull', beach, [5, 5], 2, 0.2, true);
  // Thin beaches on the west and north shores.
  t.scatter('rock', { x0: LAND.x0 + 1, x1: XS[0] - INSET - 0.5, z0: LAND.z0 + 4, z1: CITY }, [3, 5], 2);
  t.scatter('rock', { x0: LAND.x0 + 4, x1: CITY, z0: LAND.z0 + 1, z1: ZS[0] - INSET - 0.5 }, [3, 5], 2);
  // Marina piers off the south-east beach with boats moored alongside.
  for (const px of [38, 50, 62]) {
    b.rect(px, LAND.z1 + 8, 2, 16, '#a8743f');
    b.reserveArea({ x0: px - 1, x1: px + 1, z0: LAND.z1, z1: LAND.z1 + 16 });
    for (const [dz, type, lv] of [
      [4, 'boat', 9],
      [9, 'fishingboat', 12],
      [13.5, 'yacht', 13],
    ] as const) {
      if (rng.chance(0.45)) t.at(type, px + rng.sign() * 3.4, LAND.z1 + dz, Math.PI / 2 + (rng.chance(0.5) ? Math.PI : 0), [lv, lv + 1], rng.pick(PALETTE.container));
    }
  }
  // Breakwater and lighthouse.
  b.rect((LAND.x1 + 86) / 2, 64, 86 - LAND.x1, 2.6, '#9a968c');
  b.circle(88, 64, 5.6, '#9a968c');
  b.circle(88, 64, 4.4, '#b5b0a5');
  t.at('lighthouse', 88, 64, 0, 15);
  for (const p of ringPoints(5, 88, 64, 5.3)) t.at('rock', p.x, p.z, p.ang, [4, 6]);
  // Out at sea: sailboats, yachts and buoys, and a cargo ship sailing round.
  const sea: Area = { x0: -92, x1: 30, z0: LAND.z1 + 5, z1: 96 };
  t.wander('sailboat', sea, [10, 11], 1, 0.12, false, PALETTE.flower);
  t.wander('yacht', sea, [13, 14], 1, 0.1, false);
  t.scatter('buoy', sea, [5, 6], 3);
  t.scatter('buoy', { x0: LAND.x1 + 4, x1: 96, z0: -90, z1: 50 }, [5, 6], 2);
  const loop = b.addGraph(
    [
      { x: -84, z: 82 },
      { x: 26, z: 82 },
      { x: 26, z: 93 },
      { x: -84, z: 93 },
    ],
    [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
    ],
    true,
  );
  t.drive('cargoship', loop, () => 0, [18, 18], 1, 0.1, { tints: PALETTE.container });
}

// ---------------------------------------------------------------- map

/** Hometown: a seaside town round a park. The Garden realm lands in the park's flower bed. */
export function generateHometown(): MapData {
  const b = realmBuilder('hometown');
  const t = new Town(b);
  const start = setStart(b, 0, 0);

  coast(t);
  // The road between the two airfield blocks is the runway's.
  const { graph, segs } = roads(t, (s) => s.x0 === XS[2] && s.x1 === XS[2] && s.z0 === ZS[0]);

  park(t, cell(2, 2));
  airfield(t, { x0: XS[1] + INSET, x1: XS[3] - INSET, z0: ZS[0] + INSET, z1: ZS[1] - INSET });
  // Downtown on the harbour side, the civic centre north of the park.
  downtown(t, cell(3, 0), [['megatower', -70, 20]]);
  downtown(t, cell(3, 1), [['glasstower', -39, 18]]);
  const e = cell(3, 2);
  downtown(t, e, [
    ['megatower', e.z0 + 9, 19],
    ['skyscraper', e.z1 - 8, 17],
  ]);
  let rng = t.zone(10);
  const civic = cell(2, 1);
  b.rectArea(civic, PLAZA);
  b.rect(0, (civic.z0 + civic.z1) / 2, 6, civic.z1 - civic.z0, '#c9c2b2');
  planters(t, civic);
  t.at('townhall', 0, (civic.z0 + civic.z1) / 2 + 1, faceDir(0, 1), 16, 0xf0e6d8);
  t.at('office', civic.x0 + 5, (civic.z0 + civic.z1) / 2, 0, 15, rng.pick(PALETTE.building));
  t.at('glasstower', civic.x1 - 5, (civic.z0 + civic.z1) / 2, 0, 17, rng.pick(PALETTE.building));
  t.at('statue', 0, civic.z1 - 2, faceDir(0, 1), 10);
  t.scatter('flower', civic, [3, 4], 1, PALETTE.flower);
  const ne = cell(3, 3);
  b.rectArea(ne, PLAZA);
  planters(t, ne);
  t.at('apartment', ne.x0 + 5, ne.z0 + 5, 0, 14, rng.pick(PALETTE.building));
  t.at('apartment', ne.x1 - 5, ne.z0 + 5, Math.PI / 2, 15, rng.pick(PALETTE.building));
  t.at('gasstation', (ne.x0 + ne.x1) / 2, ne.z1 - 4, faceDir(0, 1), 14);
  shops(t, cell(1, 1));
  // Homes, a school sports ground and allotments in the west, two stadiums in the south.
  // House sizes come from one shuffled pool, so every size from 11 to 14 gets its share.
  const houses = t.zone(11).shuffle([11, 11, 12, 12, 12, 13, 13, 14, ...Array<undefined>(6)]);
  residential(t, cell(0, 0), 2, houses);
  residential(t, cell(0, 2), 3, houses);
  residential(t, cell(1, 3), 2, houses);
  sportsGround(t, cell(0, 1));
  allotments(t, cell(1, 2));
  arena(t, cell(2, 3), 19, 0);
  arena(t, cell(0, 3), 18, Math.PI / 2);

  harbour(t);
  seaside(t);
  streetProps(t, segs);

  // Roadworks with cones by the park, for the first seconds.
  rng = t.zone(12);
  for (let k = 0; k < 3; k++) t.at('cone', XS[2] + 8 + k * 1.9, ZS[2] - HW - 0.4, 0, 3);

  // Traffic, and people on the sidewalks.
  const lane = () => LANE;
  t.drive('car', graph, lane, [8, 10], 2, 0.22, { tints: PALETTE.car });
  t.drive('taxi', graph, lane, [8, 9], 1, 0.22);
  t.drive('van', graph, lane, [9, 10], 1, 0.2, { tints: PALETTE.car });
  t.drive('truck', graph, lane, [10, 11], 1, 0.18, { tints: PALETTE.car });
  t.drive('bus', graph, lane, [11, 12], 1, 0.18);
  t.drive('schoolbus', graph, lane, [11, 11], 1, 0.18);
  t.drive('icecream', graph, lane, [10, 10], 1, 0.16);

  return b.build(
    GRASS,
    OCEAN,
    {
      sky: '#8fd0f5',
      fog: '#cbe8f7',
      sun: '#fff4e0',
      hemiSky: '#e0f2ff',
      hemiGround: '#5f7a4a',
      sunIntensity: 2.3,
      motes: { colors: ['#ffffff', '#f4fbff', '#fff6d8'], count: 130, size: 0.7, drift: 0.7, rise: 0.06, twinkle: 0.25 },
    },
    start,
  );
}
