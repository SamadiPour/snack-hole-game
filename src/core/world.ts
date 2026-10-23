import { ABILITIES, ABILITY_LEVEL, GOLDEN, HELPERS, MAP_CLEARED_FRACTION, ROUND_END, SIZE, TOUR, type AbilityId } from '../config/balance';
import { OBJECT_TYPES, baseValueOf, distToSolid, footprintOf, solidShape, typeId, xpOf } from '../config/objects';
import {
  comboMult,
  frontierXpMult,
  holeSpeed,
  magnetPull,
  magnetRangeFrac,
  megaScale,
  radiusForLevel,
  timeBonusFrac,
  xpForLevel,
  type RoundConfig,
} from './economy';
import type { MapData } from './mapgen/builder';
import { Rng } from './rng';
import { RoundEvents, type EventId } from './roundEvents';
import { SpatialGrid } from './spatial';
import { SENSE_EVERY, senseTraffic } from './traffic';

export type { EventId };

export const ALIVE = 0;
export const FALLING = 1;
export const GONE = 2;
/** Event prop waiting off-stage (not simulated, not drawn, not counted in map %). */
export const DORMANT = 3;

export const MV_NONE = 0;
export const MV_GRAPH = 1;
export const MV_WANDER = 2;
/** Straight run to (tx, tz), then leave the stage (stampedes, UFO fly-by). */
export const MV_RUN = 3;

/** A prop in the world. Plain mutable class so V8 keeps one hidden shape. */
export class WObj {
  id = 0;
  t = 0;
  x = 0;
  z = 0;
  y = 0;
  baseY = 0;
  rot = 0;
  s = 1;
  tint = 0xffffff;
  f = 0;
  h = 0;
  value = 0;
  xp = 0;
  w = 0;
  state = ALIVE;
  cell = -1;
  /** Index inside the renderer's instanced mesh for this type. */
  inst = -1;
  // movement
  mv = MV_NONE;
  speed = 0;
  flee = false;
  graph = 0;
  lane = 0;
  from = 0;
  to = 0;
  /** Road vehicles: the node they turn toward at `to`, picked on the way in (-1 until then). */
  next = -1;
  phase = 0;
  tx = 0;
  tz = 0;
  wait = 0;
  /** MV_RUN: seconds spent detouring around the current obstacle (see RUNNER_PATIENCE). */
  detour = 0;
  /**
   * Road vehicles (see senseTraffic): speed factor from the traffic ahead, the vehicle it waits on,
   * the side room it has past that vehicle, seconds to its next look.
   */
  brake = 1;
  blocker: WObj | null = null;
  clear = 0;
  sense = 0;
  x0 = 0;
  x1 = 0;
  z0 = 0;
  z1 = 0;
  bob = 0;
  // falling
  hole = -1;
  ox = 0;
  oz = 0;
  tilt = 0;
  tdx = 0;
  tdz = 0;
  vy = 0;
  ft = 0;
  wob = 0;
  dirty = true;
  /** Worth GOLDEN.valueMul x; drawn gold. */
  gold = false;
  /** Bonus prop from a random event: excluded from map % and the size hints. */
  event = false;
  /** MV_RUN only: flies (ignores solid props). */
  fly = false;
  /** Falling from the sky (UFO drops). */
  dropVy = 0;
}

export class WHole {
  x = 0;
  z = 0;
  vx = 0;
  vz = 0;
  /** Radius from size level (before Mega Mouth). */
  baseR = 1;
  /** Current, smoothly tweened radius used for eating and drawing. */
  r = 1;
  level = 0;
  xp = 0;
  main = true;
  // helper AI
  tx = 0;
  tz = 0;
  think = 0;
  target: WObj | null = null;
}

export type WEvent =
  | { k: 'eat'; o: WObj; hole: number; cash: number; combo: number }
  | { k: 'level'; level: number }
  | { k: 'comboEnd'; n: number }
  | { k: 'ability'; id: AbilityId }
  | { k: 'tick'; s: number }
  | { k: 'event'; id: EventId; on: boolean }
  | { k: 'timeUp' }
  | { k: 'cleared' }
  /** Nothing reachable is left: the round finishes early with a time bonus. */
  | { k: 'snackedOut'; bonusFrac: number }
  /** Casual round where nothing left can grow the hole: it grows a level for free (a `level` follows). */
  | { k: 'catchUp' }
  | { k: 'end' };

export type EndReason = 'timeUp' | 'cleared' | 'snackedOut';

export interface AbilityState {
  cd: number;
  active: number;
}

export interface WorldOptions {
  /** Hub attract mode: endless, no timer. */
  demo?: boolean;
  seed?: number;
}

/**
 * 1 m raster of where wanderers may not walk: spawn index + 1 of the biggest solid prop covering
 * the cell (free again once that prop is eaten), -1 for permanent blocks such as ponds.
 */
