import { ringPoints, type MapData } from '../builder';
import { fillTiers, mapArea, realmBuilder, scaleFor, setStart, speckle } from './kit';

const COLOR_CHARGE = [0xff4d6d, 0x4dff88, 0x4d8dff];

/** Quantum Foam: a seething violet foam of quarks, gluons and photons. The run starts here. */
export function generateQuantum(): MapData {
  const b = realmBuilder('quantum');
  const rng = b.rng;
  const all = mapArea(b, 1);
  const start = setStart(b, 0, 0);

  // Ground: foam cells, bubble rims and sparks of vacuum energy.
  speckle(b, all, 70, [5, 14], ['#1c1238', '#21143f', '#1a1035', '#241747']);
  for (let i = 0; i < 50; i++) {
    const r = rng.range(2.5, 9);
    b.ring(rng.range(all.x0, all.x1), rng.range(all.z0, all.z1), r - 0.3, r, rng.pick(['#33215f', '#2c1d58', '#3a2470']));
  }
  speckle(b, all, 320, [0.12, 0.45], ['#3b2a77', '#4a3290', '#5b3fa8', '#7a4fd6', '#a678ff']);
  b.circle(start.x, start.z, 5, '#2a1a55');
  b.ring(start.x, start.z, 4.8, 5, '#5a3fb8');

  // A ring of the smallest quarks round the start: the first seconds are all snacks.
  for (const p of ringPoints(10, start.x, start.z, 2.6)) {
    b.put(p.k % 2 ? 'neutrino' : 'quark', p.x, p.z, p.ang, { force: true, scale: scaleFor(p.k % 2 ? 'neutrino' : 'quark', 0, rng), tint: COLOR_CHARGE[p.k % 3] });
  }

  fillTiers(b, 'quantum', [
    { type: 'neutrino', levels: [0, 4], count: 16, wander: { speed: 0.22, flee: true } },
    { type: 'photon', levels: [1, 7], count: 8, wander: { speed: 0.28, flee: true, span: 20 } },
    { type: 'quark', levels: [0, 9], count: 12, tint: COLOR_CHARGE },
    { type: 'electron', levels: [3, 9], count: 6, wander: { speed: 0.18, flee: true } },
    { type: 'gluon', levels: [4, 12], count: 3 },
    { type: 'pion', levels: [9, 15], count: 2 },
    { type: 'higgs', levels: [11, 15], count: 1 },
    { type: 'proton', levels: [15, 18], count: 2 },
    { type: 'neutron', levels: [15, 18], count: 2 },
  ]);

  return b.build(
    '#170f2e',
    '#0b1430',
    {
      sky: '#0b0820',
      fog: '#140c2e',
      sun: '#efe6ff',
      hemiSky: '#cdb8ff',
      hemiGround: '#2a1850',
      sunIntensity: 2.0,
      motes: { colors: ['#ff6ad5', '#6af3ff', '#fff27a', '#b48cff'], count: 220, size: 1, drift: 0.4, rise: 0.15, twinkle: 0.9 },
    },
    start,
  );
}
