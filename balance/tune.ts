/**
 * Phase 3 search: CMA-ES over the whitelisted parameters (lib/params.ts SEARCH). Each candidate is
 * scored by lib/loss.ts on Layer B playthroughs through the fitted model: every skill x optimizer /
 * balanced / casual on `--seeds`, binge; casual returners (offline); a single-stat Starting Size run.
 *
 *   npx tsx balance/tune.ts --gens 40 --tag a [--lambda 16] [--sigma 0.15] [--penalty 2] [--seeds 1,2]
 *   npx tsx balance/tune.ts --eval balance/data/tune-a.json --seeds 4-10   # score the best on fresh seeds
 *   npx tsx balance/tune.ts --gens 25 --tag d --x0 balance/data/tune-c-final.json --sigma 0.08   # warm start
 *   npx tsx balance/tune.ts --gens 40 --tag f --only '^(upgrades|abilities|helpers)\.'          # a subset
 *
 * Writes balance/data/tune-<tag>.json: settings, every evaluation, the best candidate and its breakdown.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { CMAES } from './lib/cmaes';
import { loss, type LossResult } from './lib/loss';
import { gitCommit } from './lib/meta';
import { SEARCH as ALL_SEARCH, baselineValues, type Param } from './lib/params';
import { WorkerPool } from './lib/pool';
import type { PlayResult, PlaySpec } from './lib/progress';

const args = process.argv.slice(2);
const opt = (name: string, def: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
const GENS = Number(opt('--gens', '40'));
const TAG = opt('--tag', 'a');
const SIGMA = Number(opt('--sigma', '0.15'));
const PENALTY = Number(opt('--penalty', '2'));
const LAMBDA = args.includes('--lambda') ? Number(opt('--lambda', '16')) : undefined;
const SEEDS = seedList(opt('--seeds', '1,2'));
const EVAL = opt('--eval', '');
const MODEL = 'balance/data/model.json';
/** --only <regex>: search just the parameters whose id matches (the rest stay at the config's values). */
const ONLY = args.includes('--only') ? new RegExp(opt('--only', '')) : null;
const SEARCH = ALL_SEARCH.filter((p) => !ONLY || ONLY.test(p.id));

function seedList(spec: string): number[] {
  const out: number[] = [];
  for (const part of spec.split(',')) {
    const [a, b = a] = part.split('-').map(Number);
    for (let s = a; s <= b; s++) out.push(s);
  }
  return out;
}

const base = baselineValues();
const toUnit = (p: Param, v: number) => (p.log ? Math.log(v / p.lo) / Math.log(p.hi / p.lo) : (v - p.lo) / (p.hi - p.lo));
const fromUnit = (p: Param, u: number) => {
  const c = Math.min(1, Math.max(0, u));
  const v = p.log ? p.lo * Math.pow(p.hi / p.lo, c) : p.lo + c * (p.hi - p.lo);
  return p.int ? Math.round(v) : v;
};
const decode = (x: number[]) => Object.fromEntries(SEARCH.map((p, i) => [p.id, fromUnit(p, x[i])]));
const outside = (x: number[]) => x.reduce((a, u) => a + Math.max(0, -u, u - 1) ** 2, 0);

function specsFor(values: Record<string, number>): PlaySpec[] {
  // An hour past the finish, so the endless tiers count too.
  const common = { mode: 'model' as const, params: values, afterFinish: 60, maxHours: 14, detailEvery: 0 };
  const out: PlaySpec[] = [];
  for (const skill of ['strong', 'average', 'weak'] as const) {
    for (const policy of ['optimizer', 'balanced', 'casual'] as const) for (const seed of SEEDS) out.push({ ...common, skill, policy, pattern: 'binge', seed });
    out.push({ ...common, skill, policy: 'casual', pattern: 'returner', seed: SEEDS[0] });
  }
  out.push({ ...common, skill: 'average', policy: 'single', pattern: 'binge', seed: SEEDS[0] });
  return out;
}

const pool = new WorkerPool();
async function evaluate(cands: Record<string, number>[]): Promise<LossResult[]> {
  const jobs = cands.flatMap((v) => specsFor(v).map((spec) => ({ kind: 'play' as const, spec, model: MODEL })));
  const res = await pool.run<PlayResult>(jobs);
  const per = jobs.length / cands.length;
  return cands.map((v, i) => loss(res.slice(i * per, (i + 1) * per), v, base, PENALTY));
}

const fmtParts = (l: LossResult) =>
  l.parts
    .filter((p) => p.score > 0)
    .map((p) => `${p.id} ${p.score.toFixed(1)}`)
    .join(', ');

