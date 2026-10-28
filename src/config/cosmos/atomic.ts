import type { ObjTypeDef } from '../objects';
import { C } from './def';

/** Atomic: nuclei, whole atoms and the first small molecules. */
export const ATOMIC_TYPES: ObjTypeDef[] = [
  C('alpha', 'Alpha Particle', 1.4, 1.4, 1.3),
  C('hydrogen', 'Hydrogen Atom', 2.4, 2.4, 2.4),
  C('helium', 'Helium Atom', 2.6, 2.6, 2.6),
  C('carbon', 'Carbon Atom', 3.2, 3.2, 3.2),
  C('oxygen', 'Oxygen Atom', 3.4, 3.4, 3.4),
  C('iron', 'Iron Atom', 4.2, 4.2, 4.2, { landmark: true }),
  C('goldatom', 'Gold Atom', 4.8, 4.8, 4.8, { landmark: true, valueMul: 3 }),
  C('water', 'Water Molecule', 2.2, 1.0, 1.6),
  C('o2', 'Oxygen Molecule', 2.4, 1.1, 1.1),
  C('co2', 'Carbon Dioxide', 3.0, 1.0, 1.0),
];
