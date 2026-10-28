import type * as THREE from 'three';
import { ATOMIC_BUILDERS } from './atomic';
import { EARTH_BUILDERS } from './earth';
import { GALAXY_BUILDERS } from './galaxy';
import { GARDEN_BUILDERS } from './garden';
import { HOMETOWN_BUILDERS } from './hometown';
import { MICROBIAL_BUILDERS } from './microbial';
import { MOLECULAR_BUILDERS } from './molecular';
import { QUANTUM_BUILDERS } from './quantum';
import { SOLAR_BUILDERS } from './solar';

/** Model builders for the Cosmos props (config/cosmos/*.ts), one file per realm. */
export const COSMOS_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  ...QUANTUM_BUILDERS,
  ...ATOMIC_BUILDERS,
  ...MOLECULAR_BUILDERS,
  ...MICROBIAL_BUILDERS,
  ...GARDEN_BUILDERS,
  ...HOMETOWN_BUILDERS,
  ...EARTH_BUILDERS,
  ...SOLAR_BUILDERS,
  ...GALAXY_BUILDERS,
};
