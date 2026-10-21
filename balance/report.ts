/**
 * Builds the balance report from the data the other tools wrote:
 *
 *   balance/data/layerB-direct.json   playthroughs, real Layer A round for every round
 *   balance/data/layerB-model*.json   the same and fresh seeds through the fitted model
 *   balance/data/experiments.json     paired upgrade / skill experiments
 *   balance/data/model-error.json, parity.json, balance/calibration/rounds.jsonl (if any)
 *
 *   npx tsx balance/report.ts         # writes balance/reports/<timestamp>/report.md + charts/
 *   npx tsx balance/report.ts --notes notes.md   # with a hand-written summary at the top
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { MAPS, OFFLINE, UPGRADES } from '../src/config/balance';
import * as eco from '../src/core/economy';
import { SKILL_NAMES, SKILLS, type Skill } from './lib/bots';
import { gitCommit, stamp } from './lib/meta';
import * as M from './lib/metrics';
import type { PlayResult } from './lib/progress';
import type { RoundDetail } from './lib/round';
import { barChart, dotChart, fmtNum, lineChart, slot } from './lib/svg';

const read = <T>(p: string): T | null => (existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as T) : null);
const TAG = process.argv.includes('--tag') ? process.argv[process.argv.indexOf('--tag') + 1] : '';
const sfx = TAG ? `-${TAG}` : '';
type PlayFile = { commit: string; created: string; seeds: number[]; params?: Record<string, number> | null; results: PlayResult[] };
const direct = read<PlayFile>(`balance/data/layerB-direct${sfx}.json`);
if (!direct) throw new Error('run balance/layer-b.ts --mode direct first');
const modelSame = read<PlayFile>(`balance/data/layerB-model${sfx}.json`);
const modelFresh = read<PlayFile>(`balance/data/layerB-model-fresh${sfx}.json`);
const experiments = read<{ commit: string; seeds: number; rows: ExpRow[] }>(`balance/data/experiments${sfx}.json`);
const modelErr = read<{ commit: string; n: number; err: Record<string, Record<string, number>> }>('balance/data/model-error.json');
const parity = read<{ lines: string[] }>('balance/data/parity.json');
const calib = existsSync('balance/calibration/rounds.jsonl')
  ? readFileSync('balance/calibration/rounds.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as CalibRound).filter((r) => r.port !== '5180')
  : [];

interface ExpRow {
  snap: string;
  variant: string;
  key: string;
  skill: Skill;
  map: string;
  income: number;
  dIncome: number;
  endLevel: number;
  dLevel: number;
  dSecPerLevel: number;
  pct: number;
  played: number;
  goal: number;
  detail?: (RoundDetail | undefined)[];
}
interface CalibRound {
  port: string;
  map: string;
  cfg: eco.RoundConfig;
  cash: number;
  startLevel: number;
  endLevel: number;
  played: number;
  pct: number;
  hubSeconds: number | null;
  endReason: string;
}

const dir = `balance/reports/${stamp()}${sfx}`;
mkdirSync(`${dir}/charts`, { recursive: true });
const charts: string[] = [];
const chart = (name: string, svg: string, alt: string) => {
  writeFileSync(`${dir}/charts/${name}.svg`, svg);
  charts.push(name);
  return `![${alt}](charts/${name}.svg)`;
};

const R = direct.results;
const main = R.filter((r) => r.spec.single === undefined);
const of = (skill: Skill, policy?: string, pattern = 'binge') => main.filter((r) => r.spec.skill === skill && (policy === undefined || r.spec.policy === policy) && r.spec.pattern === pattern);
const hm = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m` : 'never');
const mins = (s: number) => (Number.isFinite(s) ? `${(s / 60).toFixed(1)} min` : 'never');
const pct = (x: number, d = 0) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : '-');
const real = ['optimizer', 'balanced', 'casual'];

// ------------------------------------------------------------------ checks
interface Check {
  id: string;
  area: string;
  name: string;
  target: string;
  values: Partial<Record<Skill | 'all', string>>;
  pass: boolean;
  /** 0 = pass; higher = worse (weight x relative miss). */
  severity: number;
  cause: string;
}
const checks: Check[] = [];
const sev = (weight: number, miss: number) => weight * Math.min(5, Math.max(0, miss));
const skillVals = (f: (s: Skill) => string) => Object.fromEntries(SKILL_NAMES.map((s) => [s, f(s)])) as Record<Skill, string>;

