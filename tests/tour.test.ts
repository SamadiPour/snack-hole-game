import { describe, expect, it } from 'vitest';
import { MAPS, TOUR } from '../src/config/balance';
import type { RoundSummary } from '../src/core/round';
import { defaultSave } from '../src/core/save';
import { settleTour } from '../src/core/tour';

const suburb = MAPS[0];
const round = (over: Partial<RoundSummary> = {}): RoundSummary => ({
  mapId: suburb.id,
  cash: 0,
  eaten: 10,
  comboBest: 3,
  level: 2,
  percentEaten: 0.1,
  biggest: null,
  eatenByType: new Map(),
  time: 120,
  ...over,
});

describe('casual tour', () => {
  it('opens the next map at the goal and gives stars for the goal, a clear and a clear within par', () => {
    const s = defaultSave(0);
    const mainGame = JSON.stringify({ ...s, tour: null });
    expect(settleTour(s, round({ level: suburb.goal - 1 })).opened).toBe(null);
    expect(s.tour.maps.farm).toBe(false);

    let r = settleTour(s, round({ level: suburb.goal }));
    expect([r.opened, r.stars]).toEqual(['farm', 1]);
    expect(s.tour.maps.farm).toBe(true);
    // The hub's next PLAY goes on to the map just opened.
    expect(s.tour.selectedMap).toBe('farm');

    r = settleTour(s, round({ level: suburb.goal, percentEaten: 1, time: TOUR.par.suburb + 30 }));
    expect([r.cleared, r.stars, r.bestTime]).toEqual([true, 2, false]);
    r = settleTour(s, round({ level: suburb.goal, percentEaten: 1, time: TOUR.par.suburb - 30 }));
    expect([r.stars, r.stars - r.starsBefore, r.bestTime]).toEqual([3, 1, true]);
    // A slower clear keeps the record.
    settleTour(s, round({ percentEaten: 1, time: TOUR.par.suburb + 60 }));
    expect(s.tour.bestClear.suburb).toBe(TOUR.par.suburb - 30);

    // Tour rounds book nothing into the main game: no cash, stats, Gulpedia or map progress.
    expect(JSON.stringify({ ...s, tour: null })).toBe(mainGame);
  });

  it('celebrates once for reaching the last goal and once for the last star', () => {
    const s = defaultSave(0);
    const moon = MAPS[MAPS.length - 1];
    for (const m of MAPS) {
      s.tour.maps[m.id] = true;
      s.tour.bestLevel[m.id] = m === moon ? 0 : m.goal;
      s.tour.bestPct[m.id] = 1;
      s.tour.bestClear[m.id] = m === moon ? 0 : TOUR.par[m.id];
    }
    const atMoon = (over: Partial<RoundSummary>) => settleTour(s, round({ mapId: moon.id, level: moon.goal, ...over }));
    expect([atMoon({}).finished, atMoon({}).finished]).toEqual([true, false]);
    let r = atMoon({ percentEaten: 1, time: TOUR.par[moon.id] + 1 });
    expect([r.finished, r.perfect]).toEqual([false, false]);
    r = atMoon({ percentEaten: 1, time: TOUR.par[moon.id] });
    expect([r.finished, r.perfect]).toEqual([false, true]);
    expect(atMoon({ percentEaten: 1, time: 1 }).perfect).toBe(false);
  });
});