interface BlockMap {
  n: number;
  half: number;
  cells: Int32Array;
}

const blockCache = new WeakMap<MapData, BlockMap>();
const MOVE_FREE = 0;
const MOVE_ARRIVED = 1;
const MOVE_BLOCKED = 2;

function blockMapFor(map: MapData): BlockMap {
  let bm = blockCache.get(map);
  if (bm) return bm;
  const n = Math.ceil(map.size);
  const half = map.size / 2;
  const cells = new Int32Array(n * n);
  const best = new Float32Array(n * n);
  const margin = 0.35;
  const raster = (x: number, z: number, ext: number, hit: (cx: number, cz: number) => boolean, value: number, f: number) => {
    const i0 = Math.max(0, Math.floor(x - ext + half));
    const i1 = Math.min(n - 1, Math.floor(x + ext + half));
    const j0 = Math.max(0, Math.floor(z - ext + half));
    const j1 = Math.min(n - 1, Math.floor(z + ext + half));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = i + j * n;
        if (cells[k] < 0 || best[k] >= f) continue;
        if (!hit(i + 0.5 - half, j + 0.5 - half)) continue;
        cells[k] = value;
        best[k] = f;
      }
    }
  };
  map.spawns.forEach((s, idx) => {
    if (s.move) return;
    const def = OBJECT_TYPES[typeId(s.type)];
    const shape = solidShape(def, s.scale);
    if (!shape) return;
    const ext = (shape.round ? shape.hw : Math.hypot(shape.hw, shape.hd)) + margin + 1;
    raster(s.x, s.z, ext, (cx, cz) => distToSolid(shape, s.x, s.z, s.rot, cx, cz) <= margin, idx + 1, footprintOf(def, s.scale));
  });
  for (const b of map.blocks) raster(b.x, b.z, b.r + 1, (cx, cz) => Math.hypot(cx - b.x, cz - b.z) <= b.r, -1, Infinity);
  bm = { n, half, cells };
  blockCache.set(map, bm);
  return bm;
}

export function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/**
 * Spends `g.xp` on size levels, one level's cost at a time, up to level `max`. Returns how many
 * levels `g` gained.
 */
function spendXp(g: { level: number; xp: number }, max: number): number {
  const from = g.level;
  let need = xpForLevel(g.level);
  while (g.level < max && g.xp >= need) {
    g.xp -= need;
    g.level++;
    need = xpForLevel(g.level);
  }
  return g.level - from;
}

export class World {
  readonly objects: WObj[] = [];
  readonly movers: WObj[] = [];
  readonly falling: WObj[] = [];
  readonly holes: WHole[] = [];
  readonly grid: SpatialGrid<WObj>;
  readonly events: WEvent[] = [];
  readonly rng: Rng;
  readonly abilities: Record<AbilityId, AbilityState> = {
    dash: { cd: 0, active: 0 },
    vortex: { cd: 0, active: 0 },
    mega: { cd: 0, active: 0 },
  };

  input = { x: 0, z: 0 };
  time = 0;
  timeLeft: number;
  running = true;
  ended = false;
  endReason: EndReason | null = null;
  /** World time when the round stopped (0 while it runs). */
  endedAt = 0;
  /** Cash paid for finishing early (already included in `cash`). */
  timeBonus = 0;
  private endDelay = 0;
  private reachCheck = 0;
  /** Casual rounds: seconds catch-up has waited for the props the current size brought within reach. */
  private catchUpWait = 0;
  /** Objects sorted by footprint, for reachableLeft. */
  private bySize: WObj[] = [];
  /** Map props grouped by type, each sorted by footprint, for nextSnack. `i` skips eaten ones. */
  private byType: { objs: WObj[]; i: number }[] | null = null;

  cash = 0;
  helperCash = 0;
  eaten = 0;
  helperEaten = 0;
  biggest: WObj | null = null;
  combo = 0;
  comboTimer = 0;
  comboBest = 0;
  weightTotal = 0;
  weightEaten = 0;
  maxF = 1;
  levelsGained = 0;
  /** Count of eaten objects per type id, for Gulpedia. */
  readonly eatenByType = new Map<number, number>();
  /** Golden props (for sparkles). */
  readonly golden: WObj[] = [];
  goldEaten = 0;
  private readonly block: BlockMap;
  private readonly roundEvents: RoundEvents;
  /** Static props the magnet moved during a grid query; re-filed after it so none is visited twice. */
  private readonly pulled: WObj[] = [];
  /** Road vehicles among the movers, in mover order, rebuilt each step: all senseTraffic looks at. */
  private readonly roads: WObj[] = [];

