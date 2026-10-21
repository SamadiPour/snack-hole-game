/**
 * Layer A grid: plays real rounds at sampled upgrade states for every map and skill, then fits
 * the round model (lib/model.ts) and reports its held-out error.
 *
 *   npx tsx balance/layer-a.ts                 # 2,000 states per map and skill, seed 1
 *   npx tsx balance/layer-a.ts --n 400 --seed 2
 *
 * Half the states are drawn independently per feature (coverage, including values past today's
 * caps so Phase 3 can move them), half along a single progress value (the correlated states real
 * saves have). Rounds Layer B played directly (balance/data/layerB-samples.jsonl) are added to the
 * training data when present. Writes balance/data/layerA-samples.jsonl, balance/data/model.json
 * and balance/data/model-error.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { MAPS, type MapId } from '../src/config/balance';
import * as eco from '../src/core/economy';
import { Rng } from '../src/core/rng';
import { defaultSave } from '../src/core/save';
import { SKILL_NAMES } from './lib/bots';
import { gitCommit } from './lib/meta';
import { RoundModel, toSample, type Sample } from './lib/model';
import { runRounds } from './lib/pool';
import type { RoundSpec } from './lib/round';

const args = process.argv.slice(2);
const arg = (name: string, def: number) => (args.includes(name) ? Number(args[args.indexOf(name) + 1]) : def);
const N = arg('--n', 2000);
const TEST_STATES = arg('--test', 40);
const TEST_SEEDS = 8;
const errAcc: Record<string, { model: number[]; noise: number[]; lvl: number[]; goal: number[] }> = {};
const SEED = arg('--seed', 1);

export function randomCfg(map: MapId, rng: Rng, coupled: boolean): eco.RoundConfig {
  const def = eco.mapDef(map);
  const max = eco.mapMaxLevel(map);
  const base = eco.buildRoundConfig(defaultSave(0), map);
  const p = rng.next();
  const lvl = (cap: number) => {
    if (!coupled) return rng.int(0, cap);
    const g = (rng.next() + rng.next() + rng.next() - 1.5) * 0.35 * cap;
    return Math.max(0, Math.min(cap, Math.round(p * cap + g)));
  };
  const cont = (lo: number, hi: number, fromLvl: number) => (rng.chance(0.25) ? rng.range(lo, hi) : fromLvl);
  const startLevel = Math.max(0, Math.min(max, coupled ? Math.round(p * (def.goal + 2) + rng.range(-2, 2)) : rng.int(0, Math.min(max, def.goal + 4))));
  const helpers = lvl(4);
  const quantum = rng.chance(0.7) ? 0 : lvl(10);
  const abilities = {} as eco.RoundConfig['abilities'];
  for (const id of ['dash', 'vortex', 'mega'] as const) {
    const l = rng.chance(0.3) ? 0 : lvl(5);
    abilities[id] = { level: l, duration: eco.abilityDuration(id, l), cooldown: eco.abilityCooldown(id, l) };
  }
  return {
    ...base,
    startLevel,
    speedMult: cont(1, 1.9, 1 + 0.08 * lvl(8)),
    // Wider than today's Growth Rate range (x1-1.6) so tuned map XP multipliers stay inside the data.
    xpMult: def.xpMul * (rng.chance(0.35) ? rng.range(0.6, 2.4) : 1 + 0.1 * lvl(6)),
    magnetLevel: lvl(14),
    roundTime: cont(50, 120, 60 + 10 * lvl(4)),
    helpers,
    helperRadius: eco.helperRadius(lvl(10), quantum),
    helperSpeedMult: 1 + 0.1 * quantum,
    abilities,
  };
}

async function main(): Promise<void> {
  const rng = new Rng(SEED * 7907 + 3);
  const specs: RoundSpec[] = [];
  for (const m of MAPS)
    for (const skill of SKILL_NAMES)
      for (let i = 0; i < N; i++) specs.push({ cfg: randomCfg(m.id, rng, i % 2 === 1), skill, seed: rng.int(1, 1e9) });
  const t0 = Date.now();
  let last = 0;
  const res = await runRounds(specs, {
    progress: (d, n) => {
      if (Date.now() - last > 10000) {
        last = Date.now();
        console.error(`  layer A: ${d}/${n} rounds`);
      }
    },
  });
  console.error(`layer A: ${res.length} rounds in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  mkdirSync('balance/data', { recursive: true });
  const samples = res.map((r, i) => toSample(r, specs[i].cfg));
  writeFileSync('balance/data/layerA-samples.jsonl', samples.map((s) => JSON.stringify(s)).join('\n') + '\n');
  const extra: Sample[] = existsSync('balance/data/layerB-samples.jsonl')
    ? readFileSync('balance/data/layerB-samples.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Sample)
    : [];
  const all = [...samples, ...extra];
  const commit = gitCommit();

  // Error on fresh states: TEST_STATES new states per map and skill, TEST_SEEDS rounds each. The
  // model's mean is compared with the mean of those rounds (model error); single rounds against
  // the same mean give the round-to-round noise no model can remove.
  const testSpecs: RoundSpec[] = [];
  for (const m of MAPS)
    for (const skill of SKILL_NAMES)
      for (let i = 0; i < TEST_STATES; i++) {
        const cfg = randomCfg(m.id, rng, i % 2 === 1);
        for (let k = 0; k < TEST_SEEDS; k++) testSpecs.push({ cfg, skill, seed: rng.int(1, 1e9) });
      }
  const testRes = await runRounds(testSpecs);
  const model = RoundModel.train(all, commit, SEED);
  const err: Record<string, Record<string, number>> = {};
  const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
  const p90 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.9)];
  for (let g = 0; g < testSpecs.length; g += TEST_SEEDS) {
    const spec = testSpecs[g];
    const k = `${spec.cfg.mapId}/${spec.skill}`;
    const rs = testRes.slice(g, g + TEST_SEEDS);
    const trueLog = rs.reduce((a, r) => a + Math.log(1 + r.cashByCombo[0]), 0) / rs.length;
    const trueLvl = rs.reduce((a, r) => a + r.endLevel, 0) / rs.length;
    const goal = eco.mapDef(spec.cfg.mapId).goal;
    const trueGoal = rs.filter((r) => r.endLevel >= goal).length / rs.length;
    const p = model.predict(spec.cfg, spec.skill);
    const acc = errAcc[k] ?? (errAcc[k] = { model: [], noise: [], lvl: [], goal: [] });
    acc.model.push(Math.abs(Math.log(1 + p.cash(0)) - trueLog));
    for (const r of rs) acc.noise.push(Math.abs(Math.log(1 + r.cashByCombo[0]) - trueLog));
    acc.lvl.push(Math.abs(p.mean((r) => r.endLevel) - trueLvl));
    if (Math.abs(spec.cfg.startLevel - goal) <= 8) acc.goal.push(Math.abs(p.pAtLeast(goal) - trueGoal));
  }
  for (const [k, a] of Object.entries(errAcc))
    err[k] = {
      states: a.model.length,
      modelMedianPct: (Math.exp(med(a.model)) - 1) * 100,
      modelP90Pct: (Math.exp(p90(a.model)) - 1) * 100,
      roundNoiseMedianPct: (Math.exp(med(a.noise)) - 1) * 100,
      endLevelMAE: a.lvl.reduce((x, y) => x + y, 0) / a.lvl.length,
      goalProbMAE: a.goal.length ? a.goal.reduce((x, y) => x + y, 0) / a.goal.length : NaN,
    };
  const all2 = [...all, ...testRes.map((r, i) => toSample(r, testSpecs[i].cfg))];
  const final = RoundModel.train(all2, commit, SEED);
  writeFileSync('balance/data/model.json', JSON.stringify(final.file));
  writeFileSync('balance/data/model-error.json', JSON.stringify({ commit, n: N, seed: SEED, extra: extra.length, err }, null, 1));
  console.log(`model error on ${TEST_STATES} fresh states per map/skill vs the mean of ${TEST_SEEDS} rounds (median / p90 cash, end size MAE, P(goal) MAE) and single-round noise:`);
  for (const [k, e] of Object.entries(err))
    console.log(`  ${k.padEnd(18)} ${e.modelMedianPct.toFixed(1)}% / ${e.modelP90Pct.toFixed(1)}%  L±${e.endLevelMAE.toFixed(2)}  P±${e.goalProbMAE.toFixed(2)}   noise ${e.roundNoiseMedianPct.toFixed(1)}%`);
}

/** A round config with a sample's features (enough for model.predict). */
export function cfgFromSample(s: Sample): eco.RoundConfig {
  const base = eco.buildRoundConfig(defaultSave(0), s.map);
  const [startLevel, speedMult, xpFactor, magnetLevel, roundTime, helpers, helperRadius, helperSpeedMult, dash, vortex, mega] = s.x;
  const ab = (id: 'dash' | 'vortex' | 'mega', l: number) => ({ level: l, duration: eco.abilityDuration(id, l), cooldown: eco.abilityCooldown(id, l) });
  return {
    ...base,
    startLevel,
    speedMult,
    xpMult: xpFactor * eco.mapDef(s.map).xpMul,
    magnetLevel,
    roundTime,
    helpers,
    helperRadius,
    helperSpeedMult,
    abilities: { dash: ab('dash', dash), vortex: ab('vortex', vortex), mega: ab('mega', mega) },
  };
}

if (process.argv[1]?.endsWith('layer-a.ts')) await main();
