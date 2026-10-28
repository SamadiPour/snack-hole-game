import { SIZE } from '../config/balance';

/**
 * Hole size formulas. They live apart from core/economy.ts so map generation can use them while
 * the economy reads generated maps (see mapMaxLevel) without an import cycle.
 */

export function radiusForLevel(level: number): number {
  return SIZE.baseRadius * Math.pow(SIZE.radiusGrowth, level);
}

/** Biggest level whose radius is at most `r`. */
export function levelForRadius(r: number): number {
  return Math.max(0, Math.floor(Math.log(r / SIZE.baseRadius) / Math.log(SIZE.radiusGrowth) + 1e-9));
}

export function xpForLevel(level: number): number {
  const r = radiusForLevel(level);
  const ramp = Math.min(1, (level + SIZE.rampStart) / SIZE.rampLevels);
  return SIZE.xpCoef * Math.pow(r, SIZE.xpExp) * ramp;
}

/** XP multiplier for eating a prop of footprint `f` at radius `r`: props near the size limit count more. */
export function frontierXpMult(f: number, r: number): number {
  return 1 + SIZE.frontierBonus * Math.pow(Math.min(1, f / (SIZE.fit * r)), SIZE.frontierExp);
}

/** `k` scales the constant term (World.affine: eases back to 1 after a Cosmos flip). */
export function holeSpeed(radius: number, speedMult: number, k = 1): number {
  return (SIZE.speedBase * k + SIZE.speedPerRadius * radius) * speedMult;
}

export function canEat(footprint: number, radius: number): boolean {
  return footprint <= SIZE.fit * radius;
}

/** Smallest level whose radius can swallow an object with this footprint. */
export function levelToEat(footprint: number): number {
  return Math.max(0, Math.ceil(Math.log(footprint / (SIZE.fit * SIZE.baseRadius)) / Math.log(SIZE.radiusGrowth) - 1e-9));
}
