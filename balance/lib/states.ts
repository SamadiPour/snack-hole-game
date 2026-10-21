/** Named upgrade states used by parity checks, calibration and spot checks. */
import type { MapId } from '../../src/config/balance';
import { buildRoundConfig, type RoundConfig } from '../../src/core/economy';
import { defaultSave, type SaveData } from '../../src/core/save';

export interface NamedState {
  name: string;
  save: SaveData;
  map: MapId;
}

function state(name: string, map: MapId, apply: (s: SaveData) => void): NamedState {
  const s = defaultSave(0);
  apply(s);
  s.selectedMap = map;
  return { name, save: s, map };
}

export const STATES: NamedState[] = [
  state('suburb-fresh', 'suburb', () => {}),
  state('suburb-early', 'suburb', (s) => Object.assign(s.upgrades, { startSize: 5, speed: 1, cashValue: 2, growth: 1 })),
  state('farm', 'farm', (s) => {
    Object.assign(s.upgrades, { startSize: 12, speed: 2, cashValue: 3, roundTime: 1, growth: 2, magnet: 2, combo: 1 });
    s.helpers = 1;
    s.helperLevel = 1;
    s.abilities.dash = 1;
  }),
  state('downtown', 'downtown', (s) => {
    Object.assign(s.upgrades, { startSize: 22, speed: 4, growth: 3, magnet: 3, roundTime: 2 });
    s.helpers = 2;
    s.helperLevel = 3;
    s.abilities.dash = 2;
    s.abilities.vortex = 1;
  }),
  state('harbor', 'harbor', (s) => {
    Object.assign(s.upgrades, { startSize: 30, speed: 6, roundTime: 3, growth: 5, magnet: 6, combo: 4, golden: 2 });
    Object.assign(s.dmUpgrades, { denseCore: 2, gravityWell: 1 });
    s.helpers = 3;
    s.helperLevel = 6;
    Object.assign(s.abilities, { dash: 3, vortex: 2, mega: 1 });
  }),
  state('moon', 'moon', (s) => {
    Object.assign(s.upgrades, { startSize: 40, speed: 8, roundTime: 4, growth: 6, magnet: 8, combo: 6, golden: 4 });
    Object.assign(s.dmUpgrades, { denseCore: 6, gravityWell: 3, quantumHelpers: 3 });
    s.helpers = 4;
    s.helperLevel = 9;
    Object.assign(s.abilities, { dash: 5, vortex: 4, mega: 3 });
  }),
];

export const cfgOf = (s: NamedState): RoundConfig => buildRoundConfig(s.save, s.map);