  constructor(
    readonly map: MapData,
    readonly cfg: RoundConfig,
    readonly opts: WorldOptions = {},
  ) {
    this.rng = new Rng(opts.seed ?? 12345);
    this.grid = new SpatialGrid<WObj>(map.size, 8);
    this.block = blockMapFor(map);
    this.timeLeft = opts.demo ? Infinity : cfg.roundTime;
    // Each ability starts the round `startCharge` charged: Dash ready, Vortex and Mega Mouth empty.
    for (const a of ABILITIES) this.abilities[a.id].cd = cfg.abilities[a.id].cooldown * (1 - a.startCharge);

    for (const s of map.spawns) {
      const o = this.initObj(s.type, s.scale, s.tint);
      o.x = s.x;
      o.z = s.z;
      o.rot = s.rot;
      // Map % is weighted by ground area, so landmarks count for more than a pile of cones.
      o.w = o.f * o.f;
      this.weightTotal += o.w;
      this.maxF = Math.max(this.maxF, o.f);
      const mv = s.move;
      if (mv) {
        o.speed = mv.speed;
        o.flee = !!mv.flee;
        o.bob = this.rng.range(0, 10);
        if (mv.kind === 'graph') {
          o.mv = MV_GRAPH;
          o.graph = mv.graph;
          o.lane = mv.lane;
          o.from = mv.from;
          o.to = mv.to;
          this.initGraphMover(o);
        } else {
          o.mv = MV_WANDER;
          o.x0 = mv.x0;
          o.x1 = mv.x1;
          o.z0 = mv.z0;
          o.z1 = mv.z1;
          o.tx = o.x;
          o.tz = o.z;
          o.wait = this.rng.range(0, 2);
        }
        this.movers.push(o);
      } else {
        this.grid.insert(o);
      }
    }

    this.roundEvents = new RoundEvents(this);
    if (!opts.demo) this.roundEvents.setup();
    for (const o of this.objects) {
      if (o.gold || this.rng.next() >= cfg.goldChance) continue;
      this.makeGolden(o);
    }

    const main = new WHole();
    main.x = map.start.x;
    main.z = map.start.z;
    main.level = Math.min(cfg.startLevel, cfg.maxLevel);
    main.baseR = main.r = radiusForLevel(main.level);
    // Head start on the first size-up so every round opens with a quick level.
    main.xp = xpForLevel(main.level) * SIZE.startXp;
    this.holes.push(main);

    for (let i = 0; i < cfg.helpers; i++) {
      const h = new WHole();
      const ang = (i / Math.max(1, cfg.helpers)) * Math.PI * 2 + 0.6;
      h.main = false;
      h.x = map.start.x + Math.cos(ang) * 14;
      h.z = map.start.z + Math.sin(ang) * 14;
      h.baseR = h.r = cfg.helperRadius;
      h.think = i * 0.1;
      this.holes.push(h);
    }
  }

  get main(): WHole {
    return this.holes[0];
  }

  /** Random event in progress, if any. */
  get eventId(): EventId | null {
    return this.roundEvents.current;
  }

  /** The event UFO while it is crossing the map. */
  get ufoFlying(): WObj | null {
    return this.roundEvents.ufoFlying;
  }

  /**
   * A new prop of `type`, appended to `objects` with its size, value and XP for this round. The
   * caller places it and sets weight and movement. Also used by RoundEvents for its props.
   */
  initObj(type: string, scale: number, tint: number): WObj {
    const t = typeId(type);
    const def = OBJECT_TYPES[t];
    const o = new WObj();
    o.id = this.objects.length;
    o.t = t;
    o.s = scale;
    o.tint = tint;
    o.f = footprintOf(def, scale);
    o.h = def.h * scale;
    o.baseY = o.y = def.hover ?? 0;
    o.value = baseValueOf(def, scale) * this.cfg.mapMul;
    o.xp = xpOf(def, scale);
    this.objects.push(o);
    return o;
  }

  /** Also used by RoundEvents for the UFO drops. */
  makeGolden(o: WObj): void {
    o.gold = true;
    o.value *= GOLDEN.valueMul;
    this.golden.push(o);
  }

  get percentEaten(): number {
    return this.weightTotal > 0 ? this.weightEaten / this.weightTotal : 0;
  }

  get comboMultiplier(): number {
    return comboMult(this.combo, this.cfg.comboCap);
  }

  /** The main hole reached this map's max size and grows no more. */
  get atMaxSize(): boolean {
    return this.main.level >= this.cfg.maxLevel;
  }

  /** XP progress (0..1) toward the next size level; full at max size. */
  get levelProgress(): number {
    if (this.atMaxSize) return 1;
    return Math.min(1, this.main.xp / xpForLevel(this.main.level));
  }

