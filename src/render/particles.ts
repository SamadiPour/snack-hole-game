import * as THREE from 'three';

const MAX = 700;

const vert = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aAlpha;
varying vec3 vColor;
varying float vAlpha;
uniform float uScale;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const frag = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = dot(p, p);
  if (d > 1.0) discard;
  float a = (1.0 - d) * vAlpha;
  gl_FragColor = vec4(vColor * a, a);
}
`;

/** CPU-simulated additive sparkle particles (swallow bursts, level-up rings, big-swallow spirals). */
export class Particles {
  readonly points: THREE.Points;
  private pos = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 3);
  private size = new Float32Array(MAX);
  private alpha = new Float32Array(MAX);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private baseSize = new Float32Array(MAX);
  private grav = new Float32Array(MAX);
  /**
   * Swirl particles (spiral) ride polar coordinates around the attractor instead of flying
   * straight: radius (in hole radii), angle and orbit speed (rad/s at the rim; 0 = ordinary particle).
   */
  private orbU = new Float32Array(MAX);
  private orbA = new Float32Array(MAX);
  private orbW = new Float32Array(MAX);
  /** The main hole (centre and radius), moved by the renderer every frame. */
  private ax = 0;
  private az = 0;
  private ar = 1;
  private next = 0;
  private mat: THREE.ShaderMaterial;
  /** Parsed colours by the value emit was given (a handful of skin and effect colours). */
  private colors = new Map<string | number, THREE.Color>();
  private aPos: THREE.BufferAttribute;
  private aColor: THREE.BufferAttribute;
  private aSize: THREE.BufferAttribute;
  private aAlpha: THREE.BufferAttribute;
  /** Particles alive after the last update; 0 means the GPU copy is already all hidden. */
  private live = 0;
  /** Emitted since the last update (new colours to upload, or particles to show). */
  private emitted = false;

  constructor() {
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aColor = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('aColor', this.aColor);
    geo.setAttribute('aSize', this.aSize);
    geo.setAttribute('aAlpha', this.aAlpha);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  setViewportHeight(h: number): void {
    this.mat.uniforms.uScale.value = h * 0.9;
  }

  setAttractor(x: number, z: number, r: number): void {
    this.ax = x;
    this.az = z;
    this.ar = r;
  }

  /** Returns the particle's slot. */
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: string | number, size: number, life: number, gravity = 0): number {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    let c = this.colors.get(color);
    if (!c) {
      if (this.colors.size > 64) this.colors.clear();
      c = new THREE.Color(color);
      this.colors.set(color, c);
    }
    this.col[i * 3] = c.r;
    this.col[i * 3 + 1] = c.g;
    this.col[i * 3 + 2] = c.b;
    this.baseSize[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grav[i] = gravity;
    this.orbW[i] = 0;
    this.emitted = true;
    return i;
  }

  /**
   * Debris spiralling into the main hole like an accretion disk: it orbits faster as it closes in,
   * then drops down the throat. `power` (0..1) sets how much there is and how far out it starts.
   */
  spiral(colors: readonly (string | number)[], power: number): void {
    const r = this.ar;
    const n = Math.round(8 + power * 10);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      // Starts just outside the rim, so the show stays on the hole.
      const u = 1.05 + Math.random() * (0.25 + power * 0.25);
      const x = this.ax + Math.cos(a) * u * r;
      const z = this.az + Math.sin(a) * u * r;
      const i = this.emit(x, 0.1 + Math.random() * (0.2 + r * 0.1), z, 0, 0, 0, colors[k % colors.length], (0.2 + Math.random() * 0.25) * (0.6 + r * 0.3), 0.8 + Math.random() * 0.4);
      this.orbU[i] = u;
      this.orbA[i] = a;
      this.orbW[i] = 3.5 + Math.random() * 2;
    }
  }

  /**
   * One step of a swirl particle: infall speeds up toward the rim, orbit speed rises like a
   * Kepler orbit (u^-1.5), and once over the hole it drops in.
   */
  private orbit(i: number, dt: number): void {
    const u0 = this.orbU[i];
    const u = Math.max(0.05, u0 - (1.2 + 1.5 / Math.max(u0, 0.3)) * dt);
    this.orbU[i] = u;
    const a = this.orbA[i] + (this.orbW[i] / Math.pow(Math.max(u, 0.3), 1.5)) * dt;
    this.orbA[i] = a;
    this.pos[i * 3] = this.ax + Math.cos(a) * u * this.ar;
    this.pos[i * 3 + 2] = this.az + Math.sin(a) * u * this.ar;
    if (u < 1) this.vel[i * 3 + 1] -= (10 + 4 * this.ar) * dt;
  }

  /** Burst of sparkles rising out of the hole when something is swallowed. */
  swallowBurst(x: number, z: number, r: number, color: string, amount: number, big: boolean): void {
    const n = Math.min(24, Math.max(2, amount));
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const rr = r * (0.6 + Math.random() * 0.5);
      const sp = (1 + Math.random() * 2) * (0.5 + r * 0.25);
      this.emit(
        x + Math.cos(a) * rr,
        0.1,
        z + Math.sin(a) * rr,
        Math.cos(a) * sp * 0.4,
        sp * (big ? 2.4 : 1.6),
        Math.sin(a) * sp * 0.4,
        color,
        (0.25 + Math.random() * 0.35) * (0.6 + r * 0.35),
        0.5 + Math.random() * 0.5,
        -2 - r,
      );
    }
  }

  /** Expanding ring of sparks around the rim (level up). */
  ringBurst(x: number, z: number, r: number, color: string): void {
    const n = 48;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const sp = 3 + r * 1.2;
      this.emit(x + Math.cos(a) * r, 0.2, z + Math.sin(a) * r, Math.cos(a) * sp, 1.5 + Math.random() * 2, Math.sin(a) * sp, color, 0.5 + r * 0.25, 0.8, -3);
    }
  }

  update(dt: number): void {
    // Nothing alive and already hidden on the GPU, or paused with nothing new: no work, no upload.
    if (!this.emitted && (this.live === 0 || dt === 0)) return;
    let live = 0;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        this.size[i] = 0;
        continue;
      }
      live++;
      this.life[i] -= dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.vel[i * 3 + 1] += this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.orbW[i] > 0) this.orbit(i, dt);
      this.alpha[i] = Math.min(1, t * 2);
      this.size[i] = this.baseSize[i] * (0.4 + 0.6 * t);
    }
    this.aPos.needsUpdate = true;
    this.aSize.needsUpdate = true;
    this.aAlpha.needsUpdate = true;
    if (this.emitted) this.aColor.needsUpdate = true;
    this.emitted = false;
    this.live = live;
  }
}
