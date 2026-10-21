/**
 * Layer B: every skill x purchase policy x play pattern, several seeds, plus a single-stat sweep.
 *
 *   npx tsx balance/layer-b.ts --mode direct            # real Layer A round for every round
 *   npx tsx balance/layer-b.ts --mode model             # fitted model (balance/data/model.json)
 *   npx tsx balance/layer-b.ts --mode model --seeds 4-10 --tag fresh
 *   npx tsx balance/layer-b.ts --mode direct --params balance/data/tune-<tag>-final.json --tag tuned
 *
 * Writes balance/data/layerB-<mode>[-tag].json. Direct mode also writes its rounds to
 * balance/data/layerB-samples[-tag].jsonl; the untagged file is what layer-a.ts adds to the
 * model's training data. `--params` applies tuned values (lib/params.ts) on top of the config. The
 * optimizer always decides with the fitted model, so the model must exist in both modes.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { SKILL_NAMES } from './lib/bots';
import { gitCommit } from './lib/meta';
import { runPlays } from './lib/pool';
import { PATTERNS, POLICIES, type PlayResult, type PlaySpec } from './lib/progress';

const args = process.argv.slice(2);
const opt = (name: string, def: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
const MODE = opt('--mode', 'direct') as 'direct' | 'model';
const SEEDS = seedList(opt('--seeds', '1-3'));
const TAG = opt('--tag', '');
const MODEL = 'balance/data/model.json';
const PARAMS_FILE = opt('--params', '');
/** Tuned values: a tune-*.json (its best candidate) or a plain {id: value} file. */
const PARAMS: Record<string, number> | undefined = PARAMS_FILE
  ? ((j: { best?: { values: Record<string, number> } } & Record<string, unknown>) => j.best?.values ?? (j as Record<string, number>))(JSON.parse(readFileSync(PARAMS_FILE, 'utf8')))
  : undefined;
/** Targets of the single-stat sweep (average skill, binge). */
export const SINGLE_TARGETS = ['u-startSize', 'u-speed', 'u-cashValue', 'u-roundTime', 'u-growth', 'u-magnet', 'u-combo', 'u-golden', 'h-count', 'a-dash'];

function seedList(spec: string): number[] {
  const out: number[] = [];
  for (const part of spec.split(',')) {
    const [a, b = a] = part.split('-').map(Number);
    for (let s = a; s <= b; s++) out.push(s);
  }
  return out;
}

if (!existsSync(MODEL)) throw new Error(`${MODEL} missing: run balance/layer-a.ts first`);
const specs: PlaySpec[] = [];
for (const skill of SKILL_NAMES)
  for (const policy of POLICIES)
    for (const pattern of PATTERNS) for (const seed of SEEDS) specs.push({ skill, policy, pattern, seed, mode: MODE, params: PARAMS });
for (const single of SINGLE_TARGETS) for (const seed of SEEDS) specs.push({ skill: 'average', policy: 'single', pattern: 'binge', seed, mode: MODE, single, detailEvery: 0, params: PARAMS });

const t0 = Date.now();
let last = 0;
const results = await runPlays(specs, MODEL, {
  progress: (d, n) => {
    if (Date.now() - last > 15000) {
      last = Date.now();
      console.error(`  layer B (${MODE}): ${d}/${n} playthroughs`);
    }
  },
});
console.error(`layer B (${MODE}): ${results.length} playthroughs in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
mkdirSync('balance/data', { recursive: true });
const commit = gitCommit();
const slim = (r: PlayResult) => ({ ...r, samples: undefined });
writeFileSync(`balance/data/layerB-${MODE}${TAG ? `-${TAG}` : ''}.json`, JSON.stringify({ commit, created: new Date().toISOString(), mode: MODE, seeds: SEEDS, params: PARAMS ?? null, results: results.map(slim) }));
if (MODE === 'direct') writeFileSync(`balance/data/layerB-samples${TAG ? `-${TAG}` : ''}.jsonl`, results.flatMap((r) => r.samples.map((s) => JSON.stringify(s))).join('\n') + '\n');
const fmt = (s: number | null) => (s === null ? '   -  ' : `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`);
for (const r of results.filter((x) => x.spec.policy !== 'single' || x.spec.single === undefined))
  console.log(`${r.spec.skill.padEnd(8)} ${r.spec.policy.padEnd(10)} ${r.spec.pattern.padEnd(15)} seed ${r.spec.seed}: finish ${fmt(r.finish)} (${r.rounds.length} rounds)${r.stalled ? `  STALL ${r.stalled}` : ''}`);
for (const r of results.filter((x) => x.spec.single !== undefined)) console.log(`single ${r.spec.single!.padEnd(14)} seed ${r.spec.seed}: finish ${fmt(r.finish)}${r.stalled ? `  STALL ${r.stalled}` : ''}`);
