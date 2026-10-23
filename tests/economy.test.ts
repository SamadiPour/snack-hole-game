import { describe, expect, it } from 'vitest';
import { CASH_VALUE, COMBO, DM_UPGRADES, HEAD_START_BASE, MAPS, MAP_SIZE_HEADROOM, MAP_SIZE_MIN_SPAN, OFFLINE, PRESTIGE, ROUND, ROUND_END, UPGRADES } from '../src/config/balance';
import { OBJECT_TYPES, footprintOf, typeId } from '../src/config/objects';
import {
  applyPrestige,
  buildRoundConfig,
  buyUpgrade,
  canEat,
  cashValueMult,
  comboMult,
  computeOffline,
  dmForLifetime,
  dmGain,
  dmGrowth,
  earn,
  geomBulkCost,
  geomCost,
  levelToEat,
  lifetimeForDm,
  mapLockReason,
  mapMaxLevel,
  megaScale,
  noteRound,
  priceScale,
  radiusForLevel,
  roundTimeFor,
  singularityDmMult,
  singularityPreview,
  timeBonusFrac,
  unlockMaps,
  upgradeCost,
} from '../src/core/economy';
import { generateMap } from '../src/core/mapgen';
import { defaultSave } from '../src/core/save';

describe('cost curves', () => {
  it('grows exponentially', () => {
    expect(geomCost(10, 1.5, 0)).toBe(10);
    expect(geomCost(10, 1.5, 2)).toBeCloseTo(22.5);
  });

  it('bulk cost equals the sum of single costs', () => {
    let sum = 0;
    for (let i = 3; i < 13; i++) sum += geomCost(12, 1.52, i);
    expect(geomBulkCost(12, 1.52, 3, 10)).toBeCloseTo(sum, 6);
  });

});

describe('upgrades', () => {
  it('buys one level, deducting its price', () => {
    const s = defaultSave(0);
    const price = upgradeCost('speed', 0);
    s.cash = price + 1;
    expect(buyUpgrade(s, 'speed', 1)).toBe(1);
    expect(s.upgrades.speed).toBe(1);
    expect(s.cash).toBeCloseTo(1);
  });

  it('refuses purchases it cannot afford', () => {
    const s = defaultSave(0);
    s.cash = upgradeCost('startSize', 0) - 1;
    expect(buyUpgrade(s, 'startSize', 1)).toBe(0);
    expect(s.upgrades.startSize).toBe(0);
  });

  it('respects max levels', () => {
    const s = defaultSave(0);
    s.upgrades.roundTime = UPGRADES.find((u) => u.id === 'roundTime')!.max;
    s.cash = 1e30;
    expect(buyUpgrade(s, 'roundTime', 1)).toBe(0);
  });

  it('every track is capped', () => {
    for (const u of UPGRADES) expect(Number.isFinite(u.max)).toBe(true);
  });

  it('a Singularity tier makes prices higher', () => {
    const s = defaultSave(0);
    s.tier = 2;
    s.cash = upgradeCost('speed', 0) * 2;
    expect(buyUpgrade(s, 'speed', 1)).toBe(0);
    expect(upgradeCost('speed', 0, priceScale(s))).toBeCloseTo(upgradeCost('speed', 0) * PRESTIGE.tierScale ** 2);
  });

  it('cash value grows linearly with no milestone jumps', () => {
    for (let l = 0; l < 10; l++) expect(cashValueMult(l + 1) - cashValueMult(l)).toBeCloseTo(CASH_VALUE.perLevel);
  });
});

describe('rounds', () => {
  it('every round, the first included, lasts the base time until Round Time is bought', () => {
    expect(roundTimeFor(defaultSave(0))).toBe(ROUND.baseTime);
  });

  it('Round Time tops out at 100 seconds', () => {
    const s = defaultSave(0);
    s.upgrades.roundTime = UPGRADES.find((u) => u.id === 'roundTime')!.max;
    expect(roundTimeFor(s)).toBe(100);
  });

  it('time bonus grows with seconds left and is capped', () => {
    expect(timeBonusFrac(0)).toBe(0);
    expect(timeBonusFrac(10)).toBeCloseTo(10 * ROUND_END.bonusPerSecond);
    expect(timeBonusFrac(1000)).toBe(ROUND_END.bonusCap);
  });
});

