import * as THREE from 'three';
import type { MapData, Paint } from '../core/mapgen/builder';
import { applyHoleCut, type GroundBlend } from './materials';

/**
 * Ground = one flat mesh of painted shapes (roads, lawns, water...) drawn in array order with
 * depth writes off (painter's algorithm inside a single draw call), followed by an invisible
 * depth-only plane. Both are cut open by the hole shader, so props falling below y=0 are hidden
 * everywhere except through the hole.
 */
export class Ground {
  readonly group = new THREE.Group();
  private decal: THREE.Mesh;
  private depth: THREE.Mesh | null = null;
  private blend: GroundBlend | null = null;

  /**
   * `nest`: the ground of the Cosmos realm just left, kept for a while where it landed in the new
   * one. It has no apron (3x the map, it would paint over the new realm) and no depth plane (the
   * new ground's covers it), draws over the new ground and blends into `nest.color` (setBlend).
   */
  constructor(map: MapData, nest?: { color: string }) {
    const pos: number[] = [];
    const col: number[] = [];
    const c = new THREE.Color();
    const tri = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number) => {
      // Counter-clockwise when seen from above (+Y).
      pos.push(ax, 0, az, cx, 0, cz, bx, 0, bz);
      for (let i = 0; i < 3; i++) col.push(c.r, c.g, c.b);
    };
    const quad = (pts: [number, number][]) => {
      tri(pts[0][0], pts[0][1], pts[1][0], pts[1][1], pts[2][0], pts[2][1]);
      tri(pts[0][0], pts[0][1], pts[2][0], pts[2][1], pts[3][0], pts[3][1]);
    };
    const rect = (x: number, z: number, w: number, d: number, r = 0) => {
      const hw = w / 2;
      const hd = d / 2;
      const cs = Math.cos(r);
      const sn = Math.sin(r);
      const p = (lx: number, lz: number): [number, number] => [x + lx * cs - lz * sn, z + lx * sn + lz * cs];
      quad([p(-hw, -hd), p(hw, -hd), p(hw, hd), p(-hw, hd)]);
    };
    const segs = (r: number) => Math.max(12, Math.min(64, Math.round(r * 4)));
    const paint = (p: Paint) => {
      c.set(p.c);
      if (p.k === 'rect') rect(p.x, p.z, p.w, p.d, p.r ?? 0);
      else if (p.k === 'circle') {
        const n = segs(p.r);
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI * 2;
          const a1 = ((i + 1) / n) * Math.PI * 2;
          tri(p.x, p.z, p.x + Math.cos(a0) * p.r, p.z + Math.sin(a0) * p.r, p.x + Math.cos(a1) * p.r, p.z + Math.sin(a1) * p.r);
        }
      } else {
        const n = segs(p.r1);
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI * 2;
          const a1 = ((i + 1) / n) * Math.PI * 2;
          const [c0, s0, c1, s1] = [Math.cos(a0), Math.sin(a0), Math.cos(a1), Math.sin(a1)];
          quad([
            [p.x + c0 * p.r0, p.z + s0 * p.r0],
            [p.x + c0 * p.r1, p.z + s0 * p.r1],
            [p.x + c1 * p.r1, p.z + s1 * p.r1],
            [p.x + c1 * p.r0, p.z + s1 * p.r0],
          ]);
        }
      }
    };

    // Outside apron (a frame round the map, 1 m under its edge, so the map's pixels are not shaded
    // one extra time), then the map's base colour, then every painted feature.
    c.set(map.outside);
    const out = map.size * 3;
    const band = out - map.half + 1;
    for (const k of nest ? [] : [-1, 1]) {
      rect(0, k * (out - band / 2), out * 2, band);
      rect(k * (out - band / 2), 0, band, out * 2);
    }
    c.set(map.base);
    rect(0, 0, map.size, map.size);
    for (const p of map.paint) paint(p);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const normals = new Float32Array(pos.length);
    for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.computeBoundingSphere();

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, depthWrite: false });
    if (nest) this.blend = { amount: { value: 0 }, color: { value: new THREE.Color(nest.color) } };
    applyHoleCut(mat, this.blend ?? undefined);
    this.decal = new THREE.Mesh(geo, mat);
    this.decal.receiveShadow = true;
    // A nest draws after the new realm's ground, before the depth plane.
    this.decal.renderOrder = nest ? -1.5 : -2;
    this.decal.frustumCulled = false;
    this.group.add(this.decal);
    if (nest) return;

    const depthMat = new THREE.MeshBasicMaterial({ colorWrite: false });
    applyHoleCut(depthMat);
    const plane = new THREE.PlaneGeometry(map.size * 6, map.size * 6);
    plane.rotateX(-Math.PI / 2);
    this.depth = new THREE.Mesh(plane, depthMat);
    this.depth.renderOrder = -1;
    this.depth.frustumCulled = false;
    this.group.add(this.depth);
  }

  /** Nest only: 0 shows the old realm's ground, 1 is all the new realm's base colour. */
  setBlend(v: number): void {
    if (this.blend) this.blend.amount.value = v;
  }

  dispose(): void {
    for (const m of [this.decal, this.depth]) {
      if (!m) continue;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  }
}
