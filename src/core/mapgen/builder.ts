import type { MapId } from '../../config/balance';
import { OBJECT_TYPES, TYPE_INDEX, distToSolid, footprintOf, solidShape, type SolidShape } from '../../config/objects';
import { Rng } from '../rng';
import { SpatialGrid } from '../spatial';

export interface MoveGraph {
  nodes: { x: number; z: number }[];
  adj: number[][];
}

export type MoveSpec =
  | { kind: 'graph'; graph: number; lane: number; speed: number; flee?: boolean; from: number; to: number }
  | { kind: 'wander'; x0: number; x1: number; z0: number; z1: number; speed: number; flee?: boolean };

export interface Spawn {
  type: string;
  x: number;
  z: number;
  rot: number;
  scale: number;
  tint: number;
  move?: MoveSpec;
}

export type Paint =
  | { k: 'rect'; x: number; z: number; w: number; d: number; c: string; r?: number }
  | { k: 'circle'; x: number; z: number; r: number; c: string }
  | { k: 'ring'; x: number; z: number; r0: number; r1: number; c: string };

export interface MapTheme {
  sky: string;
  fog: string;
  sun: string;
  hemiSky: string;
  hemiGround: string;
  sunIntensity: number;
}

export interface MapData {
  id: MapId;
  size: number;
  half: number;
  base: string;
  outside: string;
  paint: Paint[];
  spawns: Spawn[];
  graphs: MoveGraph[];
  theme: MapTheme;
  start: { x: number; z: number };
  /** Permanent no-go circles for wandering movers (ponds). */
  blocks: { x: number; z: number; r: number }[];
  /** Road graph and vehicle mix for the rush hour event. */
  traffic?: Traffic;
  /** Weighted animal mix for the stampede event; maps without one get no stampede. */
  herd?: readonly (readonly [string, number])[];
}

export interface Traffic {
  graph: number;
  lane: number;
  speed: number;
  types: string[];
}

export interface Area {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

interface Circle {
  x: number;
  z: number;
  r: number;
  cell: number;
}

interface Solid {
  x: number;
  z: number;
  rot: number;
  shape: SolidShape;
  /** Bounding radius of the shape. */
  ext: number;
  f: number;
  cell: number;
}

/** A smaller prop counts as "inside" a solid when its core (this fraction of its footprint) overlaps it. */
const INSIDE_CORE = 0.4;
/** Only props at least this much bigger can swallow a smaller one visually. */
const INSIDE_RATIO = 1.5;

function shapeExtent(s: SolidShape): number {
  return s.round ? s.hw : Math.hypot(s.hw, s.hd);
}

export const PALETTE = {
  car: [0xe84a4a, 0x3b82f6, 0xf5c542, 0x38c172, 0xffffff, 0x2d3748, 0xf08a24, 0x9b5de5, 0x5ec8e5, 0xc0c4cc],
  shirt: [0xe84a4a, 0x3b82f6, 0xf5c542, 0x38c172, 0xff7eb6, 0x9b5de5, 0xf08a24, 0x5ec8e5, 0xffffff, 0x4a5568],
  house: [0xfff3d6, 0xffd6a5, 0xcde7ff, 0xffc9de, 0xd8f5c4, 0xf7e1a1, 0xe9d5ff, 0xffffff],
  building: [0xd9e2ec, 0xbcccdc, 0xf0e6d8, 0xe8d5c4, 0xc6d8e8, 0xdcd3f0, 0xe2e8d0],
  container: [0xe84a4a, 0x3b82f6, 0x38c172, 0xf08a24, 0xf5c542, 0x9b5de5, 0x2bb3b1],
  flower: [0xff5fa2, 0xffd23d, 0xff7a45, 0xb37bff, 0xffffff],
};

export class MapBuilder {
  readonly rng: Rng;
  readonly half: number;
  readonly paint: Paint[] = [];
  readonly spawns: Spawn[] = [];
  readonly graphs: MoveGraph[] = [];
  /** Each graph's neighbours both ways, for spawns: `adj` lists only the ways out on a one-way graph. */
  private readonly links: number[][][] = [];
  readonly blocks: MapData['blocks'] = [];
  traffic?: Traffic;
  herd?: MapData['herd'];
  private placer: SpatialGrid<Circle>;
  private solids: SpatialGrid<Solid>;
  private maxR = 1;
  private maxSolid = 1;

