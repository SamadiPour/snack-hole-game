import { describe, expect, it } from 'vitest';
import { MAPS, type MapId } from '../src/config/balance';
import { generateAirport } from '../src/core/mapgen/airport';
import { MapBuilder, type MapData } from '../src/core/mapgen/builder';
import { generateDowntown } from '../src/core/mapgen/downtown';
import { generateFarm } from '../src/core/mapgen/farm';
import { generateHarbor } from '../src/core/mapgen/harbor';
import { generateMoon } from '../src/core/mapgen/moon';
import { generateSpaceport } from '../src/core/mapgen/spaceport';
import { generateSuburb } from '../src/core/mapgen/suburb';

const GENERATORS: Record<MapId, (seed: number) => MapData> = {
  suburb: generateSuburb,
  downtown: generateDowntown,
  farm: generateFarm,
  harbor: generateHarbor,
  airport: generateAirport,
  spaceport: generateSpaceport,
  moon: generateMoon,
};

/**
 * Layout fingerprints (before the size ladder). A change here means the map's props moved: if
 * that was intended, paste the new value from the failure message.
 */
const PINNED: Record<MapId, string> = {
  suburb: '45bb77f2',
  downtown: '43546087',
  farm: 'c4970a1a',
  harbor: '2eedbd16',
  airport: 'a878b250',
  spaceport: 'b87769ab',
  moon: 'bf8a65cf',
};

/** FNV-1a over every spawn's type, placement, tint and movement (numbers in exact round-trip form). */
function spawnHash(m: MapData): string {
  let h = 2166136261;
  const mix = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  };
  for (const s of m.spawns) {
    mix(`${s.type},${s.x},${s.z},${s.rot},${s.scale},${s.tint}`);
    const mv = s.move;
    if (mv?.kind === 'graph') mix(`|g${mv.graph},${mv.lane},${mv.speed},${mv.from},${mv.to},${!!mv.flee}`);
    else if (mv) mix(`|w${mv.x0},${mv.x1},${mv.z0},${mv.z1},${mv.speed},${!!mv.flee}`);
    mix(';');
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

describe('graph movers', () => {
  it('drive a one-way loop its own way, from the spots and with the draws a two-way loop gives them', () => {
    const loop = (oneWay: boolean) => {
      const b = new MapBuilder('airport', 200, 7);
      const nodes = [{ x: -60, z: -20 }, { x: 60, z: -20 }, { x: 60, z: 20 }, { x: -60, z: 20 }];
      const g = b.addGraph(nodes, [[0, 1], [1, 2], [2, 3], [3, 0]], oneWay);
      for (let i = 0; i < 8; i++) b.graphMover('car', g, 0, 5);
      return { b, moves: b.spawns.map((s) => (s.move?.kind === 'graph' ? s.move : null)!) };
    };
    const two = loop(false);
    const one = loop(true);
    expect(one.b.spawns.map((s) => [s.x, s.z])).toEqual(two.b.spawns.map((s) => [s.x, s.z]));
    expect(one.moves.map((m) => m.speed)).toEqual(two.moves.map((m) => m.speed));
    expect(one.b.rng.next()).toBe(two.b.rng.next());
    expect(two.moves.some((m) => m.to !== (m.from + 1) % 4)).toBe(true);
    for (const m of one.moves) expect(m.to).toBe((m.from + 1) % 4);
  });
});

describe('map generators', () => {
  for (const def of MAPS) {
    it(`${def.id}: same seed, same layout`, () => {
      const a = GENERATORS[def.id](def.seed);
      const b = GENERATORS[def.id](def.seed);
      expect(a.id).toBe(def.id);
      expect(spawnHash(b)).toBe(spawnHash(a));
      expect(spawnHash(a)).toBe(PINNED[def.id]);
    });
  }
});
