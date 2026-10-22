/**
 * Before / after comparison for a tuning candidate: parameter changes, every target check, and
 * overlay charts, from two report.ts runs and their data.
 *
 *   npx tsx balance/compare.ts --before balance/reports/<dir> --after balance/reports/<dir>-tuned --tag tuned
 *   npx tsx balance/compare.ts --before <dir> --after <dir> --before-tag pre --tag ''   # data tags of each side
 *
 * Writes <after>/compare.md (+ charts/compare-*.svg).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { MAPS } from '../src/config/balance';
import { SKILL_NAMES, type Skill } from './lib/bots';
import * as M from './lib/metrics';
import { PARAMS, baselineValues } from './lib/params';
import type { PlayResult } from './lib/progress';
import { dotChart, lineChart } from './lib/svg';

const args = process.argv.slice(2);
const opt = (n: string) => args[args.indexOf(n) + 1];
const BEFORE = opt('--before');
const AFTER = opt('--after');
const TAG = opt('--tag');
const BEFORE_TAG = args.includes('--before-tag') ? opt('--before-tag') : '';
const sfx = (t: string) => (t ? `-${t}` : '');
type Check = { id: string; area: string; name: string; target: string; values: Record<string, string>; pass: boolean; severity: number };
type PlayFile = { seeds: number[]; params?: Record<string, number> | null; results: PlayResult[] };
type ExpRow = { key: string; skill: Skill; variant: string; dIncome: number };
const read = <T>(p: string) => JSON.parse(readFileSync(p, 'utf8')) as T;
const cb = read<{ checks: Check[] }>(`${BEFORE}/checks.json`).checks;
const ca = read<{ checks: Check[] }>(`${AFTER}/checks.json`).checks;
const db = read<PlayFile & { config?: Record<string, number> }>(`balance/data/layerB-direct${sfx(BEFORE_TAG)}.json`);
const da = read<PlayFile>(`balance/data/layerB-direct${sfx(TAG)}.json`);
const eb = read<{ rows: ExpRow[] }>(`balance/data/experiments${sfx(BEFORE_TAG)}.json`).rows;
const ea = read<{ rows: ExpRow[] }>(`balance/data/experiments${sfx(TAG)}.json`).rows;
// Tuned values from the after side's params; when they are written into the game (no params) the
// values are in src/config/balance.ts, and balance/NOTES.md says what changed.
const params = da.params ?? null;
const beforeValues = baselineValues();

const md: string[] = [`# Before / after: \`${TAG || 'game'}\``, ''];
md.push(`Before: \`${BEFORE}\` · After: \`${AFTER}\` · direct Layer B, seeds ${da.seeds.join(', ')}.`, '');

// Parameters.
if (params) {
  md.push('## Changed parameters', '', '| Parameter | Before | After | Change |', '|---|---|---|---|');
  const fmt = (v: number) => (Math.abs(v) >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : `${+v.toPrecision(3)}`);
  for (const p of PARAMS) {
    const a = beforeValues[p.id];
    const b = params[p.id];
    if (b === undefined || Math.abs(b - a) <= 1e-9 * Math.max(1, Math.abs(a))) continue;
    const show = (v: number) => (p.id.endsWith('.goal') ? `size ${v + 1}` : fmt(v));
    md.push(`| ${p.label.replace(' (size, 0-based)', '')} | ${show(a)} | ${show(b)} | ${p.int || p.id.endsWith('.goal') ? `${b - a > 0 ? '+' : ''}${b - a}` : `${b / a - 1 >= 0 ? '+' : ''}${((b / a - 1) * 100).toFixed(0)}%`} |`);
  }
  md.push('');
} else md.push('The tuned values are written into `src/config/balance.ts`; `balance/NOTES.md` says what changed.', '');

// Checks.
md.push('## Targets', '', '| Check | Target | Before | After | |', '|---|---|---|---|---|');
const val = (c: Check) => Object.entries(c.values).map(([k, v]) => (k === 'all' ? v : `${k} ${v}`)).join(' · ');
for (const a of ca) {
  const b = cb.find((x) => x.id === a.id);
  const mark = b && !b.pass && a.pass ? 'fixed' : b && b.pass && !a.pass ? 'broke' : a.pass ? 'met' : a.severity < (b?.severity ?? Infinity) - 0.05 ? 'better' : a.severity > (b?.severity ?? 0) + 0.05 ? 'worse' : 'same';
  md.push(`| ${a.name} | ${a.target} | ${b ? val(b) : '-'} | ${val(a)} | ${mark} |`);
}
md.push('');

// Charts.
const charts: string[] = [];
const save = (name: string, svg: string, alt: string) => {
  writeFileSync(`${AFTER}/charts/${name}.svg`, svg);
  charts.push(`![${alt}](charts/${name}.svg)`);
};
const real = ['optimizer', 'balanced', 'casual'];
const of = (d: PlayFile, s: Skill) => d.results.filter((r) => r.spec.single === undefined && r.spec.skill === s && real.includes(r.spec.policy) && r.spec.pattern === 'binge');
const ms: [keyof M.Milestones, string][] = [
  ['farm', 'Happy Farm'],
  ['downtown', 'Downtown'],
  ['harbor', 'Harbor'],
  ['singularity', 'first Singularity'],
  ['airport', 'Airport'],
  ['spaceport', 'Spaceport'],
  ['moon', 'Moon Base unlocked'],
  ['finish', 'Moon Base goal'],
];
for (const s of SKILL_NAMES) {
  const v = (d: PlayFile) => ms.map(([k]) => M.median(of(d, s).map((r) => M.milestones(r)[k]).map((x) => (Number.isFinite(x) ? x : Infinity))) / 60);
  save(
    `compare-milestones-${s}`,
    dotChart({
      title: `Milestones, ${s} bot: before vs after`,
      subtitle: 'Median play minutes, optimizer / balanced / casual, binge; log scale; missing dot = never',
      x: { label: 'play time (min)', log: true },
      rows: ms.map((m) => m[1]),
      series: [
        { name: 'before', values: v(db), color: 'var(--muted)' },
        { name: 'after', values: v(da), color: 'var(--s1)' },
      ],
    }),
    `Milestones ${s}`,
  );
}
const inc = (d: PlayFile) => M.incomeCurve(d.results.find((r) => r.spec.skill === 'average' && r.spec.policy === 'optimizer' && r.spec.pattern === 'binge' && r.spec.seed === 1)!);
save(
  'compare-income',
  lineChart({
    title: 'Cash per round, average optimizer: before vs after',
    subtitle: 'Seed 1, binge; median of 3 rounds; log scale. Drops are Singularities.',
    x: { label: 'play time (min)', min: 0 },
    y: { label: 'cash per round', log: true },
    series: [
      { name: 'before', points: inc(db), color: 'var(--muted)' },
      { name: 'after', points: inc(da), color: 'var(--s1)' },
    ],
  }),
  'Income before and after',
);
const rows: string[] = [];
const vb: number[] = [];
const va: number[] = [];
for (const s of SKILL_NAMES)
  for (const p of real) {
    rows.push(`${s} · ${p}`);
    const st = (d: PlayFile) => M.median(d.results.filter((r) => r.spec.single === undefined && r.spec.skill === s && r.spec.policy === p && r.spec.pattern === 'binge').map((r) => M.noticeableStretch(r, 600).rounds));
    vb.push(st(db));
    va.push(st(da));
  }
save(
  'compare-noticeable',
  dotChart({
    title: 'Longest stretch without a noticeable upgrade: before vs after',
    subtitle: 'Rounds in a row after 10 min, before the finish; median of 3 seeds; target ≤ 3',
    x: { label: 'rounds', min: 0 },
    rows,
    series: [
      { name: 'before', values: vb, color: 'var(--muted)' },
      { name: 'after', values: va, color: 'var(--s1)' },
    ],
    band: [0, 3],
  }),
  'Noticeable stretches before and after',
);
const keys = [...new Set(ea.filter((r) => r.key !== 'baseline').map((r) => r.key))];
const feel = (rs: ExpRow[], k: string) => M.median(rs.filter((r) => r.key === k && r.skill === 'average').map((r) => r.dIncome)) * 100;
save(
  'compare-feel',
  dotChart({
    title: 'One more level, average bot: change in cash per round, before vs after',
    subtitle: 'Median over the map-entry states of each playthrough; paired Layer A rounds; target ≥ 5%',
    x: { label: 'change in cash per round (%)', fmt: (v) => `${Math.round(v)}%` },
    rows: keys.map((k) => ea.find((r) => r.key === k)!.variant.replace(/ \d+→\d+$/, '')),
    series: [
      { name: 'before', values: keys.map((k) => feel(eb, k)), color: 'var(--muted)' },
      { name: 'after', values: keys.map((k) => feel(ea, k)), color: 'var(--s1)' },
    ],
    band: [5, 1e9],
  }),
  'Upgrade feel before and after',
);
md.push('## Charts', '', ...charts.flatMap((c) => [c, '']));

// Rounds to each goal.
md.push('## Rounds to each goal, by run (median, optimizer / balanced / casual, binge)', '');
md.push('| Skill | Run | ' + MAPS.map((m) => m.name).join(' | ') + ' |', '|---|---|' + MAPS.map(() => '---|').join(''));
const cell = (d: PlayFile, s: Skill, run: number, map: string) => {
  const v = of(d, s).map((r) => {
    const rr = r.rounds.filter((x) => x.run === run && x.map === map);
    if (!rr.length) return NaN;
    const hit = rr.findIndex((x) => x.endLevel >= x.goal);
    return hit >= 0 ? hit + 1 : Infinity;
  }).filter((x) => !Number.isNaN(x));
  if (!v.length) return '';
  const m = M.median(v);
  return Number.isFinite(m) ? `${m}` : 'stuck';
};
for (const s of SKILL_NAMES)
  for (let run = 1; run <= 4; run++) md.push(`| ${s} | ${run} | ${MAPS.map((m) => `${cell(db, s, run, m.id) || '·'} → ${cell(da, s, run, m.id) || '·'}`).join(' | ')} |`);
md.push('');
writeFileSync(`${AFTER}/compare.md`, md.join('\n'));
console.log(`${AFTER}/compare.md`);