  constructor(
    readonly id: MapId,
    readonly size: number,
    seed: number,
  ) {
    this.rng = new Rng(seed);
    this.half = size / 2;
    this.placer = new SpatialGrid<Circle>(size, 8);
    this.solids = new SpatialGrid<Solid>(size, 8);
  }

  // -------------------------------------------------------------- ground paint
  rect(x: number, z: number, w: number, d: number, c: string, r = 0): void {
    this.paint.push({ k: 'rect', x, z, w, d, c, r: r || undefined });
  }

  rectArea(a: Area, c: string): void {
    this.rect((a.x0 + a.x1) / 2, (a.z0 + a.z1) / 2, a.x1 - a.x0, a.z1 - a.z0, c);
  }

  circle(x: number, z: number, r: number, c: string): void {
    this.paint.push({ k: 'circle', x, z, r, c });
  }

  ring(x: number, z: number, r0: number, r1: number, c: string): void {
    this.paint.push({ k: 'ring', x, z, r0, r1, c });
  }

  // -------------------------------------------------------------- occupancy
  reserve(x: number, z: number, r: number): void {
    const c: Circle = { x, z, r, cell: -1 };
    this.placer.insert(c);
    this.maxR = Math.max(this.maxR, r);
  }

  reserveArea(a: Area): void {
    // Cover a rectangle with overlapping circles.
    const step = 3;
    for (let x = a.x0 + step / 2; x < a.x1; x += step) {
      for (let z = a.z0 + step / 2; z < a.z1; z += step) this.reserve(x, z, step * 0.75);
    }
  }

  /** Water and other ground that wandering movers must stay out of (also reserved for props). */
  blockCircle(x: number, z: number, r: number): void {
    this.reserve(x, z, r);
    this.blocks.push({ x, z, r });
  }

  /**
   * Whether a prop of reservation radius r fits at (x, z): clear of every reserved circle and
   * every solid body. A solid candidate (`shape`) must also not cover reserved circle centres.
   */
  isFree(x: number, z: number, r: number, shape?: SolidShape, rot = 0): boolean {
    if (Math.abs(x) > this.half - r || Math.abs(z) > this.half - r) return false;
    let free = true;
    const reach = shape ? Math.max(r, shapeExtent(shape)) : r;
    this.placer.query(x, z, reach + this.maxR, (c) => {
      if (!free) return;
      const dx = c.x - x;
      const dz = c.z - z;
      const rr = c.r + r;
      if (dx * dx + dz * dz < rr * rr) free = false;
      else if (shape && distToSolid(shape, x, z, rot, c.x, c.z) < c.r * 0.6) free = false;
    });
    if (!free) return false;
    this.solids.query(x, z, reach + this.maxSolid, (s) => {
      if (free && distToSolid(s.shape, s.x, s.z, s.rot, x, z) < r) free = false;
    });
    return free;
  }

  // -------------------------------------------------------------- spawning
  put(
    type: string,
    x: number,
    z: number,
    rot = 0,
    opts: { scale?: number; tint?: number; move?: MoveSpec; force?: boolean; pad?: number } = {},
  ): boolean {
    const ti = TYPE_INDEX[type];
    if (ti === undefined) throw new Error(`unknown type ${type}`);
    const def = OBJECT_TYPES[ti];
    const scale = opts.scale ?? 1;
    const f = footprintOf(def, scale);
    const r = f * (opts.pad ?? 0.8);
    const shape = opts.move ? null : solidShape(def, scale);
    if (!opts.force && !opts.move && !this.isFree(x, z, r, shape ?? undefined, rot)) return false;
    if (!opts.move) this.reserve(x, z, r);
    if (shape) {
      const ext = shapeExtent(shape);
      this.solids.insert({ x, z, rot, shape, ext, f, cell: -1 });
      this.maxSolid = Math.max(this.maxSolid, ext);
    }
    this.spawns.push({ type, x, z, rot, scale, tint: opts.tint ?? 0xffffff, move: opts.move });
    return true;
  }

