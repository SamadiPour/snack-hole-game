import { describe, expect, it } from 'vitest';
import { GOLDEN, MAPS, SAVE_VERSION, SIZE, TOUR } from '../src/config/balance';
import { OBJECT_TYPES, footprintOf, typeId } from '../src/config/objects';
import { Bot } from '../src/core/bot';
import { buildRoundConfig, radiusForLevel, timeBonusFrac } from '../src/core/economy';
import { generateMap } from '../src/core/mapgen';
import { MapBuilder } from '../src/core/mapgen/builder';
import { defaultSave, deserialize, migrate, serialize } from '../src/core/save';
import { SpatialGrid } from '../src/core/spatial';
import { tourRoundConfig } from '../src/core/tour';
import { ALIVE, FALLING, GONE, MV_GRAPH, World, type WObj } from '../src/core/world';

function tinyMap() {
  const b = new MapBuilder('suburb', 100, 1);
  b.put('cone', 0.2, 0, 0, { force: true });
  b.put('car', 6, 0, 0, { force: true });
  b.put('house', -20, 0, 0, { force: true });
  return b.build('#000', '#000', { sky: '#fff', fog: '#fff', sun: '#fff', hemiSky: '#fff', hemiGround: '#000', sunIntensity: 1 });
}

function cfg(startSize = 0, mapCleared = false) {
  const s = defaultSave(0);
  s.stats.rounds = 1;
  s.upgrades.startSize = startSize;
  s.map100.suburb = mapCleared;
  return buildRoundConfig(s);
}

describe('magnet', () => {
  // A cone `dist` m from a size-13 hole (R 3.08 m) with Magnet 8 (reach 1.11 R = 3.42 m past the rim).
  function magnetWorld(dist: number, mega: boolean, type = 'cone') {
    const b = new MapBuilder('suburb', 100, 1);
    b.put(type, dist, 0, 0, { force: true });
    const map = b.build('#000', '#000', { sky: '#fff', fog: '#fff', sun: '#fff', hemiSky: '#fff', hemiGround: '#000', sunIntensity: 1 });
    const s = defaultSave(0);
    s.stats.rounds = 1;
    s.upgrades.startSize = 12;
    s.upgrades.magnet = 8;
    s.abilities.mega = 1;
    const w = new World(map, buildRoundConfig(s));
    if (mega) {
      w.abilities.mega.active = 5;
      w.main.r = w.main.baseR * 1.35;
    }
    w.step(1 / 30);
    return w.objects[0].x;
  }

  it('pulls edible props within reach of the rim', () => {
    expect(magnetWorld(6, false)).toBeLessThan(6);
    expect(magnetWorld(7, false)).toBe(7);
  });

  it('keeps its reach when Mega Mouth widens the mouth', () => {
    // Mega moves the mouth's rim to 4.16 m; the magnet still reaches 3.42 m past the hole's own rim.
    expect(magnetWorld(6, true)).toBeLessThan(6);
    expect(magnetWorld(7, true)).toBe(7);
  });

  it('pulls props only Mega Mouth can swallow, from the same reach', () => {
    // A truck (3.58 m) fits the Mega mouth (3.75 m) but not the hole's own (2.77 m).
    expect(magnetWorld(6, false, 'truck')).toBe(6);
    expect(magnetWorld(6, true, 'truck')).toBeLessThan(6);
    expect(magnetWorld(7, true, 'truck')).toBe(7);
  });
});

