import { describe, expect, it } from 'vitest';
import { SIZE } from '../src/config/balance';
import { COSMOS, REALMS } from '../src/config/cosmos';
import { GULPEDIA_TYPES, OBJECT_TYPES } from '../src/config/objects';
import { cosmicLevel, cosmosConfig, flipFactor, flipScale, realSize } from '../src/core/cosmos';
import { frontierXpMult, radiusForLevel, xpForLevel } from '../src/core/economy';
import { generateRealm } from '../src/core/mapgen/cosmos';
import { spawnLevel } from '../src/core/mapgen/ladder';
import { ALIVE, FALLING, MV_ORBIT, World } from '../src/core/world';

function realmWorld(i: number): World {
  return new World(generateRealm(REALMS[i].id), cosmosConfig(i), { seed: 1 });
}

/**
 * Eats a fresh realm smallest first (each prop as soon as it fits, the most XP it can give) until
 * the goal, and returns the share of the realm's weight eaten by then: the best case for a player.
 */
function goalShare(w: World): number {
  const goal = w.cfg.cosmos!.goal;
  const objs = [...w.objects].sort((a, b) => a.f - b.f);
  let level = w.main.level;
  let xp = w.main.xp;
  let eaten = 0;
  for (const o of objs) {
    if (level >= goal) break;
    const r = radiusForLevel(level);
    if (o.f > SIZE.fit * r) break;
    eaten += o.w;
    xp += o.xp * frontierXpMult(o.f, r);
    while (xp >= xpForLevel(level)) {
      xp -= xpForLevel(level);
      level++;
    }
  }
  return eaten / w.weightTotal;
}

describe('cosmos realms', () => {
  REALMS.forEach((r, i) => {
    it(`${r.id}: eating alone takes the hole past its goal`, () => {
      const w = realmWorld(i);
      expect(w.main.level + w.reachable().levels).toBeGreaterThanOrEqual(r.goal + COSMOS.goalHeadroom);
    });

    it(`${r.id}: never more than one size level without something new to eat`, () => {
      const has = new Set(generateRealm(r.id).spawns.map(spawnLevel));
      let run = 0;
      let worst = 0;
      for (let l = r.startLevel + 1; l < r.goal; l++) {
        run = has.has(l) ? 0 : run + 1;
        worst = Math.max(worst, run);
      }
      expect(worst).toBeLessThanOrEqual(1);
    });
  });

  REALMS.forEach((r, i) => {
    it(`${r.id}: the goal comes well before the realm is eaten`, () => {
      const share = goalShare(realmWorld(i));
      expect(share).toBeGreaterThan(0.35);
      expect(share).toBeLessThan(0.85);
    });
  });

  it('real sizes chain from one realm into the next', () => {
    for (let i = 0; i + 1 < REALMS.length; i++) expect(REALMS[i].real[1]).toBe(REALMS[i + 1].real[0]);
    expect(realSize(0, radiusForLevel(0))).toBeCloseTo(REALMS[0].real[0], 30);
  });

  it('keeps the Gulpedia to the classic props', () => {
    expect(GULPEDIA_TYPES.length).toBe(124);
    expect(OBJECT_TYPES.length).toBeGreaterThan(124);
  });
});