describe('size rules', () => {
  it('levelToEat returns the first level whose radius fits', () => {
    for (const f of [0.3, 1, 2.2, 5, 12]) {
      const l = levelToEat(f);
      expect(canEat(f, radiusForLevel(l))).toBe(true);
      if (l > 0) expect(canEat(f, radiusForLevel(l - 1))).toBe(false);
    }
  });

  it('combo multiplier ramps and caps', () => {
    expect(comboMult(1, 3)).toBe(1);
    expect(comboMult(11, 3)).toBeCloseTo(1 + COMBO.perStack * 10);
    expect(comboMult(100000, 3)).toBe(3);
  });
});

describe('maps', () => {
  it('unlock in order once the previous size goal is reached', () => {
    const s = defaultSave(0);
    expect(unlockMaps(s)).toEqual([]);
    expect(mapLockReason(s, MAPS[1].id)).toContain(`size ${MAPS[0].goal + 1}`);
    noteRound(s, MAPS[0].id, MAPS[0].goal, 10);
    expect(unlockMaps(s)).toEqual([MAPS[1].id]);
    expect(s.maps[MAPS[2].id]).toBe(false);
  });

  it('Mega Mouth widens the mouth more with each level', () => {
    expect(megaScale(0)).toBe(1);
    expect(megaScale(1)).toBeCloseTo(1.35);
    expect(megaScale(5)).toBeCloseTo(1.75);
  });

  it('later maps need Singularities', () => {
    const s = defaultSave(0);
    const gated = MAPS.findIndex((m) => m.needsSingularities > 0);
    for (let i = 0; i < gated; i++) {
      s.maps[MAPS[i].id] = true;
      s.mapLevel[MAPS[i].id] = MAPS[i].goal;
    }
    expect(unlockMaps(s)).toEqual([]);
    expect(mapLockReason(s, MAPS[gated].id)).toContain('Singularit');
    expect(mapLockReason(s, MAPS[gated].id)).toContain('(you have 0)');
    s.stats.prestiges = MAPS[gated].needsSingularities;
    expect(unlockMaps(s)).toEqual([MAPS[gated].id]);
  });

  it('start smaller on bigger worlds and on higher tiers', () => {
    const s = defaultSave(0);
    s.stats.rounds = 1;
    s.upgrades.startSize = 40;
    const last = MAPS[MAPS.length - 1];
    expect(buildRoundConfig(s, MAPS[0].id).startLevel).toBe(mapMaxLevel(MAPS[0].id));
    expect(buildRoundConfig(s, last.id).startLevel).toBe(40 - last.sizeOffset);
    s.tier = 2;
    expect(buildRoundConfig(s, last.id).startLevel).toBe(40 - last.sizeOffset - 2);
    s.upgrades.startSize = 0;
    expect(buildRoundConfig(s, last.id).startLevel).toBe(0);
  });

  it('high tiers stay playable: the size a tier takes away is capped, prices and payouts keep scaling', () => {
    // A 100 s round grows the hole ~15-20 sizes (DESIGN.md, Pacing).
    const levelsPerRound = 15;
    const maxedAt = (tier: number) => {
      const s = defaultSave(0);
      s.stats.rounds = 1;
      s.upgrades.startSize = UPGRADES.find((u) => u.id === 'startSize')!.max;
      s.dmUpgrades.denseCore = DM_UPGRADES.find((d) => d.id === 'denseCore')!.max;
      s.tier = tier;
      return s;
    };
    const capped = maxedAt(PRESTIGE.tierSizeCap);
    const high = maxedAt(50);
    for (const m of MAPS) {
      const atCap = buildRoundConfig(capped, m.id);
      const at50 = buildRoundConfig(high, m.id);
      expect(at50.startLevel).toBe(atCap.startLevel);
      expect(at50.startLevel).toBeGreaterThan(0);
      expect(m.goal - at50.startLevel).toBeLessThanOrEqual(levelsPerRound);
      expect(at50.mapMul / atCap.mapMul / PRESTIGE.tierScale ** (50 - PRESTIGE.tierSizeCap)).toBeCloseTo(1);
    }
    // The Moon Base goal raises the tier (tierUpReady). Fully upgraded at the size cap's tier (Dense
    // Core's late levels cost more DM than earlier tiers earn), reaching it still takes a round.
    const moon = MAPS[MAPS.length - 1];
    expect(moon.goal - buildRoundConfig(capped, moon.id).startLevel).toBeGreaterThanOrEqual(1);
    expect(upgradeCost('startSize', 30, priceScale(high)) / upgradeCost('startSize', 30, priceScale(capped)) / PRESTIGE.tierScale ** (50 - PRESTIGE.tierSizeCap)).toBeCloseTo(1);
  });

  it('caps the hole at a size that swallows every prop on the map, above the map goal', () => {
    const s = defaultSave(0);
    s.stats.rounds = 1;
    s.upgrades.startSize = UPGRADES.find((u) => u.id === 'startSize')!.max;
    s.dmUpgrades.denseCore = DM_UPGRADES.find((d) => d.id === 'denseCore')!.max;
    for (const m of MAPS) {
      const max = mapMaxLevel(m.id);
      const map = generateMap(m.id);
      const biggest = Math.max(...map.spawns.map((sp) => footprintOf(OBJECT_TYPES[typeId(sp.type)], sp.scale)));
      expect(canEat(biggest, radiusForLevel(max - MAP_SIZE_HEADROOM))).toBe(true);
      // The cap never stops a hole short of MAP_SIZE_MIN_SPAN of the map's width.
      expect(2 * radiusForLevel(max + 1)).toBeGreaterThan(MAP_SIZE_MIN_SPAN * map.size);
      expect(m.goal).toBeLessThan(max);
      const c = buildRoundConfig(s, m.id);
      expect(c.maxLevel).toBe(max);
      expect(c.startLevel).toBeLessThanOrEqual(max);
    }
    // The size30 achievement asks for size 30 (level 29) on some map.
    expect(Math.max(...MAPS.map((m) => mapMaxLevel(m.id)))).toBeGreaterThanOrEqual(29);
  });
});