  /** Deepest overlap test: is (x, z) within `margin` of a solid at least `minF` big? */
  private insideSolid(x: number, z: number, margin: number, minF: number): boolean {
    let hit = false;
    this.solids.query(x, z, margin + this.maxSolid, (s) => {
      if (!hit && s.f >= minF && distToSolid(s.shape, s.x, s.z, s.rot, x, z) < margin) hit = true;
    });
    return hit;
  }

  /**
   * Final clean-up: forced layouts can still drop small props into bigger buildings, and wander
   * movers start anywhere in their area. Drop the former and move the latter out.
   */
  private resolveOverlaps(): void {
    const kept: Spawn[] = [];
    for (const s of this.spawns) {
      const def = OBJECT_TYPES[TYPE_INDEX[s.type]];
      const f = footprintOf(def, s.scale);
      if (!s.move) {
        if (!this.insideSolid(s.x, s.z, Math.max(0.2, f * INSIDE_CORE), f * INSIDE_RATIO)) kept.push(s);
        continue;
      }
      if (s.move.kind === 'wander') {
        const m = s.move;
        // Margin covers the world's 1 m blocking raster (cell half-diagonal) plus the mover's body.
        const blocked = (x: number, z: number) =>
          this.insideSolid(x, z, 1.1 + f * 0.3, 0) || this.blocks.some((b) => Math.hypot(x - b.x, z - b.z) < b.r + 1);
        for (let tries = 0; tries < 40 && blocked(s.x, s.z); tries++) {
          s.x = this.rng.range(m.x0, m.x1);
          s.z = this.rng.range(m.z0, m.z1);
        }
      }
      kept.push(s);
    }
    this.spawns.length = 0;
    this.spawns.push(...kept);
  }

  /** Random placements inside an area; returns how many succeeded. */
  scatter(
    type: string | (() => string),
    a: Area,
    count: number,
    opts: { scale?: [number, number]; tint?: () => number; pad?: number; tries?: number } = {},
  ): number {
    let placed = 0;
    const tries = count * (opts.tries ?? 6);
    for (let i = 0; i < tries && placed < count; i++) {
      const t = typeof type === 'string' ? type : type();
      const x = this.rng.range(a.x0, a.x1);
      const z = this.rng.range(a.z0, a.z1);
      const s = opts.scale ? this.rng.range(opts.scale[0], opts.scale[1]) : 1;
      if (this.put(t, x, z, this.rng.range(0, Math.PI * 2), { scale: s, tint: opts.tint?.(), pad: opts.pad })) placed++;
    }
    return placed;
  }

  wanderer(type: string, a: Area, speed: number, opts: { tint?: number; flee?: boolean; scale?: number } = {}): void {
    const x = this.rng.range(a.x0, a.x1);
    const z = this.rng.range(a.z0, a.z1);
    this.put(type, x, z, this.rng.range(0, Math.PI * 2), {
      tint: opts.tint,
      scale: opts.scale,
      move: { kind: 'wander', ...a, speed: speed * this.rng.range(0.8, 1.2), flee: opts.flee },
    });
  }

  /**
   * Adds a graph for graph movers. On a one-way graph they drive each edge only from its first node
   * to its second, so movers sharing a lane never meet head-on.
   */
  addGraph(nodes: { x: number; z: number }[], edges: [number, number][], oneWay = false): number {
    const links: number[][] = nodes.map(() => []);
    const adj = oneWay ? nodes.map((): number[] => []) : links;
    for (const [a, b] of edges) {
      links[a].push(b);
      links[b].push(a);
      if (oneWay) adj[a].push(b);
    }
    this.graphs.push({ nodes, adj });
    this.links.push(links);
    return this.graphs.length - 1;
  }