describe('cosmos flip', () => {
  function atGoal(): World {
    const w = realmWorld(0);
    const h = w.main;
    h.x = 12;
    h.z = -7;
    h.vx = 3;
    h.vz = 1;
    w.gainXp(1e9);
    return w;
  }

  it('sends realmUp once when the hole reaches the goal', () => {
    const w = atGoal();
    expect(w.main.level).toBe(REALMS[0].goal + COSMOS.goalHeadroom);
    expect(w.events.filter((e) => e.k === 'realmUp')).toHaveLength(1);
    w.gainXp(1e9);
    expect(w.events.filter((e) => e.k === 'realmUp')).toHaveLength(1);
    expect(w.realmPending).toBe(true);
  });

  it('shrinks everything around the hole by the same factor', () => {
    const w = atGoal();
    w.main.r = w.main.baseR;
    const before = { x: w.main.x, z: w.main.z, r: w.main.r, level: w.main.level };
    const prop = w.objects.find((o) => o.state === ALIVE && o.mv === 0 && o.f * flipFactor(0) > COSMOS.minCrumb)!;
    const p = { x: prop.x, z: prop.z, f: prop.f };
    const falling = w.objects.find((o) => o.state === ALIVE && o !== prop)!;
    falling.state = FALLING;
    falling.hole = 0;
    falling.ox = 0.8;
    w.falling.push(falling);
    const time = w.time;
    const flip = flipScale(w)!;
    const z = flipFactor(0);
    expect(flip.z).toBeCloseTo(z);
    expect(w.cfg.cosmos).toEqual({ realm: 1, goal: REALMS[1].goal });
    expect(w.main.x).toBeCloseTo(flip.nx + before.x * z);
    expect(w.main.z).toBeCloseTo(flip.nz + before.z * z);
    expect(w.main.r).toBeCloseTo(before.r * z);
    expect(w.main.baseR).toBeCloseTo(before.r * z);
    expect(w.main.vx).toBeCloseTo(3 * z);
    expect(w.main.level).toBe(before.level - (REALMS[0].goal - REALMS[1].startLevel));
    expect(prop.x).toBeCloseTo(flip.nx + p.x * z);
    expect(prop.f).toBeCloseTo(p.f * z);
    expect(prop.crumb).toBe(true);
    expect(falling.ox).toBeCloseTo(0.8 * z);
    expect(w.falling).toContain(falling);
    expect(w.time).toBe(time);
    expect(w.affine).toBeCloseTo(z);
    expect(w.realmPending).toBe(false);
    // Ids follow the new order, and the new realm's props come after the carried ones.
    w.objects.forEach((o, k) => expect(o.id).toBe(k));
    expect(w.objects.length).toBe(flip.carried + generateRealm(REALMS[1].id).spawns.length);
    expect(w.objects[flip.carried].crumb).toBe(false);
  });

  it('does not carry XP piled up at the size cap into further flips', () => {
    const w = atGoal();
    flipScale(w);
    expect(w.main.xp).toBeLessThan(xpForLevel(w.main.level));
    w.gainXp(0);
    expect(w.realmPending).toBe(false);
  });

  it('drops the crumbs of the realm before at the next flip', () => {
    const w = atGoal();
    flipScale(w);
    const crumbs = w.objects.filter((o) => o.crumb);
    expect(crumbs.length).toBeGreaterThan(0);
    w.gainXp(1e9);
    flipScale(w);
    for (const o of crumbs) expect(w.objects).not.toContain(o);
  });

  it('keeps the size number climbing across a flip', () => {
    const w = atGoal();
    const shown = cosmicLevel(0, w.main.level);
    flipScale(w);
    expect(cosmicLevel(1, w.main.level)).toBe(shown);
  });

  it('keeps the real size continuous across a flip', () => {
    const w = atGoal();
    w.main.r = w.main.baseR;
    const before = realSize(0, w.main.r);
    flipScale(w);
    expect(realSize(1, w.main.r) / before).toBeCloseTo(1, 6);
  });

  it('eases the constant terms back after a flip', () => {
    const w = atGoal();
    flipScale(w);
    for (let i = 0; i < 300; i++) w.step(1 / 60);
    expect(w.affine).toBeGreaterThan(0.99);
  });

  it('ends no Cosmos round early and grows nothing for free', () => {
    const w = realmWorld(0);
    for (const o of w.objects) o.state = 2;
    for (let i = 0; i < COSMOS.safetyPatience * 15; i++) w.step(0.1);
    expect(w.running).toBe(true);
    expect(w.main.level).toBe(REALMS[0].startLevel);
    // The safety net flips the realm instead, without growing the hole.
    expect(w.realmPending).toBe(true);
    expect(w.safetyFlips).toBe(1);
  });

  it('keeps orbiters on their circle', () => {
    const w = realmWorld(1);
    const o = w.movers.find((m) => m.mv === MV_ORBIT)!;
    const d = () => Math.hypot(o.x - o.tx, o.z - o.tz);
    const r0 = d();
    for (let i = 0; i < 60; i++) w.step(1 / 30);
    expect(d()).toBeCloseTo(r0, 5);
  });
});
