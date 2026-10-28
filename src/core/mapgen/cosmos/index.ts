import { realmDef, type RealmId } from '../../../config/cosmos';
import type { MapData } from '../builder';
import { fillLadder } from '../ladder';
import { generateAtomic } from './atomic';
import { generateEarth } from './earth';
import { generateGalaxy } from './galaxy';
import { generateGarden } from './garden';
import { generateHometown } from './hometown';
import { generateMicrobial } from './microbial';
import { generateMolecular } from './molecular';
import { generateQuantum } from './quantum';
import { generateSolar } from './solar';

const GENERATORS: Record<RealmId, () => MapData> = {
  quantum: generateQuantum,
  atomic: generateAtomic,
  molecular: generateMolecular,
  microbial: generateMicrobial,
  garden: generateGarden,
  hometown: generateHometown,
  earth: generateEarth,
  solar: generateSolar,
  galaxy: generateGalaxy,
};

const cache = new Map<RealmId, MapData>();

/** Realm maps are deterministic per id (their seed is in REALMS) and cached like generateMap's. */
export function generateRealm(id: RealmId): MapData {
  let m = cache.get(id);
  if (!m) {
    m = GENERATORS[id]();
    fillLadder(m, 6, 1, realmDef(id).startLevel);
    cache.set(id, m);
  }
  return m;
}
