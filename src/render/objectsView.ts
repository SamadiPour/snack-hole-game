import * as THREE from 'three';
import { SIZE } from '../config/balance';
import { OBJECT_TYPES } from '../config/objects';
import { ALIVE, DORMANT, FALLING, GONE, MV_NONE, type World, type WObj } from '../core/world';
import { fxOn } from '../dev/flags';
import { createGhostMaterial, createPropMaterial } from './materials';
import { BUILDERS } from './props';

const geoCache = new Map<number, THREE.BufferGeometry>();

/** Geometry for a type, built once and shared across rounds. */
export function geometryFor(t: number): THREE.BufferGeometry {
  let g = geoCache.get(t);
  if (!g) {
    const def = OBJECT_TYPES[t];
    const b = BUILDERS[def.id];
    if (!b) throw new Error(`no builder for ${def.id}`);
    g = b();
    geoCache.set(t, g);
  }
  return g;
}

const _m = new THREE.Matrix4();
const _w = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qy = new THREE.Quaternion();
const _qt = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/** Opacity of a prop that hides the hole from the camera. */
const GHOST_ALPHA = 0.45;
const MAX_GHOSTS = 24;

/** A prop drawn see-through (depth pre-pass + blended colour pass) instead of in its instanced mesh. */
interface Ghost {
  o: WObj | null;
  depth: THREE.Mesh;
  color: THREE.Mesh;
  mat: THREE.MeshLambertMaterial;
  tint: THREE.Color;
  gold: { value: number };
  alpha: number;
  hold: number;
}

const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true, depthWrite: true });

/** Spaghettification at strength 1: length factor, width factor and spin (rad/s per s of fall). */
const SPAG_STRETCH = 2.4;
const SPAG_THIN = 0.45;
const SPAG_TWIST = 7;
/**
 * Strongest a prop gets (a tractor's worth), and the most length the stretch may add, in hole
 * radii: beyond these, big and tall props (trucks, trees) look broken rather than pulled in.
 */
const SPAG_MAX = 0.6;
const SPAG_REACH = 0.7;
/**
 * Props that would stick out of the hole if they tipped over swirl down at a SWIRL_LEAN lean
 * instead: tall and thin (height at least SWIRL_TALL x footprint) and taller than the hole's
 * radius (trees and silos at the size they first fit; never people, who drop in easily). The lean
 * turns SWIRL_SPEED rad/s at first, speeding up as they fall.
 */
const SWIRL_TALL = 2;
const SWIRL_LEAN = (30 * Math.PI) / 180;
const SWIRL_SPEED = 5;

/**
 * How strongly a falling prop is spaghettified (0..SPAG_MAX). Grows with the prop's size relative
 * to its hole, so small snacks barely change, and tops out at a tractor's worth. Ramps in over the
 * first moments of the fall.
 */
function spaghetti(o: WObj, r: number): number {
  if (!fxOn.spaghetti) return 0;
  const rel = o.f / (SIZE.fit * r);
  return Math.min(SPAG_MAX, Math.max(0, (rel - 0.2) / 0.7)) * Math.min(1, o.ft / 0.45);
}

function meshKey(o: WObj): number {
  return o.t * 2 + (o.gold ? 1 : 0);
}

/** One InstancedMesh per prop type; syncs instance matrices from the simulation each frame. */
export class ObjectsView {
  readonly group = new THREE.Group();
  readonly material = createPropMaterial();
  readonly goldMaterial = createPropMaterial(true);
  /** Instanced mesh per prop type, golden props in their own mesh: key = type * 2 + gold. */
  private meshes = new Map<number, THREE.InstancedMesh>();
  private world: World | null = null;
  private ghosts = new Map<WObj, Ghost>();
  private ghostPool: Ghost[] = [];
  private shadows = true;

