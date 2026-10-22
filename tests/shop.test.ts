import { describe, expect, it } from 'vitest';
import { ABILITIES, HELPERS, MAP_PRICE, MAPS, OFFLINE, SKINS } from '../src/config/balance';
import { ACHIEVEMENTS, checkAchievements } from '../src/core/achievements';
import { abilityCost, buyAbility, buyHelper, buyHelperLevel, cashBreakdown, computeOffline, fixedPriceScale, helperCountCost, helperLevelCost, priceScale } from '../src/core/economy';
import { defaultSave } from '../src/core/save';

describe('helper holes', () => {
  it('buys helpers in order up to the cap, then refuses', () => {
    const s = defaultSave(0);
    s.cash = 1e12;
    for (let i = 0; i < HELPERS.countCosts.length; i++) {
      const cost = helperCountCost(s.helpers);
      const before = s.cash;
      expect(buyHelper(s)).toBe(true);
      expect(before - s.cash).toBe(cost);
    }
    expect(s.helpers).toBe(HELPERS.countCosts.length);
    const left = s.cash;
    expect(buyHelper(s)).toBe(false);
    expect(s.cash).toBe(left);
  });

  it('trains helpers only once one is owned, up to the level cap', () => {
    const s = defaultSave(0);
    s.cash = 1e15;
    expect(buyHelperLevel(s)).toBe(false);
    s.helpers = 1;
    const cost = helperLevelCost(0);
    expect(buyHelperLevel(s)).toBe(true);
    expect(s.cash).toBe(1e15 - cost);
    while (buyHelperLevel(s));
    expect(s.helperLevel).toBe(HELPERS.levelMax);
  });

  it('refuses what it cannot afford', () => {
    const s = defaultSave(0);
    s.cash = HELPERS.countCosts[0] - 1;
    expect(buyHelper(s)).toBe(false);
    expect(s.helpers).toBe(0);
  });
});

describe('abilities', () => {
  it('unlocks, levels up to the max and charges the listed price', () => {
    const s = defaultSave(0);
    s.cash = 1e12;
    for (const a of ABILITIES) {
      for (let lvl = 0; lvl < a.maxLevel; lvl++) {
        const before = s.cash;
        expect(buyAbility(s, a.id)).toBe(true);
        expect(before - s.cash).toBeCloseTo(abilityCost(a.id, lvl), 2);
      }
      expect(buyAbility(s, a.id)).toBe(false);
      expect(s.abilities[a.id]).toBe(a.maxLevel);
    }
  });

  it('prices scale with the Singularity tier', () => {
    const s = defaultSave(0);
    s.tier = 2;
    expect(abilityCost('dash', 0, fixedPriceScale(s))).toBeCloseTo(abilityCost('dash', 0) * 16);
  });

  it('upgrade prices follow the newest unlocked map; helper and ability prices stay fixed', () => {
    const s = defaultSave(0);
    expect(priceScale(s)).toBe(1);
    s.maps.farm = true;
    const farm = Math.pow(MAPS[1].valueMul, MAP_PRICE.exp);
    expect(priceScale(s)).toBe(farm);
    // Upgrade prices rise with the map, but a little less than its payouts.
    expect(farm).toBeGreaterThan(1);
    expect(farm).toBeLessThanOrEqual(MAPS[1].valueMul);
    // Helpers and abilities cost what they did before the unlock.
    expect(fixedPriceScale(s)).toBe(1);
    s.cash = helperCountCost(0) - 1;
    expect(buyHelper(s)).toBe(false);
    s.cash += 1;
    expect(buyHelper(s)).toBe(true);
    expect(s.cash).toBeCloseTo(0);
    s.cash = abilityCost('dash', 0);
    expect(buyAbility(s, 'dash')).toBe(true);
  });
});

describe('achievements', () => {
  it('every id is unique and every skin reward exists', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) if (a.skin) expect(SKINS.some((sk) => sk.id === a.skin)).toBe(true);
  });

  it('grants met achievements once, with their skin', () => {
    const s = defaultSave(0);
    s.stats.totalEaten = 1000;
    const got = checkAchievements(s).map((a) => a.id);
    expect(got).toEqual(expect.arrayContaining(['firstBite', 'eat100', 'eat1000']));
    expect(s.skins).toContain('mint');
    expect(checkAchievements(s)).toEqual([]);
  });

  it('drops unknown ids so junk entries never add cash', () => {
    const s = defaultSave(0);
    s.achievements = ['firstBite', 'madeUp', 'alsoFake'];
    s.stats.totalEaten = 1;
    checkAchievements(s);
    expect(s.achievements).toEqual(['firstBite']);
    expect(cashBreakdown(s).achievements).toBeCloseTo(1.02);
  });
});

describe('offline clock edge cases', () => {
  const withIncome = () => {
    const s = defaultSave(0);
    s.recentRoundCash = [1000];
    s.lastSeen = 1_000_000_000;
    return s;
  };

  it('pays nothing when the clock went backwards', () => {
    const s = withIncome();
    expect(computeOffline(s, s.lastSeen - 3_600_000).earned).toBe(0);
  });

  it('starts paying at the minimum absence', () => {
    const s = withIncome();
    expect(computeOffline(s, s.lastSeen + (OFFLINE.minSeconds - 1) * 1000).earned).toBe(0);
    expect(computeOffline(s, s.lastSeen + OFFLINE.minSeconds * 1000).earned).toBeGreaterThan(0);
  });

  it('a clock jumped years ahead still pays only the cap', () => {
    const s = withIncome();
    const capped = computeOffline(s, s.lastSeen + 24 * 3600_000).earned;
    expect(computeOffline(s, s.lastSeen + 5 * 365 * 24 * 3600_000).earned).toBe(capped);
  });
});
