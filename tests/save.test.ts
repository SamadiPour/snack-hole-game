import { describe, expect, it } from 'vitest';
import { DM_UPGRADES, HELPERS, OFFLINE, SAVE_VERSION, UPGRADES } from '../src/config/balance';
import { buildRoundConfig, cashBreakdown, dmUpgradeCost, earn } from '../src/core/economy';
import { decodeSaveText, defaultSave, encodeSaveText, looksLikeSave, migrate, parseSave, serialize } from '../src/core/save';

/** A save as an import or a hand-edited localStorage entry might carry it. */
const edited = (fields: Record<string, unknown>) => migrate({ ...JSON.parse(serialize(defaultSave(0))), ...fields }, 0);

describe('loading untrusted saves', () => {
  it('ignores inherited names like toString as the selected map', () => {
    const s = edited({ selectedMap: 'toString' });
    expect(s.selectedMap).toBe('suburb');
    expect(() => buildRoundConfig(s)).not.toThrow();
  });

  it('keeps a selected map only when it is unlocked', () => {
    expect(edited({ selectedMap: 'farm', maps: { suburb: true, farm: true } }).selectedMap).toBe('farm');
    expect(edited({ selectedMap: 'farm', maps: { suburb: true, farm: 'yes' } }).selectedMap).toBe('suburb');
  });

  it('unlocks a map added before one the save has already unlocked', () => {
    // A save from before the Spaceport: Moon Base unlocked, so it already passed the Spaceport's unlock point.
    const s = edited({ maps: { suburb: true, farm: true, downtown: true, harbor: true, airport: true, moon: true } });
    expect(s.maps.spaceport).toBe(true);
    expect(edited({ maps: { suburb: true, farm: true, downtown: true, harbor: true, airport: true } }).maps.spaceport).toBe(false);
  });

  it('drops infinite, negative and fractional counts anywhere in the save', () => {
    const s = edited({ helpers: 1e999, helperLevel: -3, cash: Number.NaN, upgrades: { speed: 2.7, startSize: 1e6 }, stats: { rounds: -1 } });
    expect(s.helpers).toBe(0);
    expect(s.helperLevel).toBe(0);
    expect(s.cash).toBe(0);
    expect(s.upgrades.speed).toBe(2);
    expect(s.upgrades.startSize).toBe(UPGRADES.find((u) => u.id === 'startSize')!.max);
    expect(s.stats.rounds).toBe(0);
    expect(edited({ helpers: 99 }).helpers).toBe(HELPERS.countCosts.length);
  });

  it('gives back the Dark Matter of DM upgrade levels above a lowered cap, once', () => {
    // Dense Core went from 20 levels to 10.
    const dc = DM_UPGRADES.find((d) => d.id === 'denseCore')!;
    const s = edited({ dm: 4, dmUpgrades: { denseCore: dc.max + 2 } });
    expect(s.dmUpgrades.denseCore).toBe(dc.max);
    expect(s.dm).toBe(4 + dmUpgradeCost('denseCore', dc.max) + dmUpgradeCost('denseCore', dc.max + 1));
    expect(migrate(JSON.parse(serialize(s)), 0).dm).toBe(s.dm);
    // No DM upgrade ever went past level 20: a hand-edited level gets nothing more for the rest.
    expect(edited({ dmUpgrades: { denseCore: 1e9 } }).dm).toBe(edited({ dmUpgrades: { denseCore: 20 } }).dm);
  });

  it('gives back Hawking Radiation levels at the price they were bought for', () => {
    // 3 levels at 5, 10 and 20 DM became 1 level: levels 2 and 3 give back 10 + 20.
    const s = edited({ dm: 0, dmUpgrades: { hawking: 3 } });
    expect(s.dmUpgrades.hawking).toBe(1);
    expect(s.dm).toBe(30);
  });

  it('adds no keys the default save does not have, even on nested records', () => {
    const s = edited({ map100: { constructor: true, valueOf: 1, suburb: true }, upgrades: { __proto__: 5 } });
    expect(Object.keys(s.map100).sort()).toEqual(Object.keys(defaultSave(0).map100).sort());
    expect(s.map100.suburb).toBe(true);
    // One cleared map: exactly one +25% map bonus, nothing extra from the junk keys.
    expect(cashBreakdown(s).maps).toBeCloseTo(cashBreakdown({ ...defaultSave(0), map100: { ...defaultSave(0).map100, suburb: true } }).maps);
  });

  it('cleans arrays: unknown skins and Gulpedia entries go, duplicates collapse, recent income stays short', () => {
    const s = edited({
      skins: ['classic', 'mint', 'mint', 'hacker', 7],
      skin: 'hacker',
      achievements: ['firstBite', 'firstBite', 3],
      gulpedia: { car: 2.5, nonsense: 9, cone: -1 },
      recentRoundCash: [1, 'x', Infinity, 2, 3, 4, 5, 6, 7],
    });
    expect(s.skins).toEqual(['classic', 'mint']);
    expect(s.skin).toBe('classic');
    expect(s.achievements).toEqual(['firstBite']);
    expect(s.gulpedia).toEqual({ car: 2 });
    expect(s.recentRoundCash).toEqual([3, 4, 5, 6, 7].slice(-OFFLINE.recentRounds));
  });

  it('moves claimed Dark Matter onto the v4 curve and keeps the DM held', () => {
    const s = migrate({ ...JSON.parse(serialize(defaultSave(0))), version: 3, dm: 12, dmTotal: 20, dmClaimed: 11 }, 0);
    expect(s.dmClaimed).toBe(7);
    expect(s.dm).toBe(12);
    expect(s.dmTotal).toBe(20);
  });

  it('floors a fractional version instead of skipping migrations', () => {
    const s = migrate({ version: 2.5, cash: 1e9, settings: { volume: 0.3 } }, 0);
    expect(s.cash).toBe(0);
    expect(s.settings.volume).toBe(0.3);
  });

  it('keeps default records where the save holds null or an array', () => {
    for (const bad of [null, [], [3]]) {
      const s = edited({ stats: bad, upgrades: bad, dmUpgrades: bad, settings: bad, mapBest: bad, maps: bad });
      expect(s.stats).toEqual(defaultSave(0).stats);
      expect(s.upgrades).toEqual(defaultSave(0).upgrades);
      expect(s.dmUpgrades).toEqual(defaultSave(0).dmUpgrades);
      expect(s.settings).toEqual(defaultSave(0).settings);
      expect(s.maps.suburb).toBe(true);
      expect(buildRoundConfig(s).startLevel).toBe(buildRoundConfig(defaultSave(0)).startLevel);
    }
  });

  it('falls back to safe settings', () => {
    const s = edited({ settings: { volume: 7, quality: 'ultra', shake: 'no', abilitySide: 'top' } });
    expect(s.settings.volume).toBe(1);
    expect(s.settings.quality).toBe('auto');
    expect(s.settings.abilitySide).toBe('left');
    expect(s.settings.shake).toBe(true);
  });

  it('keeps ability buttons on the right', () => {
    expect(edited({ settings: { abilitySide: 'right' } }).settings.abilitySide).toBe('right');
  });
});

