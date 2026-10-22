import * as THREE from 'three';
import { SIZE } from '../config/balance';
import { OBJECT_TYPES } from '../config/objects';
import { ALIVE, DORMANT, FALLING, GONE, MV_NONE, type World, type WObj } from '../core/world';
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
const _q = new THREE.Quaternion();
const _qy = new THREE.Quaternion();
const _qt = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _sphere = new THREE.Sphere();
const _vp = new THREE.Matrix4();

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

function meshKey(o: WObj): number {
  return o.t * 2 + (o.gold ? 1 : 0);
}

/** Props still standing or falling; swallowed and not-yet-spawned ones are not drawn at all. */
function drawable(o: WObj): boolean {
  return o.state !== GONE && o.state !== DORMANT;
}

/** Last view the visible set was picked for (see cull). */
interface CullView {
  x: number;
  z: number;
  dist: number;
  fov: number;
  aspect: number;
  frames: number;
}

/**
 * One InstancedMesh per prop type; syncs instance matrices from the simulation each frame. A
 * mesh draws only the props near the view (see cull), packed into its first `count` slots: a
 * prop's slot is `o.inst`, -1 while it is not drawn.
 */
export class ObjectsView {
  readonly group = new THREE.Group();
  readonly material = createPropMaterial();
  readonly goldMaterial = createPropMaterial(true);
  /** Instanced mesh per prop type, golden props in their own mesh: key = type * 2 + gold. */
  private meshes = new Map<number, THREE.InstancedMesh>();
  /** The props each mesh draws, in slot order. */
  private slots = new Map<number, WObj[]>();
  /** Camera and sun shadow frustums the visible set was picked with; null draws everything. */
  private view: THREE.Frustum | null = null;
  private shadowView: THREE.Frustum | null = null;
  /** Bounding spheres grow by this much, so the set stays right while the camera moves on. */
  private margin = 0;
  private cullView: CullView = { x: NaN, z: NaN, dist: 0, fov: 0, aspect: 0, frames: 0 };
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
      this.slots.set(key, []);
      this.group.add(mesh);
    }
    // No view yet: every prop gets a slot until the first cull().
    this.view = this.shadowView = null;
    this.cullView.x = NaN;
    this.refill(0);
  }

  /** Is the prop's bounding sphere (plus the margin) in the camera's or the shadow's view? */
  private inView(o: WObj): boolean {
    if (!this.view) return true;
    _sphere.center.set(o.x, o.y + o.h * 0.5, o.z);
    _sphere.radius = Math.hypot(o.f, o.h * 0.5) + this.margin;
    return this.view.intersectsSphere(_sphere) || (this.shadowView !== null && this.shadowView.intersectsSphere(_sphere));
  }

  /** Gives every drawable prop in view a slot, in object order, and rewrites all slots. */
  private refill(time: number): void {
    for (const list of this.slots.values()) list.length = 0;
    for (const o of this.world!.objects) {
      o.inst = -1;
      o.dirty = false;
      if (drawable(o) && this.inView(o)) this.addSlot(o, time);
      else if (this.ghosts.has(o)) this.writeMatrix(this.meshes.get(meshKey(o))!, o, time);
    }
    for (const [key, mesh] of this.meshes) {
      mesh.count = this.slots.get(key)!.length;
      mesh.visible = mesh.count > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  private addSlot(o: WObj, time: number): void {
    const key = meshKey(o);
    const mesh = this.meshes.get(key)!;
    const list = this.slots.get(key)!;
    o.inst = list.length;
    list.push(o);
    mesh.count = list.length;
    mesh.visible = true;
    mesh.setColorAt(o.inst, _c.setHex(o.tint));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.writeMatrix(mesh, o, time);
  }

  /**
   * Picks the props to draw: those whose bounding sphere meets the camera's view or, with
   * shadows on, the sun's shadow camera (props just out of sight still cast shadows into it). The
   * spheres grow by a margin, so the set is picked again only after the view moved about half of
   * it, zoomed, or every half second, instead of every frame.
   */
  cull(camera: THREE.PerspectiveCamera, shadowCamera: THREE.Camera | null, x: number, z: number, dist: number, time: number): void {
    if (!this.world) return;
    const c = this.cullView;
    const margin = 4 + dist * 0.15;
    const moved = Math.hypot(x - c.x, z - c.z);
    if (moved < margin * 0.5 && Math.abs(dist - c.dist) < dist * 0.05 && Math.abs(camera.fov - c.fov) < 1 && camera.aspect === c.aspect && ++c.frames < 30) return;
    Object.assign(c, { x, z, dist, fov: camera.fov, aspect: camera.aspect, frames: 0 });
    this.margin = margin;
    camera.updateMatrixWorld();
    this.view ??= new THREE.Frustum();
    this.view.setFromProjectionMatrix(_vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    if (shadowCamera) {
      shadowCamera.updateMatrixWorld();
      this.shadowView ??= new THREE.Frustum();
      this.shadowView.setFromProjectionMatrix(_vp.multiplyMatrices(shadowCamera.projectionMatrix, shadowCamera.matrixWorldInverse));
    } else this.shadowView = null;
    this.refill(time);
  }

  setShadows(on: boolean): void {
    this.shadows = on;
    // Shadows add the props that are out of sight but cast into it: pick the set again.
    this.cullView.x = NaN;
    for (const m of this.meshes.values()) {
      m.castShadow = on;
      m.receiveShadow = on;
    }
    for (const g of this.ghosts.values()) {
      g.color.castShadow = on;
      g.color.receiveShadow = on;
    }
  }

  /** Writes the prop's slot (when it has one) and its see-through copy (when it has one). */
  private writeMatrix(mesh: THREE.InstancedMesh, o: WObj, time: number): void {
    if (o.state === GONE || o.state === DORMANT) {
      if (o.inst >= 0) mesh.setMatrixAt(o.inst, ZERO);
      return;
    }
    _qy.setFromAxisAngle(_up, o.rot);
    let y = o.y;
    if (o.state === FALLING) {
      _axis.set(o.tdz, 0, -o.tdx).normalize();
      _qt.setFromAxisAngle(_axis, o.tilt);
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
    const ghost = this.ghosts.get(o);
    if (ghost) {
      ghost.color.matrix.copy(_m);
      ghost.depth.matrix.copy(_m);
    }
    if (o.inst >= 0) mesh.setMatrixAt(o.inst, ghost ? ZERO : _m);
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
      if (o.inst < 0) {
        // Not drawn: it may have walked, spawned or been pulled into view since the last cull.
        if (drawable(o) && this.inView(o)) this.addSlot(o, time);
        else if (this.ghosts.has(o)) this.writeMatrix(mesh, o, time);
        else continue;
      } else this.writeMatrix(mesh, o, time);
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
    this.slots.clear();
    this.world = null;
  }
}
