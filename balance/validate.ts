/**
 * Scores direct Layer B data (every round a real Layer A round) with the Phase 3 loss, baseline
 * vs tuned, so the comparison does not lean on the fitted model.
 *
 *   npx tsx balance/validate.ts --pairs ":tuned,fresh:tuned-fresh"     # seeds 1-3 and fresh 4-10
 *
 * Each pair is baseline-tag:tuned-tag of balance/data/layerB-direct[-tag].json files. Prints a
 * markdown table and writes balance/data/validate.json.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { loss, type LossResult } from './lib/loss';
import { baselineValues } from './lib/params';
import type { PlayResult } from './lib/progress';

const args = process.argv.slice(2);
const pairs = (args.includes('--pairs') ? args[args.indexOf('--pairs') + 1] : ':tuned').split(',').map((p) => p.split(':'));
const base = baselineValues();
type PlayFile = { seeds: number[]; params?: Record<string, number> | null; results: PlayResult[] };
const load = (tag: string) => JSON.parse(readFileSync(`balance/data/layerB-direct${tag ? `-${tag}` : ''}.json`, 'utf8')) as PlayFile;
const fmt = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '-' : +v.toFixed(2));

const out: Record<string, { seeds: number[]; before: LossResult; after: LossResult }> = {};
const md: string[] = [];
for (const [a, b] of pairs) {
  const before = load(a);
  const after = load(b);
  // Single-stat sweep targets other than Starting Size are left out: they stall by design.
  const keep = (r: PlayResult) => r.spec.single === undefined || r.spec.single === 'u-startSize';
  const lb = loss(before.results.filter(keep), base, base);
  const la = loss(after.results.filter(keep), { ...base, ...(after.params ?? {}) }, base);
  out[`${a || 'base'}:${b}`] = { seeds: after.seeds, before: lb, after: la };
  md.push(`Seeds ${after.seeds.join(', ')} (direct): loss ${lb.violation.toFixed(1)} → ${la.violation.toFixed(1)} (violations only; the tuned set also pays ${la.change.toFixed(1)} for its changes).`, '');
  md.push('| Check | Before (strong / average / weak) | After | Score before → after |', '|---|---|---|---|');
  for (const p of la.parts) {
    const q = lb.parts.find((x) => x.id === p.id)!;
    const v = (l: typeof p) => (['strong', 'average', 'weak'] as const).map((s) => fmt(l.bySkill[s]?.value)).join(' / ');
    md.push(`| ${p.label} | ${v(q)} | ${v(p)} | ${q.score.toFixed(1)} → ${p.score.toFixed(1)} |`);
  }
  md.push('');
}
writeFileSync('balance/data/validate.json', JSON.stringify(out, null, 1));
console.log(md.join('\n'));