describe('swallowing', () => {
  it('eats small objects under the hole and pays cash + XP', () => {
    const w = new World(tinyMap(), cfg());
    w.step(1 / 30);
    const cone = w.objects[0];
    expect(cone.state).toBe(FALLING);
    expect(w.cash).toBeGreaterThan(0);
    expect(w.eaten).toBe(1);
    for (let i = 0; i < 200; i++) w.step(1 / 30);
    expect(cone.state).toBe(GONE);
  });

  it('does not eat objects that are too big, even when centred', () => {
    const w = new World(tinyMap(), cfg());
    w.main.x = 6;
    w.step(1 / 30);
    expect(w.objects[1].state).toBe(ALIVE);
    expect(w.objects[1].wob).toBeGreaterThan(0);
  });

  it('eats the car once the hole is big enough', () => {
    const w = new World(tinyMap(), cfg(12));
    w.main.x = 6;
    w.step(1 / 30);
    expect(w.objects[1].state).toBe(FALLING);
  });

  it('levels up from XP and grows the radius', () => {
    const w = new World(tinyMap(), cfg());
    const r0 = w.main.baseR;
    w.gainXp(1000);
    expect(w.main.level).toBeGreaterThan(0);
    expect(w.main.baseR).toBeGreaterThan(r0);
    expect(w.events.some((e) => e.k === 'level')).toBe(true);
  });

  it("stops growing at the map's max size", () => {
    const c = cfg();
    c.startLevel = c.maxLevel + 5;
    const w = new World(tinyMap(), c);
    expect(w.main.level).toBe(c.maxLevel);
    c.startLevel = c.maxLevel - 1;
    const g = new World(tinyMap(), c);
    g.gainXp(1e12);
    expect(g.main.level).toBe(c.maxLevel);
    expect(g.main.baseR).toBe(radiusForLevel(c.maxLevel));
    expect(g.levelProgress).toBe(1);
    expect(g.reachable().levels).toBe(0);
  });

  it('combo stacks for quick successive swallows and lapses after the window', () => {
    const b = new MapBuilder('suburb', 100, 1);
    for (let i = 0; i < 5; i++) b.put('cone', i * 0.05, 0, 0, { force: true });
    const w = new World(b.build('#000', '#000', { sky: '#fff', fog: '#fff', sun: '#fff', hemiSky: '#fff', hemiGround: '#000', sunIntensity: 1 }), cfg());
    w.step(1 / 30);
    expect(w.combo).toBe(5);
    for (let i = 0; i < 90; i++) w.step(1 / 30);
    expect(w.combo).toBe(0);
    expect(w.comboBest).toBe(5);
  });

  it('starts Dash ready and the big abilities empty', () => {
    const s = defaultSave(0);
    s.stats.rounds = 1;
    s.abilities = { dash: 1, vortex: 1, mega: 1 };
    const w = new World(tinyMap(), buildRoundConfig(s));
    expect(w.abilityReady('dash')).toBe(true);
    expect(w.abilityReady('vortex')).toBe(false);
    expect(w.abilities.vortex.cd).toBeCloseTo(w.cfg.abilities.vortex.cooldown);
    expect(w.abilities.mega.cd).toBeCloseTo(w.cfg.abilities.mega.cooldown);
  });

  it('golden props are worth GOLDEN.valueMul times more', () => {
    const plain = new World(tinyMap(), cfg());
    const gold = new World(tinyMap(), { ...cfg(), goldChance: 1 });
    expect(gold.objects.every((o) => o.gold)).toBe(true);
    expect(gold.objects[0].value).toBeCloseTo(plain.objects[0].value * GOLDEN.valueMul);
  });

  it('rolls random events per round; their bonus props do not count toward map %', () => {
    const fired = new Set<string>();
    let quiet = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const w = new World(generateMap('farm'), cfg(), { seed });
      const total = w.weightTotal;
      let n = 0;
      while (w.running) {
        w.step(0.1);
        for (const e of w.events) if (e.k === 'event' && e.on) (fired.add(e.id), n++);
        w.events.length = 0;
      }
      if (n === 0) quiet++;
      expect(w.objects.filter((o) => o.event).every((o) => o.w === 0)).toBe(true);
      expect(w.weightTotal).toBe(total);
    }
    // Some rounds get events, some get none.
    expect(fired.size).toBeGreaterThan(1);
    expect(quiet).toBeGreaterThan(0);
  });

  it('ends the round after the timer runs out', () => {
    const w = new World(generateMap('suburb'), cfg());
    let ended = false;
    for (let i = 0; i < 30 * 70 && !ended; i++) {
      w.step(1 / 30);
      ended = w.events.some((e) => e.k === 'end');
      w.events.length = 0;
    }
    expect(ended).toBe(true);
  });
});

