import { describe, expect, it } from 'vitest';
import { MAP_CLEARED_FRACTION, MAPS } from '../src/config/balance';
import { OBJECT_TYPES } from '../src/config/objects';
import { settleRound, type RoundSummary } from '../src/core/round';
import { defaultSave } from '../src/core/save';

const round = (over: Partial<RoundSummary> = {}): RoundSummary => ({
  mapId: 'suburb',
  cash: 100,
  eaten: 10,
  comboBest: 3,
  level: 2,
  percentEaten: 0.1,
  biggest: null,
  eatenByType: new Map(),
  time: 60,
  ...over,
});

describe('settleRound', () => {
  it('credits each round its own cash, the first one included', () => {
    const s = defaultSave(0);
    const first = settleRound(s, round({ cash: 10 }));
    expect(first.total).toBe(10);
    expect(s.cash).toBe(10);
    expect(s.stats.bestRoundCash).toBe(10);
    expect(s.recentRoundCash).toEqual([10]);

    const second = settleRound(s, round({ cash: 5 }));
    expect(second.total).toBe(5);
    expect(s.cash).toBe(15);
    expect(s.stats.rounds).toBe(2);
  });

  it('keeps records and reports new bests after the first round', () => {
    const s = defaultSave(0);
    const big = 2;
    const first = settleRound(s, round({ cash: 100, comboBest: 20, level: 4, biggest: { t: big, f: 7 } }));
    expect(first.bestRound).toBe(false);
    expect(first.bestCombo).toBe(false);
    expect(s.stats).toMatchObject({ rounds: 1, totalEaten: 10, bestCombo: 20, bestLevel: 5, bestRoundCash: 100, biggestF: 7, biggestType: OBJECT_TYPES[big].id });

    const second = settleRound(s, round({ cash: 200, comboBest: 30, level: 3, biggest: { t: 0, f: 1 } }));
    expect(second.bestRound).toBe(true);
    expect(second.bestCombo).toBe(true);
    expect(s.stats).toMatchObject({ totalEaten: 20, bestCombo: 30, bestLevel: 5, bestRoundCash: 200, biggestF: 7, biggestType: OBJECT_TYPES[big].id });

    const third = settleRound(s, round({ cash: 150, comboBest: 4 }));
    expect(third.bestRound).toBe(false);
    expect(third.bestCombo).toBe(false);
  });

  it('counts swallowed types in the Gulpedia and lists the new ones', () => {
    const s = defaultSave(0);
    const a = OBJECT_TYPES[0].id;
    const b = OBJECT_TYPES[1].id;
    expect(settleRound(s, round({ eatenByType: new Map([[1, 2], [0, 3]]) })).discovered).toEqual([1, 0]);
    expect(settleRound(s, round({ eatenByType: new Map([[0, 1], [2, 1]]) })).discovered).toEqual([2]);
    expect(s.gulpedia[a]).toBe(4);
    expect(s.gulpedia[b]).toBe(2);
  });

  it('tracks the best share eaten per map', () => {
    const s = defaultSave(0);
    expect(settleRound(s, round({ percentEaten: 0.2 })).bestPercent).toBe(false);
    expect(settleRound(s, round({ percentEaten: 0.1 })).bestPercent).toBe(false);
    expect(settleRound(s, round({ percentEaten: 0.3 })).bestPercent).toBe(true);
    expect(s.mapBest.suburb).toBe(0.3);
  });

  it('marks a map cleared once at the clear threshold', () => {
    const s = defaultSave(0);
    const almost = settleRound(s, round({ percentEaten: MAP_CLEARED_FRACTION - 1e-4 }));
    expect(almost.cleared).toBe(false);
    expect(s.map100.suburb).toBe(false);
    const first = settleRound(s, round({ percentEaten: MAP_CLEARED_FRACTION }));
    expect(first).toMatchObject({ cleared: true, completed: true });
    expect(s.map100.suburb).toBe(true);
    expect(settleRound(s, round({ percentEaten: 1 }))).toMatchObject({ cleared: true, completed: false });
  });

  it('records the size reached and unlocks and selects the next map at its goal', () => {
    const s = defaultSave(0);
    const [m0, m1] = MAPS;
    expect(settleRound(s, round({ mapId: m0.id, level: m0.goal - 1 })).unlockedMaps).toEqual([]);
    expect(s.mapLevel[m0.id]).toBe(m0.goal - 1);
    const r = settleRound(s, round({ mapId: m0.id, level: m0.goal }));
    expect(r.unlockedMaps).toEqual([m1.id]);
    expect(s.maps[m1.id]).toBe(true);
    expect(s.selectedMap).toBe(m1.id);
    expect(s.mapLevel[m0.id]).toBe(m0.goal);
  });
});
