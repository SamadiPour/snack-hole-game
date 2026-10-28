import { OBJECT_TYPES, footprintOf, typeId } from '../../../config/objects';
import type { MapData } from '../builder';
import { fillTiers, mapArea, realmBuilder, setStart, speckle } from './kit';

/** Atomic: a navy deep of nuclei and Bohr atoms, ending in the first molecules. */
export function generateAtomic(): MapData {
  const b = realmBuilder('atomic');
  const rng = b.rng;
  const all = mapArea(b, 1);
  const start = setStart(b, 0, 0);

  // Ground: electron clouds of atoms long gone, their shells, and a dust of charge.
  speckle(b, all, 50, [5, 14], ['#0e1a3c', '#101f46', '#0d1838']);
  for (let i = 0; i < 40; i++) {
    const x = rng.range(all.x0, all.x1);
    const z = rng.range(all.z0, all.z1);
    const r = rng.range(4, 14);
    b.circle(x, z, r * 0.22, '#162a5c');
    for (let k = 1; k <= 3; k++) b.ring(x, z, r * k * 0.33 - 0.3, r * k * 0.33, k === 3 ? '#1f3470' : '#1a2d62');
  }
  speckle(b, all, 320, [0.1, 0.35], ['#25407a', '#2f4f90', '#3a5fa8', '#5f8fe0', '#8fb8ff']);

  fillTiers(b, 'atomic', [
    { type: 'electron', levels: [3, 6], count: 14, wander: { speed: 0.2, flee: true } },
    { type: 'proton', levels: [3, 8], count: 8 },
    { type: 'neutron', levels: [3, 8], count: 8 },
    { type: 'alpha', levels: [5, 10], count: 6 },
    { type: 'hydrogen', levels: [6, 11], count: 4 },
    { type: 'helium', levels: [8, 12], count: 3 },
    { type: 'carbon', levels: [10, 14], count: 2 },
    { type: 'oxygen', levels: [12, 15], count: 2 },
    { type: 'iron', levels: [13, 17], count: 1 },
    { type: 'goldatom', levels: [15, 18], count: 1 },
    { type: 'water', levels: [15, 20], count: 2 },
    { type: 'o2', levels: [16, 20], count: 1 },
    { type: 'co2', levels: [17, 20], count: 1 },
  ]);

  // Stray electrons circle the heavy atoms.
  for (const s of [...b.spawns]) {
    if (s.type !== 'iron' && s.type !== 'goldatom') continue;
    const r = footprintOf(OBJECT_TYPES[typeId(s.type)], s.scale) * 1.6;
    const sc = s.scale * 0.22;
    for (let k = 0; k < 3; k++) b.orbiter('electron', s.x, s.z, r, (k / 3) * Math.PI * 2, (k % 2 ? -1 : 1) * rng.range(0.7, 1.1), { scale: sc });
  }

  return b.build(
    '#0b1430',
    '#0f4a52',
    {
      sky: '#050a1c',
      fog: '#0b1430',
      sun: '#e6f0ff',
      hemiSky: '#b8d0ff',
      hemiGround: '#14224a',
      sunIntensity: 2.1,
      motes: { colors: ['#5fd8ff', '#a8e6ff', '#ffffff'], count: 160, size: 0.8, drift: 0.9, rise: 0.05, twinkle: 0.6 },
    },
    start,
  );
}
