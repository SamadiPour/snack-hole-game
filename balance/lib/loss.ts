/**
 * Phase 3 loss: weighted target violations over Layer B playthroughs, plus a penalty on how far
 * each parameter moved from the current design. Each check yields a miss >= 0 per skill (0 inside
 * the target, else the relative distance past it, capped at 5); average and weak count 1.5x.
 */
import { MAPS } from '../../src/config/balance';
import type { Skill } from './bots';
import * as M from './metrics';
import { SEARCH, applyParams, resetParams } from './params';
import type { PlayResult } from './progress';

export const SKILL_WEIGHT: Record<Skill, number> = { strong: 1, average: 1.5, weak: 1.5 };

export interface TargetRange {
  lo?: number;
  hi?: number;
}

/** Relative miss outside [lo, hi] (0 inside), capped at 5. */
export function miss(v: number, t: TargetRange): number {
  if (!Number.isFinite(v)) return 5;
  let m = 0;
  if (t.lo !== undefined && v < t.lo) m = t.lo / Math.max(1e-9, v) - 1;
  if (t.hi !== undefined && v > t.hi) m = v / t.hi - 1;
  return Math.min(5, m);
}

/** Play time (s) to finish, per skill: the user's "more than 1-1.5 h casually", comparable games 3-5 h. */
export const LENGTH: Record<Skill, TargetRange> = { strong: { lo: 2700, hi: 9000 }, average: { lo: 5400, hi: 14400 }, weak: { lo: 9000, hi: 21600 } };
export const FIRST_SINGULARITY: Record<Skill, TargetRange> = { strong: { lo: 900, hi: 2700 }, average: { lo: 1800, hi: 3600 }, weak: { lo: 2400, hi: 5400 } };

export interface CheckDef {
  id: string;
  weight: number;
  label: string;
  /** Miss per skill (skills it does not apply to are left out). */
  eval: (by: (s: Skill) => PlayResult[], all: PlayResult[]) => Partial<Record<Skill, { value: number; miss: number }>>;
}

const SKILLS: Skill[] = ['strong', 'average', 'weak'];
const finishOf = (r: PlayResult) => r.finish ?? 12 * 3600;
const perSkill = (f: (s: Skill) => { value: number; miss: number }, skills = SKILLS) => Object.fromEntries(skills.map((s) => [s, f(s)])) as Partial<Record<Skill, { value: number; miss: number }>>;

export const CHECKS: CheckDef[] = [
  { id: 'length', weight: 4, label: 'time to finish (h)', eval: (by) => perSkill((s) => { const v = M.median(by(s).map(finishOf)); return { value: v / 3600, miss: miss(v, LENGTH[s]) }; }) },
  { id: 'noticeable', weight: 2.5, label: 'longest stretch without a noticeable upgrade (rounds)', eval: (by) => perSkill((s) => { const v = M.median(by(s).map((r) => M.noticeableStretch(r, 600).rounds)); return { value: v, miss: miss(v, { hi: 3 }) }; }) },
  { id: 'content', weight: 2, label: 'longest gap between new content (min)', eval: (by) => perSkill((s) => { const v = M.median(by(s).map((r) => M.contentGap(r).gap)); return { value: v / 60, miss: miss(v, { hi: 1200 }) }; }) },
  { id: 'replay', weight: 2.5, label: 'replay time vs previous run', eval: (by) => perSkill((s) => { const v = M.median(by(s).flatMap((r) => M.replayRatios(r).map((x) => x.ratio))); return { value: v, miss: Number.isNaN(v) ? 0 : miss(v, { hi: 0.5 }) }; }) },
  { id: 'firstSingularity', weight: 1.5, label: 'first Singularity (min)', eval: (by) => perSkill((s) => { const v = M.median(by(s).map((r) => M.milestones(r).singularity)); return { value: v / 60, miss: miss(v, FIRST_SINGULARITY[s]) }; }) },
  { id: 'weakProgress', weight: 2, label: 'weak: rounds in a row without progress', eval: (by) => perSkill((s) => { const v = M.median(by(s).map(M.noProgressStretch)); return { value: v, miss: miss(v, { hi: 3 }) }; }, ['weak']) },
  {
    id: 'early',
    weight: 1.5,
    label: 'early: first purchase (min), tracks by 4:00, affordable share in 30 min',
    eval: (by) =>
      perSkill((s) => {
        const first = M.median(by(s).map((r) => M.milestones(r).firstPurchase));
        const tracks = M.median(by(s).map((r) => M.tracksBy(r, 240)));
        const aff = M.median(by(s).map((r) => M.earlyAffordable(r, 1800)));
        return { value: first / 60, miss: miss(first, { hi: 90 }) + miss(tracks, { lo: 3 }) + miss(aff, { lo: 0.9 }) };
      }),
  },
  {
    id: 'endgame',
    weight: 3,
    label: 'after the finish: median prestige run (min) and DM growth per run',
    eval: (by) =>
      perSkill((s) => {
        const len: number[] = [];
        const growth: number[] = [];
        for (const r of by(s)) {
          if (r.finish === null) continue;
          const post = r.runs.filter((x) => x.start >= r.finish! && x.start < r.finish! + 3600 && x.dm > 0);
          len.push(...post.map((x) => x.end - x.start));
          for (let i = 1; i < post.length; i++) growth.push(post[i].dm / Math.max(1, post[i - 1].dm));
        }
        const l = M.median(len);
        const g = growth.length ? Math.max(...growth) : 1;
        return { value: l / 60, miss: (Number.isNaN(l) ? 0 : miss(l, { lo: 600 })) + miss(g, { hi: 2 }) };
      }),
  },
  {
    id: 'firstVisit',
    weight: 2,
    label: 'maps whose first visit reaches the goal in under 2 rounds (count)',
    eval: (by) =>
      perSkill((s) => {
        let short = 0;
        for (const m of ['farm', 'downtown', 'harbor', 'airport', 'spaceport', 'moon'] as const) {
          const v = M.median(by(s).map((r) => M.firstVisitRounds(r)[m] ?? NaN));
          if (v < 2) short++;
        }
        return { value: short, miss: short / 2 };
      }, ['average', 'weak']),
  },
  {
    // The shop never runs dry before the finish: something left to buy, not trivially cheap.
    id: 'shop',
    weight: 3,
    label: 'shop before the finish: cheapest option left (rounds of income), sold-out visits, buys per visit',
    eval: (by) =>
      perSkill((s) => {
        const rs = by(s).flatMap((r) => M.preFinish(r).filter((x) => x.clock > 600));
        const ratio = M.median(rs.map((x) => (Number.isFinite(x.cheapest) ? x.cheapest / Math.max(1, x.cash) : 10)));
        const soldOut = rs.length ? rs.filter((x) => !Number.isFinite(x.cheapest)).length / rs.length : 0;
        const buys = M.median(rs.map((x) => x.purchases.length));
        return { value: ratio, miss: miss(ratio, { lo: 0.25 }) + miss(1 - soldOut, { lo: 0.98 }) * 5 + miss(buys, { hi: 4 }) };
      }),
  },
  { id: 'stall', weight: 4, label: 'playthroughs hitting the 150-round cap', eval: (by) => perSkill((s) => { const v = by(s).filter((r) => r.stalled?.includes('150 rounds')).length / Math.max(1, by(s).length); return { value: v, miss: v }; }) },
  {
    id: 'perceptible',
    weight: 1,
    label: 'purchases adding < 5% cash and < 0.5 size (model)',
    eval: (by) =>
      perSkill((s) => {
        const ps = by(s).flatMap((r) => M.preFinish(r).flatMap((x) => x.purchases)).filter((p) => p.key !== 'u-offline');
        const v = ps.length ? ps.filter((p) => p.dIncome < 0.05 && p.dLevel < 0.5).length / ps.length : 0;
        return { value: v, miss: miss(v, { hi: 0.25 }) };
      }, ['average']),
  },
];

