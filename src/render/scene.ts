import * as THREE from 'three';
import type { SkinDef } from '../config/balance';
import type { Quality } from '../core/save';
import type { MapData } from '../core/mapgen/builder';
import { ALIVE, type World } from '../core/world';
import { DashTrail } from './dashTrail';
import { Ground } from './ground';
import { HoleView } from './holeView';
import { MAX_HOLES, holeUniforms } from './materials';
import { reducedMotion } from './motion';
import { ObjectsView } from './objectsView';
import { Particles } from './particles';

export type CameraMode = 'round' | 'hub';

/** Auto quality: frames slower than this (s) for SLOW_FOR seconds step the pixel ratio down. */
const SLOW_FRAME = 1 / 40;
const SLOW_FOR = 3;
const MIN_PIXEL_RATIO = 1;
/**
 * Auto quality's starting pixel ratio. Phones and tablets start at 1.5: still sharp on a small
 * screen, with 44% fewer pixels to shade than 2, which keeps them from running hot.
 */
const AUTO_RATIO = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 1.5 : 2;

const HELPER_SKIN: SkinDef = {
  id: 'helper',
  name: 'Helper',
  rim: '#5fe0ff',
  glow: '#a8f0ff',
  swirl: 'rings',
  swirlColor: '#0f4a66',
  cost: 0,
};