describe('round end', () => {
  const theme = { sky: '#fff', fog: '#fff', sun: '#fff', hemiSky: '#fff', hemiGround: '#000', sunIntensity: 1 };
  /** `small` cones far from the hole plus one cone scaled to footprint `bigF`. */
  function ladderMap(small: number, bigF: number) {
    const b = new MapBuilder('suburb', 200, 1);
    for (let i = 0; i < small; i++) b.put('cone', 30 + i * 1.5, 30, 0, { force: true });
    b.put('cone', -30, -30, 0, { force: true, scale: bigF / footprintOf(OBJECT_TYPES[typeId('cone')]) });
    return b.build('#000', '#000', theme);
  }
  const fitAt = (level: number) => SIZE.fit * radiusForLevel(level);

  it('counts props it could grow into on the XP of everything that fits now', () => {
    const big = fitAt(1) * 0.98;
    expect(new World(ladderMap(0, big), cfg()).reachableLeft()).toBe(0);
    expect(new World(ladderMap(40, big), cfg()).reachableLeft()).toBe(41);
  });

  it('counts what Mega Mouth will fit while it can still be used', () => {
    const big = fitAt(0) * 1.2;
    const s = defaultSave(0);
    s.stats.rounds = 1;
    expect(new World(ladderMap(0, big), buildRoundConfig(s)).reachableLeft()).toBe(0);
    s.abilities.mega = 1;
    expect(new World(ladderMap(0, big), buildRoundConfig(s)).reachableLeft()).toBe(1);
  });

  it('keeps the round going while anything fits, even crumbs it cannot grow on', () => {
    const w = new World(ladderMap(3, fitAt(20)), cfg(12, true));
    w.cash = 1e12;
    expect(w.reachable().levels).toBe(0);
    expect(w.snackedOut()).toBe(false);
    expect(new World(ladderMap(0, fitAt(20)), cfg(12, true)).snackedOut()).toBe(true);
  });

  it('grows a casual hole for free once nothing left can grow it, instead of ending the round', () => {
    const w = new World(ladderMap(0, fitAt(5)), tourRoundConfig('suburb'));
    for (let i = 0; i < 30 * 4; i++) w.step(1 / 30);
    expect(w.running).toBe(true);
    expect(w.main.level).toBeGreaterThanOrEqual(5);
  });

  it('gives a casual hole no free growth once everything left fits', () => {
    const w = new World(ladderMap(3, fitAt(9) * 0.9), tourRoundConfig('farm'));
    expect(w.reachable().levels).toBe(0);
    for (let i = 0; i < 30 * 4; i++) w.step(1 / 30);
    expect(w.main.level).toBe(10);
  });

  /** A size-11 Tour hole, one cone it just grew into and one it fits at size 13. */
  function tierWorld() {
    const b = new MapBuilder('suburb', 200, 1);
    const cone = footprintOf(OBJECT_TYPES[typeId('cone')]);
    b.put('cone', -30, -30, 0, { force: true, scale: (fitAt(10) * 0.98) / cone });
    b.put('cone', -55, -30, 0, { force: true, scale: (fitAt(12) * 0.98) / cone });
    const w = new World(b.build('#000', '#000', theme), tourRoundConfig('farm'));
    expect(w.reachable().levels).toBe(0);
    return w;
  }
  const run = (w: World, seconds: number) => {
    for (let i = 0; i < 30 * seconds; i++) w.step(1 / 30);
  };

  it('opens the next tier for a casual hole once the tier its size brought within reach is eaten', () => {
    const w = tierWorld();
    run(w, 4);
    expect(w.main.level).toBe(10);
    w.objects[0].state = GONE;
    run(w, 4);
    expect(w.main.level).toBe(12);
  });

  it('waits only TOUR.catchUpPatience seconds for a casual hole to eat the tier its size brought within reach', () => {
    const w = tierWorld();
    run(w, TOUR.catchUpPatience - 2);
    expect(w.main.level).toBe(10);
    run(w, 4);
    expect(w.main.level).toBe(12);
  });

  it('gives a casual hole no free growth while what fits can still grow it', () => {
    const w = new World(ladderMap(40, fitAt(1) * 0.98), tourRoundConfig('suburb'));
    for (let i = 0; i < 30 * 4; i++) w.step(1 / 30);
    expect(w.main.level).toBe(0);
  });

  it('finishes early with a time bonus once nothing reachable is left', () => {
    const w = new World(tinyMap(), cfg());
    for (let i = 0; i < 30 * 5 && !w.ended; i++) w.step(1 / 30);
    expect(w.ended).toBe(true);
    expect(w.endReason).toBe('snackedOut');
    expect(w.timeLeft).toBeGreaterThan(50);
    expect(w.timeBonus).toBeCloseTo((w.cash - w.timeBonus) * timeBonusFrac(w.timeLeft));
  });
});

describe('next snack hint', () => {
  /** Props scaled to footprints given as multiples of `unit`, far from the hole. */
  function scaledMap(unit: number, props: [string, number][]) {
    const b = new MapBuilder('suburb', 200, 1);
    props.forEach(([type, k], i) => b.put(type, -60 + i * 20, 60, 0, { force: true, scale: (k * unit) / footprintOf(OBJECT_TYPES[typeId(type)]) }));
    return b.build('#000', '#000', { sky: '#fff', fog: '#fff', sun: '#fff', hemiSky: '#fff', hemiGround: '#000', sunIntensity: 1 });
  }
  const at = (w: World, fit: number) => {
    w.main.r = fit / SIZE.fit;
    return w.nextSnack();
  };

  it('goes by the scaled footprint of each prop and skips types with an edible prop left', () => {
    const w = new World(scaledMap(1, [['cone', 0.5], ['car', 1.5], ['car', 4], ['house', 2]]), cfg());
    const [, smallCar, bigCar, house] = w.objects;
    expect(at(w, 1)).toBe(smallCar);
    // The small car fits, so cars are open even though the big one does not.
    expect(at(w, 1.8)).toBe(house);
    smallCar.state = GONE;
    expect(at(w, 1.8)).toBe(house);
    house.state = GONE;
    expect(at(w, 1.8)).toBe(bigCar);
    expect(at(w, 4.5)).toBeNull();
  });
});