  /**
   * What the main hole can still eat this round: the props that fit now, plus the ones that would
   * fit after growing on all of those (props are taken smallest first, so one pass reaches the
   * fixed point). While Mega Mouth is active or will recharge before time runs out, the enlarged
   * mouth counts too. Dormant event props are not counted. `levels` is how many more size levels
   * that food is worth, `cash` what it would pay (before combo) and `weight` its share of map %.
   */
  reachable(): { count: number; levels: number; cash: number; weight: number } {
    if (this.bySize.length !== this.objects.length) this.bySize = [...this.objects].sort((a, b) => a.f - b.f);
    const mega = this.abilities.mega;
    const megaUsable = this.cfg.abilities.mega.level > 0 && (mega.active > 0 || mega.cd <= this.timeLeft);
    const mouth = SIZE.fit * (megaUsable ? megaScale(this.cfg.abilities.mega.level) : 1);
    const grow = { level: this.main.level, xp: this.main.xp };
    let r = radiusForLevel(grow.level);
    let fit = mouth * r;
    // XP for the next level, kept between level-ups: spendXp only runs once it is reached.
    let need = xpForLevel(grow.level);
    let count = 0;
    let cash = 0;
    let weight = 0;
    for (const o of this.bySize) {
      if (o.state !== ALIVE) continue;
      if (o.f > fit) break;
      count++;
      cash += o.value * this.cfg.cashMult;
      weight += o.w;
      grow.xp += o.xp * this.cfg.xpMult * frontierXpMult(o.f, r);
      if (grow.xp >= need && spendXp(grow, this.cfg.maxLevel)) {
        r = radiusForLevel(grow.level);
        fit = mouth * r;
        need = xpForLevel(grow.level);
      }
    }
    return { count, levels: grow.level - this.main.level, cash, weight };
  }

  reachableLeft(): number {
    return this.reachable().count;
  }

  /**
   * The next kind of prop the main hole grows into, for the HUD hint: among the prop types with
   * nothing the hole can eat right now, the smallest prop still on the map. Map spawns are scaled
   * per instance, so this goes by each prop's own footprint. Null once every type left has an
   * edible prop. Event props are left out. Cheap per frame: map props never come back once eaten,
   * so each type's cursor only moves forward.
   */
  nextSnack(): WObj | null {
    if (!this.byType) {
      const groups = new Map<number, WObj[]>();
      for (const o of this.objects) {
        if (o.event) continue;
        const g = groups.get(o.t);
        if (g) g.push(o);
        else groups.set(o.t, [o]);
      }
      this.byType = [...groups.values()].map((objs) => ({ objs: objs.sort((a, b) => a.f - b.f), i: 0 }));
    }
    const fit = SIZE.fit * this.main.r;
    let next: WObj | null = null;
    for (const g of this.byType) {
      while (g.i < g.objs.length && g.objs[g.i].state !== ALIVE) g.i++;
      const o = g.objs[g.i];
      if (o && o.f > fit && (!next || o.f < next.f)) next = o;
    }
    return next;
  }

  /**
   * The round is over once nothing reachable is left. Crumbs the hole cannot grow on keep it going:
   * ending a round while something still fits reads as a bug to players, and quitting from the
   * pause menu is theirs to choose.
   */
  snackedOut(): boolean {
    return this.reachable().count === 0;
  }

  // ------------------------------------------------------------ abilities
  abilityReady(id: AbilityId): boolean {
    return this.cfg.abilities[id].level > 0 && this.abilities[id].cd <= 0 && this.running;
  }

  useAbility(id: AbilityId): boolean {
    if (!this.abilityReady(id)) return false;
    const c = this.cfg.abilities[id];
    this.abilities[id].active = c.duration;
    this.abilities[id].cd = c.cooldown;
    this.events.push({ k: 'ability', id });
    return true;
  }

  // ------------------------------------------------------------ movers
  /** Also used by RoundEvents for rush hour traffic. */
  initGraphMover(o: WObj): void {
    // Spawn sits on the centre line; snap onto the lane and head for the edge end.
    const g = this.map.graphs[o.graph];
    const a = g.nodes[o.from];
    const b = g.nodes[o.to];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const L = Math.hypot(dx, dz) || 1;
    o.x += (-dz / L) * o.lane;
    o.z += (dx / L) * o.lane;
    o.rot = Math.atan2(-dz, dx);
    // Spread the traffic looks over the frames.
    o.sense = (o.id % 10) * (SENSE_EVERY / 10);
    o.next = -1;
    this.setGraphTarget(o, 1);
  }

  private setGraphTarget(o: WObj, phase: number): void {
    const g = this.map.graphs[o.graph];
    const a = g.nodes[o.from];
    const b = g.nodes[o.to];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const L = Math.hypot(dx, dz) || 1;
    const ux = dx / L;
    const uz = dz / L;
    const rx = -uz;
    const rz = ux;
    const c = Math.min(Math.abs(o.lane), L * 0.3);
    o.phase = phase;
    if (phase === 0) {
      o.tx = a.x + rx * o.lane + ux * c;
      o.tz = a.z + rz * o.lane + uz * c;
    } else {
      o.tx = b.x + rx * o.lane - ux * c;
      o.tz = b.z + rz * o.lane - uz * c;
    }
  }

