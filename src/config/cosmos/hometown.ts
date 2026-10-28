import type { ObjTypeDef } from '../objects';
import { C } from './def';

/** Hometown: the classic street props at their own scale, plus a beach and a stadium. */
export const HOMETOWN_TYPES: ObjTypeDef[] = [
  C('parasol', 'Beach Umbrella', 1.8, 1.8, 1.6),
  C('sailboat', 'Sailboat', 2.6, 1.0, 2.8),
  // Top tier: Planet Earth starts with it (and the classic towers, ships and jets).
  C('stadium', 'Stadium', 5.4, 4.2, 1.4, { solid: 'round', landmark: true }),
];
