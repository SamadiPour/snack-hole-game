/**
 * Simulated players for Layer A. Each one steers the real World through `w.input` and presses
 * ability keys, the way a person at the keyboard would; nothing reaches into the simulation.
 *
 *   strong   knows the map, routes to the most XP + cash per second of travel (clusters count),
 *            times Dash / Vortex / Mega Mouth, quits a round once only crumbs are left.
 *   average  heads for the nearest edible prop it can see (mild preference for bigger ones), with
 *            reaction delay, steering noise and abilities a few seconds after they are ready.
 *   weak     reacts slowly, wanders, picks at random among the few best-looking props nearby,
 *            sometimes chases what it cannot eat, steers loosely and uses abilities late.
 *
 * The numbers live in SKILLS so calibration (balance/calibrate.ts) can tune them.
 */
import { ABILITIES, ABILITY_LEVEL, MAP_CLEARED_FRACTION, SIZE, type AbilityId } from '../../src/config/balance';
import { magnetRangeFrac, megaScale } from '../../src/core/economy';
import { Rng } from '../../src/core/rng';
import { frontierXpMult, holeSpeed, xpForLevel } from '../../src/core/size';
import { ALIVE, type WObj, type World } from '../../src/core/world';
import type { View } from './view';

export type Skill = 'strong' | 'average' | 'weak';
export const SKILL_NAMES: Skill[] = ['strong', 'average', 'weak'];

export interface SkillProfile {
  /** Seconds between target decisions (reaction time). */
  think: number;
  /** Time constant (s) of the stick following the intended direction. */
  lag: number;
  /** Standard deviation (radians) of the slowly drifting heading error. */
  noise: number;
  /** Stick magnitude, 0..1 (mouse not pushed all the way, keys = 1). */
  stick: number;
  /** strong: routes by value per travel time over a cluster; others pick by distance. */
  route: boolean;
  /** Cluster radius in hole radii for `route` (0 = the prop alone). */
  cluster: number;
  /** `route`: weight of cash next to XP, and the search radius `searchBase + searchPerR * R`. */
  cashWeight: number;
  searchBase: number;
  searchPerR: number;
  /** Non-routing pickers: score = (f / fit)^sizePref / distance (0 = nearest). */
  sizePref: number;
  /** Chance per decision to wander instead of chasing anything. */
  wander: number;
  /** Chance per decision to chase the nearest prop that is still too big. */
  chaseBig: number;
  /** Pick at random among this many best-scored visible edible props (0 = the best one). */
  randomPick: number;
  /** Mean seconds from an ability being ready to pressing it; 0 = situational use (strong). */
  castDelay: number;
  /** Ends a round from the pause menu once only crumbs are left (as scripts/sim.ts does). */
  quits: boolean;
}

export const SKILLS: Record<Skill, SkillProfile> = {
  strong: { think: 0.4, lag: 0.06, noise: 0.05, stick: 1, route: true, cluster: 1.5, cashWeight: 0.1, searchBase: 10, searchPerR: 5, sizePref: 0, wander: 0, chaseBig: 0, randomPick: 0, castDelay: 0, quits: true },
  average: { think: 0.45, lag: 0.12, noise: 0.2, stick: 0.85, route: false, cluster: 0, cashWeight: 0, searchBase: 0, searchPerR: 0, sizePref: 0.6, wander: 0, chaseBig: 0.03, randomPick: 0, castDelay: 3, quits: false },
  weak: { think: 0.7, lag: 0.2, noise: 0.35, stick: 0.75, route: false, cluster: 0, cashWeight: 0, searchBase: 0, searchPerR: 0, sizePref: 0.3, wander: 0.1, chaseBig: 0.08, randomPick: 3, castDelay: 8, quits: false },
};

/** Share of the round's cash the leftovers must beat for `quits` players to keep going. */
const QUIT_CRUMBS = 0.05;

export class Pilot {
  private readonly rng: Rng;
  private think = 0;
  private target: WObj | null = null;
  private tx = 0;
  private tz = 0;
  private hasPoint = false;
  private roamUntil = 0;
  private wantMega = false;
  private noiseAngle = 0;
  private ix = 0;
  private iz = 0;
  private readonly castAt: Record<AbilityId, number> = { dash: -1, vortex: -1, mega: -1 };
  private readonly cands: WObj[] = [];
  private readonly vals: number[] = [];

  constructor(
    readonly p: SkillProfile,
    private readonly view: View,
    seed: number,
  ) {
    this.rng = new Rng(seed);
  }