  private advanceGraph(o: WObj): void {
    if (o.phase === 0) {
      this.setGraphTarget(o, 1);
      return;
    }
    const next = o.next >= 0 ? o.next : this.pickNext(o);
    o.next = -1;
    o.from = o.to;
    o.to = next;
    this.setGraphTarget(o, 0);
  }

  /** The node a graph mover heads for after the one it drives to. */
  private pickNext(o: WObj): number {
    const adj = this.map.graphs[o.graph].adj[o.to];
    let next = o.from;
    if (adj.length > 1) {
      // Avoid U-turns unless at a dead end.
      for (let tries = 0; tries < 6; tries++) {
        next = adj[Math.floor(this.rng.next() * adj.length)];
        if (next !== o.from) break;
      }
    } else if (adj.length === 1) next = adj[0];
    return next;
  }

  /** True where a wanderer may not walk: inside an uneaten solid prop or a pond. */
  blocked(x: number, z: number): boolean {
    const b = this.block;
    const i = Math.floor(x + b.half);
    const j = Math.floor(z + b.half);
    if (i < 0 || j < 0 || i >= b.n || j >= b.n) return false;
    const v = b.cells[i + j * b.n];
    if (v === 0) return false;
    return v < 0 || this.objects[v - 1].state === ALIVE;
  }

  private moveToward(o: WObj, speed: number, dt: number, avoid = false): number {
    const dx = o.tx - o.x;
    const dz = o.tz - o.z;
    const d = Math.hypot(dx, dz);
    const step = speed * dt;
    if (d <= step || d < 1e-4) {
      if (avoid && this.blocked(o.tx, o.tz)) return MOVE_BLOCKED;
      o.x = o.tx;
      o.z = o.tz;
      return MOVE_ARRIVED;
    }
    const nx = o.x + (dx / d) * step;
    const nz = o.z + (dz / d) * step;
    // A mover already inside (pulled in by the magnet) may always walk out.
    if (avoid && this.blocked(nx, nz) && !this.blocked(o.x, o.z)) return MOVE_BLOCKED;
    o.x = nx;
    o.z = nz;
    o.rot = lerpAngle(o.rot, Math.atan2(-dz, dx), 1 - Math.exp(-10 * dt));
    return MOVE_FREE;
  }

  /** Next wander target inside the mover's area, preferring spots outside solid props. */
  private pickWanderTarget(o: WObj): void {
    const span = 10;
    for (let tries = 0; tries < 6; tries++) {
      o.tx = Math.min(o.x1, Math.max(o.x0, o.x + this.rng.range(-span, span)));
      o.tz = Math.min(o.z1, Math.max(o.z0, o.z + this.rng.range(-span, span)));
      if (!this.blocked(o.tx, o.tz) && !this.blocked((o.x + o.tx) / 2, (o.z + o.tz) / 2)) return;
    }
  }

  private updateMover(o: WObj, dt: number): void {
    if (o.mv === MV_RUN) {
      this.roundEvents.updateRunner(o, dt);
      return;
    }
    const main = this.main;
    // Small things panic and run from a hole that can eat them.
    if (o.flee && o.f <= SIZE.fit * main.r) {
      const dx = o.x - main.x;
      const dz = o.z - main.z;
      const fr = main.r * 2.2 + 3;
      const d2 = dx * dx + dz * dz;
      if (d2 < fr * fr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const sp = o.speed * 1.9 * dt;
        const nx = o.x + (dx / d) * sp;
        const nz = o.z + (dz / d) * sp;
        // Slide along walls instead of running into buildings.
        if (!this.blocked(nx, nz) || this.blocked(o.x, o.z)) {
          o.x = nx;
          o.z = nz;
        } else if (!this.blocked(nx, o.z)) o.x = nx;
        else if (!this.blocked(o.x, nz)) o.z = nz;
        o.rot = lerpAngle(o.rot, Math.atan2(-dz, dx), 1 - Math.exp(-12 * dt));
        o.bob += dt * 14;
        this.clampToMap(o);
        o.dirty = true;
        return;
      }
    }
    if (o.wait > 0) {
      o.wait -= dt;
      return;
    }
    o.bob += dt * (4 + o.speed * 3);
    if (o.mv === MV_GRAPH) {
      let speed = o.speed;
      if (!o.flee) {
        // Vehicles pick their turn on the way in, so they wait for room on the road out.
        if (o.phase === 1 && o.next < 0) o.next = this.pickNext(o);
        o.sense -= dt;
        if (o.sense <= 0) {
          o.sense = SENSE_EVERY;
          senseTraffic(o, this.roads, this.map.graphs);
        }
        speed *= o.brake;
      }
      if (this.moveToward(o, speed, dt) === MOVE_ARRIVED) this.advanceGraph(o);
    } else {
      const res = this.moveToward(o, o.speed, dt, true);
      if (res !== MOVE_FREE) {
        o.wait = res === MOVE_BLOCKED ? this.rng.range(0.1, 0.5) : this.rng.range(0.4, 3);
        this.pickWanderTarget(o);
      }
    }
    o.dirty = true;
  }

