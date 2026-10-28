import type { ObjTypeDef } from '../objects';
import { C } from './def';

/** Milky Way: stars of every kind, clusters, nebulae, black holes and the galactic core. */
export const GALAXY_TYPES: ObjTypeDef[] = [
  C('star', 'Star', 1.4, 1.4, 1.3, { glow: true }),
  C('browndwarf', 'Brown Dwarf', 1.4, 1.4, 1.2),
  C('whitedwarf', 'White Dwarf', 1.2, 1.2, 1.0, { glow: true }),
  C('pulsar', 'Pulsar', 2.8, 1.2, 1.2, { glow: true, valueMul: 1.5 }),
  C('redgiant', 'Red Giant', 2.4, 2.4, 2.3, { glow: true }),
  C('starcluster', 'Star Cluster', 2.8, 2.8, 1.3, { glow: true }),
  C('nebula', 'Nebula', 4.6, 3.8, 1.5, { glow: true, landmark: true, valueMul: 2 }),
  C('blackhole', 'Black Hole', 3.8, 3.8, 2.0, { glow: true, landmark: true, valueMul: 3 }),
  C('globular', 'Globular Cluster', 3.0, 3.0, 3.0, { glow: true, landmark: true, valueMul: 2 }),
  C('sgra', 'Sagittarius A*', 6.4, 6.4, 2.8, { glow: true, landmark: true, valueMul: 5 }),
];
