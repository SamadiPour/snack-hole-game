import type { ObjTypeDef } from '../objects';
import { C } from './def';

/** Quantum Foam: the smallest things there are. */
export const QUANTUM_TYPES: ObjTypeDef[] = [
  C('neutrino', 'Neutrino', 1.0, 0.45, 0.55, { glow: true }),
  C('photon', 'Photon', 1.7, 0.3, 0.7, { glow: true }),
  C('quark', 'Quark', 1.3, 1.3, 1.1, { glow: true }),
  C('electron', 'Electron', 1.2, 1.2, 1.0, { glow: true }),
  C('gluon', 'Gluon', 1.9, 0.5, 0.6, { glow: true }),
  C('pion', 'Pion', 2.3, 0.9, 1.0),
  C('higgs', 'Higgs Boson', 2.2, 2.2, 1.9, { glow: true, landmark: true, valueMul: 3 }),
  C('proton', 'Proton', 2.4, 2.4, 1.5, { landmark: true }),
  C('neutron', 'Neutron', 2.4, 2.4, 1.5, { landmark: true }),
];
