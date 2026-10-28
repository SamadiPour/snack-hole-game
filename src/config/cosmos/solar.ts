import type { ObjTypeDef } from '../objects';
import { C } from './def';

/** Solar System: asteroids, moons, planets and the Sun. */
export const SOLAR_TYPES: ObjTypeDef[] = [
  C('spacejunk', 'Space Junk', 1.2, 1.0, 0.6),
  C('asteroid', 'Asteroid', 1.4, 1.2, 1.0),
  C('probe', 'Space Probe', 1.9, 1.4, 1.0, { valueMul: 1.5 }),
  C('comet', 'Comet', 3.2, 1.4, 0.9, { glow: true, valueMul: 1.5 }),
  C('pluto', 'Pluto', 1.5, 1.5, 1.5),
  C('mercury', 'Mercury', 1.7, 1.7, 1.7),
  C('mars', 'Mars', 1.9, 1.9, 1.9),
  C('venus', 'Venus', 2.2, 2.2, 2.2),
  C('earthplanet', 'Earth', 2.3, 2.3, 2.3, { valueMul: 2 }),
  C('neptune', 'Neptune', 2.6, 2.6, 2.6),
  C('uranus', 'Uranus', 2.6, 3.6, 3.6),
  C('saturn', 'Saturn', 5.0, 5.0, 2.6, { landmark: true, valueMul: 2 }),
  C('jupiter', 'Jupiter', 3.2, 3.2, 3.2, { landmark: true, valueMul: 2 }),
  // Top tier: the Milky Way starts with it.
  C('sun', 'The Sun', 4.2, 4.2, 3.6, { glow: true, landmark: true, valueMul: 2 }),
];
