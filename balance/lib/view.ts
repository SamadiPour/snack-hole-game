/**
 * What the round camera shows, from src/render/scene.ts: the camera sits `d = (13 + 7.5 R)` from
 * the hole (x (1/aspect)^0.6 on portrait screens), pitched 0.98 rad, looking north, with a 45°
 * vertical field of view. `visible(dx, dz)` tests a ground point relative to the hole. The real
 * camera also leads the hole by 0.2 s of velocity and eases its distance; both are ignored.
 */
const PITCH = 0.98;
const TAN_HALF_FOV = Math.tan((45 / 2) * (Math.PI / 180));

export interface View {
  aspect: number;
  /** Ground point (dx east, dz south of the hole) on screen for a hole of radius r. */
  visible(dx: number, dz: number, r: number): boolean;
  /** Half extent of a box that contains the whole view, for spatial queries. */
  reach(r: number): number;
}

export function makeView(aspect = 16 / 9): View {
  const sinP = Math.sin(PITCH);
  const cosP = Math.cos(PITCH);
  const portrait = aspect < 1 ? Math.pow(1 / aspect, 0.6) : 1;
  const dist = (r: number) => (13 + 7.5 * r) * portrait;
  return {
    aspect,
    visible(dx, dz, r) {
      const d = dist(r);
      // Camera space: right = +x, up = (0, cosP, -sinP), forward = (0, -sinP, -cosP).
      const zc = d - cosP * dz;
      if (zc <= 0) return false;
      const yc = -sinP * dz;
      return Math.abs(dx) <= TAN_HALF_FOV * aspect * zc && Math.abs(yc) <= TAN_HALF_FOV * zc;
    },
    reach(r) {
      // Far edge: 0.69 d north and ~1.2 d wide at that depth on 16:9; 1.4 d covers both.
      return dist(r) * Math.max(1.4, 0.8 * aspect);
    },
  };
}
