import { SIZE } from '../config/balance';
import type { Rng } from './rng';
import { frontierXpMult } from './size';
import { ALIVE, type WObj, type World } from './world';

export interface BotOptions {
  /**
   * Score each prop by the XP of every edible prop within this many hole radii of it, so the bot
   * heads for dense patches the way a good player steers (0 = the prop alone).
   */
  cluster?: number;
  /** Randomness for roaming and sampling; the world's own Rng when absent. */
  rng?: Rng;
}

/**
 * Greedy steering used by the balance simulation and the hub attract mode:
 * chase the edible prop nearby with the most size XP per distance, otherwise roam. Map goals are
 * sizes, so chasing growth is the faster way forward: chasing cash instead reached Moon Base
 * 10-15% later in the balance sim.
 */
export class Bot {
  private think = 0;
  private target: WObj | null = null;
  private roamX = 0;
  private roamZ = 0;
  private readonly cands: WObj[] = [];
  private readonly vals: number[] = [];

  constructor(
    private skill = 1,
    private readonly opts: BotOptions = {},
  ) {}

  /** Forget the target and roam point (a Cosmos flip moved the world under them). */
  reset(): void {
    this.target = null;
    this.think = 0;
  }

  steer(world: World, dt: number): { x: number; z: number } {
    const h = world.main;
    const rng = this.opts.rng ?? world.rng;
    this.think -= dt;
    if (this.think <= 0 || !this.target || this.target.state !== ALIVE || this.target.f > SIZE.fit * h.r) {
      this.think = 0.3 / this.skill;
      this.target = this.pick(world, rng);
      if (!this.target) {
        const H = world.map.half * 0.8;
        this.roamX = (rng.next() * 2 - 1) * H;
        this.roamZ = (rng.next() * 2 - 1) * H;
      }
    }
    const tx = this.target ? this.target.x : this.roamX;
    const tz = this.target ? this.target.z : this.roamZ;
    const dx = tx - h.x;
    const dz = tz - h.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return { x: 0, z: 0 };
    return { x: dx / d, z: dz / d };
  }

  private pick(world: World, rng: Rng): WObj | null {
    const h = world.main;
    const fit = SIZE.fit * h.r;
    const search = 10 + 5 * h.r;
    const over = h.r * 1.5 + 2;
    const cluster = this.opts.cluster ?? 0;
    let best: WObj | null = null;
    let bestScore = 0;
    const cands = this.cands;
    const vals = this.vals;
    cands.length = 0;
    vals.length = 0;
    const consider = (o: WObj) => {
      if (o.state !== ALIVE || o.f > fit) return;
      const v = o.xp * frontierXpMult(o.f, h.baseR) + 0.01;
      if (cluster > 0) {
        cands.push(o);
        vals.push(v);
        return;
      }
      const score = v / (Math.hypot(o.x - h.x, o.z - h.z) + over);
      if (score > bestScore) {
        bestScore = score;
        best = o;
      }
    };
    world.grid.query(h.x, h.z, search, consider);
    for (const o of world.movers) {
      if (Math.abs(o.x - h.x) < search && Math.abs(o.z - h.z) < search) consider(o);
    }
    if (cluster > 0) {
      const r2 = (cluster * h.r) ** 2;
      for (let i = 0; i < cands.length; i++) {
        const a = cands[i];
        let sum = 0;
        for (let j = 0; j < cands.length; j++) {
          const dx = a.x - cands[j].x;
          const dz = a.z - cands[j].z;
          if (dx * dx + dz * dz <= r2) sum += vals[j];
        }
        const score = sum / (Math.hypot(a.x - h.x, a.z - h.z) + over);
        if (score > bestScore) {
          bestScore = score;
          best = a;
        }
      }
    }
    if (best) return best;
    // Nothing close: sample the map for the nearest edible prop.
    let bestD = Infinity;
    const objs = world.objects;
    for (let i = 0; i < 80; i++) {
      const o = objs[Math.floor(rng.next() * objs.length)];
      if (o.state !== ALIVE || o.f > fit) continue;
      const d = Math.hypot(o.x - h.x, o.z - h.z);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }
}
