import type { ObjTypeDef } from '../objects';
import { ATOMIC_TYPES } from './atomic';
import { EARTH_TYPES } from './earth';
import { GALAXY_TYPES } from './galaxy';
import { GARDEN_TYPES } from './garden';
import { HOMETOWN_TYPES } from './hometown';
import { MICROBIAL_TYPES } from './microbial';
import { MOLECULAR_TYPES } from './molecular';
import { QUANTUM_TYPES } from './quantum';
import { SOLAR_TYPES } from './solar';

/**
 * Every Cosmos prop type, one file per realm. A type is defined once, in the first realm that uses
 * it; later realms reuse it at another scale (a realm's top tier is the next one's bottom tier).
 */
export const COSMOS_TYPES: ObjTypeDef[] = [
  ...QUANTUM_TYPES,
  ...ATOMIC_TYPES,
  ...MOLECULAR_TYPES,
  ...MICROBIAL_TYPES,
  ...GARDEN_TYPES,
  ...HOMETOWN_TYPES,
  ...EARTH_TYPES,
  ...SOLAR_TYPES,
  ...GALAXY_TYPES,
];