describe('maps', () => {
  it('generates every map deterministically with known prop types', () => {
    for (const m of MAPS) {
      const a = generateMap(m.id);
      expect(a.spawns.length).toBeGreaterThan(500);
      const ids = new Set(OBJECT_TYPES.map((t) => t.id));
      for (const s of a.spawns) expect(ids.has(s.type)).toBe(true);
    }
  });

  it('a bot round on the suburb earns cash and grows', () => {
    const w = new World(generateMap('suburb'), cfg());
    const bot = new Bot();
    for (let i = 0; i < 30 * 30; i++) {
      w.input = bot.steer(w, 1 / 30);
      w.step(1 / 30);
      w.events.length = 0;
    }
    expect(w.eaten).toBeGreaterThan(20);
    expect(w.main.level).toBeGreaterThan(2);
  });
});

describe('traffic', () => {
  /** How deep two vehicle boxes overlap (<= 0: apart), by separating axes. */
  function overlap(a: WObj, b: WObj): number {
    const box = (o: WObj) => {
      const d = OBJECT_TYPES[o.t];
      return { ax: Math.cos(o.rot), az: -Math.sin(o.rot), hl: (d.w * o.s) / 2, hw: (d.d * o.s) / 2 };
    };
    const A = box(a);
    const B = box(b);
    const half = (p: typeof A, x: number, z: number) => p.hl * Math.abs(p.ax * x + p.az * z) + p.hw * Math.abs(p.az * x - p.ax * z);
    let depth = Infinity;
    for (const [x, z] of [[A.ax, A.az], [A.az, -A.ax], [B.ax, B.az], [B.az, -B.ax]]) {
      depth = Math.min(depth, half(A, x, z) + half(B, x, z) - Math.abs((b.x - a.x) * x + (b.z - a.z) * z));
    }
    return depth;
  }

  it('vehicles queue and take turns at a junction instead of driving through each other', () => {
    // A plus-shaped junction with two vehicles on each arm, all reaching it at about the same time.
    const b = new MapBuilder('suburb', 140, 1);
    const g = b.addGraph(
      [{ x: 0, z: 0 }, { x: -60, z: 0 }, { x: 60, z: 0 }, { x: 0, z: -60 }, { x: 0, z: 60 }],
      [[0, 1], [0, 2], [0, 3], [0, 4]],
    );
    const arms: [number, number, number][] = [[1, -1, 0], [2, 1, 0], [3, 0, -1], [4, 0, 1]];
    for (const [from, dx, dz] of arms) {
      for (const [d, type, speed] of [[14, 'car', 9], [26, from === 4 ? 'bus' : 'car', 11]] as const) {
        b.put(type, dx * d, dz * d, 0, { force: true, move: { kind: 'graph', graph: g, lane: 2.2, speed, from, to: 0 } });
      }
    }
    const map = b.build('#000', '#000', { sky: '#fff', fog: '#fff', sun: '#fff', hemiSky: '#fff', hemiGround: '#000', sunIntensity: 1 });
    const w = new World(map, cfg(), { demo: true });
    w.main.x = w.main.z = 65;
    const cars = [...w.movers];
    const moved = cars.map(() => 0);
    let worst = 0;
    for (let f = 0; f < 30 * 60; f++) {
      const before = cars.map((o) => [o.x, o.z]);
      w.step(1 / 60);
      cars.forEach((o, i) => (moved[i] += Math.hypot(o.x - before[i][0], o.z - before[i][1])));
      for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) worst = Math.max(worst, overlap(cars[i], cars[j]));
    }
    expect(cars).toHaveLength(8);
    expect(worst).toBeLessThan(0.05);
    // No gridlock: every vehicle drove through the junction and on, several times over.
    for (const m of moved) expect(m).toBeGreaterThan(100);
  });

  it('planes taxi one way round the airport loop and keep clear as they turn its corners', () => {
    const map = generateMap('airport');
    const w = new World(map, cfg(), { demo: true });
    w.main.x = 0;
    w.main.z = 150;
    const planes = w.movers.filter((o) => o.mv === MV_GRAPH && ['jet', 'smallplane', 'jumbo'].includes(OBJECT_TYPES[o.t].id));
    const n = map.graphs[planes[0].graph].nodes.length;
    const moved = planes.map(() => 0);
    let backwards = 0;
    let worst = -Infinity;
    for (let f = 0; f < 120 * 60; f++) {
      const before = planes.map((o) => [o.x, o.z]);
      w.step(1 / 60);
      w.events.length = 0;
      planes.forEach((o, i) => (moved[i] += Math.hypot(o.x - before[i][0], o.z - before[i][1])));
      for (const o of planes) if (o.to !== (o.from + 1) % n) backwards++;
      for (let i = 0; i < planes.length; i++) for (let j = i + 1; j < planes.length; j++) worst = Math.max(worst, overlap(planes[i], planes[j]));
    }
    expect(planes).toHaveLength(4);
    expect(backwards).toBe(0);
    expect(worst).toBeLessThan(0);
    // Each one went round the loop at least once.
    for (const m of moved) expect(m).toBeGreaterThan(600);
  });
});