/** Owns the three.js renderer, scene, lights, camera rig and all world visuals. */
export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.5, 2000);
  readonly objects = new ObjectsView();
  readonly particles = new Particles();
  private dashTrail = new DashTrail();
  /** 0..1 FOV punch while dashing. */
  private fovKick = 0;
  /** 0..1 camera pull-back after swallowing a landmark. */
  private zoomKick = 0;
  /** Tractor beam under the event UFO. */
  private beam: THREE.Mesh;
  private hemi = new THREE.HemisphereLight(0xffffff, 0x888866, 1.4);
  private sun = new THREE.DirectionalLight(0xffffff, 2.2);
  private ground: Ground | null = null;
  private holeViews: HoleView[] = [];
  private map: MapData | null = null;
  private skin: SkinDef;
  private camTarget = new THREE.Vector3();
  private camDist = 20;
  private yaw = 0;
  private pitch = 0.75;
  private camInit = false;
  private shakeAmt = 0;
  private time = 0;
  /** Real seconds of the last frame (noteFrame), unscaled by slow-motion and ticking while paused. */
  private frameDt = 1 / 60;
  private shadowsOn = true;
  /** Direction from the view target to the sun. */
  private readonly sunDir = new THREE.Vector3(-45, 80, 35).normalize();
  private scratch = new THREE.Vector3();
  private quality: Quality = 'auto';
  /** Pixel ratio cap from auto quality (steps down while frames run slow). */
  private autoRatio = AUTO_RATIO;
  private slowFor = 0;
  private avgFrame = 1 / 60;
  private dpr = window.devicePixelRatio;
  /** Smoothed CPU time spent syncing instance matrices (ms). */
  syncMs = 0;

  constructor(canvas: HTMLCanvasElement, skin: SkinDef) {
    this.skin = skin;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.scene.add(this.objects.group, this.particles.points, this.dashTrail.group);
    const beamGeo = new THREE.CylinderGeometry(0.6, 3.2, 1, 20, 1, true);
    beamGeo.translate(0, -0.5, 0);
    this.beam = new THREE.Mesh(
      beamGeo,
      new THREE.MeshBasicMaterial({ color: 0x7ff6ff, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    );
    this.beam.visible = false;
    this.beam.renderOrder = 4;
    this.scene.add(this.beam);
    this.resize();
    // The canvas fills its CSS box; size the drawing buffer from that box, so the picture never
    // stretches when a mobile browser's toolbar changes the visible height.
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  /** Render resolution: high = up to 2x, low = 1x with smaller shadow maps, auto adapts (from AUTO_RATIO). */
  setQuality(q: Quality): void {
    if (q === this.quality) return;
    this.quality = q;
    this.autoRatio = AUTO_RATIO;
    this.slowFor = 0;
    const size = q === 'low' ? 1024 : 2048;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.resize();
  }

  /**
   * Called once per frame with the real frame time. Auto quality lowers the pixel ratio a step at
   * a time while frames stay slow; it also picks up a new devicePixelRatio (window moved to
   * another screen).
   */
  noteFrame(dt: number): void {
    this.frameDt = dt;
    if (window.devicePixelRatio !== this.dpr) {
      this.dpr = window.devicePixelRatio;
      this.resize();
    }
    if (this.quality !== 'auto' || dt <= 0) return;
    // A long frame counts as at most 50 ms: one hitch (GC, tab coming back) cannot step the
    // quality down, but a device that never gets under the game's 0.1 s frame cap still does.
    this.avgFrame += (Math.min(dt, 0.05) - this.avgFrame) * 0.1;
    this.slowFor = this.avgFrame > SLOW_FRAME ? this.slowFor + dt : 0;
    if (this.slowFor < SLOW_FOR || this.pixelRatio() <= MIN_PIXEL_RATIO) return;
    this.autoRatio = Math.max(MIN_PIXEL_RATIO, this.pixelRatio() - 0.25);
    this.slowFor = 0;
    this.avgFrame = 1 / 60;
    this.resize();
  }

  private pixelRatio(): number {
    const max = Math.min(window.devicePixelRatio, 2);
    if (this.quality === 'low') return Math.min(max, 1);
    if (this.quality === 'auto') return Math.min(max, this.autoRatio);
    return max;
  }

  setShadows(on: boolean): void {
    this.shadowsOn = on;
    this.sun.castShadow = on;
    // Frees the shadow map (up to 2048²); three.js makes a new one when shadows come back on.
    if (!on && this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
    this.objects.setShadows(on);
  }

  setMap(map: MapData): void {
    if (this.map === map) return;
    this.map = map;
    if (this.ground) {
      this.scene.remove(this.ground.group);
      this.ground.dispose();
    }
    this.ground = new Ground(map);
    this.scene.add(this.ground.group);
    const th = map.theme;
    this.scene.background = new THREE.Color(th.sky);
    this.scene.fog = new THREE.Fog(th.fog, 60, 300);
    this.hemi.color.set(th.hemiSky);
    this.hemi.groundColor.set(th.hemiGround);
    this.sun.color.set(th.sun);
    this.sun.intensity = th.sunIntensity;
  }

  setWorld(world: World): void {
    this.setMap(world.map);
    this.objects.setWorld(world, this.shadowsOn);
    while (this.holeViews.length < world.holes.length) {
      const v = new HoleView(this.holeViews.length === 0 ? this.skin : HELPER_SKIN, this.holeViews.length > 0);
      this.holeViews.push(v);
      this.scene.add(v.group);
    }
    // Keep the current distance/yaw so the camera glides from the hub view into the round.
    if (!this.camInit) {
      this.camTarget.set(world.main.x, 0, world.main.z);
      this.camDist = this.desiredDist(world.main.r);
      this.camInit = true;
    }
  }

  setSkin(skin: SkinDef): void {
    this.skin = skin;
    this.holeViews[0]?.setSkin(skin);
  }

  get skinColor(): string {
    return this.skin.glow;
  }

  pulseHole(amount = 1): void {
    if (this.holeViews[0]) this.holeViews[0].pulse = Math.max(this.holeViews[0].pulse, amount);
  }

  /** Dash start: shockwave, sparks and a camera FOV punch. */
  dashBurst(world: World): void {
    const h = world.main;
    this.dashTrail.shockwave(h.x, h.z, h.r, this.skin.glow);
    this.particles.ringBurst(h.x, h.z, h.r, this.skin.glow);
    this.pulseHole(1.2);
  }

  /** Landmark swallowed: a dust cloud bursts out of the hole; `full` also pulls the camera back. */
  landmarkBurst(world: World, f: number, full: boolean): void {
    const h = world.main;
    if (full) this.zoomKick = 1;
    this.pulseHole(full ? 1.5 : 1);
    const n = Math.min(full ? 60 : 30, (full ? 24 : 12) + Math.round(f * (full ? 4 : 2)));
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (2 + Math.random() * 4) * (0.6 + h.r * 0.25);
      const col = k % 3 === 0 ? '#fff4d6' : k % 3 === 1 ? '#c9b48f' : this.skin.glow;
      this.particles.emit(h.x + Math.cos(a) * h.r, 0.3, h.z + Math.sin(a) * h.r, Math.cos(a) * sp, 2 + Math.random() * 5, Math.sin(a) * sp, col, (0.5 + Math.random() * 0.6) * (0.7 + h.r * 0.3), 0.9 + Math.random() * 0.6, -5);
    }
    if (full) this.particles.ringBurst(h.x, h.z, h.r * 1.2, '#ffffff');
  }

  shake(amount: number): void {
    this.shakeAmt = Math.min(1.5, Math.max(this.shakeAmt, amount));
  }

  private desiredDist(r: number): number {
    // Portrait screens see less horizontally; pull back so the hole keeps breathing room.
    const a = this.camera.aspect;
    const portrait = a < 1 ? Math.pow(1 / a, 0.6) : 1;
    return (13 + 7.5 * r) * portrait;
  }

  resize(): void {
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    const ratio = this.pixelRatio();
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.particles.setViewportHeight(h * ratio);
  }

  /** Screen position (CSS px) of a world point, or null when behind the camera. */
  project(x: number, y: number, z: number): { x: number; y: number } | null {
    const v = this.scratch.set(x, y, z).project(this.camera);
    if (v.z > 1) return null;
    const canvas = this.renderer.domElement;
    return { x: (v.x * 0.5 + 0.5) * canvas.clientWidth, y: (-v.y * 0.5 + 0.5) * canvas.clientHeight };
  }

  render(dt: number, world: World | null, mode: CameraMode): void {
    this.time += dt;
    if (world) {
      // Holes: shader cut-outs + visuals.
      const n = Math.min(world.holes.length, MAX_HOLES);
      holeUniforms.uHoleCount.value = n;
      for (let i = 0; i < n; i++) {
        const h = world.holes[i];
        holeUniforms.uHoles.value[i].set(h.x, h.z, h.r, 0);
        this.holeViews[i]?.update(h.x, h.z, h.r, this.time, true, this.frameDt);
      }
      for (let i = n; i < this.holeViews.length; i++) this.holeViews[i].group.visible = false;
      holeUniforms.uFadeDepth.value = Math.max(2, world.main.r * 1.6);
      holeUniforms.uTime.value = this.time;
      this.updateCamera(dt, world, mode);
      this.updateDash(dt, world);
      this.updateGoldAndEvents(dt, world);
      const ts = performance.now();
      this.objects.updateOcclusion(dt, mode === 'round' ? this.camera.position : null);
      let shadowCam: THREE.Camera | null = null;
      if (this.shadowsOn) {
        // Aim the shadow camera now (render does it again) so culling sees this frame's.
        this.sun.updateMatrixWorld();
        this.sun.target.updateMatrixWorld();
        this.sun.shadow.updateMatrices(this.sun);
        shadowCam = this.sun.shadow.camera;
      }
      this.objects.cull(this.camera, shadowCam, this.camTarget.x, this.camTarget.z, this.camDist, this.time);
      this.objects.update(dt, this.time);
      this.syncMs += (performance.now() - ts - this.syncMs) * 0.05;
    }
    this.particles.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  /** Sparkles on golden props near the view, and the UFO's tractor beam. */
  private updateGoldAndEvents(dt: number, world: World): void {
    const t = this.camTarget;
    const R = this.camDist * 1.3;
    for (const o of world.golden) {
      if (o.state !== ALIVE || Math.abs(o.x - t.x) > R || Math.abs(o.z - t.z) > R) continue;
      if (Math.random() > dt * (2 + o.f)) continue;
      const a = Math.random() * Math.PI * 2;
      const rr = Math.random() * o.f * 0.6;
      this.particles.emit(o.x + Math.cos(a) * rr, o.y + Math.random() * o.h, o.z + Math.sin(a) * rr, 0, 0.6 + Math.random() * 0.6, 0, Math.random() < 0.4 ? '#ffffff' : '#ffd23d', 0.25 + o.f * 0.12, 0.6 + Math.random() * 0.4, 0);
    }
    const u = world.ufoFlying;
    this.beam.visible = !!u;
    if (u) {
      const top = u.y + 0.4;
      this.beam.position.set(u.x, top, u.z);
      this.beam.scale.set(u.s, top, u.s);
      (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.16 + 0.08 * Math.sin(this.time * 9);
    }
  }

  private updateDash(dt: number, world: World): void {
    const h = world.main;
    const dashing = world.abilities.dash.active > 0 && world.running;
    this.dashTrail.update(dt, h.x, h.z, h.r, dashing, this.skin.glow);
    if (!dashing) return;
    this.pulseHole(0.7);
    // Sparks peeling off the trailing rim.
    const v = Math.hypot(h.vx, h.vz) || 1;
    const bx = -h.vx / v;
    const bz = -h.vz / v;
    for (let k = 0; k < 3; k++) {
      const a = Math.atan2(bz, bx) + (Math.random() - 0.5) * 2.2;
      const px = h.x + Math.cos(a) * h.r;
      const pz = h.z + Math.sin(a) * h.r;
      const sp = v * (0.15 + Math.random() * 0.2);
      this.particles.emit(px, 0.15, pz, bx * sp, 0.6 + Math.random() * 1.2, bz * sp, k === 0 ? '#ffffff' : this.skin.glow, (0.3 + Math.random() * 0.3) * (0.6 + h.r * 0.3), 0.35 + Math.random() * 0.25, -2);
    }
  }

  private updateCamera(dt: number, world: World, mode: CameraMode): void {
    const h = world.main;
    const k = 1 - Math.exp(-3 * dt);
    let wantPitch: number;
    this.zoomKick *= Math.exp(-1.1 * dt);
    if (mode === 'round') {
      const want = this.desiredDist(h.r) * (1 + 0.35 * this.zoomKick);
      this.camDist += (want - this.camDist) * (1 - Math.exp(-2 * dt));
      this.camTarget.x += (h.x + h.vx * 0.2 - this.camTarget.x) * (1 - Math.exp(-6 * dt));
      this.camTarget.z += (h.z + h.vz * 0.2 - this.camTarget.z) * (1 - Math.exp(-6 * dt));
      wantPitch = 0.98;
      // Ease back to north-up (steering assumes it).
      let dy = -this.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.yaw += dy * (1 - Math.exp(-5 * dt));
    } else {
      const want = this.desiredDist(h.r) * 1.6 + 8;
      this.camDist += (want - this.camDist) * k * 0.5;
      this.camTarget.x += (h.x - this.camTarget.x) * k;
      this.camTarget.z += (h.z - this.camTarget.z) * k;
      this.yaw += dt * 0.06;
      wantPitch = 0.75;
    }
    this.pitch += (wantPitch - this.pitch) * (1 - Math.exp(-3 * dt));
    const pitch = this.pitch;
    const yaw = this.yaw;
    const d = this.camDist;
    let sx = 0;
    let sz = 0;
    if (this.shakeAmt > 0.001 && dt > 0) {
      sx = (Math.random() - 0.5) * this.shakeAmt * d * 0.02;
      sz = (Math.random() - 0.5) * this.shakeAmt * d * 0.02;
      this.shakeAmt *= Math.exp(-8 * dt);
    }
    const t = this.camTarget;
    this.camera.position.set(
      t.x + Math.sin(yaw) * Math.cos(pitch) * d + sx,
      Math.sin(pitch) * d,
      t.z + Math.cos(yaw) * Math.cos(pitch) * d + sz,
    );
    this.camera.lookAt(t.x + sx, 0, t.z + sz);
    const dashing = world.abilities.dash.active > 0 && world.running;
    this.fovKick += ((dashing ? 1 : 0) - this.fovKick) * (1 - Math.exp(-(dashing ? 14 : 4) * dt));
    this.camera.fov = 45 + (reducedMotion() ? 0 : 8) * this.fovKick;
    this.camera.near = Math.max(0.3, d * 0.03);
    this.camera.far = d * 8 + 300;
    this.camera.updateProjectionMatrix();

    const fog = this.scene.fog as THREE.Fog | null;
    if (fog) {
      fog.near = d * 1.6;
      fog.far = d * 4.5 + 60;
    }

    // Shadow frustum follows the view.
    const ext = d * 1.25 + 10;
    const cam = this.sun.shadow.camera;
    cam.left = -ext;
    cam.right = ext;
    cam.top = ext;
    cam.bottom = -ext;
    cam.near = 1;
    cam.far = 400 + d * 2;
    cam.updateProjectionMatrix();
    const sd = this.sunDir;
    const sk = 150 + d;
    this.sun.position.set(t.x + sd.x * sk, sd.y * sk, t.z + sd.z * sk);
    this.sun.target.position.set(t.x, 0, t.z);
  }
}
