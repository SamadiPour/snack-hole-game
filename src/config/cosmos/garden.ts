import type { ObjTypeDef } from '../objects';
import { C } from './def';

/** Garden: ants, bugs, seeds and lost things in a soil bed, ending in the garden's gnomes and pots. */
export const GARDEN_TYPES: ObjTypeDef[] = [
  C('ant', 'Ant', 1.6, 1.0, 0.5),
  C('aphid', 'Aphid', 1.2, 0.8, 0.6),
  C('sunseed', 'Sunflower Seed', 1.6, 0.8, 0.45),
  C('grasstuft', 'Grass Tuft', 1.5, 1.5, 1.55),
  C('ladybug', 'Ladybug', 1.4, 1.2, 0.7),
  C('pebble', 'Pebble', 1.4, 1.1, 0.6),
  C('caterpillar', 'Caterpillar', 2.4, 0.7, 0.66),
  C('button', 'Button', 1.4, 1.4, 0.26),
  C('beetle', 'Beetle', 1.8, 1.3, 0.7),
  C('coin', 'Coin', 1.6, 1.6, 0.2, { valueMul: 2.5 }),
  C('leaf', 'Fallen Leaf', 2.6, 1.5, 0.3),
  C('acorn', 'Acorn', 1.6, 1.1, 1.05),
  C('earthworm', 'Earthworm', 3.1, 1.0, 0.42),
  C('bee', 'Bumblebee', 1.4, 1.5, 0.8, { hover: 0.9 }),
  C('butterfly', 'Butterfly', 1.6, 2.6, 0.5, { hover: 1.3 }),
  C('snail', 'Snail', 2.0, 1.0, 1.4),
  C('mushroom', 'Toadstool', 1.8, 1.8, 2.0),
  C('dandelion', 'Dandelion', 2.2, 2.2, 2.4),
  C('apple', 'Apple', 2.0, 2.0, 2.0),
  // Set pieces.
  C('anthill', 'Anthill', 4.0, 4.0, 1.6, { landmark: true, solid: 'round' }),
  C('frog', 'Frog', 2.2, 1.8, 1.3, { landmark: true, valueMul: 2 }),
  C('sneaker', 'Lost Sneaker', 4.6, 1.8, 1.45, { landmark: true, valueMul: 1.5, solid: 'box' }),
];