  /** Puts a graph mover at a random edge of the given graph. */
  graphMover(type: string, graph: number, lane: number, speed: number, opts: { tint?: number; flee?: boolean; scale?: number } = {}): void {
    const g = this.graphs[graph];
    const links = this.links[graph];
    let a = this.rng.int(0, g.nodes.length - 1);
    if (links[a].length === 0) return;
    let b = this.rng.pick(links[a]);
    const t = this.rng.range(0.15, 0.85);
    const x = g.nodes[a].x + (g.nodes[b].x - g.nodes[a].x) * t;
    const z = g.nodes[a].z + (g.nodes[b].z - g.nodes[a].z) * t;
    // One-way graph: drive the picked edge its own way from the same spot, with the same draws.
    if (!g.adj[a].includes(b)) [a, b] = [b, a];
    this.put(type, x, z, 0, {
      tint: opts.tint,
      scale: opts.scale,
      move: { kind: 'graph', graph, lane, speed: speed * this.rng.range(0.85, 1.15), flee: opts.flee, from: a, to: b },
    });
  }

  tint(list: readonly number[]): number {
    return this.rng.pick(list);
  }

  build(base: string, outside: string, theme: MapTheme, start = { x: 0, z: 0 }): MapData {
    this.resolveOverlaps();
    return {
      id: this.id,
      size: this.size,
      half: this.half,
      base,
      outside,
      paint: this.paint,
      spawns: this.spawns,
      graphs: this.graphs,
      theme,
      start,
      blocks: this.blocks,
      traffic: this.traffic,
      herd: this.herd,
    };
  }
}

// ---------------------------------------------------------------- road grid helper

export interface RoadStyle {
  roadW: number;
  walkW: number;
  asphalt: string;
  walk: string;
  /** Centre-line dash colour; omit for unmarked (dirt) roads. */
  line?: string;
  edgeLine?: string;
  crosswalk?: string;
  dash?: number;
}

export interface RoadGrid {
  xs: number[];
  zs: number[];
  style: RoadStyle;
  graph: number;
  blocks: (Area & { i: number; j: number })[];
  /** Sidewalk segments (centre line) where street props can go. */
  walks: { x0: number; z0: number; x1: number; z1: number; nx: number; nz: number }[];
  /** Road segments between intersections (centre line). */
  segments: { x0: number; z0: number; x1: number; z1: number }[];
}

export function buildRoadGrid(b: MapBuilder, xs: number[], zs: number[], style: RoadStyle): RoadGrid {
  const { roadW, walkW } = style;
  const hw = roadW / 2;
  const minX = xs[0];
  const maxX = xs[xs.length - 1];
  const minZ = zs[0];
  const maxZ = zs[zs.length - 1];
  const len = (a: number, c: number) => c - a;

  // Sidewalks first, then asphalt on top.
  for (const z of zs) b.rect((minX + maxX) / 2, z, len(minX, maxX) + roadW + walkW * 2, roadW + walkW * 2, style.walk);
  for (const x of xs) b.rect(x, (minZ + maxZ) / 2, roadW + walkW * 2, len(minZ, maxZ) + roadW + walkW * 2, style.walk);
  for (const z of zs) b.rect((minX + maxX) / 2, z, len(minX, maxX) + roadW, roadW, style.asphalt);
  for (const x of xs) b.rect(x, (minZ + maxZ) / 2, roadW, len(minZ, maxZ) + roadW, style.asphalt);

  const segments: RoadGrid['segments'] = [];
  const walks: RoadGrid['walks'] = [];
  const dash = style.dash ?? 2.4;
  const clear = hw + walkW + 0.5;
  const markLine = (x0: number, z0: number, x1: number, z1: number) => {
    const horiz = z0 === z1;
    const L = horiz ? x1 - x0 : z1 - z0;
    const usable = L - roadW * 2;
    if (usable <= 0) return;
    const n = Math.floor(usable / (dash * 2));
    const start = (horiz ? x0 : z0) + roadW + (usable - n * dash * 2) / 2 + dash / 2;
    for (let k = 0; style.line && k < n; k++) {
      const p = start + k * dash * 2;
      if (horiz) b.rect(p, z0, dash, 0.22, style.line);
      else b.rect(x0, p, 0.22, dash, style.line);
    }
    if (style.crosswalk) {
      for (const end of [0, 1]) {
        const base = horiz ? (end === 0 ? x0 + hw + 1.4 : x1 - hw - 1.4) : end === 0 ? z0 + hw + 1.4 : z1 - hw - 1.4;
        for (let s = -hw + 0.9; s < hw - 0.5; s += 1.2) {
          if (horiz) b.rect(base, z0 + s + 0.3, 2.0, 0.6, style.crosswalk);
          else b.rect(x0 + s + 0.3, base, 0.6, 2.0, style.crosswalk);
        }
      }
    }
  };

  for (const z of zs) {
    for (let i = 0; i < xs.length - 1; i++) {
      segments.push({ x0: xs[i], z0: z, x1: xs[i + 1], z1: z });
      markLine(xs[i], z, xs[i + 1], z);
      for (const side of [-1, 1]) {
        const off = side * (hw + walkW / 2);
        walks.push({ x0: xs[i] + clear, z0: z + off, x1: xs[i + 1] - clear, z1: z + off, nx: 0, nz: side });
      }
    }
  }
  for (const x of xs) {
    for (let j = 0; j < zs.length - 1; j++) {
      segments.push({ x0: x, z0: zs[j], x1: x, z1: zs[j + 1] });
      markLine(x, zs[j], x, zs[j + 1]);
      for (const side of [-1, 1]) {
        const off = side * (hw + walkW / 2);
        walks.push({ x0: x + off, z0: zs[j] + clear, x1: x + off, z1: zs[j + 1] - clear, nx: side, nz: 0 });
      }
    }
  }

  // Graph over intersections.
  const nodes: { x: number; z: number }[] = [];
  const edges: [number, number][] = [];
  for (let j = 0; j < zs.length; j++) for (let i = 0; i < xs.length; i++) nodes.push({ x: xs[i], z: zs[j] });
  for (let j = 0; j < zs.length; j++) {
    for (let i = 0; i < xs.length; i++) {
      const n = i + j * xs.length;
      if (i < xs.length - 1) edges.push([n, n + 1]);
      if (j < zs.length - 1) edges.push([n, n + xs.length]);
    }
  }
  const graph = b.addGraph(nodes, edges);

  // Keep props off the asphalt and sidewalks.
  for (const s of segments) {
    const horiz = s.z0 === s.z1;
    const area: Area = horiz
      ? { x0: s.x0 - hw, x1: s.x1 + hw, z0: s.z0 - hw - walkW * 0.6, z1: s.z0 + hw + walkW * 0.6 }
      : { x0: s.x0 - hw - walkW * 0.6, x1: s.x0 + hw + walkW * 0.6, z0: s.z0 - hw, z1: s.z1 + hw };
    b.reserveArea(area);
  }

  const blocks: RoadGrid['blocks'] = [];
  const inset = hw + walkW;
  for (let j = 0; j < zs.length - 1; j++) {
    for (let i = 0; i < xs.length - 1; i++) {
      blocks.push({ x0: xs[i] + inset, x1: xs[i + 1] - inset, z0: zs[j] + inset, z1: zs[j + 1] - inset, i, j });
    }
  }
  return { xs, zs, style, graph, blocks, walks, segments };
}

/** Places props along sidewalks at a rough spacing. `pick` returns a type or null to skip. */
export function decorateWalks(
  b: MapBuilder,
  grid: RoadGrid,
  spacing: number,
  pick: (rng: Rng) => string | null,
  edgeOffset = 0.6,
): void {
  const { walkW } = grid.style;
  for (const w of grid.walks) {
    const horiz = w.z0 === w.z1;
    const L = horiz ? w.x1 - w.x0 : w.z1 - w.z0;
    const n = Math.max(1, Math.floor(L / spacing));
    for (let k = 0; k <= n; k++) {
      const t = (k + b.rng.range(-0.2, 0.2)) / n;
      const type = pick(b.rng);
      if (!type) continue;
      // Push toward the outer (block) edge of the sidewalk.
      const out = (walkW / 2 - edgeOffset) * (horiz ? w.nz : w.nx);
      const x = horiz ? w.x0 + L * t : w.x0 + out;
      const z = horiz ? w.z0 + out : w.z0 + L * t;
      const rot = horiz ? (w.nz > 0 ? Math.PI / 2 : -Math.PI / 2) : w.nx > 0 ? Math.PI : 0;
      b.put(type, x, z, rot, { force: true, tint: b.tint(PALETTE.flower) });
    }
  }
}

/** Parks cars along the curb of road segments. */
export function parkCars(b: MapBuilder, grid: RoadGrid, chance: number, types: [string, number][]): void {
  const hw = grid.style.roadW / 2;
  for (const s of grid.segments) {
    const horiz = s.z0 === s.z1;
    const L = horiz ? s.x1 - s.x0 : s.z1 - s.z0;
    for (const side of [-1, 1]) {
      if (!b.rng.chance(chance)) continue;
      const off = side * (hw - 1.15);
      for (let p = hw + 5; p < L - hw - 5; p += b.rng.range(6, 9)) {
        if (!b.rng.chance(0.6)) continue;
        const type = b.rng.weighted(types);
        const x = horiz ? s.x0 + p : s.x0 + off;
        const z = horiz ? s.z0 + off : s.z0 + p;
        const rot = horiz ? (side > 0 ? 0 : Math.PI) : side > 0 ? Math.PI / 2 : -Math.PI / 2;
        b.put(type, x, z, rot, { force: true, tint: b.tint(PALETTE.car) });
      }
    }
  }
}

export function subdivide(a: Area, nx: number, nz: number): Area[] {
  const out: Area[] = [];
  const w = (a.x1 - a.x0) / nx;
  const d = (a.z1 - a.z0) / nz;
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) out.push({ x0: a.x0 + i * w, x1: a.x0 + (i + 1) * w, z0: a.z0 + j * d, z1: a.z0 + (j + 1) * d });
  return out;
}

