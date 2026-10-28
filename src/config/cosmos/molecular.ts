import type { ObjTypeDef } from '../objects';
import { C } from './def';

/** Molecular: water, salt, sugar, proteins, DNA, ending in viruses. */
export const MOLECULAR_TYPES: ObjTypeDef[] = [
  C('methane', 'Methane', 1.75, 1.9, 1.75),
  C('saltcrystal', 'Salt Crystal', 1.6, 1.6, 1.6, { valueMul: 1.5 }),
  C('glucose', 'Glucose', 2.7, 2.55, 1.05),
  C('aminoacid', 'Amino Acid', 2.65, 1.6, 1.4),
  C('lipid', 'Phospholipid', 3.1, 1.4, 0.8),
  C('atp', 'ATP', 3.75, 1.45, 0.7, { valueMul: 1.5 }),
  C('protein', 'Protein', 2.7, 2.45, 1.4),
  C('antibody', 'Antibody', 2.8, 2.35, 0.7),
  C('ribosome', 'Ribosome', 2.7, 2.05, 2.05),
  C('buckyball', 'Buckyball', 2.45, 2.45, 2.5, { landmark: true, valueMul: 2 }),
  C('dna', 'DNA Helix', 6.45, 1.5, 1.55, { landmark: true, valueMul: 2 }),
  // Top tier: the Microbial realm starts with it.
  C('virus', 'Virus', 1.75, 1.75, 1.75),
];