  private gauss(): number {
    const u = Math.max(1e-9, this.rng.next());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.rng.next());
  }

  steer(w: World, dt: number): { x: number; z: number } {
    const h = w.main;
    this.think -= dt;
    const lost = this.target && (this.target.state !== ALIVE || (!this.chasingBig && this.target.f > SIZE.fit * h.r * (this.wantMega ? megaScale(w.cfg.abilities.mega.level) : 1)));
    if (this.think <= 0 || lost || (!this.target && this.hasPoint && w.time > this.roamUntil)) {
      this.think = this.p.think * this.rng.range(0.7, 1.3);
      this.decide(w);
    }
    let dx = 0;
    let dz = 0;
    if (this.target) {
      dx = this.target.x - h.x;
      dz = this.target.z - h.z;
    } else if (this.hasPoint) {
      dx = this.tx - h.x;
      dz = this.tz - h.z;
      if (Math.hypot(dx, dz) < h.r) this.hasPoint = false;
    }
    // Heading error drifts like a hand on a mouse: Ornstein-Uhlenbeck, about 1 s memory.
    const theta = 1;
    this.noiseAngle += -this.noiseAngle * theta * dt + this.p.noise * Math.sqrt(2 * theta * dt) * this.gauss();
    const d = Math.hypot(dx, dz);
    let wx = 0;
    let wz = 0;
    if (d > 0.05) {
      const a = Math.atan2(dz, dx) + this.noiseAngle;
      wx = Math.cos(a) * this.p.stick;
      wz = Math.sin(a) * this.p.stick;
    }
    const k = 1 - Math.exp(-dt / Math.max(1e-3, this.p.lag));
    this.ix += (wx - this.ix) * k;
    this.iz += (wz - this.iz) * k;
    return { x: this.ix, z: this.iz };
  }

  private chasingBig = false;

  private decide(w: World): void {
    const h = w.main;
    this.chasingBig = false;
    this.wantMega = false;
    if (this.p.wander > 0 && this.rng.chance(this.p.wander)) {
      this.target = null;
      this.roamInView(w);
      return;
    }
    if (this.p.chaseBig > 0 && this.rng.chance(this.p.chaseBig)) {
      const big = this.nearestTooBig(w);
      if (big) {
        this.target = big;
        this.chasingBig = true;
        return;
      }
    }
    this.target = this.p.route ? this.routePick(w) : this.simplePick(w);
    if (this.target) {
      this.hasPoint = false;
      return;
    }
    if (this.p.route) {
      // Knows the map: head for the nearest edible prop anywhere.
      const fit = SIZE.fit * h.r;
      let best: WObj | null = null;
      let bestD = Infinity;
      for (const o of w.objects) {
        if (o.state !== ALIVE || o.f > fit) continue;
        const dd = (o.x - h.x) ** 2 + (o.z - h.z) ** 2;
        if (dd < bestD) {
          bestD = dd;
          best = o;
        }
      }
      this.target = best;
      if (best) return;
    }
    if (!this.hasPoint || w.time > this.roamUntil) this.roamMap(w);
  }

  private roamMap(w: World): void {
    const H = w.map.half * 0.8;
    this.tx = this.rng.range(-H, H);
    this.tz = this.rng.range(-H, H);
    this.hasPoint = true;
    this.roamUntil = w.time + 6;
  }

  private roamInView(w: World): void {
    const h = w.main;
    const R = this.view.reach(h.r) * 0.5;
    this.tx = h.x + this.rng.range(-R, R);
    this.tz = h.z + this.rng.range(-R, R * 0.5);
    this.hasPoint = true;
    this.roamUntil = w.time + this.p.think;
  }

  /** Visible props (alive, on screen), through `visit`. */
  private eachVisible(w: World, visit: (o: WObj) => void): void {
    const h = w.main;
    const reach = this.view.reach(h.r);
    const r = h.r;
    const check = (o: WObj) => {
      if (o.state !== ALIVE) return;
      if (this.view.visible(o.x - h.x, o.z - h.z, r)) visit(o);
    };
    w.grid.query(h.x, h.z, reach, check);
    for (const o of w.movers) if (Math.abs(o.x - h.x) < reach && Math.abs(o.z - h.z) < reach) check(o);
  }

  private nearestTooBig(w: World): WObj | null {
    const h = w.main;
    const fit = SIZE.fit * h.r;
    let best: WObj | null = null;
    let bestD = Infinity;
    this.eachVisible(w, (o) => {
      if (o.f <= fit || o.f > fit * 2.5) return;
      const d = Math.hypot(o.x - h.x, o.z - h.z);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    });
    return best;
  }

  private simplePick(w: World): WObj | null {
    const h = w.main;
    const fit = SIZE.fit * h.r;
    if (this.p.randomPick > 0) {
      // Random among the few best-looking props (size preference over distance), not the best.
      const scored: [WObj, number][] = [];
      this.eachVisible(w, (o) => {
        if (o.f <= fit) scored.push([o, Math.pow(o.f / fit, this.p.sizePref) / (Math.hypot(o.x - h.x, o.z - h.z) + h.r)]);
      });
      scored.sort((a, b) => b[1] - a[1]);
      return scored.length ? this.rng.pick(scored.slice(0, this.p.randomPick))[0] : null;
    }
    let best: WObj | null = null;
    let bestS = 0;
    this.eachVisible(w, (o) => {
      if (o.f > fit) return;
      const s = Math.pow(o.f / fit, this.p.sizePref) / (Math.hypot(o.x - h.x, o.z - h.z) + h.r);
      if (s > bestS) {
        bestS = s;
        best = o;
      }
    });
    return best;
  }

  /**
   * Most XP (plus `cashWeight` x cash) per metre, summed over the cluster around each candidate:
   * the scoring of src/core/bot.ts, which the balance sim found about the fastest way through the
   * maps, plus props that only fit with Mega Mouth while it is usable.
   */
  private routePick(w: World): WObj | null {
    const h = w.main;
    const cfg = w.cfg;
    const fit = SIZE.fit * h.r;
    const mega = w.abilities.mega;
    const megaUsable = cfg.abilities.mega.level > 0 && (mega.active > 0.5 || mega.cd <= 0);
    const megaFit = megaUsable ? SIZE.fit * h.baseR * megaScale(cfg.abilities.mega.level) : fit;
    const need = xpForLevel(h.level);
    const refValue = 6 * Math.pow(SIZE.fit * h.baseR, 1.3) * cfg.mapMul;
    const cands = this.cands;
    const vals = this.vals;
    cands.length = 0;
    vals.length = 0;
    const reach = this.p.searchBase + this.p.searchPerR * h.r;
    const add = (o: WObj) => {
      if (o.state !== ALIVE || o.f > megaFit) return;
      const xp = (o.xp * cfg.xpMult * frontierXpMult(o.f, h.baseR)) / need;
      let v = xp + this.p.cashWeight * (o.value / refValue) + 1e-4;
      if (o.f > fit) v *= 0.8; // needs Mega Mouth: a little riskier
      cands.push(o);
      vals.push(v);
    };
    w.grid.query(h.x, h.z, reach, add);
    for (const o of w.movers) if (Math.abs(o.x - h.x) < reach && Math.abs(o.z - h.z) < reach) add(o);
    let best: WObj | null = null;
    let bestS = 0;
    const cr2 = (this.p.cluster * h.r) ** 2;
    const over = 1.5 * h.r + 2;
    for (let i = 0; i < cands.length; i++) {
      const a = cands[i];
      let sum = vals[i];
      if (cr2 > 0) {
        for (let j = 0; j < cands.length; j++) {
          if (j === i || cands[j].f > fit) continue;
          const dx = a.x - cands[j].x;
          const dz = a.z - cands[j].z;
          if (dx * dx + dz * dz <= cr2) sum += vals[j];
        }
      }
      const s = sum / (Math.hypot(a.x - h.x, a.z - h.z) + over);
      if (s > bestS) {
        bestS = s;
        best = a;
      }
    }
    if (best && (best as WObj).f > fit) this.wantMega = true;
    return best;
  }

  /** Presses ability keys; call once per step after steer(). */
  abilities(w: World): void {
    if (!w.running) return;
    const h = w.main;
    for (const a of ABILITIES) {
      if (!w.abilityReady(a.id)) {
        this.castAt[a.id] = -1;
        continue;
      }
      if (this.p.castDelay > 0) {
        if (this.castAt[a.id] < 0) this.castAt[a.id] = w.time - Math.log(Math.max(1e-9, this.rng.next())) * this.p.castDelay;
        if (w.time >= this.castAt[a.id] && (a.id !== 'dash' || Math.hypot(h.vx, h.vz) > 1)) w.useAbility(a.id);
        continue;
      }
      // Situational use.
      const t = this.target;
      const dist = t ? Math.hypot(t.x - h.x, t.z - h.z) : 0;
      if (a.id === 'dash') {
        if (t && dist > 3 * h.r + 5) w.useAbility('dash');
      } else if (a.id === 'mega') {
        if (this.wantMega && t && dist < 2 * h.r + holeSpeed(h.baseR, w.cfg.speedMult) * 1.5) w.useAbility('mega');
      } else if (a.id === 'vortex') {
        // What Vortex would pull: props that fit the mouth, within its reach of the hole's own rim.
        const range = h.baseR * (1 + magnetRangeFrac(w.cfg.magnetLevel) + ABILITY_LEVEL.vortexRange);
        const fit = SIZE.fit * h.r;
        let n = 0;
        w.grid.query(h.x, h.z, range, (o) => {
          if (o.state === ALIVE && o.f <= fit && (o.x - h.x) ** 2 + (o.z - h.z) ** 2 < range * range) n++;
        });
        if (n >= 6) w.useAbility('vortex');
      }
    }
  }

  /** The pause-menu quit of scripts/sim.ts: no growth left and the leftovers are crumbs. */
  wantsQuit(w: World): boolean {
    if (!this.p.quits) return false;
    const r = w.reachable();
    if (r.count === 0 || w.eventId) return false;
    if (!w.cfg.mapCleared && w.weightEaten + r.weight >= w.weightTotal * MAP_CLEARED_FRACTION) return false;
    return r.levels === 0 && r.cash * w.cfg.comboCap < w.cash * QUIT_CRUMBS;
  }
}
