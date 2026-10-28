import { SIZE } from '../../config/balance';
import { OBJECT_TYPES, footprintOf, typeId } from '../../config/objects';
import { levelToEat, radiusForLevel } from '../size';
import type { MapData } from './builder';

/** Size level a spawn becomes edible at. */
export function spawnLevel(s: { type: string; scale: number }): number {
  return levelToEat(footprintOf(OBJECT_TYPES[typeId(s.type)], s.scale));
}

/**
 * Makes sure growth always has a next snack on this map:
 *
 * 1. Every level below the biggest prop that has nothing new to eat gets a few props shrunk into
 *    it from the nearest level above that has several. Donors are spread evenly along X, so the
 *    result is deterministic.
 * 2. Gaps that are left (right below lone landmarks) and are longer than `maxGap` levels are
 *    closed by shrinking everything above them by the excess, which keeps the landmarks'
 *    order and relative size.
 *
 * `from` is the first level checked: a Cosmos realm starts its hole above size 1.
 */
export function fillLadder(map: MapData, maxStep = 6, maxGap = 1, from = 1): void {
  const lv = map.spawns.map(spawnLevel);
  let top = Math.max(...lv);
  const count = new Map<number, number>();
  for (const l of lv) count.set(l, (count.get(l) ?? 0) + 1);
  for (let g = from; g < top; g++) {
    if (count.get(g)) continue;
    for (let d = g + 1; d <= Math.min(top, g + maxStep); d++) {
      const n = count.get(d) ?? 0;
      if (n < 2) continue;
      const take = Math.max(1, Math.min(3, Math.floor(n / 4)));
      const donors = lv
        .map((l, i) => (l === d ? i : -1))
        .filter((i) => i >= 0)
        .sort((a, b) => map.spawns[a].x - map.spawns[b].x);
      for (let k = 0; k < take; k++) {
        const i = donors[Math.floor(((k + 0.5) * donors.length) / take)];
        const s = map.spawns[i];
        const f = footprintOf(OBJECT_TYPES[typeId(s.type)], s.scale);
        s.scale *= (SIZE.fit * radiusForLevel(g) * 0.95) / f;
        lv[i] = g;
      }
      count.set(d, n - take);
      count.set(g, take);
      break;
    }
  }

  let run = 0;
  for (let g = from; g <= top; g++) {
    if (!count.get(g)) {
      run++;
      continue;
    }
    if (run > maxGap) {
      const shift = run - maxGap;
      const k = Math.pow(SIZE.radiusGrowth, -shift);
      const moved = new Map<number, number>();
      lv.forEach((l, i) => {
        if (l < g) return;
        map.spawns[i].scale *= k;
        lv[i] = spawnLevel(map.spawns[i]);
        moved.set(lv[i], (moved.get(lv[i]) ?? 0) + 1);
      });
      for (const l of [...count.keys()]) if (l >= g - shift) count.delete(l);
      for (const [l, n] of moved) count.set(l, n);
      top = Math.max(...lv);
      g -= shift;
    }
    run = 0;
  }
}
