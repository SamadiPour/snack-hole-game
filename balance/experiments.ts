/**
 * Paired Layer A experiments at real progression states: the saves an average optimizer had when
 * it first entered each map (balance/data/layerB-direct.json). At each one:
 *
 *   - upgrade feel: every purchase on offer, bought vs not, same world seeds, every skill;
 *     change in cash per round (all multipliers), end size and seconds per level;
 *   - skill gap: strong / average / weak cash per round at the same state.
 *
 *   npx tsx balance/experiments.ts [--seeds 12]     # writes balance/data/experiments.json
 *   npx tsx balance/experiments.ts --tag tuned     # states and params from layerB-direct-tuned.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { ABILITIES, HELPERS, UPGRADES } from '../src/config/balance';
import * as eco from '../src/core/economy';
import type { SaveData } from '../src/core/save';
import { SKILL_NAMES, type Skill } from './lib/bots';
import { gitCommit } from './lib/meta';
import { adjustCfg, applyParams } from './lib/params';
import { runJobs } from './lib/pool';
import type { PlayResult } from './lib/progress';
import { goldFactor, type RoundResult, type RoundSpec } from './lib/round';

const args = process.argv.slice(2);
const SEEDS = args.includes('--seeds') ? Number(args[args.indexOf('--seeds') + 1]) : 12;
const TAG = args.includes('--tag') ? args[args.indexOf('--tag') + 1] : '';
const suffix = TAG ? `-${TAG}` : '';

interface Variant {
  key: string;
  name: string;
  apply: (s: SaveData) => void;
}

function variants(s: SaveData): Variant[] {
  const out: Variant[] = [];
  for (const u of UPGRADES) {
    if (u.id === 'offline' || s.upgrades[u.id] >= u.max) continue;
    out.push({ key: `u-${u.id}`, name: `${u.name} ${s.upgrades[u.id]}→${s.upgrades[u.id] + 1}`, apply: (t) => (t.upgrades[u.id] += 1) });
  }
  if (s.helpers < HELPERS.countCosts.length) out.push({ key: 'h-count', name: `Helpers ${s.helpers}→${s.helpers + 1}`, apply: (t) => (t.helpers += 1) });
  if (s.helpers > 0 && s.helperLevel < HELPERS.levelMax) out.push({ key: 'h-level', name: `Helper training ${s.helperLevel}→${s.helperLevel + 1}`, apply: (t) => (t.helperLevel += 1) });
  for (const a of ABILITIES) if (s.abilities[a.id] < a.maxLevel) out.push({ key: `a-${a.id}`, name: `${a.name} ${s.abilities[a.id]}→${s.abilities[a.id] + 1}`, apply: (t) => (t.abilities[a.id] += 1) });
  return out;
}

const income = (s: SaveData, r: RoundResult) => r.cashByCombo[s.upgrades.combo] * eco.globalCashMult(s) * goldFactor(eco.goldChance(s.upgrades.golden), r.goldShare);
const spl = (r: RoundResult) => (r.endLevel > r.startLevel ? r.played / (r.endLevel - r.startLevel) : r.played);

const data = JSON.parse(readFileSync(`balance/data/layerB-direct${suffix}.json`, 'utf8')) as { results: PlayResult[]; params?: Record<string, number> | null };
const PARAMS = data.params ?? undefined;
applyParams(PARAMS);
const src = data.results.find((r) => r.spec.skill === 'average' && r.spec.policy === 'optimizer' && r.spec.pattern === 'binge' && r.spec.seed === 1)!;
const snaps = src.snapshots.filter((s) => src.finish === null || s.clock <= src.finish);

interface Group {
  snap: string;
  variant: string;
  key: string;
  skill: Skill;
  before: number;
  after: number;
}
const specs: RoundSpec[] = [];
const groups: { g: Group; save: SaveData; mod: SaveData; at: number }[] = [];
for (const snap of snaps) {
  const save = snap.save;
  save.selectedMap = (Object.keys(save.maps) as (keyof typeof save.maps)[]).filter((m) => save.maps[m]).pop()!;
  const list: (Variant | null)[] = [null, ...variants(save)];
  for (const v of list) {
    const mod = structuredClone(save);
    v?.apply(mod);
    const cfg = adjustCfg(eco.buildRoundConfig(mod, save.selectedMap), mod);
    for (const skill of SKILL_NAMES) {
      groups.push({ g: { snap: snap.label, variant: v?.name ?? 'baseline', key: v?.key ?? 'baseline', skill, before: 0, after: 0 }, save, mod, at: specs.length });
      for (let k = 0; k < SEEDS; k++) specs.push({ cfg, skill, seed: 9000 + k, detail: v === null });
    }
  }
}
console.error(`experiments: ${snaps.length} states, ${specs.length} rounds`);
const res = await runJobs<RoundResult>(specs.map((spec) => ({ kind: 'round' as const, spec, params: PARAMS })));
const out: Record<string, unknown>[] = [];
const baseFor = new Map<string, RoundResult[]>();
for (const { g, mod, at } of groups) {
  const rs = res.slice(at, at + SEEDS);
  if (g.key === 'baseline') baseFor.set(`${g.snap}/${g.skill}`, rs);
  const base = baseFor.get(`${g.snap}/${g.skill}`)!;
  const save = groups.find((x) => x.g.snap === g.snap && x.g.key === 'baseline')!.save;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const inc0 = mean(base.map((r) => income(save, r)));
  const inc1 = mean(rs.map((r) => income(mod, r)));
  out.push({
    snap: g.snap,
    variant: g.variant,
    key: g.key,
    skill: g.skill,
    map: mod.selectedMap,
    income: inc1,
    dIncome: inc0 > 0 ? inc1 / inc0 - 1 : 0,
    endLevel: mean(rs.map((r) => r.endLevel)),
    dLevel: mean(rs.map((r) => r.endLevel)) - mean(base.map((r) => r.endLevel)),
    dSecPerLevel: mean(rs.map(spl)) / mean(base.map(spl)) - 1,
    pct: mean(rs.map((r) => r.pct)),
    played: mean(rs.map((r) => r.played)),
    goal: mean(rs.map((r) => (r.endLevel >= eco.mapDef(mod.selectedMap).goal ? 1 : 0))),
    detail: g.key === 'baseline' ? rs.map((r) => r.detail) : undefined,
  });
}
writeFileSync(`balance/data/experiments${suffix}.json`, JSON.stringify({ commit: gitCommit(), seeds: SEEDS, params: PARAMS ?? null, rows: out }));
console.error(`experiments: wrote ${out.length} rows`);