// Total length: average finish 1.5-4 h; strong not under 1 h; weak finishes.
{
  const fin = (s: Skill) => M.median(real.flatMap((p) => of(s, p).map((r) => r.finish ?? Infinity)));
  const a = fin('average');
  const miss = a < 5400 ? 5400 / a - 1 : a > 14400 ? a / 14400 - 1 : 0;
  checks.push({
    id: 'length',
    area: 'Between runs',
    name: 'Total length to the first Moon Base goal (median, optimizer / balanced / casual, binge)',
    target: 'average 1.5–4 h; weak finishes; strong ≥ 1 h',
    values: skillVals((s) => hm(fin(s))),
    pass: miss === 0 && Number.isFinite(fin('weak')) && fin('strong') >= 3600,
    severity: sev(3, miss) + (Number.isFinite(fin('weak')) ? 0 : 6) + (fin('strong') < 3600 ? sev(1, 3600 / fin('strong') - 1) : 0),
    cause: 'Weak bots stall at goals that need a full clear (Harbor, Moon Base) or at sparse landmark bands; see "Where progression stalls".',
  });
}
// Early: first purchase, 3 tracks by 4 min.
{
  const first = (s: Skill) => M.median(main.filter((r) => r.spec.skill === s).map((r) => M.milestones(r).firstPurchase));
  const by4 = (s: Skill) => M.median(main.filter((r) => r.spec.skill === s).map((r) => M.tracksBy(r, 240)));
  const worst = Math.min(...SKILL_NAMES.map(by4));
  checks.push({
    id: 'early-basics',
    area: 'Between runs',
    name: 'Basic upgrades early: first purchase, distinct tracks bought by 4:00 (median)',
    target: 'first ≤ 1.5 min, ≥ 3 tracks by 4 min',
    values: skillVals((s) => `${mins(first(s))}, ${by4(s)} tracks`),
    pass: worst >= 3 && Math.max(...SKILL_NAMES.map(first)) <= 90,
    severity: sev(2, 3 / Math.max(0.5, worst) - 1) + sev(1, Math.max(...SKILL_NAMES.map(first)) / 90 - 1),
    cause: 'Starting Size $45 and Speed $60 are cheap enough after round 1; later tracks show up by run cash (unlockAt).',
  });
}
{
  const aff = (s: Skill) => M.median(main.filter((r) => r.spec.skill === s).map((r) => M.earlyAffordable(r, 1800)));
  const worst = Math.min(...SKILL_NAMES.map(aff));
  checks.push({
    id: 'early-afford',
    area: 'Between runs',
    name: 'First 30 min: rounds ending with a purchase, or one affordable after the next round',
    target: '≥ 90% of rounds',
    values: skillVals((s) => pct(aff(s))),
    pass: worst >= 0.9,
    severity: sev(2, 0.9 / Math.max(0.05, worst) - 1),
    cause: 'Cost growth of 3.5–8x per level on the capped tracks outpaces income between map unlocks.',
  });
}
// Mid game: noticeable upgrade every <= 3 rounds.
{
  const st = (s: Skill) => M.median(real.flatMap((p) => of(s, p).map((r) => M.noticeableStretch(r, 600).rounds)));
  const worst = Math.max(...SKILL_NAMES.map(st));
  checks.push({
    id: 'noticeable',
    area: 'Between runs',
    name: 'Longest stretch without a noticeable upgrade after 10 min (rounds; median over playthroughs)',
    target: '≤ 3 rounds (noticeable = +10% cash per round, new ability, new map or new size tier)',
    values: skillVals((s) => `${st(s)} rounds`),
    pass: worst <= 3,
    severity: sev(2.5, worst / 3 - 1),
    cause: 'Maps whose goal sits at the XP ceiling: rounds repeat with the same end size while every affordable upgrade adds < 10%.',
  });
}
// New content every 10-20 min.
{
  const gap = (s: Skill) => M.median(real.flatMap((p) => of(s, p).map((r) => M.contentGap(r).gap)));
  const worst = Math.max(...SKILL_NAMES.map(gap));
  checks.push({
    id: 'content',
    area: 'Between runs',
    name: 'Longest gap between new content (new map, prop type, upgrade track, Singularity, tier) before the finish',
    target: '≤ 20 min',
    values: skillVals((s) => mins(gap(s))),
    pass: worst <= 1200,
    severity: sev(2, worst / 1200 - 1),
    cause: 'Long stays on one map: the stall at a goal, or a prestige run that replays maps with nothing new to eat.',
  });
}
// Slow first hour.
{
  const slow = (s: Skill) => M.median(real.flatMap((p) => of(s, p).map((r) => Math.min(...M.firstHourGrowth(r)))));
  const worst = Math.min(...SKILL_NAMES.map(slow));
  checks.push({
    id: 'first-hour',
    area: 'Between runs',
    name: 'Slow first hour: worst 10-min window growth of median cash per round, first 60 min',
    target: '≥ x1.15 per 10 min',
    values: skillVals((s) => `x${slow(s).toFixed(2)}`),
    pass: worst >= 1.15,
    severity: sev(2, 1.15 / Math.max(0.2, worst) - 1),
    cause: 'Income per round plateaus on a map until its goal falls; the next map multiplies it.',
  });
}
// Upgrade perceptibility (experiments).
let feelRows: { key: string; name: string; skill: Skill; d: number; dl: number; ds: number; n: number }[] = [];
if (experiments) {
  const groups = new Map<string, ExpRow[]>();
  for (const r of experiments.rows) if (r.key !== 'baseline') {
    const k = `${r.key}/${r.skill}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  feelRows = [...groups.entries()].map(([k, rs]) => ({
    key: k.split('/')[0],
    name: rs[0].variant.replace(/ \d+→\d+$/, ''),
    skill: k.split('/')[1] as Skill,
    d: M.median(rs.map((r) => r.dIncome)),
    dl: M.median(rs.map((r) => r.dLevel)),
    ds: M.median(rs.map((r) => r.dSecPerLevel)),
    n: rs.length,
  }));
  const avg = feelRows.filter((r) => r.skill === 'average');
  const weak = avg.filter((r) => r.d < 0.05 && r.dl < 0.5 && r.ds > -0.05);
  checks.push({
    id: 'perceptible',
    area: 'Between runs',
    name: 'Upgrades below 5% (median over progression states: cash, end size < +0.5, s/level > -5%), average bot',
    target: 'none',
    values: { all: weak.map((r) => `${r.name} ${pct(r.d, 1)}`).join(', ') || 'none' },
    pass: weak.length === 0,
    severity: sev(1.5, weak.length / 2),
    cause: 'Linear effects on capped tracks (+8% speed, +1% golden, combo cap only reachable at 51-swallow streaks); helpers paying 60% of tiny props.',
  });
}
// Upgrade choice: single-stat, distinct tracks.
{
  const sweep = R.filter((r) => r.spec.single !== undefined);
  const stalls = [...new Set(sweep.filter((r) => r.stalled).map((r) => r.spec.single!))];
  const opt = M.median(of('average', 'optimizer').map((r) => r.finish ?? Infinity));
  const fast = sweep.filter((r) => r.finish !== null && r.finish < 0.8 * opt).map((r) => r.spec.single!);
  checks.push({
    id: 'single-stat',
    area: 'Between runs',
    name: 'Single-stat dumping (average, binge): stalls or trivializes',
    target: 'no target stalls; none finishes < 0.8x optimizer',
    values: { all: `stall: ${stalls.join(', ') || 'none'}; too fast: ${[...new Set(fast)].join(', ') || 'none'}` },
    pass: stalls.length === 0 && fast.length === 0,
    severity: sev(1.5, stalls.length / 3) + sev(1.5, fast.length),
    cause: 'Goals need several tracks at once (Starting Size to reach the map ceiling, Mega Mouth past Harbor): any single stat stalls.',
  });
  const tracks = (s: Skill) => M.median(of(s, 'optimizer').map((r) => new Set(M.preFinish(r).flatMap((x) => x.purchases.map((p) => p.key))).size));
  const total = UPGRADES.length - 1 + 2 + 3;
  checks.push({
    id: 'choice',
    area: 'Between runs',
    name: 'Optimizer buys a spread of tracks (distinct tracks bought before the finish)',
    target: `≥ 10 of ${total}`,
    values: skillVals((s) => `${tracks(s)}`),
    pass: Math.min(...SKILL_NAMES.map(tracks)) >= 10,
    severity: sev(1, 10 / Math.max(1, Math.min(...SKILL_NAMES.map(tracks))) - 1),
    cause: 'Tracks that never pay for themselves at current prices.',
  });
}
// Prestige.
{
  const first = (s: Skill) => M.median(real.flatMap((p) => of(s, p).map((r) => M.milestones(r).singularity)));
  const a = first('average');
  checks.push({
    id: 'prestige-first',
    area: 'Prestige',
    name: 'First Singularity (median)',
    target: '30–60 min (average)',
    values: skillVals((s) => hm(first(s))),
    pass: a >= 1800 && a <= 3600,
    severity: sev(2, a > 3600 ? a / 3600 - 1 : a < 1800 ? 1800 / a - 1 : 0),
    cause: 'Singularity needs Downtown unlocked plus 3 DM ($8.6M lifetime cash) and a stall; the Farm and Downtown goals set when.',
  });
  const ratios = (s: Skill) => real.flatMap((p) => of(s, p).flatMap((r) => M.replayRatios(r).map((x) => x.ratio)));
  const worst = Math.max(...SKILL_NAMES.map((s) => M.median(ratios(s))));
  checks.push({
    id: 'replay',
    area: 'Prestige',
    name: "Replaying cleared content: next run's time to the previous run's furthest map, vs the previous run",
    target: '≤ 50%',
    values: skillVals((s) => `median ${pct(M.median(ratios(s)))}, worst ${pct(Math.max(...ratios(s).filter(Number.isFinite)))}`),
    pass: worst <= 0.5,
    severity: sev(3, worst / 0.5 - 1),
    cause: 'A Singularity resets every cash upgrade; Dense Core / Event Horizon / Head Start give back too little of it early on.',
  });
}
// Within run (direct rounds with detail).
const details = (s: Skill) => main.filter((r) => r.spec.skill === s && r.spec.pattern === 'binge').flatMap((r) => M.preFinish(r).filter((x) => x.detail).map((x) => ({ r: x, d: x.detail! })));
{
  const fe = (s: Skill) => M.median(details(s).map((x) => x.d.firstEat ?? Infinity));
  const worst = Math.max(...SKILL_NAMES.map(fe));
  checks.push({
    id: 'dead-start',
    area: 'Within a run',
    name: 'No dead start: first swallow (median s into the round)',
    target: '≤ 1.5 s',
    values: skillVals((s) => `${fe(s).toFixed(1)} s`),
    pass: worst <= 1.5,
    severity: sev(1.5, worst / 1.5 - 1),
    cause: 'Start snacks ring the start point on every map.',
  });
  const gaps = (s: Skill, early: boolean) => details(s).flatMap((x) => {
    let t = 0;
    return x.d.newTypeGaps.filter((g) => {
      t += g;
      return early ? t <= x.r.wall / 2 : t > x.r.wall / 2;
    });
  });
  const e = (s: Skill) => M.median(gaps(s, true));
  const l = (s: Skill) => M.median(gaps(s, false));
  const ok = SKILL_NAMES.every((s) => e(s) <= 30 && !(l(s) < e(s)));
  checks.push({
    id: 'tiers',
    area: 'Within a run',
    name: 'New kind of prop edible: median gap, first half / second half of a round',
    target: 'first half ≤ 30 s (every 15–30 s), later gaps longer',
    values: skillVals((s) => `${e(s).toFixed(0)} s / ${l(s).toFixed(0)} s`),
    pass: ok,
    severity: ok ? 0 : sev(1, Math.max(...SKILL_NAMES.map((s) => e(s) / 30 - 1))) + 0.5,
    cause: 'Prop sizes per map (size ladders) and XP per level.',
  });
  const vis = (s: Skill) => M.median(details(s).map((x) => x.d.nextGoalShare));
  const worstVis = Math.min(...SKILL_NAMES.map(vis));
  checks.push({
    id: 'next-goal',
    area: 'Within a run',
    name: 'Next goal on screen: share of round time with a prop just too big (≤ 2 sizes up) in view',
    target: '≥ 70%',
    values: skillVals((s) => pct(vis(s))),
    pass: worstVis >= 0.7,
    severity: sev(1.5, 0.7 / Math.max(0.05, worstVis) - 1),
    cause: 'Sparse landmark bands: above size ~12 each size has 1-6 props, 50-190 m apart.',
  });
  const loop = (s: Skill) => M.median(details(s).map((x) => x.d.loopShare));
  checks.push({
    id: 'loop',
    area: 'Within a run',
    name: 'Katamari loop: props touched while too big that are eaten later the same round',
    target: '≥ 25%',
    values: skillVals((s) => pct(loop(s))),
    pass: Math.min(...SKILL_NAMES.map(loop)) >= 0.25,
    severity: sev(1, 0.25 / Math.max(0.02, Math.min(...SKILL_NAMES.map(loop))) - 1),
    cause: 'How far apart a map places the next size up, and whether rounds last long enough to come back.',
  });
  const noise = (s: Skill) => {
    let n = 0;
    let tiny = 0;
    for (const x of details(s)) for (let k = 0; k < x.d.small.length; k++) {
      n += x.d.small[k].n;
      if (x.d.small[k].xp < 0.005) tiny += x.d.small[k].n;
    }
    return n ? tiny / n : NaN;
  };
  checks.push({
    id: 'noise',
    area: 'Within a run',
    name: 'Small-object value: swallows worth < 0.5% of a size level ("noise")',
    target: '≤ 50% of swallows',
    values: skillVals((s) => pct(noise(s))),
    pass: Math.max(...SKILL_NAMES.map(noise)) <= 0.5,
    severity: sev(1, Math.max(...SKILL_NAMES.map(noise)) / 0.5 - 1),
    cause: 'XP is f² with a frontier bonus: props a few sizes down are worth ~1/1.27^k of a level each.',
  });
  const early = (s: Skill) => {
    const xs = details(s);
    return xs.length ? xs.filter((x) => x.d.effectivelyClearedAt !== null && x.d.effectivelyClearedAt < 0.75 * x.r.wall).length / xs.length : NaN;
  };
  const worstEarly = Math.max(...SKILL_NAMES.map(early));
  checks.push({
    id: 'emptied',
    area: 'Within a run',
    name: 'Map emptied early: rounds with nothing worth eating left before 75% of the round',
    target: '≤ 20% of rounds',
    values: skillVals((s) => pct(early(s))),
    pass: worstEarly <= 0.2,
    severity: sev(1.5, worstEarly / 0.2 - 1),
    cause: 'Round cash is capped by the map content: a strong hole clears the map and the rest of the round is vacuuming.',
  });
  const late = (s: Skill) => {
    const xs = main.filter((r) => r.spec.skill === s && r.spec.pattern === 'binge' && r.finish !== null).flatMap((r) => r.rounds.filter((x) => x.detail && x.clock >= r.finish! - 1800 && x.clock <= r.finish!).map((x) => x.detail!.vacuumShare));
    return M.median(xs);
  };
  checks.push({
    id: 'vacuum',
    area: 'Within a run',
    name: 'Late-game vacuuming: share of round time where everything on screen is edible, last 30 min before the finish',
    target: '≤ 50%',
    values: skillVals((s) => pct(late(s))),
    pass: !(Math.max(...SKILL_NAMES.map(late).filter(Number.isFinite)) > 0.5),
    severity: sev(1.5, Math.max(...SKILL_NAMES.map(late).filter(Number.isFinite), 0) / 0.5 - 1),
    cause: 'Starting Size + Dense Core start late maps near their top; max size caps per map.',
  });
}
// Skill gap.
if (experiments) {
  const base = experiments.rows.filter((r) => r.key === 'baseline');
  const ratioOf = (a: Skill, b: Skill) =>
    M.median([...new Set(base.map((r) => r.snap))].map((snap) => {
      const g = (s: Skill) => base.find((r) => r.snap === snap && r.skill === s)!.income;
      return g(a) / Math.max(1, g(b));
    }));
  const ratio = ratioOf('strong', 'weak');
  checks.push({
    id: 'skill-gap',
    area: 'Within a run',
    name: 'Skill gap: strong / weak cash per round at the same upgrade states (median over states)',
    target: '1.5–2x',
    values: { all: `strong/weak x${ratio.toFixed(2)} (strong/average x${ratioOf('strong', 'average').toFixed(2)}, average/weak x${ratioOf('average', 'weak').toFixed(2)})` },
    pass: ratio >= 1.5 && ratio <= 2,
    severity: sev(1.5, ratio > 2 ? ratio / 2 - 1 : ratio < 1.5 ? 1.5 / ratio - 1 : 0),
    cause: 'Target choice dominates: XP is f² x up to x4 near the size limit, so aiming at the biggest edible props beats eating what is nearest by 2-4x, and faster growth snowballs. Depends heavily on how the bots are defined.',
  });
}
{
  const st = M.median(real.flatMap((p) => of('weak', p).map(M.noProgressStretch)));
  checks.push({
    id: 'weak-progress',
    area: 'Within a run',
    name: 'Weak player progresses every run: longest stretch of rounds with no purchase, new best size or unlock',
    target: '≤ 3 rounds',
    values: { weak: `${st} rounds` },
    pass: st <= 3,
    severity: sev(2, st / 3 - 1),
    cause: 'A goal the weak bot cannot reach and nothing affordable that helps.',
  });
}
// Offline.
{
  const ret = (s: Skill) => main.filter((r) => r.spec.skill === s && r.spec.pattern === 'returner');
  const eq = (s: Skill) => M.median(ret(s).map((r) => M.offlineEquivalence(r).capMinutes));
  const a = eq('average');
  checks.push({
    id: 'offline-cap',
    area: 'Offline',
    name: `One full offline period (${OFFLINE.baseCapHours} h base cap) in minutes of active play`,
    target: '5–15 min (average)',
    values: skillVals((s) => `${eq(s).toFixed(1)} min`),
    pass: a >= 5 && a <= 15,
    severity: sev(1, a < 5 ? 5 / a - 1 : a > 15 ? a / 15 - 1 : 0),
    cause: 'OFFLINE.roundsPerHour x baseCapHours = 4 rounds of recent income.',
  });
  const eff = (s: Skill) => M.median(ret(s).map((r) => M.offlineEquivalence(r).activeVsOffline));
  checks.push({
    id: 'offline-eff',
    area: 'Offline',
    name: 'Active play vs offline, cash per minute',
    target: '≥ 5x',
    values: skillVals((s) => `x${eff(s).toFixed(0)}`),
    pass: Math.min(...SKILL_NAMES.map(eff)) >= 5,
    severity: 0,
    cause: '',
  });
  const share = (s: Skill) => M.median(ret(s).map((r) => r.offlineTotal / Math.max(1, r.offlineTotal + r.roundTotal)));
  const skip = (s: Skill) => {
    const a2 = M.median(ret(s).map((r) => (r.finish === null ? Infinity : M.preFinish(r).length)));
    const b = M.median(main.filter((r) => r.spec.skill === s && r.spec.pattern === 'returner-nooff').map((r) => (r.finish === null ? Infinity : M.preFinish(r).length)));
    return a2 / b;
  };
  checks.push({
    id: 'offline-share',
    area: 'Offline',
    name: 'Offline share of all cash, and rounds to finish with / without offline',
    target: '≤ 25% of cash; ≥ 85% of the rounds (offline never skips content)',
    values: skillVals((s) => `${pct(share(s))}; ${pct(skip(s))} of the rounds`),
    pass: SKILL_NAMES.every((s) => share(s) <= 0.25 && !(skip(s) < 0.85)),
    severity: sev(1, Math.max(...SKILL_NAMES.map(share)) / 0.25 - 1) + sev(1, Math.max(...SKILL_NAMES.map((s) => (skip(s) < 0.85 ? 0.85 / skip(s) - 1 : 0)))),
    cause: 'recentRoundCash x 0.5 per hour, cap 8-18 h.',
  });
}

// ------------------------------------------------------------------ charts
const md: string[] = [];
const commit = gitCommit();
const bySkill = SKILL_NAMES;

// Income over time.
const incomeChart = chart(
  'income',
  lineChart({
    title: 'Cash per round over play time',
    subtitle: 'Optimizer, binge, seed 1; median of 3 rounds; log scale. Drops are Singularities.',
    x: { label: 'play time (min)', min: 0 },
    y: { label: 'cash per round', log: true },
    series: bySkill.map((s) => ({ name: s, points: M.incomeCurve(of(s, 'optimizer').find((r) => r.spec.seed === 1)!) })),
    marks: of('average', 'optimizer')
      .find((r) => r.spec.seed === 1)!
      .events.filter((e) => e.kind === 'singularity')
      .map((e) => ({ x: e.clock / 60, label: 'S' })),
  }),
  'Cash per round over play time',
);
// Milestones.
const msKeys: [keyof M.Milestones, string][] = [
  ['firstPurchase', 'first purchase'],
  ['farm', 'Happy Farm'],
  ['downtown', 'Downtown'],
  ['harbor', 'Harbor'],
  ['singularity', 'first Singularity'],
  ['airport', 'Airport'],
  ['spaceport', 'Spaceport'],
  ['moon', 'Moon Base unlocked'],
  ['finish', 'Moon Base goal (finish)'],
];
const msVal = (s: Skill, k: keyof M.Milestones) => M.median(real.flatMap((p) => of(s, p).map((r) => M.milestones(r)[k])).map((x) => (Number.isFinite(x) ? x : Infinity)));
const msChart = chart(
  'milestones',
  dotChart({
    title: 'Time to each milestone by skill',
    subtitle: 'Median over optimizer / balanced / casual, binge, 3 seeds each; log scale; missing dot = never (10 h cap)',
    x: { label: 'play time (min)', log: true, fmt: (v) => fmtNum(v) },
    rows: msKeys.map((k) => k[1]),
    series: bySkill.map((s) => ({ name: s, values: msKeys.map(([k]) => msVal(s, k) / 60) })),
  }),
  'Milestones by skill',
);
// Purchase gaps.
const gapBins = (s: Skill) => {
  const pts = real.flatMap((p) => of(s, p).flatMap(M.purchaseGaps));
  const out: [number, number][] = [];
  for (let b = 0; b < 600; b += 15) {
    const g = pts.filter(([c]) => c >= b * 60 && c < (b + 15) * 60).map(([, g2]) => g2 / 60);
    if (g.length >= 3) out.push([b + 7.5, M.quantile(g, 0.9)]);
  }
  return out;
};
const gapChart = chart(
  'purchase-gaps',
  lineChart({
    title: 'Time between purchases (90th percentile)',
    subtitle: 'Per 15-min bin of play, optimizer / balanced / casual, binge, before the finish; log scale',
    x: { label: 'play time (min)', min: 0 },
    y: { label: 'minutes between purchases (p90)', log: true },
    series: bySkill.map((s) => ({ name: s, points: gapBins(s) })),
  }),
  'Purchase gaps',
);
// Noticeable stretches.
const noticeRows: string[] = [];
const noticeVals: number[] = [];
for (const s of bySkill)
  for (const p of ['optimizer', 'balanced', 'casual', 'single']) {
    noticeRows.push(`${s} · ${p}`);
    noticeVals.push(M.median(of(s, p).map((r) => M.noticeableStretch(r, 600).rounds)));
  }
const noticeChart = chart(
  'noticeable',
  barChart({
    title: 'Longest stretch without a noticeable upgrade',
    subtitle: 'Rounds in a row after 10 min of play, before the finish; median of 3 seeds, binge',
    x: { label: 'rounds' },
    rows: noticeRows,
    values: noticeVals,
    colors: noticeVals.map((v) => (v > 3 ? 'var(--bad)' : slot(0))),
    ref: { x: 3, label: 'target ≤ 3' },
  }),
  'Noticeable-upgrade stretches',
);
// Policies + single-stat.
const polRows = [...real, 'single (Starting Size)'];
const polChart = chart(
  'policies',
  dotChart({
    title: 'Time to finish by purchase policy and skill',
    subtitle: 'Median of 3 seeds, binge; missing dot = never finished (stalled or 10 h cap)',
    x: { label: 'play time to the Moon Base goal (h)', log: false, min: 0 },
    rows: polRows,
    series: bySkill.map((s) => ({ name: s, values: polRows.map((p) => M.median(of(s, p.split(' ')[0]).map((r) => (r.finish === null ? Infinity : r.finish / 3600)))) })),
    notes: polRows.map((p) => (bySkill.some((s) => of(s, p.split(' ')[0]).some((r) => r.stalled)) ? '(stalls)' : '')),
  }),
  'Finish time by policy',
);
const sweep = R.filter((r) => r.spec.single !== undefined);
const sweepTargets = [...new Set(sweep.map((r) => r.spec.single!))];
const stallMap = (r: PlayResult) => (r.stalled ? (MAPS.find((m) => r.stalled!.includes(`on ${m.id}`))?.name ?? 'cap') : '');
// Upgrade feel.
let feelChart = '';
if (feelRows.length) {
  const keys = [...new Set(feelRows.map((r) => r.key))];
  feelChart = chart(
    'upgrade-feel',
    dotChart({
      title: 'What one more level does to cash per round',
      subtitle: 'Median over the map-entry states of an average optimizer run; paired Layer A rounds, 12 seeds each',
      x: { label: 'change in cash per round (%)', fmt: (v) => `${Math.round(v)}%` },
      rows: keys.map((k) => feelRows.find((r) => r.key === k)!.name),
      series: bySkill.map((s) => ({ name: s, values: keys.map((k) => (feelRows.find((r) => r.key === k && r.skill === s)?.d ?? NaN) * 100) })),
      band: [5, 1000],
    }),
    'Upgrade feel',
  );
}
// Within run charts.
const visRows = MAPS.map((m) => m.name);
const detailBy = (s: Skill, map: string) => details(s).filter((x) => x.r.map === map).map((x) => x.d);
const visChart = chart(
  'next-goal',
  dotChart({
    title: 'Next goal on screen',
    subtitle: 'Share of round time with a prop just too big (≤ 2 sizes up) in view; median per map, binge, before the finish',
    x: { label: 'share of round time (%)', min: 0, max: 100, fmt: (v) => `${v}%` },
    rows: visRows,
    series: bySkill.map((s) => ({ name: s, values: MAPS.map((m) => M.median(detailBy(s, m.id).map((d) => d.nextGoalShare)) * 100) })),
    band: [70, 100],
  }),
  'Next goal visibility',
);
const vacChart = chart(
  'vacuum',
  lineChart({
    title: 'Vacuuming over the playthrough',
    subtitle: 'Share of round time where everything on screen is edible; median per 15-min bin, binge',
    x: { label: 'play time (min)', min: 0 },
    y: { label: 'share of round time (%)', min: 0, max: 100, fmt: (v) => `${v}%` },
    series: bySkill.map((s) => {
      const xs = main.filter((r) => r.spec.skill === s && r.spec.pattern === 'binge').flatMap((r) => r.rounds.filter((x) => x.detail).map((x) => [x.clock / 60, x.detail!.vacuumShare * 100] as [number, number]));
      const out: [number, number][] = [];
      for (let b = 0; b < 600; b += 15) {
        const v = xs.filter(([c]) => c >= b && c < b + 15).map(([, y]) => y);
        if (v.length >= 3) out.push([b + 7.5, M.median(v)]);
      }
      return { name: s, points: out };
    }),
    band: [0, 50],
  }),
  'Vacuum share over time',
);
const smallChart = chart(
  'small-value',
  lineChart({
    title: 'What a small prop is worth',
    subtitle: 'XP per swallow as a share of the current size level, by how many sizes below the hole the prop is; binge, all maps',
    x: { label: 'sizes below the hole (8 = 8 or more)', min: 0, max: 8 },
    y: { label: 'XP per swallow (% of a level)', log: true, fmt: (v) => `${fmtNum(v)}%` },
    series: bySkill.map((s) => {
      const acc = Array.from({ length: 9 }, () => ({ n: 0, xp: 0 }));
      for (const x of details(s)) x.d.small.forEach((b, k) => {
        acc[k].n += b.n;
        acc[k].xp += b.xp * b.n;
      });
      return { name: s, points: acc.map((a, k) => [k, a.n ? (a.xp / a.n) * 100 : NaN] as [number, number]) };
    }),
  }),
  'Small object value',
);
let sizeChart = '';
if (experiments) {
  const base = experiments.rows.filter((r) => r.key === 'baseline' && r.skill === 'average' && r.snap.startsWith('run 1'));
  sizeChart = chart(
    'size-curve',
    lineChart({
      title: 'Size over a round, average bot, first visit to each map',
      subtitle: 'Map-entry states of an average optimizer run 1; one round each (seed 9000)',
      x: { label: 'round time (s)', min: 0 },
      y: { label: 'size (as the HUD shows it)' },
      series: base.map((r) => ({ name: eco.mapDef(r.map as never).name, points: (r.detail?.[0]?.curve ?? []).map((c) => [c.t, c.level + 1] as [number, number]) })),
    }),
    'Size curves',
  );
}
const offChart = chart(
  'offline',
  lineChart({
    title: 'Offline share of cash per day (returner)',
    subtitle: 'Three 15-min sessions a day (8:00, 13:00, 20:00), optimizer / balanced / casual, median per day',
    x: { label: 'day', min: 1 },
    y: { label: 'offline / all cash that day (%)', min: 0, max: 100, fmt: (v) => `${v}%` },
    series: bySkill.map((s) => {
      const per = new Map<number, number[]>();
      for (const r of main.filter((x) => x.spec.skill === s && x.spec.pattern === 'returner')) for (const d of M.offlineByDay(r)) per.set(d.day, [...(per.get(d.day) ?? []), (d.offline / Math.max(1, d.offline + d.rounds)) * 100]);
      return { name: s, points: [...per.entries()].sort((a, b) => a[0] - b[0]).map(([d, v]) => [d, M.median(v)] as [number, number]) };
    }),
  }),
  'Offline share per day',
);

// ------------------------------------------------------------------ write
const ranked = checks.filter((c) => !c.pass).sort((a, b) => b.severity - a.severity);
const passed = checks.filter((c) => c.pass);
const vals = (c: Check) => Object.entries(c.values).map(([k, v]) => (k === 'all' ? v : `${k} ${v}`)).join(' · ');

md.push(TAG ? `# Balance report: ${TAG}` : '# Balance baseline report', '');
md.push(`Commit \`${commit}\` · Layer B data ${direct.created} (commit \`${direct.commit}\`) · seeds ${direct.seeds.join(', ')} · report ${new Date().toISOString()}${direct.params ? ` · tuned parameters: ${Object.keys(direct.params).length} values (see compare.md)` : ''}`, '');
const notesArg = process.argv.indexOf('--notes');
if (notesArg > 0) md.push(readFileSync(process.argv[notesArg + 1], 'utf8').trim(), '');
md.push(`> **Bots are ${calib.length ? `calibrated against ${calib.length} logged rounds` : 'not calibrated yet'}.** Absolute times depend on how fast the bots play. Treat them as a guide and confirm by playing.`, '');
md.push('## Violations, worst first', '');
md.push('| # | Area | Check | Target | Measured | Likely cause |', '|---|---|---|---|---|---|');
ranked.forEach((c, i) => md.push(`| ${i + 1} | ${c.area} | ${c.name} | ${c.target} | ${vals(c)} | ${c.cause} |`));
md.push('', `Met: ${passed.map((c) => `${c.name} (${vals(c)})`).join('; ')}.`, '');

md.push('## Progression', '', msChart, '', incomeChart, '');
md.push('| Skill | Policy | Pattern | Finish (median) | First Singularity | Rounds to finish | Stalls |', '|---|---|---|---|---|---|---|');
for (const s of bySkill)
  for (const p of ['optimizer', 'balanced', 'casual', 'single'])
    for (const pat of ['binge', 'returner']) {
      const rs = of(s, p, pat);
      if (!rs.length) continue;
      const fin = M.median(rs.map((r) => r.finish ?? Infinity));
      const calFin = M.median(rs.map((r) => r.finishCal ?? Infinity));
      md.push(`| ${s} | ${p} | ${pat} | ${hm(fin)}${pat === 'returner' && Number.isFinite(calFin) ? ` play (day ${Math.floor(calFin / 86400) + 1})` : ''} | ${hm(M.median(rs.map((r) => M.milestones(r).singularity)))} | ${M.median(rs.map((r) => (r.finish === null ? Infinity : M.preFinish(r).length)))} | ${[...new Set(rs.map((r) => r.stalled ?? ''))].filter(Boolean).join('; ') || '-'} |`);
    }
md.push('', gapChart, '', noticeChart, '');

md.push('## Where progression stalls', '');
md.push('Rounds per map until its goal (median of optimizer / balanced / casual, binge, 3 seeds), by prestige run:', '');
md.push('| Skill | Run | ' + MAPS.map((m) => m.name).join(' | ') + ' |', '|---|---|' + MAPS.map(() => '---|').join(''));
for (const s of bySkill)
  for (let run = 1; run <= 5; run++) {
    const rs = real.flatMap((p) => of(s, p));
    const cells = MAPS.map((m) => {
      const v = rs.map((r) => {
        const rr = r.rounds.filter((x) => x.run === run && x.map === m.id);
        if (!rr.length) return NaN;
        const hit = rr.findIndex((x) => x.endLevel >= x.goal);
        return hit >= 0 ? hit + 1 : Infinity;
      }).filter((x) => !Number.isNaN(x));
      if (!v.length) return '';
      const med = M.median(v);
      return Number.isFinite(med) ? String(med) : `stuck (${Math.max(...rs.map((r) => r.rounds.filter((x) => x.run === run && x.map === m.id).length))}+)`;
    });
    if (cells.every((c) => c === '')) continue;
    md.push(`| ${s} | ${run} | ${cells.join(' | ')} |`);
  }
md.push('');
md.push('Single-stat sweep (average, binge; everything into one track, cheapest-first once it is maxed):', '');
md.push('| Track | Finish | Stalls on |', '|---|---|---|');
for (const t of sweepTargets) {
  const rs = sweep.filter((r) => r.spec.single === t);
  md.push(`| ${t} | ${hm(M.median(rs.map((r) => r.finish ?? Infinity)))} | ${[...new Set(rs.map(stallMap))].filter(Boolean).join(', ') || '-'} |`);
}
md.push('', polChart, '');

md.push('## Upgrade feel', '');
if (feelRows.length) {
  md.push(feelChart, '');
  md.push('| Upgrade | Skill | Δ cash per round | Δ end size | Δ seconds per size | States |', '|---|---|---|---|---|---|');
  for (const r of [...feelRows].sort((a, b) => a.d - b.d)) md.push(`| ${r.name} | ${r.skill} | ${pct(r.d, 1)} | ${r.dl >= 0 ? '+' : ''}${r.dl.toFixed(2)} | ${pct(r.ds, 1)} | ${r.n} |`);
  md.push('');
}
md.push('What each policy bought before the finish (levels, median of 3 seeds, average skill, binge):', '');
const trackKeys = [...new Set(main.flatMap((r) => r.rounds.flatMap((x) => x.purchases.map((p) => p.key))))].sort();
md.push('| Policy | ' + trackKeys.join(' | ') + ' |', '|---|' + trackKeys.map(() => '---|').join(''));
for (const p of ['optimizer', 'balanced', 'casual', 'single'])
  md.push(`| ${p} | ${trackKeys.map((k) => M.median(of('average', p).map((r) => M.preFinish(r).reduce((a, x) => a + x.purchases.filter((y) => y.key === k).length, 0)))).join(' | ')} |`);
md.push('');

md.push('## Within a run', '', visChart, '', vacChart, '', smallChart, '');
if (sizeChart) md.push(sizeChart, '');
md.push('| Map | Skill | Rounds | s / size | First swallow (s) | Dead time (s) | Next goal on screen | Vacuum | Emptied < 75% | Katamari loop |', '|---|---|---|---|---|---|---|---|---|---|');
for (const m of MAPS)
  for (const s of bySkill) {
    const xs = details(s).filter((x) => x.r.map === m.id);
    if (!xs.length) continue;
    const spl = xs.map((x) => (x.r.endLevel > x.r.startLevel ? x.r.wall / (x.r.endLevel - x.r.startLevel) : NaN));
    md.push(`| ${m.name} | ${s} | ${xs.length} | ${M.median(spl).toFixed(1)} | ${M.median(xs.map((x) => x.d.firstEat ?? NaN)).toFixed(1)} | ${M.median(xs.map((x) => x.r.dead)).toFixed(0)} | ${pct(M.median(xs.map((x) => x.d.nextGoalShare)))} | ${pct(M.median(xs.map((x) => x.d.vacuumShare)))} | ${pct(xs.filter((x) => x.d.effectivelyClearedAt !== null && x.d.effectivelyClearedAt < 0.75 * x.r.wall).length / xs.length)} | ${pct(M.median(xs.map((x) => x.d.loopShare)))} |`);
  }
md.push('');

md.push('## Offline', '', offChart, '');
md.push('## Prestige', '');
md.push(`- Dark Matter total is \`floor(1.75 (lifetime / 1e6)^0.25)\`: doubling it takes **16x** the lifetime cash. First DM at $107K, 3 DM (the sim's first collapse) at $8.6M.`);
for (const s of bySkill) {
  const rr = real.flatMap((p) => of(s, p).flatMap(M.replayRatios));
  md.push(`- ${s}: replay ratio by run (time to the previous run's furthest map / previous run's time): ${[2, 3, 4, 5].map((k) => `run ${k} ${pct(M.median(rr.filter((x) => x.run === k).map((x) => x.ratio)))}`).join(', ')}.`);
}
md.push('');

md.push('## Models and their error', '');
md.push('- **Layer A** plays the real `World` (same generators, swallow rule, growth, timer) with bots steering through `w.input`; nothing is re-implemented. Step 1/30 s.');
if (parity) md.push(`- **Parity** (\`balance/parity.ts\`): ${parity.lines.filter((l) => l.startsWith('PASS')).length}/${parity.lines.length} checks pass (step size vs the game's 60 fps, combo recompute, cash scaling, golden expectation, formulas by hand).`);
if (modelErr) {
  const e = Object.values(modelErr.err);
  md.push(`- **Fitted model** (random forest per map and skill, ${modelErr.n} states each + Layer B rounds): median error of mean cash per round **${M.median(e.map((x) => x.modelMedianPct)).toFixed(1)}%** (p90 ${M.median(e.map((x) => x.modelP90Pct)).toFixed(0)}%), end size ±${M.median(e.map((x) => x.endLevelMAE)).toFixed(2)}, P(goal) ±${M.median(e.map((x) => x.goalProbMAE)).toFixed(2)}; a single round's own noise is ${M.median(e.map((x) => x.roundNoiseMedianPct)).toFixed(0)}%.`);
}
const cmp = (file: PlayFile | null, label: string) => {
  if (!file) return;
  const rows: string[] = [];
  for (const s of bySkill) {
    const a = M.median(real.flatMap((p) => of(s, p).map((r) => r.finish ?? Infinity)));
    const b = M.median(file.results.filter((r) => r.spec.single === undefined && r.spec.skill === s && real.includes(r.spec.policy) && r.spec.pattern === 'binge').map((r) => r.finish ?? Infinity));
    rows.push(`${s} ${hm(b)} vs ${hm(a)} direct`);
  }
  md.push(`- **Layer B through the model** (${label}): median finish ${rows.join('; ')}.`);
};
cmp(modelSame, `seeds ${modelSame?.seeds.join(', ')}`);
cmp(modelFresh, `fresh seeds ${modelFresh?.seeds.join(', ')}`);
md.push('');
md.push('**Bot profiles** (`balance/lib/bots.ts`):', '');
md.push('| Skill | Reaction (s) | Stick | Heading noise (rad) | Targeting | Abilities | Quits early |', '|---|---|---|---|---|---|---|');
for (const s of bySkill) {
  const p = SKILLS[s];
  md.push(`| ${s} | ${p.think} | ${p.stick} | ${p.noise} | ${p.route ? `XP per metre over a ${p.cluster} R cluster, knows the map` : p.randomPick ? `random among the ${p.randomPick} nearest; wanders ${pct(p.wander)}, chases too-big ${pct(p.chaseBig)}` : `nearest visible, size preference ^${p.sizePref}`} | ${p.castDelay ? `~${p.castDelay} s after ready` : 'situational'} | ${p.quits ? 'yes' : 'no'} |`);
}
md.push('');
md.push('## Where the model is likely wrong', '');
md.push('- Bots are not people: they never misread the HUD, pause, or play for fun; the weak bot may be harsher than a real beginner.');
md.push(`- ${calib.length ? `Calibration rests on ${calib.length} rounds from one player.` : 'No calibration rounds yet: the average bot is a guess between the strong and weak profiles.'}`);
md.push('- Menus, the Singularity dialog and first-landmark slow motion count only through a fixed 12–25 s overhead per round.');
md.push('- Players replay earlier maps (for 100% bonuses, Gulpedia sets); Layer B always plays the newest map.');
md.push('- The optimizer is greedy with a 10-level lookahead; it can still miss purchases that only pay off together.');
md.push('');
md.push(`Charts: ${charts.map((c) => `\`charts/${c}.svg\``).join(', ')}. Reproduce: see \`balance/README.md\`.`);
writeFileSync(`${dir}/report.md`, md.join('\n'));
writeFileSync(`${dir}/checks.json`, JSON.stringify({ commit, checks }, null, 1));
console.log(`${dir}/report.md`);
console.log(ranked.map((c, i) => `${i + 1}. [${c.severity.toFixed(1)}] ${c.name}: ${vals(c)}`).join('\n'));