/** Single-stat (Starting Size) and returner checks, from their own playthroughs. */
export const EXTRA: CheckDef[] = [
  {
    // Prices follow the newest map's value multiplier, so a map worth less than the one before
    // would make the shop cheaper on unlocking it.
    id: 'mapValues',
    weight: 3,
    label: 'map value multipliers rise map by map (relative drops, summed)',
    eval: () =>
      perSkill(() => {
        let drop = 0;
        for (let i = 1; i < MAPS.length; i++) drop += Math.max(0, MAPS[i - 1].valueMul / MAPS[i].valueMul - 1);
        return { value: drop, miss: Math.min(5, drop * 2) };
      }, ['average']),
  },
  { id: 'singleStat', weight: 2, label: 'single-stat Starting Size stalls', eval: (_, all) => perSkill(() => { const rs = all.filter((r) => r.spec.policy === 'single'); const v = rs.filter((r) => r.stalled).length / Math.max(1, rs.length); return { value: v, miss: v }; }, ['average']) },
  {
    id: 'offline',
    weight: 1,
    label: 'returner: offline share of cash',
    eval: (_, all) =>
      perSkill((s) => {
        const rs = all.filter((r) => r.spec.pattern === 'returner' && r.spec.skill === s);
        const v = M.median(rs.map((r) => r.offlineTotal / Math.max(1, r.offlineTotal + r.roundTotal)));
        return { value: v, miss: miss(v, { hi: 0.25 }) };
      }),
  },
];

export interface LossResult {
  total: number;
  violation: number;
  change: number;
  parts: { id: string; weight: number; label: string; bySkill: Partial<Record<Skill, { value: number; miss: number }>>; score: number }[];
}

/** Normalised distance of each searched parameter from the baseline (log scale where the range is). */
export function changeOf(values: Record<string, number>, baseline: Record<string, number>): number {
  let c = 0;
  for (const p of SEARCH) {
    const v = values[p.id] ?? baseline[p.id];
    const b = baseline[p.id];
    const d = p.log ? Math.log(v / b) / Math.log(p.hi / p.lo) : (v - b) / (p.hi - p.lo);
    c += d * d;
  }
  return c;
}

export function loss(results: PlayResult[], values: Record<string, number>, baseline: Record<string, number>, lambda = 2): LossResult {
  // Checks that read the config (mapValues) see the candidate's values; restored below.
  applyParams(values);
  try {
    return lossOf(results, values, baseline, lambda);
  } finally {
    resetParams();
  }
}

function lossOf(results: PlayResult[], values: Record<string, number>, baseline: Record<string, number>, lambda: number): LossResult {
  const core = results.filter((r) => r.spec.pattern === 'binge' && r.spec.policy !== 'single');
  const by = (s: Skill) => core.filter((r) => r.spec.skill === s);
  const parts = [...CHECKS, ...EXTRA].map((c) => {
    const bySkill = c.eval(by, results);
    let score = 0;
    for (const [s, v] of Object.entries(bySkill)) score += c.weight * SKILL_WEIGHT[s as Skill] * v!.miss;
    return { id: c.id, weight: c.weight, label: c.label, bySkill, score };
  });
  const violation = parts.reduce((a, p) => a + p.score, 0);
  const change = lambda * changeOf(values, baseline);
  return { total: violation + change, violation, change, parts };
}
