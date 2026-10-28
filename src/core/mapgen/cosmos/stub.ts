import type { RealmId } from '../../../config/cosmos';
import type { MapData } from '../builder';
import { fillTiers, mapArea, realmBuilder, setStart, speckle } from './kit';

/** Stand-in realm made of classic props until the realm's own content lands. */
export function generateStub(id: RealmId, base: string, outside: string): MapData {
  const b = realmBuilder(id);
  const all = mapArea(b, 1);
  const start = setStart(b, 0, 0);
  speckle(b, all, 200, [1, 6], [outside, base]);
  fillTiers(b, id, [
    { type: 'rock', levels: [3, 8], count: 14 },
    { type: 'bush', levels: [6, 12], count: 10 },
    { type: 'tree', levels: [10, 16], count: 8 },
    { type: 'house', levels: [14, 20], count: 5 },
    { type: 'office', levels: [18, 23], count: 3 },
  ]);
  return b.build(base, outside, { sky: '#202028', fog: '#303040', sun: '#ffffff', hemiSky: '#ffffff', hemiGround: '#444444', sunIntensity: 2 }, start);
}
