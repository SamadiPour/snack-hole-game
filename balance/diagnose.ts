/**
 * Phase 3 diagnosis: measures the mechanism behind each baseline problem.
 *
 *   D1  goals vs XP ceiling: where stalled rounds end, per map and skill (direct Layer B rounds)
 *   D2  slow size levels: median seconds per level, per map and level (direct rounds, average bot)
 *   D3  frontier XP bonus: skill gap and seconds per level at frontierBonus 3 / 2 / 1 (Layer A)
 *   D4  prestige replay: DM, cash multiplier and Starting Size spend per run (direct Layer B)
 *   D5  helpers: main-hole end size and cash with helpers vs without (Layer A)
 *
 *   npx tsx balance/diagnose.ts           # writes balance/data/diagnosis.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { MAPS, SIZE } from '../src/config/balance';
import * as eco from '../src/core/economy';
import type { SaveData } from '../src/core/save';
import { SKILL_NAMES } from './lib/bots';
import { gitCommit } from './lib/meta';
import { median } from './lib/metrics';
import type { Sample } from './lib/model';
import { runJobs } from './lib/pool';
import type { PlayResult } from './lib/progress';
import type { RoundResult, RoundSpec } from './lib/round';

const out: Record<string, unknown> = { commit: gitCommit() };
const direct = JSON.parse(readFileSync('balance/data/layerB-direct.json', 'utf8')) as { results: PlayResult[] };
const samples = readFileSync('balance/data/layerB-samples.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Sample);

// D1: rounds on a map that did not reach its goal: how far short, and how much of the map was eaten.
console.log('D1  rounds short of the goal: median sizes short / map eaten / share of rounds on the map');
const d1: Record<string, unknown>[] = [];
for (const m of MAPS)
  for (const skill of SKILL_NAMES) {
    const rs = direct.results.filter((r) => r.spec.skill === skill && r.spec.single === undefined).flatMap((r) => r.rounds.filter((x) => x.map === m.id));
    const miss = rs.filter((x) => x.endLevel < x.goal);
    if (!rs.length) continue;
    const row = { map: m.id, skill, rounds: rs.length, missShare: miss.length / rs.length, short: median(miss.map((x) => x.goal - x.endLevel)), pct: median(miss.map((x) => x.pct)), pctHit: median(rs.filter((x) => x.endLevel >= x.goal).map((x) => x.pct)) };
    d1.push(row);
    console.log(`  ${m.id.padEnd(9)} ${skill.padEnd(8)} ${(row.missShare * 100).toFixed(0).padStart(3)}% of ${rs.length} rounds miss, by ${row.short} sizes, ${(row.pct * 100).toFixed(0)}% eaten (hits at ${(row.pctHit * 100).toFixed(0)}%)`);
  }
out.d1 = d1;

// D2: seconds spent at each size level, average bot.
console.log('D2  median seconds per size level (average bot), per map; * = over 2x the map median');
const d2: Record<string, Record<number, number>> = {};
for (const m of MAPS) {
  const per = new Map<number, number[]>();
  for (const s of samples.filter((x) => x.map === m.id && x.skill === 'average')) {
    let prev = 0;
    s.lt.forEach((t, i) => {
      const lvl = s.startLevel + i + 1;
      per.set(lvl, [...(per.get(lvl) ?? []), t - prev]);
      prev = t;
    });
  }
  const meds = [...per.entries()].filter(([, v]) => v.length >= 10).sort((a, b) => a[0] - b[0]).map(([l, v]) => [l, median(v)] as [number, number]);
  const mm = median(meds.map((x) => x[1]));
  d2[m.id] = Object.fromEntries(meds);
  console.log(`  ${m.id.padEnd(9)} median ${mm.toFixed(1)} s: ${meds.map(([l, v]) => `${l + 1}:${v.toFixed(0)}${v > 2 * mm ? '*' : ''}`).join(' ')}`);
}
out.d2 = d2;

// D4: per prestige run, DM gained, cash multiplier at the start and Starting Size spend.
console.log('D4  per run (average, optimizer, binge, seed 1): minutes, DM, cash mult at start, Starting Size cash share');
const src = direct.results.find((r) => r.spec.skill === 'average' && r.spec.policy === 'optimizer' && r.spec.pattern === 'binge' && r.spec.seed === 1)!;
const d4 = src.runs.map((run) => {
  const rs = src.rounds.filter((x) => x.run === run.run);
  const spend = rs.flatMap((x) => x.purchases);
  const ss = spend.filter((p) => p.key === 'u-startSize').reduce((a, p) => a + p.cost, 0);
  const all = spend.reduce((a, p) => a + p.cost, 0);
  const snap = src.snapshots.find((s) => s.label === `run ${run.run} suburb`);
  const mult = snap ? eco.globalCashMult(snap.save as SaveData) : NaN;
  const row = { run: run.run, minutes: (run.end - run.start) / 60, dm: run.dm, mult, ssShare: all ? ss / all : 0, rounds: run.rounds };
  console.log(`  run ${run.run}: ${row.minutes.toFixed(0)} min, ${row.rounds} rounds, +${run.dm} DM, cash x${mult.toFixed(2)} at start, Starting Size ${(row.ssShare * 100).toFixed(0)}% of spend`);
  return row;
});
out.d4 = d4;

// D3 + D5: Layer A at the map-entry saves of run 1 (average optimizer, seed 1).
const snaps = src.snapshots.filter((s) => s.label.startsWith('run 1') || s.label.startsWith('run 2'));
const SEEDS = 16;
type Var = { label: string; params?: Record<string, number>; helpers?: boolean };
const vars: Var[] = [{ label: 'frontier 3 (now)' }, { label: 'frontier 2', params: { 'SIZE.frontierBonus': 2 } }, { label: 'frontier 1', params: { 'SIZE.frontierBonus': 1 } }, { label: 'no helpers', helpers: false }];
const jobs: { kind: 'round'; spec: RoundSpec; params?: Record<string, number> }[] = [];
const index: { snap: string; v: string; skill: string; at: number }[] = [];
for (const snap of snaps)
  for (const v of vars)
    for (const skill of SKILL_NAMES) {
      const s = structuredClone(snap.save) as SaveData;
      if (v.helpers === false) s.helpers = 0;
      const map = (Object.keys(s.maps) as (keyof typeof s.maps)[]).filter((k) => s.maps[k]).pop()!;
      const cfg = eco.buildRoundConfig(s, map);
      index.push({ snap: snap.label, v: v.label, skill, at: jobs.length });
      for (let k = 0; k < SEEDS; k++) jobs.push({ kind: 'round', spec: { cfg, skill, seed: 7000 + k }, params: v.params });
    }
const res = await runJobs<RoundResult>(jobs);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const stat = (snap: string, v: string, skill: string) => {
  const i = index.find((x) => x.snap === snap && x.v === v && x.skill === skill)!;
  const rs = res.slice(i.at, i.at + SEEDS);
  return { cash: mean(rs.map((r) => r.cashByCombo[0])), level: mean(rs.map((r) => r.endLevel)), spl: mean(rs.map((r) => (r.endLevel > r.startLevel ? r.played / (r.endLevel - r.startLevel) : r.played))) };
};
console.log(`D3  frontier bonus (now ${SIZE.frontierBonus}): strong/weak and strong/average cash, average end size and s/size (median over ${snaps.length} states)`);
const d3: Record<string, unknown>[] = [];
for (const v of vars.slice(0, 3)) {
  const sw = median(snaps.map((s) => stat(s.label, v.label, 'strong').cash / Math.max(1, stat(s.label, v.label, 'weak').cash)));
  const sa = median(snaps.map((s) => stat(s.label, v.label, 'strong').cash / Math.max(1, stat(s.label, v.label, 'average').cash)));
  const lv = median(snaps.map((s) => stat(s.label, v.label, 'average').level - stat(s.label, vars[0].label, 'average').level));
  const spl = median(snaps.map((s) => stat(s.label, v.label, 'average').spl));
  d3.push({ v: v.label, strongWeak: sw, strongAvg: sa, dLevelAvg: lv, splAvg: spl });
  console.log(`  ${v.label.padEnd(17)} strong/weak x${sw.toFixed(1)}, strong/average x${sa.toFixed(2)}, average end size ${lv >= 0 ? '+' : ''}${lv.toFixed(2)}, ${spl.toFixed(1)} s/size`);
}
out.d3 = d3;
console.log('D5  helpers on vs off: main-hole end size and total cash (median over states with helpers)');
const withHelpers = snaps.filter((s) => (s.save as SaveData).helpers > 0);
const d5 = SKILL_NAMES.map((skill) => {
  const dl = median(withHelpers.map((s) => stat(s.label, vars[0].label, skill).level - stat(s.label, 'no helpers', skill).level));
  const dc = median(withHelpers.map((s) => stat(s.label, vars[0].label, skill).cash / Math.max(1, stat(s.label, 'no helpers', skill).cash) - 1));
  console.log(`  ${skill.padEnd(8)} end size ${dl >= 0 ? '+' : ''}${dl.toFixed(2)}, cash ${dc >= 0 ? '+' : ''}${(dc * 100).toFixed(1)}% with helpers (${withHelpers.length} states)`);
  return { skill, dLevel: dl, dCash: dc };
});
out.d5 = d5;
writeFileSync('balance/data/diagnosis.json', JSON.stringify(out, null, 1));