describe('placement', () => {
  it('drops small props forced inside a bigger building and keeps wanderers out of it', () => {
    const b = new MapBuilder('suburb', 100, 1);
    b.put('house', 0, 0, 0.3, { force: true });
    b.put('bench', 3.0, 2.0, 0, { force: true });
    b.put('bench', 12, 0, 0, { force: true });
    // Inside the rotated house corner but outside its round reservation.
    expect(b.isFree(4.0, 1.9, 0.5)).toBe(false);
    for (let i = 0; i < 20; i++) b.wanderer('dog', { x0: -9, x1: 9, z0: -9, z1: 9 }, 1.6);
    const map = b.build('#000', '#000', { sky: '#fff', fog: '#fff', sun: '#fff', hemiSky: '#fff', hemiGround: '#000', sunIntensity: 1 });
    expect(map.spawns.filter((s) => s.type === 'bench').map((s) => s.x)).toEqual([12]);
    const w = new World(map, cfg());
    for (const o of w.movers) expect(w.blocked(o.x, o.z)).toBe(false);
    for (let i = 0; i < 300; i++) w.step(1 / 30);
    for (const o of w.movers) expect(w.blocked(o.x, o.z)).toBe(false);
  });
});

describe('spatial grid', () => {
  it('finds inserted items and forgets removed ones', () => {
    const g = new SpatialGrid<{ x: number; z: number; cell: number }>(100, 8);
    const a = { x: 1, z: 1, cell: -1 };
    const b = { x: 40, z: 40, cell: -1 };
    g.insert(a);
    g.insert(b);
    const found: unknown[] = [];
    g.query(0, 0, 5, (i) => found.push(i));
    expect(found).toContain(a);
    expect(found).not.toContain(b);
    g.remove(a);
    expect(g.count()).toBe(1);
    b.x = -40;
    g.update(b);
    const found2: unknown[] = [];
    g.query(-40, 40, 2, (i) => found2.push(i));
    expect(found2).toContain(b);
  });
});

describe('save', () => {
  it('round-trips and fills in defaults for missing fields', () => {
    const s = defaultSave(0);
    s.cash = 123;
    s.gulpedia.car = 2;
    s.flags.tab_maps = true;
    const back = deserialize(serialize(s), 0);
    expect(back.cash).toBe(123);
    expect(back.gulpedia.car).toBe(2);
    expect(back.flags.tab_maps).toBe(true);
    const partial = migrate({ version: SAVE_VERSION, cash: 50, upgrades: { speed: 3 } }, 0);
    expect(partial.cash).toBe(50);
    expect(partial.upgrades.speed).toBe(3);
    expect(partial.upgrades.startSize).toBe(0);
    expect(partial.mapLevel.suburb).toBe(0);
    expect(partial.settings.volume).toBeGreaterThan(0);
  });

  it('starts fresh from saves made before the rebalance, keeping only settings', () => {
    const old = migrate({ version: 2, cash: 1e9, dm: 40, upgrades: { speed: 30 }, settings: { volume: 0.2 } }, 0);
    expect(old.cash).toBe(0);
    expect(old.dm).toBe(0);
    expect(old.upgrades.speed).toBe(0);
    expect(old.settings.volume).toBe(0.2);
  });

  it('survives garbage', () => {
    expect(deserialize('not json', 0).cash).toBe(0);
    expect(migrate(42, 0).cash).toBe(0);
    expect(migrate({ cash: -5, selectedMap: 'moon' }, 0).selectedMap).toBe('suburb');
  });
});