describe('offline progress', () => {
  const recent = (s: ReturnType<typeof defaultSave>, cash: number) => {
    for (let i = 0; i < OFFLINE.recentRounds; i++) noteRound(s, 'suburb', 0, cash);
  };

  it('pays nothing for short absences or before any round', () => {
    const s = defaultSave(0);
    expect(computeOffline(s, 10 * 3600e3).earned).toBe(0);
    recent(s, 1000);
    expect(computeOffline(s, (OFFLINE.minSeconds - 1) * 1000).earned).toBe(0);
  });

  it('pays a few rounds of recent income for a night away, without helpers', () => {
    const s = defaultSave(0);
    recent(s, 1000);
    const night = computeOffline(s, 8 * 3600e3);
    expect(night.earned / 1000).toBeGreaterThanOrEqual(3);
    expect(night.earned / 1000).toBeLessThanOrEqual(5);
  });

  it('caps the credited time; Offline Vault raises the cap', () => {
    const s = defaultSave(0);
    recent(s, 1000);
    expect(computeOffline(s, 48 * 3600e3).creditedSeconds).toBe(OFFLINE.baseCapHours * 3600);
    s.upgrades.offline = 2;
    expect(computeOffline(s, 48 * 3600e3).creditedSeconds).toBe((OFFLINE.baseCapHours + 2 * OFFLINE.capPerLevel) * 3600);
  });

  it('only remembers the last few rounds', () => {
    const s = defaultSave(0);
    for (let i = 0; i < 20; i++) noteRound(s, 'suburb', 0, i);
    expect(s.recentRoundCash.length).toBe(OFFLINE.recentRounds);
    expect(s.recentRoundCash[s.recentRoundCash.length - 1]).toBe(19);
  });
});