const FINAL = opt('--finalists', '');
if (FINAL) {
  // Re-score the K best distinct candidates of a search (and its final CMA mean) on other seeds;
  // the lowest mean loss there is the finalist, written as tune-<tag>-final.json.
  const K = Number(opt('--k', '8'));
  const file = JSON.parse(readFileSync(FINAL, 'utf8')) as { history: { values: Record<string, number>; total: number }[]; mean: Record<string, number> };
  const seen = new Set<string>();
  const top = [...file.history].sort((a, b) => a.total - b.total).filter((h) => {
    const k = JSON.stringify(h.values);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const cands = [base, file.mean, ...top.slice(0, K).map((h) => h.values)];
  const ls = await evaluate(cands);
  ls.forEach((l, i) => console.log(`${i === 0 ? 'baseline' : i === 1 ? 'CMA mean' : `top ${i - 1}`.padEnd(8)}  ${l.total.toFixed(2)} = violations ${l.violation.toFixed(2)} + change ${l.change.toFixed(2)}  (${fmtParts(l)})`));
  const pick = ls.slice(1).reduce((b, l, i) => (l.total < ls[b + 1].total ? i : b), 0) + 1;
  console.log(`finalist: ${pick === 1 ? 'CMA mean' : `top ${pick - 1}`}`);
  writeFileSync(FINAL.replace('.json', '-final.json'), JSON.stringify({ seeds: SEEDS, best: { values: cands[pick], loss: ls[pick] }, baseline: { values: base, loss: ls[0] }, all: cands.map((v, i) => ({ values: v, loss: ls[i] })) }));
  pool.close();
  process.exit(0);
}

if (EVAL) {
  const file = JSON.parse(readFileSync(EVAL, 'utf8')) as { best: { values: Record<string, number> } };
  const [b, t] = await evaluate([base, { ...base, ...file.best.values }]);
  console.log(`seeds ${SEEDS.join(',')}: baseline ${b.total.toFixed(1)} (${fmtParts(b)})`);
  console.log(`seeds ${SEEDS.join(',')}: tuned    ${t.total.toFixed(1)} = violations ${t.violation.toFixed(1)} + change ${t.change.toFixed(1)} (${fmtParts(t)})`);
  writeFileSync(EVAL.replace('.json', `-eval-${SEEDS.join('_')}.json`), JSON.stringify({ seeds: SEEDS, baseline: b, tuned: t }, null, 1));
  pool.close();
  process.exit(0);
}

// --x0 file: warm start from an earlier search's finalist (the change penalty still counts from today's values).
const X0 = opt('--x0', '');
const start = X0 ? { ...base, ...(JSON.parse(readFileSync(X0, 'utf8')) as { best: { values: Record<string, number> } }).best.values } : base;
const x0 = SEARCH.map((p) => toUnit(p, start[p.id]));
const es = new CMAES(x0, SIGMA, { lambda: LAMBDA, seed: 7 });
const [baseLoss] = await evaluate([base]);
console.log(`baseline loss ${baseLoss.total.toFixed(2)} (${fmtParts(baseLoss)}); ${SEARCH.length} params, lambda ${es.lambda}, ${GENS} generations, seeds ${SEEDS.join(',')}`);
const history: { gen: number; values: Record<string, number>; total: number; violation: number; change: number }[] = [];
let best = { values: base, loss: baseLoss };
const t0 = Date.now();
for (let g = 0; g < GENS; g++) {
  const xs = es.ask();
  const vals = xs.map(decode);
  const ls = await evaluate(vals);
  const fs = ls.map((l, i) => l.total + 10 * outside(xs[i]));
  ls.forEach((l, i) => {
    history.push({ gen: g, values: vals[i], total: fs[i], violation: l.violation, change: l.change });
    if (fs[i] < best.loss.total) best = { values: vals[i], loss: l };
  });
  es.tell(xs, fs);
  const sorted = [...fs].sort((a, b) => a - b);
  console.log(`gen ${String(g + 1).padStart(2)}  best ${best.loss.total.toFixed(2)} (viol ${best.loss.violation.toFixed(2)}, change ${best.loss.change.toFixed(2)})  gen median ${sorted[sorted.length >> 1].toFixed(2)}  sigma ${es.sigma.toFixed(3)}  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  writeFileSync(`balance/data/tune-${TAG}.json`, JSON.stringify({ commit: gitCommit(), tag: TAG, seeds: SEEDS, penalty: PENALTY, sigma: SIGMA, gens: g + 1, baseline: { values: base, loss: baseLoss }, best, mean: decode(es.mean), history }));
}
console.log('\nchanged parameters (baseline -> best):');
for (const p of SEARCH) {
  const a = base[p.id];
  const b = best.values[p.id];
  if (Math.abs(b - a) > 1e-9 * Math.max(1, Math.abs(a))) console.log(`  ${p.label.padEnd(44)} ${fmt(a)} -> ${fmt(b)}`);
}
console.log(`\nbest: ${fmtParts(best.loss)}`);
console.log(`base: ${fmtParts(baseLoss)}`);
pool.close();

function fmt(v: number): string {
  return Math.abs(v) >= 1000 ? v.toExponential(2) : +v.toPrecision(4) + '';
}
