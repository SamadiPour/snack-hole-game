import * as THREE from 'three';
import type { SkinDef } from '../config/balance';

/** Pulse decay rate (1/s): -ln(0.92) * 60. */
const PULSE_DECAY = 5;
/** Vortex spin-up after a big swallow: decay rate (1/s) and extra swirl speed at full spin. */
const SPIN_DECAY = 2.5;
const SPIN_BOOST = 8;

const SWIRL_MODE: Record<SkinDef['swirl'], number> = { none: 0, spiral: 1, rings: 2, stars: 3, galaxy: 4 };

const wallVert = /* glsl */ `
varying vec3 vLocal;
void main() {
  vLocal = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const wallFrag = /* glsl */ `
uniform vec3 uRim;
uniform vec3 uSwirl;
uniform float uTime;
uniform float uMode;
uniform float uSpin;
varying vec3 vLocal;
void main() {
  float t = clamp(0.5 - vLocal.y, 0.0, 1.0);
  float a = atan(vLocal.z, vLocal.x);
  float stripes = 0.5 + 0.5 * sin(a * 7.0 + t * 14.0 - uTime * 3.0);
  vec3 top = mix(uSwirl * 0.9, uRim * 0.55, 0.35);
  vec3 col = mix(top, vec3(0.0), pow(t, 0.45));
  col += uSwirl * stripes * (1.0 - t) * 0.35 * step(0.5, uMode);
  // Spin-up: bright streaks race down the throat, on every skin.
  col += mix(uSwirl, uRim, 0.6) * pow(stripes, 3.0) * pow(1.0 - t, 1.5) * 0.9 * uSpin;
  col += uRim * smoothstep(0.06, 0.0, t) * 0.5;
  gl_FragColor = vec4(col, 1.0);
}
`;

const bottomFrag = /* glsl */ `
uniform vec3 uRim;
uniform vec3 uSwirl;
uniform float uTime;
uniform float uMode;
uniform float uSpin;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float v = 0.0;
  if (uMode > 3.5) {
    float arms = sin(a * 2.0 + log(r + 0.05) * 6.0 - uTime * 1.5);
    v = smoothstep(0.2, 1.0, arms) * (1.0 - r);
    vec2 g = floor((p + 1.0) * 24.0);
    v += step(0.985, hash(g + floor(uTime * 0.5))) * 0.8;
  } else if (uMode > 2.5) {
    vec2 g = floor((p + 1.0) * 14.0 + vec2(uTime * 0.6, 0.0));
    v = step(0.93, hash(g)) * (1.0 - r * 0.7);
    v += 0.25 * smoothstep(0.3, 1.0, sin(a * 3.0 + r * 10.0 - uTime * 2.0)) * (1.0 - r);
  } else if (uMode > 1.5) {
    v = smoothstep(0.55, 1.0, sin(r * 22.0 - uTime * 4.0)) * (1.0 - r);
  } else if (uMode > 0.5) {
    v = smoothstep(0.35, 1.0, sin(a * 3.0 + r * 12.0 - uTime * 3.5)) * (1.0 - r);
  }
  vec3 col = (uSwirl * v * 1.4 + uRim * v * 0.25) * (1.0 + uSpin);
  // Spin-up: the core flares as the swallowed prop hits the singularity.
  col += mix(uRim, vec3(1.0), 0.35) * pow(max(0.0, 1.0 - r * 1.6), 3.0) * uSpin;
  gl_FragColor = vec4(col, 1.0);
}
`;

const glowFrag = /* glsl */ `
uniform vec3 uGlow;
uniform float uPulse;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  // Ring geometry covers r in [inner, 1]; inner edge is the rim.
  float t = clamp((r - 0.74) / 0.26, 0.0, 1.0);
  float a = pow(1.0 - t, 2.2) * (0.55 + 0.25 * uPulse);
  gl_FragColor = vec4(uGlow * a, a);
}
`;

const basicVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** Visual part of a hole: dark inner wall, animated swirl floor, bright rim and soft glow. */
export class HoleView {
  readonly group = new THREE.Group();
  private wall: THREE.Mesh;
  private bottom: THREE.Mesh;
  private rim: THREE.Mesh;
  private glow: THREE.Mesh;
  private uniforms = {
    uRim: { value: new THREE.Color() },
    uSwirl: { value: new THREE.Color() },
    uGlow: { value: new THREE.Color() },
    uTime: { value: 0 },
    uMode: { value: 1 },
    uPulse: { value: 0 },
    uSpin: { value: 0 },
  };
  private rimMat: THREE.MeshBasicMaterial;
  pulse = 0;
  /** Vortex spin-up (0..1): the swirl races and the throat lights up, then eases back. */
  spin = 0;
  /** Swirl animation clock: scene time, run faster while spinning up. */
  private swirlT = 0;
  private lastTime = 0;

  constructor(skin: SkinDef, private helper = false) {
    const u = this.uniforms;
    const wallMat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: wallVert, fragmentShader: wallFrag, side: THREE.BackSide });
    this.wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 48, 1, true), wallMat);
    this.wall.renderOrder = 0;

    const bottomGeo = new THREE.CircleGeometry(1, 48);
    bottomGeo.rotateX(-Math.PI / 2);
    this.bottom = new THREE.Mesh(bottomGeo, new THREE.ShaderMaterial({ uniforms: u, vertexShader: basicVert, fragmentShader: bottomFrag }));

    const rimGeo = new THREE.RingGeometry(1, 1.06, 64);
    rimGeo.rotateX(-Math.PI / 2);
    this.rimMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.rim = new THREE.Mesh(rimGeo, this.rimMat);
    this.rim.renderOrder = 2;

    const glowGeo = new THREE.RingGeometry(1, 1.35, 64);
    glowGeo.rotateX(-Math.PI / 2);
    // Remap UVs so the shader sees radius 0.74..1 across the ring.
    const uv = glowGeo.getAttribute('uv') as THREE.BufferAttribute;
    const posAttr = glowGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      const x = posAttr.getX(i) / 1.35;
      const z = posAttr.getZ(i) / 1.35;
      uv.setXY(i, x * 0.5 + 0.5, -z * 0.5 + 0.5);
    }
    this.glow = new THREE.Mesh(
      glowGeo,
      new THREE.ShaderMaterial({
        uniforms: u,
        vertexShader: basicVert,
        fragmentShader: glowFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );
    this.glow.renderOrder = 1;

    this.group.add(this.wall, this.bottom, this.glow, this.rim);
    this.setSkin(skin);
  }

  setSkin(skin: SkinDef): void {
    const u = this.uniforms;
    u.uRim.value.set(skin.rim);
    u.uSwirl.value.set(skin.swirlColor);
    u.uGlow.value.set(skin.glow);
    u.uMode.value = SWIRL_MODE[skin.swirl];
    if (this.helper) {
      u.uGlow.value.multiplyScalar(0.6);
    }
    this.rimMat.color.set(skin.rim);
  }

  /** `dt` (real frame seconds) eases the pulse and spin back down. */
  update(x: number, z: number, r: number, time: number, visible = true, dt = 1 / 60): void {
    this.group.visible = visible && r > 0.01;
    const depth = r * 2.2 + 1.5;
    this.wall.position.set(x, -depth / 2, z);
    this.wall.scale.set(r, depth, r);
    this.bottom.position.set(x, -depth + 0.01, z);
    this.bottom.scale.set(r, 1, r);
    this.rim.position.set(x, 0.02, z);
    this.rim.scale.set(r, 1, r);
    this.glow.position.set(x, 0.015, z);
    this.glow.scale.set(r, 1, r);
    // Same decay as the old 0.92 per frame at 60 Hz, independent of frame rate.
    this.pulse *= Math.exp(-PULSE_DECAY * dt);
    this.uniforms.uPulse.value = Math.min(1, this.pulse);
    this.spin *= Math.exp(-SPIN_DECAY * dt);
    this.uniforms.uSpin.value = Math.min(1, this.spin);
    const step = Math.min(0.1, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    this.swirlT += step * (1 + SPIN_BOOST * Math.min(1, this.spin));
    this.uniforms.uTime.value = this.swirlT;
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}
