/**
 * Fitted Layer A model: one random forest per (map, skill) over the round config features that
 * change what happens in a round. Cash multipliers, tier, golden chance and Combo Window are left
 * out on purpose: Layer A measures base cash, and Layer B applies them exactly (see round.ts).
 */
import { MAPS, type MapId } from '../../src/config/balance';
import { OBJECT_TYPES, TYPE_INDEX } from '../../src/config/objects';
import type { RoundConfig } from '../../src/core/economy';
import { Rng } from '../../src/core/rng';
import type { Skill } from './bots';
import { fitForest, neighbours, type Forest } from './forest';
import { BASE } from './params';
import type { RoundResult } from './round';

export const FEATURES = ['startLevel', 'speedMult', 'xpFactor', 'magnetLevel', 'roundTime', 'helpers', 'helperRadius', 'helperSpeed', 'dash', 'vortex', 'mega'] as const;

export function features(cfg: RoundConfig): number[] {
  const helpers = cfg.helpers;
  return [
    cfg.startLevel,
    cfg.speedMult,
    // Against the baseline map XP multiplier, so a tuned xpMul reads as a bigger XP factor.
    cfg.xpMult / BASE.xpMul[cfg.mapId],
    cfg.magnetLevel,
    cfg.roundTime,
    helpers,
    helpers > 0 ? cfg.helperRadius : 0,
    helpers > 0 ? cfg.helperSpeedMult : 0,
    cfg.abilities.dash.level,
    cfg.abilities.vortex.level,
    cfg.abilities.mega.level,
  ];
}

/** A training round, trimmed to what Layer B and the reports read. */
export interface Sample {
  map: MapId;
  skill: Skill;
  x: number[];
  /** Base cash per Combo Window level. */
  cash: number[];
  startLevel: number;
  endLevel: number;
  /** Level-up times (s). */
  lt: number[];
  wall: number;
  played: number;
  pct: number;
  eaten: number;
  helperEaten: number;
  comboBest: number;
  goldShare: number;
  /** Share of the cash that helper holes earned (baseline helper share). */
  helperShare: number;
  quit: boolean;
  dead: number;
  end: string;
  /** Object type indices swallowed. */
  types: number[];
}

export function toSample(r: RoundResult, cfg: RoundConfig): Sample {
  return {
    map: r.mapId,
    skill: r.skill,
    x: features(cfg),
    cash: r.cashByCombo.map((c) => Math.round(c * 100) / 100),
    startLevel: r.startLevel,
    endLevel: r.endLevel,
    lt: r.levelTimes.map((t) => Math.round(t * 10) / 10),
    wall: Math.round(r.wall * 10) / 10,
    played: Math.round(r.played * 10) / 10,
    pct: Math.round(r.pct * 1e5) / 1e5,
    eaten: r.eaten,
    helperEaten: r.helperEaten,
    comboBest: r.comboBest,
    goldShare: Math.round(r.goldShare * 1e4) / 1e4,
    helperShare: r.cash > 0 ? Math.round((r.helperCash / r.cash) * 1e4) / 1e4 : 0,
    quit: r.quit,
    dead: Math.round(r.deadTime * 10) / 10,
    end: r.endReason,
    types: r.types.map((id) => TYPE_INDEX[id]),
  };
}

export const typeIds = (s: Sample) => s.types.map((t) => OBJECT_TYPES[t].id);

const key = (map: MapId, skill: Skill) => `${map}/${skill}`;

/** What the forest says about a round: its weighted neighbour rounds. */
export class Prediction {
  constructor(
    readonly rows: Sample[],
    readonly w: number[],
  ) {}

  mean(f: (s: Sample) => number): number {
    let a = 0;
    for (let i = 0; i < this.rows.length; i++) a += this.w[i] * f(this.rows[i]);
    return a;
  }

  /** Mean base cash at a Combo Window level (geometric mean, which the forest fits), each round scaled by `factor`. */
  cash(combo: number, factor: (s: Sample) => number = () => 1): number {
    return Math.exp(this.mean((s) => Math.log(1 + s.cash[combo] * factor(s)))) - 1;
  }

  /** Chance the round ends at `level` or bigger. */
  pAtLeast(level: number): number {
    return this.mean((s) => (s.endLevel >= level ? 1 : 0));
  }

  /** One neighbour round, drawn by weight: a realistic joint outcome. */
  sample(rng: Rng): Sample {
    let u = rng.next();
    for (let i = 0; i < this.rows.length; i++) {
      u -= this.w[i];
      if (u <= 0) return this.rows[i];
    }
    return this.rows[this.rows.length - 1];
  }
}

export interface ModelFile {
  commit: string;
  created: string;
  samples: Record<string, Sample[]>;
  forests: Record<string, Forest>;
}

export class RoundModel {
  constructor(readonly file: ModelFile) {}

  static train(samples: Sample[], commit: string, seed = 1): RoundModel {
    const groups: Record<string, Sample[]> = {};
    for (const s of samples) (groups[key(s.map, s.skill)] ??= []).push(s);
    const forests: Record<string, Forest> = {};
    for (const [k, rows] of Object.entries(groups)) {
      forests[k] = fitForest(
        rows.map((s) => s.x),
        rows.map((s) => [Math.log(1 + s.cash[0]), s.endLevel, s.wall, s.pct * 10]),
        { trees: 50, minLeaf: 5, seed },
      );
    }
    return new RoundModel({ commit, created: new Date().toISOString(), samples: groups, forests });
  }

  has(map: MapId, skill: Skill): boolean {
    return !!this.file.forests[key(map, skill)];
  }

  predict(cfg: RoundConfig, skill: Skill): Prediction {
    const k = key(cfg.mapId, skill);
    const forest = this.file.forests[k];
    if (!forest) throw new Error(`no model for ${k}`);
    const { rows, w } = neighbours(forest, features(cfg));
    const data = this.file.samples[k];
    return new Prediction(
      rows.map((r) => data[r]),
      w,
    );
  }
}

export const MAP_IDS = MAPS.map((m) => m.id);