export function shrink(a: Area, m: number): Area {
  return { x0: a.x0 + m, x1: a.x1 - m, z0: a.z0 + m, z1: a.z1 - m };
}

export const center = (a: Area) => ({ x: (a.x0 + a.x1) / 2, z: (a.z0 + a.z1) / 2 });

export const areaOf = (a: Area) => (a.x1 - a.x0) * (a.z1 - a.z0);

/** `n` evenly spaced points on a circle of radius `r` around (x, z), the first on the +X side. */
export function ringPoints(n: number, x: number, z: number, r: number): { k: number; ang: number; x: number; z: number }[] {
  const out = [];
  for (let k = 0; k < n; k++) {
    const ang = (k / n) * Math.PI * 2;
    out.push({ k, ang, x: x + Math.cos(ang) * r, z: z + Math.sin(ang) * r });
  }
  return out;
}

/**
 * The four strips between a square core (|x| and |z| up to `edge`) and the map border, 1 m in from
 * it: north and south span the full width, west and east fill the gap between them.
 */
export function ringStrips(b: MapBuilder, edge: number): [north: Area, south: Area, west: Area, east: Area] {
  const H = b.size / 2 - 1;
  return [
    { x0: -H, x1: H, z0: -H, z1: -edge },
    { x0: -H, x1: H, z0: edge, z1: H },
    { x0: -H, x1: -edge, z0: -edge, z1: edge },
    { x0: edge, x1: H, z0: -edge, z1: edge },
  ];
}

