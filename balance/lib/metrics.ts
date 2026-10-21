/** Pacing metrics over Layer B playthroughs (lib/progress.ts results). Pure functions. */
import { MAPS, OFFLINE, type MapId } from '../../src/config/balance';
import type { PlayResult, RoundLog } from './progress';

export const median = (xs: number[]): number => {
  const a = xs.filter((x) => !Number.isNaN(x)).sort((p, q) => p - q);
  if (!a.length) return NaN;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
export const quantile = (xs: number[], q: number): number => {
  const a = xs.filter((x) => !Number.isNaN(x)).sort((p, q2) => p - q2);
  if (!a.length) return NaN;
  return a[Math.min(a.length - 1, Math.floor(q * a.length))];
};
export const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

/** Rounds up to the finish (or all rounds when the playthrough never finished). */
export const preFinish = (p: PlayResult): RoundLog[] => p.rounds.filter((r) => p.finish === null || r.clock <= p.finish);

export interface Milestones {
  firstPurchase: number;
  farm: number;
  downtown: number;
  harbor: number;
  singularity: number;
  airport: number;
  spaceport: number;
  moon: number;
  finish: number;
}

/** Play seconds at the first time each milestone happened (NaN = never). */
export function milestones(p: PlayResult): Milestones {
  const first = (kind: string, text?: string) => p.events.find((e) => e.kind === kind && (text === undefined || e.text === text))?.clock ?? NaN;
  return {
    firstPurchase: p.rounds.find((r) => r.purchases.length)?.clock ?? NaN,
    farm: first('map', 'Happy Farm'),
    downtown: first('map', 'Downtown'),
    harbor: first('map', 'Harbor'),
    singularity: first('singularity'),
    airport: first('map', 'Airport'),
    spaceport: first('map', 'Spaceport'),
    moon: first('map', 'Moon Base'),
    finish: p.finish ?? NaN,
  };
}

/** Distinct upgrade tracks bought within `seconds` of play. */
export const tracksBy = (p: PlayResult, seconds: number) => new Set(p.rounds.filter((r) => r.clock <= seconds).flatMap((r) => r.purchases.map((x) => x.key))).size;

/** Share of rounds in the first `seconds` that ended with a purchase or with the cheapest option affordable after one more round. */
export function earlyAffordable(p: PlayResult, seconds: number): number {
  const rs = p.rounds.filter((r) => r.clock <= seconds);
  const ok = rs.filter((r) => r.purchases.length > 0 || r.cheapest - r.cashLeft <= Math.max(r.expAfter, r.cash));
  return rs.length ? ok.length / rs.length : NaN;
}

/** Longest run of consecutive rounds with nothing noticeable (+10% income, new ability, new map, new size tier). */
export function noticeableStretch(p: PlayResult, fromSeconds = 0): { rounds: number; minutes: number; at: number } {
  let best = { rounds: 0, minutes: 0, at: 0 };
  let n = 0;
  let start = 0;
  for (const r of preFinish(p)) {
    if (r.clock < fromSeconds) continue;
    if (r.noticeable.length) {
      n = 0;
      start = r.clock;
      continue;
    }
    n++;
    if (n > best.rounds) best = { rounds: n, minutes: (r.clock - start) / 60, at: r.clock };
  }
  return best;
}

/** Times of new content: first map unlocks, new prop types, first purchase of each track, first Singularity and tier. */
export function contentTimes(p: PlayResult): number[] {
  const t: number[] = [0];
  const maps = new Set<string>();
  for (const e of p.events) {
    if (e.kind === 'map' && !maps.has(e.text)) {
      maps.add(e.text);
      t.push(e.clock);
    } else if (e.kind === 'buy-first') t.push(e.clock);
  }
  const sing = p.events.find((e) => e.kind === 'singularity');
  if (sing) t.push(sing.clock);
  const tier = p.events.find((e) => e.kind === 'singularity' && e.text.includes('tier up'));
  if (tier) t.push(tier.clock);
  for (const r of p.rounds) if (r.newTypes.length) t.push(r.clock);
  return [...new Set(t)].sort((a, b) => a - b);
}

/** Longest gap (s) between new-content moments before the finish, and when it started. */
export function contentGap(p: PlayResult): { gap: number; at: number } {
  const end = p.finish ?? p.rounds[p.rounds.length - 1]?.clock ?? 0;
  const t = contentTimes(p).filter((x) => x <= end);
  t.push(end);
  let best = { gap: 0, at: 0 };
  for (let i = 1; i < t.length; i++) if (t[i] - t[i - 1] > best.gap) best = { gap: t[i] - t[i - 1], at: t[i - 1] };
  return best;
}

/** Gaps (s) between shop visits that bought something, with the clock of the later visit. */
export function purchaseGaps(p: PlayResult): [number, number][] {
  const out: [number, number][] = [];
  let last = 0;
  for (const r of preFinish(p)) {
    if (!r.purchases.length) continue;
    out.push([r.clock, r.clock - last]);
    last = r.clock;
  }
  return out;
}

/** Rolling median of cash per round over `k` rounds, with play minutes. */
export function incomeCurve(p: PlayResult, k = 3): [number, number][] {
  return p.rounds.map((r, i) => [r.clock / 60, median(p.rounds.slice(Math.max(0, i - k + 1), i + 1).map((x) => x.cash))]);
}

/**
 * Within the first hour: each 10-minute window's median income over the previous window's, using
 * only rounds of one prestige run in both (a Singularity is a reset, not a slow patch).
 */
export function firstHourGrowth(p: PlayResult): number[] {
  const out: number[] = [];
  for (const run of new Set(p.rounds.map((r) => r.run))) {
    const rs = p.rounds.filter((r) => r.run === run);
    for (let w = 1; w < 6; w++) {
      const a = rs.filter((r) => r.clock > (w - 1) * 600 && r.clock <= w * 600);
      const b = rs.filter((r) => r.clock > w * 600 && r.clock <= (w + 1) * 600);
      if (a.length >= 2 && b.length >= 2) out.push(median(b.map((r) => r.cash)) / median(a.map((r) => r.cash)));
    }
  }
  return out;
}

/** Play seconds for income to double, from each round of the first prestige run. */
export function doublingTimes(p: PlayResult): number[] {
  const rs = p.rounds.filter((r) => r.run === 1);
  const c = rs.map((_, i) => median(rs.slice(Math.max(0, i - 2), i + 1).map((x) => x.cash)));
  const out: number[] = [];
  for (let i = 0; i < rs.length; i++) {
    const j = c.findIndex((v, k) => k > i && v >= 2 * c[i]);
    if (j > 0) out.push(rs[j].clock - rs[i].clock);
  }
  return out;
}

/** Run k+1's time to the furthest map of run k, as a share of run k's time to it. */
export function replayRatios(p: PlayResult): { run: number; map: MapId; ratio: number }[] {
  const out: { run: number; map: MapId; ratio: number }[] = [];
  for (let k = 0; k + 1 < p.runs.length; k++) {
    const a = p.runs[k];
    const b = p.runs[k + 1];
    const far = MAPS.filter((m) => a.mapAt[m.id] !== undefined).pop();
    if (!far || far.id === 'suburb') continue;
    const t = b.mapAt[far.id];
    out.push({ run: k + 2, map: far.id, ratio: t === undefined ? Infinity : t / Math.max(1, a.mapAt[far.id]!) });
  }
  return out;
}

/** Longest run of rounds with no purchase, no new best size on the map and no unlock (before the finish). */
export function noProgressStretch(p: PlayResult): number {
  let best = 0;
  let n = 0;
  const bestLevel = new Map<string, number>();
  for (const r of preFinish(p)) {
    const k = `${r.run}/${r.map}`;
    const improved = r.endLevel > (bestLevel.get(k) ?? -1);
    if (improved) bestLevel.set(k, r.endLevel);
    if (r.purchases.length || improved || r.unlocked.length) n = 0;
    else best = Math.max(best, ++n);
  }
  return best;
}

/** Offline cash per calendar day and round cash per day (returner). */
export function offlineByDay(p: PlayResult): { day: number; offline: number; rounds: number }[] {
  const days = new Map<number, { offline: number; rounds: number }>();
  for (const r of p.rounds) {
    const d = Math.floor(r.cal / 86400) + 1;
    const e = days.get(d) ?? { offline: 0, rounds: 0 };
    e.offline += r.offline;
    e.rounds += r.cash;
    days.set(d, e);
  }
  return [...days.entries()].map(([day, e]) => ({ day, ...e }));
}

/** Minutes of active play one full base offline cap is worth, and active vs offline cash per minute. */
export function offlineEquivalence(p: PlayResult): { capMinutes: number; activeVsOffline: number } {
  const rs = preFinish(p);
  const minPerRound = mean(rs.slice(1).map((r, i) => (r.clock - rs[i].clock) / 60));
  const capRounds = OFFLINE.baseCapHours * OFFLINE.roundsPerHour;
  return { capMinutes: capRounds * minPerRound, activeVsOffline: 60 / OFFLINE.roundsPerHour / minPerRound };
}

/** Rounds the first visit to each map took to reach its goal (Infinity if never), by map. */
export function firstVisitRounds(p: PlayResult): Partial<Record<MapId, number>> {
  const out: Partial<Record<MapId, number>> = {};
  for (const m of MAPS) {
    const first = p.rounds.find((r) => r.map === m.id);
    if (!first) continue;
    const rs = p.rounds.filter((r) => r.map === m.id && r.run === first.run);
    const hit = rs.findIndex((r) => r.endLevel >= r.goal);
    out[m.id] = hit >= 0 ? hit + 1 : Infinity;
  }
  return out;
}
