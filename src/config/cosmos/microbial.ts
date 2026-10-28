import type { ObjTypeDef } from '../objects';
import { C } from './def';

/** Microbial: viruses, bacteria, blood cells, ending in sand and crumbs. */
export const MICROBIAL_TYPES: ObjTypeDef[] = [
  C('phage', 'Bacteriophage', 2.0, 2.0, 2.35),
  C('coccus', 'Coccus Chain', 2.9, 1.0, 0.7),
  C('bacterium', 'Bacterium', 3.4, 0.8, 0.75),
  C('redcell', 'Red Blood Cell', 1.8, 1.8, 0.5),
  C('platelet', 'Platelet', 1.5, 1.2, 0.45),
  C('yeast', 'Yeast Cell', 2.0, 1.3, 1.2),
  C('pollengrain', 'Pollen Grain', 1.85, 1.85, 1.85, { valueMul: 1.5 }),
  C('diatom', 'Diatom', 2.35, 2.35, 0.5, { valueMul: 1.5 }),
  C('paramecium', 'Paramecium', 3.45, 1.7, 1.0),
  C('amoeba', 'Amoeba', 3.8, 3.45, 1.0, { landmark: true }),
  C('whitecell', 'White Blood Cell', 3.0, 2.75, 2.7, { landmark: true }),
  C('tardigrade', 'Tardigrade', 3.75, 2.2, 1.3, { landmark: true, valueMul: 3 }),
  C('dustmite', 'Dust Mite', 3.0, 2.5, 1.2, { landmark: true, valueMul: 2 }),
  // Top tier: the Garden realm starts with them.
  C('sandgrain', 'Sand Grain', 1.2, 1.0, 0.95),
  C('crumb', 'Crumb', 1.3, 0.85, 0.8),
];