describe('save text', () => {
  it('tells saves from other JSON', () => {
    expect(looksLikeSave({ version: SAVE_VERSION })).toBe(true);
    expect(looksLikeSave({})).toBe(false);
    expect(looksLikeSave([1])).toBe(false);
    expect(parseSave('{}')).toBeNull();
    expect(parseSave('not json')).toBeNull();
    expect(parseSave(serialize(defaultSave(0)))).not.toBeNull();
  });

  it('export text round-trips, including non-ASCII', () => {
    const json = serialize({ ...defaultSave(0), skin: 'classic' }) + ' ✨ü';
    expect(decodeSaveText(encodeSaveText(json))).toBe(json);
    expect(decodeSaveText(`${encodeSaveText(json).slice(0, 10)}\n${encodeSaveText(json).slice(10)}`)).toBe(json);
  });

  it('keeps overflowing late-game cash at the largest number instead of saving it as 0', () => {
    const s = defaultSave(0);
    s.cash = Number.MAX_VALUE;
    earn(s, Number.MAX_VALUE);
    expect(s.cash).toBe(Number.MAX_VALUE);
    s.stats.bestRoundCash = Infinity;
    const back = parseSave(serialize(s), 0)!;
    expect(back.cash).toBe(Number.MAX_VALUE);
    expect(back.stats.bestRoundCash).toBe(Number.MAX_VALUE);
  });
});