  private clampToMap(o: { x: number; z: number }): void {
    const h = this.map.half - 0.5;
    if (o.x < -h) o.x = -h;
    else if (o.x > h) o.x = h;
    if (o.z < -h) o.z = -h;
    else if (o.z > h) o.z = h;
  }

  // ------------------------------------------------------------ holes
  private moveMain(dt: number): void {
    const h = this.main;
    const dash = this.abilities.dash.active > 0;
    let ix = this.input.x;
    let iz = this.input.z;
    if (!this.running) ix = iz = 0;
    const mag = Math.hypot(ix, iz);
    if (mag > 1) {
      ix /= mag;
      iz /= mag;
    }
    let speed = holeSpeed(h.baseR, this.cfg.speedMult);
    if (dash) {
      speed *= ABILITY_LEVEL.dashSpeed;
      if (mag < 0.2) {
        // Dash in the current travel direction if there is no input.
        const v = Math.hypot(h.vx, h.vz);
        if (v > 0.01) {
          ix = h.vx / v;
          iz = h.vz / v;
        }
      } else {
        ix /= Math.max(mag, 1e-6);
        iz /= Math.max(mag, 1e-6);
      }
    }
    const k = 1 - Math.exp(-(dash ? 14 : 9) * dt);
    h.vx += (ix * speed - h.vx) * k;
    h.vz += (iz * speed - h.vz) * k;
    h.x += h.vx * dt;
    h.z += h.vz * dt;
    this.clampToMap(h);
  }

