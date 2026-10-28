import * as THREE from 'three';
import { G, type PartOpts } from '../geo';

/** Modelling helpers shared by the Cosmos prop builders (on top of the `G` kit in render/geo.ts). */

const _v = new THREE.Vector3();
const _e = new THREE.Euler();

/** Ring of radius `R`, tube `t`, lying flat (XZ) at (x, y, z) before the part rotation `o`. */
export function torus(g: G, R: number, t: number, x: number, y: number, z: number, color: number, o: PartOpts = {}, seg = 28): G {
  const geo = new THREE.TorusGeometry(R, t, 4, seg);
  geo.rotateX(Math.PI / 2);
  return g.add(geo, color, x, y, z, o);
}

/** Point at angle `a` on a flat circle of radius `R` round (x, y, z), tilted by rx / rz like `torus`. */
export function onRing(R: number, a: number, x: number, y: number, z: number, rx = 0, rz = 0): [number, number, number] {
  _v.set(Math.cos(a) * R, 0, Math.sin(a) * R).applyEuler(_e.set(rx, 0, rz));
  return [x + _v.x, y + _v.y, z + _v.z];
}

/** `n` beads of radius `r` from a to b (a spring or bond drawn as dots). */
export function chain(g: G, a: [number, number, number], b: [number, number, number], n: number, r: number, color: number): G {
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    g.ball(r, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, color);
  }
  return g;
}

/** Cylinder bond from a to b. */
export function bond(g: G, a: [number, number, number], b: [number, number, number], r: number, color: number, seg = 6): G {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  const geo = new THREE.CylinderGeometry(r, r, len, seg);
  // Point the cylinder's Y axis along a -> b.
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
  geo.applyQuaternion(q);
  return g.add(geo, color, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
}

/** Beads on a helix along X from x0 to x1 round (y, z): a gluon spring, a DNA strand. */
export function helix(g: G, x0: number, x1: number, y: number, z: number, radius: number, turns: number, beads: number, r: number, color: number, phase = 0): G {
  for (let i = 0; i < beads; i++) {
    const t = i / (beads - 1);
    const a = phase + t * turns * Math.PI * 2;
    g.ball(r, x0 + (x1 - x0) * t, y + Math.cos(a) * radius, z + Math.sin(a) * radius, color);
  }
  return g;
}

/** `n` points spread over a ball of radius `R` (Fibonacci sphere), for packed clusters. */
export function cluster(n: number, R: number): [number, number, number][] {
  if (n === 1) return [[0, 0, 0]];
  const out: [number, number, number][] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const rr = Math.sqrt(1 - y * y);
    const a = i * golden;
    out.push([Math.cos(a) * rr * R, y * R, Math.sin(a) * rr * R]);
  }
  return out;
}

/** Atomic nucleus: `p` protons and `n` neutrons packed round (x, y, z). */
export function nucleus(g: G, p: number, n: number, r: number, x: number, y: number, z: number, proton = 0xff5a6e, neutron = 0xc9d2e3): G {
  const total = p + n;
  const R = total <= 1 ? 0 : r * Math.cbrt(total) * 0.62;
  // Stepping through the slots by 7 mixes protons and neutrons over the ball.
  cluster(total, R).forEach(([cx, cy, cz], i) => g.ball(r, x + cx, y + cy, z + cz, (i * 7) % total < p ? proton : neutron, 1));
  return g;
}

export interface Shell {
  R: number;
  electrons: number;
  rx: number;
  rz: number;
}

/** Bohr-model electron shells round (x, y, z): thin orbit rings with electrons on them. */
export function shells(g: G, list: Shell[], x: number, y: number, z: number, ring: number, electron = 0x5fd8ff, er = 0.16): G {
  for (const s of list) {
    torus(g, s.R, 0.035, x, y, z, ring, { rx: s.rx, rz: s.rz }, 32);
    for (let k = 0; k < s.electrons; k++) {
      const [ex, ey, ez] = onRing(s.R, (k / s.electrons) * Math.PI * 2 + s.rx, x, y, z, s.rx, s.rz);
      g.ball(er, ex, ey, ez, electron, 1);
    }
  }
  return g;
}

/** Spikes (cones) pointing out of a ball of radius `R` round (x, y, z). */
export function spikes(g: G, n: number, R: number, len: number, w: number, x: number, y: number, z: number, color: number): G {
  for (const [sx, sy, sz] of cluster(n, 1)) {
    const geo = new THREE.ConeGeometry(w, len, 5);
    geo.translate(0, R + len / 2, 0);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(sx, sy, sz).normalize()));
    g.add(geo, color, x, y, z);
  }
  return g;
}

export { G };