describe('prestige', () => {
  const unlocked = () => {
    const s = defaultSave(0);
    s.maps[PRESTIGE.unlockMap] = true;
    return s;
  };

  it('is locked until the prestige map is unlocked', () => {
    const s = defaultSave(0);
    earn(s, lifetimeForDm(50));
    expect(dmGain(s)).toBe(0);
    s.maps[PRESTIGE.unlockMap] = true;
    expect(dmGain(s)).toBe(50);
  });

  it('pays from lifetime cash, so collapsing again at the same point pays nothing', () => {
    const s = unlocked();
    earn(s, lifetimeForDm(20));
    const n = applyPrestige(s);
    expect(n.dmTotal).toBe(20);
    n.maps[PRESTIGE.unlockMap] = true;
    expect(dmGain(n)).toBe(0);
    earn(n, lifetimeForDm(30) - n.lifetimeCash);
    expect(dmGain(n)).toBe(Math.floor(10 * singularityDmMult(1) + 1e-9));
  });

  it('each Singularity done raises later Dark Matter gains, up to a cap; the first pays the formula', () => {
    const s = unlocked();
    earn(s, lifetimeForDm(10));
    expect(dmGain(s)).toBe(10);
    s.stats.prestiges = 1;
    expect(dmGain(s)).toBe(Math.floor(10 * (1 + PRESTIGE.singularityDmBonus) + 1e-9));
    s.stats.prestiges = PRESTIGE.singularityDmCap + 20;
    expect(dmGain(s)).toBe(Math.floor(10 * singularityDmMult(PRESTIGE.singularityDmCap) + 1e-9));
  });

  it('needs ~16x the lifetime cash to double Dark Matter', () => {
    expect(lifetimeForDm(20) / lifetimeForDm(10)).toBeCloseTo(16);
    expect(dmForLifetime(lifetimeForDm(12) * 1.0001)).toBe(12);
  });

  it('times the collapse hint by the formula, so the multipliers do not bring it sooner', () => {
    const s = unlocked();
    expect(dmGrowth(s)).toBe(Infinity);
    earn(s, lifetimeForDm(10));
    const n = applyPrestige(s);
    n.maps[PRESTIGE.unlockMap] = true;
    earn(n, lifetimeForDm(10 * (1 + PRESTIGE.goodGain)) - n.lifetimeCash);
    expect(dmGrowth(n)).toBeCloseTo(PRESTIGE.goodGain);
    expect(dmGain(n)).toBe(Math.floor(10 * PRESTIGE.goodGain * singularityDmMult(1) + 1e-9));
  });

  it('resets the run but keeps meta progress', () => {
    const s = unlocked();
    earn(s, lifetimeForDm(10));
    s.upgrades.speed = 5;
    s.gulpedia.car = 3;
    s.achievements.push('firstBite');
    s.map100.suburb = true;
    s.mapLevel.suburb = 12;
    s.recentRoundCash.push(5);
    s.tour.maps.farm = true;
    s.tour.bestClear.suburb = 300;
    const n = applyPrestige(s);
    expect(n.dm).toBe(10);
    expect(n.cash).toBe(0);
    expect(n.upgrades.speed).toBe(0);
    expect(n.maps[PRESTIGE.unlockMap]).toBe(false);
    expect(n.mapLevel.suburb).toBe(0);
    expect(n.recentRoundCash).toEqual([]);
    expect(n.gulpedia.car).toBe(3);
    expect(n.achievements).toContain('firstBite');
    expect(n.map100.suburb).toBe(true);
    expect(n.tour.maps.farm).toBe(true);
    expect(n.tour.bestClear.suburb).toBe(300);
    expect(n.stats.prestiges).toBe(1);
  });

  it('a run that reached the Moon Base goal raises the tier, which boosts Dark Matter', () => {
    const s = unlocked();
    const moon = MAPS[MAPS.length - 1];
    s.mapLevel[moon.id] = moon.goal;
    const n = applyPrestige(s);
    expect(n.tier).toBe(1);
    n.maps[PRESTIGE.unlockMap] = true;
    earn(n, lifetimeForDm(10));
    expect(dmGain(n)).toBe(Math.floor(10 * (1 + PRESTIGE.tierDmBonus) * singularityDmMult(1) + 1e-9));
    expect(applyPrestige(n).tier).toBe(1);
  });

  it('tier bonuses never lose a Dark Matter to float error', () => {
    const s = unlocked();
    s.tier = 4;
    earn(s, lifetimeForDm(45) * 1.0001);
    // 45 * 1.4 is 62.999… in floating point.
    expect(dmGain(s)).toBe(Math.round(45 * (1 + PRESTIGE.tierDmBonus * 4)));
  });

  it('wormhole keeps maps and head start grants cash', () => {
    const s = unlocked();
    s.dmUpgrades.wormhole = 1;
    s.dmUpgrades.headStart = 2;
    const n = applyPrestige(s);
    expect(n.maps[PRESTIGE.unlockMap]).toBe(true);
    expect(n.cash).toBe(HEAD_START_BASE * 10);
    expect(singularityPreview(s, 0).lostMaps).toEqual([]);
  });

  it('previews what a collapse resets, and a kept cash bonus without the Cash Value upgrade', () => {
    const s = unlocked();
    s.maps.farm = true;
    earn(s, lifetimeForDm(10));
    s.upgrades.cashValue = 4;
    s.upgrades.speed = 2;
    s.abilities.dash = 1;
    const p = singularityPreview(s, 0);
    expect(p.dm).toBe(10);
    expect(p.upgradeLevels).toBe(6);
    expect(p.abilities).toEqual(['dash']);
    expect(p.lostMaps).toEqual(['farm', 'downtown']);
    // Cash Value resets, so only Dark Matter (none yet, then 10 x 10%) counts as kept.
    expect(p.keptMult).toBeCloseTo(1);
    expect(p.keptMultAfter).toBeCloseTo(1 + 10 * PRESTIGE.bonusPerDm);
  });
});