  setWorld(world: World, shadows: boolean): void {
    this.clear();
    this.world = world;
    this.shadows = shadows;
    const counts = new Map<number, number>();
    for (const o of world.objects) counts.set(meshKey(o), (counts.get(meshKey(o)) ?? 0) + 1);
    for (const [key, n] of counts) {
      const mesh = new THREE.InstancedMesh(geometryFor(key >> 1), key & 1 ? this.goldMaterial : this.material, n);
      mesh.castShadow = shadows;
      mesh.receiveShadow = shadows;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      this.meshes.set(key, mesh);
      this.group.add(mesh);
    }
    const next = new Map<number, number>();
    for (const o of world.objects) {
      const key = meshKey(o);
      const i = next.get(key) ?? 0;
      next.set(key, i + 1);
      o.inst = i;
      const mesh = this.meshes.get(key)!;
      mesh.setColorAt(i, _c.setHex(o.tint));
      this.writeMatrix(mesh, o, 0);
      o.dirty = false;
    }
    for (const mesh of this.meshes.values()) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  setShadows(on: boolean): void {
    this.shadows = on;
    for (const m of this.meshes.values()) {
      m.castShadow = on;
      m.receiveShadow = on;
    }
    for (const g of this.ghosts.values()) {
      g.color.castShadow = on;
      g.color.receiveShadow = on;
    }
  }

  private writeMatrix(mesh: THREE.InstancedMesh, o: WObj, time: number): void {
    if (o.state === GONE || o.state === DORMANT) {
      mesh.setMatrixAt(o.inst, ZERO);
      return;
    }
    _qy.setFromAxisAngle(_up, o.rot);
    let y = o.y;
    let spag = 0;
    let tilt = 0;
    if (o.state === FALLING) {
      const r = this.world!.holes[o.hole].r;
      spag = spaghetti(o, r);
      tilt = o.tilt;
      let yaw = o.rot + spag * o.ft * SPAG_TWIST;
      let tdx = o.tdx;
      let tdz = o.tdz;
      if (fxOn.spaghetti && o.h >= SWIRL_TALL * o.f && o.h > r) {
        // Tall props swirl down the drain instead of tipping over: a slight lean whose direction
        // turns around the hole (the same way as the wall's swirl), the prop turning with it.
        const a = o.ft * (SWIRL_SPEED + SWIRL_SPEED * o.ft);
        const c = Math.cos(a);
        const s = Math.sin(a);
        tdx = o.tdx * c - o.tdz * s;
        tdz = o.tdx * s + o.tdz * c;
        yaw -= a;
        tilt = Math.min(tilt, SWIRL_LEAN);
      }
      _qy.setFromAxisAngle(_up, yaw);
      _axis.set(tdz, 0, -tdx).normalize();
      _qt.setFromAxisAngle(_axis, tilt);
      _q.multiplyQuaternions(_qt, _qy);
    } else if (o.wob > 0.01) {
      // Too big to fit: rock on the rim.
      const w = o.wob * 0.07 * Math.sin(time * 18 + o.id);
      const hole = this.world!.main;
      const dx = hole.x - o.x;
      const dz = hole.z - o.z;
      const d = Math.hypot(dx, dz) || 1;
      _axis.set(dz / d, 0, -dx / d);
      _qt.setFromAxisAngle(_axis, Math.abs(w) + o.wob * 0.03);
      _q.multiplyQuaternions(_qt, _qy);
    } else if (o.mv !== MV_NONE && o.h < 2.2 && o.wait <= 0) {
      // Little walking bob for people and animals.
      y += Math.abs(Math.sin(o.bob)) * 0.06 * o.s;
      _q.copy(_qy);
    } else {
      _q.copy(_qy);
    }
    _p.set(o.x, y, o.z);
    _s.set(o.s, o.s, o.s);
    _m.compose(_p, _q, _s);
    if (spag > 0.001) {
      // World-space stretch: the top stays put while the body pulls down toward the bottom of
      // the hole, squeezed in toward the hole's axis. The pivot sits at (or above) the prop's
      // highest point, so nothing is pushed up: a tipped-over tower would poke out of the ground.
      const hole = this.world!.holes[o.hole];
      const stretch = 1 + Math.min(SPAG_STRETCH * spag, (SPAG_REACH * hole.r) / o.h);
      const thin = 1 - SPAG_THIN * spag;
      // Footprint is 0.85 x the half diagonal.
      const top = y + o.h * Math.cos(tilt) + 1.2 * o.f * Math.sin(tilt);
      _w.makeScale(thin, stretch, thin).setPosition(hole.x * (1 - thin), top * (1 - stretch), hole.z * (1 - thin));
      _m.premultiply(_w);
    }
    const ghost = this.ghosts.get(o);
    if (ghost) {
      ghost.color.matrix.copy(_m);
      ghost.depth.matrix.copy(_m);
      mesh.setMatrixAt(o.inst, ZERO);
    } else mesh.setMatrixAt(o.inst, _m);
  }

  // ------------------------------------------------------------ see-through occluders
  private acquireGhost(o: WObj): Ghost | null {
    if (this.ghosts.size >= MAX_GHOSTS) return null;
    let g = this.ghostPool.pop();
    if (!g) {
      const { mat, tint, gold } = createGhostMaterial();
      const depth = new THREE.Mesh(undefined, depthOnly);
      const color = new THREE.Mesh(undefined, mat);
      for (const m of [depth, color]) {
        m.matrixAutoUpdate = false;
        m.frustumCulled = false;
      }
      depth.renderOrder = 3;
      color.renderOrder = 4;
      g = { o: null, depth, color, mat, tint, gold, alpha: 1, hold: 0 };
    }
    const geo = geometryFor(o.t);
    g.depth.geometry = geo;
    g.color.geometry = geo;
    g.color.castShadow = this.shadows;
    g.color.receiveShadow = this.shadows;
    g.tint.setHex(o.tint);
    g.gold.value = o.gold ? 1 : 0;
    g.o = o;
    g.alpha = 1;
    g.mat.opacity = 1;
    this.group.add(g.depth, g.color);
    this.ghosts.set(o, g);
    o.dirty = true;
    return g;
  }

  private releaseGhost(g: Ghost): void {
    this.group.remove(g.depth, g.color);
    if (g.o) {
      this.ghosts.delete(g.o);
      g.o.dirty = true;
    }
    g.o = null;
    this.ghostPool.push(g);
  }

  /** Sight line for visitOccluder, set by updateOcclusion (fields, so no closure per frame). */
  private occ = { hx: 0, hz: 0, R: 0, fit: 0, dx: 0, dz: 0, L2: 1, L: 1, camY: 0 };

  /** Marks a prop as see-through if it stands on the sight line and is too big to swallow. */
  private visitOccluder = (o: WObj): void => {
    const { hx, hz, R, fit, dx, dz, L2, L, camY } = this.occ;
    // Flying event props (the UFO) pass quickly and are the show: never fade them.
    if (o.state !== ALIVE || o.f <= fit || o.fly) return;
    const top = o.y + o.h;
    if (top < 1 || top < R * 0.5) return;
    const ox = o.x - hx;
    const oz = o.z - hz;
    const t = (ox * dx + oz * dz) / L2;
    // Centre well behind the hole (from the camera's side): it cannot hide it.
    if (t * L < -(o.f * 0.6 + R * 0.3)) return;
    const tc = Math.min(1, Math.max(0, t));
    const qx = ox - dx * tc;
    const qz = oz - dz * tc;
    if (qx * qx + qz * qz > (o.f * 0.85 + R * 0.7) ** 2) return;
    // Height of the sight line where it enters the prop's footprint.
    if (camY * Math.max(0, t - o.f / L) > top) return;
    const g = this.ghosts.get(o) ?? this.acquireGhost(o);
    if (g) g.hold = 0.3;
  };

  /**
   * Fades props that stand between the camera and the hole and are too big to swallow, so the
   * player can see what is going on behind a building.
   */
  updateOcclusion(dt: number, cam: THREE.Vector3 | null): void {
    const w = this.world;
    if (w && cam) {
      const h = w.main;
      const occ = this.occ;
      occ.hx = h.x;
      occ.hz = h.z;
      occ.R = h.r;
      occ.fit = SIZE.fit * h.r;
      occ.dx = cam.x - h.x;
      occ.dz = cam.z - h.z;
      occ.L2 = occ.dx * occ.dx + occ.dz * occ.dz;
      occ.L = Math.sqrt(occ.L2) || 1;
      occ.camY = cam.y;
      const mx = h.x + occ.dx * 0.5;
      const mz = h.z + occ.dz * 0.5;
      w.grid.query(mx, mz, occ.L * 0.5 + Math.min(w.maxF, 30), this.visitOccluder);
      for (const o of w.movers) this.visitOccluder(o);
    }
    // Deleting the current entry while iterating a Map is safe.
    for (const g of this.ghosts.values()) {
      const o = g.o!;
      if (o.state !== ALIVE || !w) {
        this.releaseGhost(g);
        continue;
      }
      g.hold -= dt;
      const want = g.hold > 0 ? GHOST_ALPHA : 1;
      g.alpha += (want - g.alpha) * (1 - Math.exp(-10 * dt));
      if (want === 1 && g.alpha > 0.98) {
        this.releaseGhost(g);
        continue;
      }
      g.mat.opacity = g.alpha;
    }
  }

  update(dt: number, time: number): void {
    const w = this.world;
    if (!w) return;
    const objs = w.objects;
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      if (o.wob > 0) {
        o.wob = Math.max(0, o.wob - dt * 1.6);
        o.dirty = true;
      }
      if (!o.dirty) continue;
      o.dirty = false;
      const mesh = this.meshes.get(meshKey(o))!;
      this.writeMatrix(mesh, o, time);
      // Only bumps a version number: each mesh still uploads once per render.
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  clear(): void {
    for (const g of [...this.ghosts.values()]) this.releaseGhost(g);
    for (const m of this.meshes.values()) {
      this.group.remove(m);
      m.dispose();
    }
    this.meshes.clear();
    this.world = null;
  }
}