/**
 * A row of parking bays along X at `z`: a stripe of length `stripe` every 3 m from `x0` while
 * x < `x1`, each bay holding a car or van (nose to +Z or -Z) at chance `fill`.
 */
export function parkingRow(b: MapBuilder, x0: number, x1: number, z: number, stripe: number, fill: number): void {
  for (let x = x0; x < x1; x += 3) {
    b.rect(x, z, 0.15, stripe, '#f4f4f4');
    if (b.rng.chance(fill)) b.put(b.rng.chance(0.85) ? 'car' : 'van', x + 1.5, z, Math.PI / 2 + (b.rng.chance(0.5) ? Math.PI : 0), { force: true, tint: b.tint(PALETTE.car) });
  }
}

/** Rotation that makes a building's front (+X) face direction (dx, dz). */
export function faceDir(dx: number, dz: number): number {
  return Math.atan2(-dz, dx);
}

/** Ring of cones, barriers and hydrants around the map start so the first seconds are full of snacks. */
export function startSnacks(b: MapBuilder, hw: number, x = 0, z = 0): void {
  for (const p of ringPoints(10, x, z, 3.2)) b.put('cone', p.x, p.z, 0, { force: true });
  b.put('barrier', x, z - hw + 1.4, 0, { force: true });
  b.put('barrier', x, z + hw - 1.4, 0, { force: true });
  for (const [dx, dz] of [
    [-7, -7],
    [7, -7],
    [-7, 7],
    [7, 7],
  ]) {
    b.put('hydrant', x + dx, z + dz, 0, { force: true });
    b.put('cone', x + dx * 0.6, z + dz * 1.2, 0, { force: true });
  }
}

