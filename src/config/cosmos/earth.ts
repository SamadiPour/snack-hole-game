import type { ObjTypeDef } from '../objects';
import { C } from './def';

/** Planet Earth from above: islands, mountains, cities and storms, ending in orbit. */
export const EARTH_TYPES: ObjTypeDef[] = [
  // On land.
  C('village', 'Village', 2.6, 2.6, 0.9),
  C('forest', 'Forest', 3.0, 3.0, 1.2),
  C('city', 'City', 3.2, 3.2, 2.2),
  C('mountain', 'Mountain', 3.0, 2.8, 2.2),
  C('rainforest', 'Rainforest', 4.0, 3.4, 1.2),
  C('volcano', 'Volcano', 3.2, 3.2, 2.6, { landmark: true, valueMul: 2 }),
  C('pyramids', 'Pyramids of Giza', 3.6, 2.8, 1.3, { landmark: true, valueMul: 3 }),
  // At sea.
  C('oilrig', 'Oil Rig', 2.0, 1.6, 1.8),
  C('whale', 'Blue Whale', 2.6, 1.2, 0.9),
  C('iceberg', 'Iceberg', 2.2, 1.6, 0.9),
  C('island', 'Island', 3.4, 2.8, 1.6),
  // In the sky.
  C('cloud', 'Cloud', 2.8, 1.8, 1.4),
  C('hurricane', 'Hurricane', 4.6, 4.6, 1.1, { landmark: true, valueMul: 2 }),
  // Top tier: the Solar System starts with these (and the classic satellite).
  C('spacestation', 'Space Station', 3.0, 4.4, 0.8),
  C('luna', 'The Moon', 2.0, 2.0, 2.0, { landmark: true }),
];
