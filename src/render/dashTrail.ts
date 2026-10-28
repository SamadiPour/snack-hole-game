import * as THREE from 'three';

const POOL = 18;

interface Echo {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  max: number;
  r0: number;
  r1: number;
  peak: number;
}

/**
 * Dash visuals on the ground: glowing rim "after-images" left behind while dashing (a comet
 * tail of rings) and a fast shockwave ring when the dash starts.
 */
export class DashTrail {
  readonly group = new THREE.Group();
  private echoes: Echo[] = [];
  private next = 0;
  private spawn = 0;
  private lastX = 0;
  private lastZ = 0;

  constructor() {
    const geo = new THREE.RingGeometry(0.88, 1.0, 56);
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < POOL; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 2;
      this.group.add(mesh);
      this.echoes.push({ mesh, mat, life: 0, max: 1, r0: 1, r1: 1, peak: 1 });
    }
  }

  private emit(x: number, z: number, r0: number, r1: number, life: number, peak: number, color: string): void {
    const e = this.echoes[this.next];
    this.next = (this.next + 1) % POOL;
    e.mesh.position.set(x, 0.035, z);
    e.mesh.visible = true;
    e.mat.color.set(color);
    e.life = e.max = life;
    e.r0 = r0;
    e.r1 = r1;
    e.peak = peak;
  }

  /** Expanding ring when the dash kicks in. */
  shockwave(x: number, z: number, r: number, color: string): void {
    this.emit(x, z, r, r * 2.6 + 2, 0.45, 1, color);
    this.emit(x, z, r * 0.9, r * 1.8 + 1, 0.3, 0.8, '#ffffff');
  }

  /** Cosmos flip: rings shrink by `k` around the old origin, which lands on (nx, nz). */
  rebase(k: number, nx: number, nz: number): void {
    this.lastX = nx + this.lastX * k;
    this.lastZ = nz + this.lastZ * k;
    for (const e of this.echoes) {
      e.mesh.position.set(nx + e.mesh.position.x * k, e.mesh.position.y, nz + e.mesh.position.z * k);
      e.r0 *= k;
      e.r1 *= k;
    }
  }

  update(dt: number, x: number, z: number, r: number, dashing: boolean, color: string): void {
    if (dashing) {
      // Drop an echo every ~half a radius of travel (and at least every 40 ms).
      this.spawn -= dt;
      const moved = Math.hypot(x - this.lastX, z - this.lastZ);
      if (this.spawn <= 0 || moved > r * 0.5) {
        this.spawn = 0.04;
        this.lastX = x;
        this.lastZ = z;
        this.emit(x, z, r, r * 1.08, 0.42, 0.75, color);
      }
    } else {
      this.lastX = x;
      this.lastZ = z;
    }
    for (const e of this.echoes) {
      if (e.life <= 0) continue;
      e.life -= dt;
      if (e.life <= 0) {
        e.mesh.visible = false;
        continue;
      }
      const t = 1 - e.life / e.max;
      const s = e.r0 + (e.r1 - e.r0) * (1 - (1 - t) * (1 - t));
      e.mesh.scale.set(s, 1, s);
      e.mat.opacity = e.peak * (1 - t) * (1 - t);
    }
  }
}
