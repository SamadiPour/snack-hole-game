import * as THREE from 'three';
import type { MoteStyle } from '../core/mapgen/builder';

/**
 * Drifting specks above a Cosmos realm's ground (sparks, bubbles, pollen, space dust) that give the
 * flat world some depth as the camera moves. The motes live in the world, not on the screen: each
 * of three layers tiles the world with a box of a fixed size, wrapped round the view, so whatever
 * the zoom one layer fits it, and a layer fades out when the view is far smaller or bigger than its box.
 */

/** Box half-widths of the layers, in world units. */
const LAYERS = [14, 56, 224];

const vert = /* glsl */ `
attribute vec4 aSeed;
attribute vec3 aColor;
attribute float aSpan;
uniform vec3 uCenter;
uniform float uTime;
uniform float uScale;
uniform float uSize;
uniform float uDrift;
uniform float uRise;
uniform float uTwinkle;
uniform float uDist;
uniform float uFade;
varying vec3 vColor;
varying float vAlpha;

float wrap(float v, float c, float L) {
  return c + mod(v - c + 0.5 * L, L) - 0.5 * L;
}

void main() {
  float L = aSpan * 2.0;
  float a = aSeed.w * 6.2831;
  vec2 drift = vec2(cos(a), sin(a)) * uDrift * (0.4 + aSeed.y) * aSpan * 0.02;
  float x = wrap(aSeed.x * L + drift.x * uTime, uCenter.x, L);
  float z = wrap(aSeed.z * L + drift.y * uTime, uCenter.z, L);
  float lo = aSpan * 0.04;
  float hi = aSpan * 0.4;
  float y = lo + mod(aSeed.y * (hi - lo) + uRise * aSpan * 0.01 * uTime, hi - lo);
  // A layer shows while the view (camera distance) is within about 0.25x to 2x of its box.
  float k = uDist / aSpan;
  float layer = smoothstep(0.12, 0.3, k) * (1.0 - smoothstep(1.2, 2.4, k));
  float tw = 1.0 - uTwinkle * 0.5 * (1.0 + sin(uTime * (1.5 + aSeed.x * 3.0) + a * 3.0));
  // Fade in near the top of the column and out near the bottom, so wrapping never pops.
  float edge = smoothstep(lo, lo + (hi - lo) * 0.15, y) * (1.0 - smoothstep(hi - (hi - lo) * 0.15, hi, y));
  vAlpha = layer * tw * edge * uFade;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(x, y, z, 1.0);
  gl_PointSize = uSize * aSpan * 0.03 * (0.5 + aSeed.y) * uScale / -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const frag = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = dot(p, p);
  if (d > 1.0 || vAlpha <= 0.0) discard;
  float a = (1.0 - d) * (1.0 - d) * vAlpha;
  gl_FragColor = vec4(vColor * a, a);
}
`;

export class Motes {
  readonly points: THREE.Points;
  private mat: THREE.ShaderMaterial;
  private fade = 0;
  private fadeRate = 1;

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uCenter: { value: new THREE.Vector3() },
        uTime: { value: 0 },
        uScale: { value: 400 },
        uSize: { value: 1 },
        uDrift: { value: 0 },
        uRise: { value: 0 },
        uTwinkle: { value: 0 },
        uDist: { value: 20 },
        uFade: { value: 0 },
      },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(new THREE.BufferGeometry(), this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    this.points.visible = false;
  }

  setViewportHeight(h: number): void {
    this.mat.uniforms.uScale.value = h * 0.9;
  }

  /**
   * New style (null: none), fading in over `fadeIn` seconds. A Cosmos flip shrinks the world, which
   * would scatter the old motes, so they go at once and the new realm's fade in.
   */
  setStyle(style: MoteStyle | null, fadeIn = 0): void {
    this.fade = fadeIn > 0 ? 0 : 1;
    this.fadeRate = fadeIn > 0 ? 1 / fadeIn : 1;
    this.points.geometry.dispose();
    const geo = new THREE.BufferGeometry();
    this.points.geometry = geo;
    this.points.visible = !!style;
    if (!style) return;
    const n = style.count;
    const seed = new Float32Array(n * 4);
    const col = new Float32Array(n * 3);
    const span = new Float32Array(n);
    const pos = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 4; k++) seed[i * 4 + k] = Math.random();
      c.set(style.colors[i % style.colors.length]);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
      span[i] = LAYERS[i % LAYERS.length];
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSpan', new THREE.BufferAttribute(span, 1));
    const u = this.mat.uniforms;
    u.uSize.value = style.size;
    u.uDrift.value = style.drift;
    u.uRise.value = style.rise;
    u.uTwinkle.value = style.twinkle;
  }

  update(dt: number, time: number, x: number, z: number, dist: number): void {
    if (this.fade < 1) this.fade = Math.min(1, this.fade + this.fadeRate * dt);
    const u = this.mat.uniforms;
    u.uCenter.value.set(x, 0, z);
    u.uTime.value = time;
    u.uDist.value = dist;
    u.uFade.value = this.fade;
  }
}