  private findHelperTarget(h: WHole): WObj | null {
    const fit = SIZE.fit * h.r;
    let best: WObj | null = null;
    let bestD = Infinity;
    const visit = (o: WObj) => {
      if (o.state !== ALIVE || o.f > fit) return;
      const d = (o.x - h.x) ** 2 + (o.z - h.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    };
    this.grid.query(h.x, h.z, 24, visit);
    for (const o of this.movers) {
      if (Math.abs(o.x - h.x) < 24 && Math.abs(o.z - h.z) < 24) visit(o);
    }
    return best;
  }

  private moveHelper(h: WHole, dt: number): void {
    h.think -= dt;
    if (h.think <= 0 || (h.target && h.target.state !== ALIVE)) {
      h.think = 0.5 + this.rng.next() * 0.3;
      h.target = this.findHelperTarget(h);
      if (!h.target) {
        const H = this.map.half - 10;
        h.tx = Math.max(-H, Math.min(H, h.x + this.rng.range(-40, 40)));
        h.tz = Math.max(-H, Math.min(H, h.z + this.rng.range(-40, 40)));
      }
    }
    const tx = h.target ? h.target.x : h.tx;
    const tz = h.target ? h.target.z : h.tz;
    const dx = tx - h.x;
    const dz = tz - h.z;
    const d = Math.hypot(dx, dz);
    const speed = HELPERS.speed * this.cfg.helperSpeedMult * (1 + 0.4 * h.r) * (this.running ? 1 : 0);
    const k = 1 - Math.exp(-5 * dt);
    const ix = d > 0.05 ? dx / d : 0;
    const iz = d > 0.05 ? dz / d : 0;
    h.vx += (ix * speed - h.vx) * k;
    h.vz += (iz * speed - h.vz) * k;
    h.x += h.vx * dt;
    h.z += h.vz * dt;
    this.clampToMap(h);
  }

  private processHole(hi: number, dt: number): void {
    const H = this.holes[hi];
    const R = H.r;
    const fit = SIZE.fit * R;
    let magR = 0;
    let pull = 0;
    if (H.main) {
      // Range and pull follow the hole's own size, not Mega Mouth's: Mega widens the mouth only.
      const vortex = this.abilities.vortex.active > 0;
      const frac = magnetRangeFrac(this.cfg.magnetLevel) + (vortex ? ABILITY_LEVEL.vortexRange : 0);
      magR = H.baseR * frac;
      pull = magnetPull(H.baseR, this.cfg.magnetLevel) * (vortex ? ABILITY_LEVEL.vortexPull : 1);
    }
    const wobR = H.main ? Math.min(this.maxF, 2.5 * R + 6) * 0.8 : 0;
    const qr = R + Math.max(magR, wobR);
    // The magnet (and Vortex) reach `magR` past the hole's own rim: Mega Mouth widens what they pull
    // in, not how far they pull from.
    const mr = H.baseR + magR;
    const visit = (o: WObj) => {
      if (o.state !== ALIVE) return;
      const dx = o.x - H.x;
      const dz = o.z - H.z;
      const d2 = dx * dx + dz * dz;
      if (o.f <= fit) {
        const inner = R - 0.25 * o.f;
        if (d2 < inner * inner) {
          this.swallow(o, hi, dx, dz);
          return;
        }
        if (magR > 0) {
          if (d2 < mr * mr) {
            const d = Math.sqrt(d2);
            const step = Math.min(pull * dt * (1.5 - d / mr), d - inner * 0.5);
            if (step > 0) {
              o.x -= (dx / d) * step;
              o.z -= (dz / d) * step;
              if (o.mv === MV_NONE) this.pulled.push(o);
              o.dirty = true;
            }
          }
        }
      } else if (H.main) {
        const reach = R + o.f * 0.7;
        if (d2 < reach * reach) {
          const w = Math.min(1, 1.3 - Math.sqrt(d2) / reach);
          if (w > o.wob) o.wob = w;
          o.dirty = true;
        }
      }
    };
    this.grid.query(H.x, H.z, qr, visit);
    for (const o of this.pulled) if (o.state === ALIVE) this.grid.update(o);
    this.pulled.length = 0;
    const movers = this.movers;
    for (let i = movers.length - 1; i >= 0; i--) {
      const o = movers[i];
      if (Math.abs(o.x - H.x) < qr + o.f && Math.abs(o.z - H.z) < qr + o.f) visit(o);
    }
  }

  private swallow(o: WObj, hi: number, dx: number, dz: number): void {
    o.state = FALLING;
    o.hole = hi;
    o.ox = dx;
    o.oz = dz;
    o.ft = 0;
    o.vy = 0;
    o.tilt = 0;
    const d = Math.hypot(dx, dz);
    if (d > 1e-3) {
      o.tdx = -dx / d;
      o.tdz = -dz / d;
    } else {
      const a = this.rng.range(0, Math.PI * 2);
      o.tdx = Math.cos(a);
      o.tdz = Math.sin(a);
    }
    if (o.mv !== MV_NONE) {
      const i = this.movers.indexOf(o);
      if (i >= 0) {
        this.movers[i] = this.movers[this.movers.length - 1];
        this.movers.pop();
      }
    } else {
      this.grid.remove(o);
    }
    this.falling.push(o);
    o.dirty = true;
    this.weightEaten += o.w;
    this.eatenByType.set(o.t, (this.eatenByType.get(o.t) ?? 0) + 1);
    if (o.gold) this.goldEaten++;

    const H = this.holes[hi];
    let cash: number;
    if (H.main) {
      this.eaten++;
      this.combo = this.comboTimer > 0 ? this.combo + 1 : 1;
      this.comboTimer = this.cfg.comboWindow;
      if (this.combo > this.comboBest) this.comboBest = this.combo;
      cash = o.value * this.cfg.cashMult * comboMult(this.combo, this.cfg.comboCap);
      if (!this.biggest || o.f > this.biggest.f) this.biggest = o;
      this.gainXp(o.xp * this.cfg.xpMult * frontierXpMult(o.f, H.baseR));
    } else {
      this.helperEaten++;
      cash = o.value * this.cfg.cashMult * HELPERS.roundCashShare;
      this.helperCash += cash;
    }
    this.cash += cash;
    this.events.push({ k: 'eat', o, hole: hi, cash, combo: H.main ? this.combo : 0 });
  }

  gainXp(xp: number): void {
    if (this.atMaxSize) return;
    const h = this.main;
    const from = h.level;
    h.xp += xp;
    if (!spendXp(h, this.cfg.maxLevel)) return;
    for (let l = from + 1; l <= h.level; l++) this.events.push({ k: 'level', level: l });
    this.levelsGained += h.level - from;
    h.baseR = radiusForLevel(h.level);
  }

  /**
   * A casual round is due a free level when what fits cannot pay for one and a map prop is still
   * too big to fit. While props the current size brought within reach are left, it first waits up
   * to TOUR.catchUpPatience seconds for the player to eat them: each new tier gets its turn, a
   * landmark nobody has found holds the hole back no longer than that, and once everything fits the
   * hole stops growing. Event props come and go, so they are left out.
   */
  private catchUpDue(): boolean {
    if (this.atMaxSize || this.reachable().levels > 0) {
      this.catchUpWait = 0;
      return false;
    }
    const fit = SIZE.fit * radiusForLevel(this.main.level);
    const fitBefore = SIZE.fit * radiusForLevel(this.main.level - 1);
    let tooBig = false;
    let tierLeft = false;
    for (const o of this.objects) {
      if (o.state !== ALIVE || o.event) continue;
      if (o.f > fit) tooBig = true;
      else if (o.f > fitBefore) tierLeft = true;
    }
    if (tooBig && tierLeft) {
      this.catchUpWait += ROUND_END.checkEvery;
      if (this.catchUpWait < TOUR.catchUpPatience) return false;
    }
    this.catchUpWait = 0;
    return tooBig;
  }

  /** One free size level for a casual round where nothing left can grow the hole. */
  private catchUp(): void {
    const h = this.main;
    this.events.push({ k: 'catchUp' });
    h.xp = Math.max(h.xp, xpForLevel(h.level));
    this.gainXp(0);
  }

  private updateFalling(dt: number): void {
    const f = this.falling;
    for (let i = f.length - 1; i >= 0; i--) {
      const o = f[i];
      const H = this.holes[o.hole];
      o.ft += dt;
      const k = Math.exp(-3.5 * dt);
      o.ox *= k;
      o.oz *= k;
      o.tilt = Math.min(1.35, o.tilt + dt * 3.4);
      if (o.ft > 0.08) {
        o.vy += (14 + 5 * H.r) * dt;
        o.y -= o.vy * dt;
      }
      o.x = H.x + o.ox;
      o.z = H.z + o.oz;
      o.dirty = true;
      if (o.y < o.baseY - (o.h * 1.1 + H.r * 1.3 + 1) || o.ft > 3.5) {
        o.state = GONE;
        f[i] = f[f.length - 1];
        f.pop();
      }
    }
  }

  // ------------------------------------------------------------ main step
  step(dt: number): void {
    this.time += dt;
    if (this.running && !this.opts.demo) {
      const before = Math.ceil(this.timeLeft);
      this.timeLeft -= dt;
      const after = Math.ceil(this.timeLeft);
      if (after < before && after <= 5 && after >= 1) this.events.push({ k: 'tick', s: after });
      const cleared = this.weightEaten >= this.weightTotal * MAP_CLEARED_FRACTION;
      let snackedOut = false;
      if (!cleared && this.timeLeft > 0) {
        this.reachCheck -= dt;
        if (this.reachCheck <= 0) {
          this.reachCheck = ROUND_END.checkEvery;
          if (this.cfg.casual) {
            // Casual rounds have no timer to end them: once what is left cannot grow the hole, it
            // grows for free, so the bigger props come within reach instead of a long crumb hunt.
            if (this.catchUpDue()) this.catchUp();
          } else if (!this.roundEvents.current && this.snackedOut() && !this.roundEvents.hurry()) {
            // A random event still to come brings new snacks: hurry() starts it instead of ending.
            snackedOut = true;
          }
        }
      }
      if (this.timeLeft <= 0 || cleared || snackedOut) {
        this.timeLeft = Math.max(0, this.timeLeft);
        this.running = false;
        this.endedAt = this.time;
        this.endReason = cleared ? 'cleared' : snackedOut ? 'snackedOut' : 'timeUp';
        const bonusFrac = this.endReason === 'timeUp' ? 0 : timeBonusFrac(this.timeLeft);
        this.timeBonus = this.cash * bonusFrac;
        this.cash += this.timeBonus;
        this.endDelay = cleared ? 2.4 : ROUND_END.endDelay;
        this.events.push(snackedOut ? { k: 'snackedOut', bonusFrac } : { k: cleared ? 'cleared' : 'timeUp' });
        if (this.combo > 0) this.events.push({ k: 'comboEnd', n: this.combo });
        this.combo = 0;
        this.comboTimer = 0;
      }
    } else if (!this.running && !this.ended) {
      this.endDelay -= dt;
      if (this.endDelay <= 0 && this.falling.length === 0) {
        this.ended = true;
        this.events.push({ k: 'end' });
      }
    }

    for (const id of ['dash', 'vortex', 'mega'] as AbilityId[]) {
      const a = this.abilities[id];
      if (a.cd > 0) a.cd -= dt;
      if (a.active > 0) a.active -= dt;
    }

    this.moveMain(dt);
    for (let i = 1; i < this.holes.length; i++) this.moveHelper(this.holes[i], dt);

    const mega = this.abilities.mega.active > 0 ? megaScale(this.cfg.abilities.mega.level) : 1;
    const kr = 1 - Math.exp(-5 * dt);
    const main = this.main;
    main.r += (main.baseR * mega - main.r) * kr;

    const movers = this.movers;
    // senseTraffic only watches road vehicles; scanning every mover for each one cost more than the
    // rest of the step.
    const roads = this.roads;
    roads.length = 0;
    for (let i = 0; i < movers.length; i++) if (movers[i].mv === MV_GRAPH && !movers[i].flee) roads.push(movers[i]);
    for (let i = 0; i < movers.length; i++) this.updateMover(movers[i], dt);
    this.roundEvents.update(dt);

    if (this.running) {
      for (let i = 0; i < this.holes.length; i++) this.processHole(i, dt);
    }
    this.updateFalling(dt);

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.events.push({ k: 'comboEnd', n: this.combo });
        this.combo = 0;
      }
    }
  }
}