/** Fence segments around a rectangle, leaving a gate gap on one side. */
export function fenceRect(b: MapBuilder, a: Area, gate = true): void {
  const seg = 3;
  const sides: [number, number, number, number, number][] = [
    [a.x0, a.z0, a.x1, a.z0, 0],
    [a.x0, a.z1, a.x1, a.z1, 0],
    [a.x0, a.z0, a.x0, a.z1, Math.PI / 2],
    [a.x1, a.z0, a.x1, a.z1, Math.PI / 2],
  ];
  sides.forEach(([x0, z0, x1, z1, rot], si) => {
    const L = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.floor(L / seg);
    for (let k = 0; k < n; k++) {
      if (gate && si === 1 && k === Math.floor(n / 2)) continue;
      const t = (k + 0.5) / n;
      b.put('fence', x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, rot, { force: true });
    }
  });
}

/** Striped crop field paint. */
export function fieldPaint(b: MapBuilder, a: Area, colors: string[], stripe = 2.4, vertical = false): void {
  b.rectArea(a, colors[0]);
  let k = 0;
  if (vertical) {
    for (let x = a.x0; x < a.x1; x += stripe) b.rect(x + stripe / 2, (a.z0 + a.z1) / 2, stripe * 0.55, a.z1 - a.z0, colors[1 + (k++ % (colors.length - 1))]);
  } else {
    for (let z = a.z0; z < a.z1; z += stripe) b.rect((a.x0 + a.x1) / 2, z + stripe / 2, a.x1 - a.x0, stripe * 0.55, colors[1 + (k++ % (colors.length - 1))]);
  }
}

/** Dense nature ring between the playable core and the map edge. */
export function natureRing(b: MapBuilder, edge: number, types: [string, number][], density: number, scale: [number, number] = [0.7, 1.4]): void {
  for (const s of ringStrips(b, edge)) b.scatter(() => b.rng.weighted(types), s, Math.floor(areaOf(s) / density), { scale });
}
