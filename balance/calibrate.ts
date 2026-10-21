/**
 * Compares the bots with rounds a person played (balance/calibration/rounds.jsonl, written by the
 * dev server for `?log`). Each logged round is replayed with its own config, world seed and screen
 * shape by every bot (several bot seeds), and cash, end size and seconds per size are compared.
 * With --fit it grid-searches the average bot's reaction, steering noise, stick and size
 * preference for the closest match and prints the profile to put in lib/bots.ts.
 *
 *   npx tsx balance/calibrate.ts [--fit]      # writes balance/data/calibration.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { COMBO } from '../src/config/balance';
import * as eco from '../src/core/economy';
import { SKILL_NAMES, type SkillProfile } from './lib/bots';
import { gitCommit } from './lib/meta';
import { runRounds } from './lib/pool';
import { goldFactor, type RoundResult, type RoundSpec } from './lib/round';

interface Logged {
  port: string;
  map: string;
  seed: number;
  cfg: eco.RoundConfig;
  viewport: { w: number; h: number; touch: boolean };
  cash: number;
  startLevel: number;
  endLevel: number;
  played: number;
  pct: number;
  endReason: string;
  hubSeconds: number | null;
  meanInput: number;
}

const FILE = 'balance/calibration/rounds.jsonl';
if (!existsSync(FILE)) {
  console.log(`no ${FILE} yet: play at http://localhost:5101/?log first`);
  process.exit(0);
}
const rounds = readFileSync(FILE, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l) as Logged)
  .filter((r) => r.port !== '5180' && r.played > 20);
const BOT_SEEDS = 6;
const comboLevel = (cfg: eco.RoundConfig) => Math.round((cfg.comboWindow - COMBO.baseWindow) / COMBO.windowPerLevel);
/** The logged cash brought back to Layer A's base: cash multiplier 1, tier 0, no golden. */
const baseCash = (r: Logged) => r.cash / (r.cfg.cashMult * goldFactor(r.cfg.goldChance) * (r.cfg.mapMul / eco.mapDef(r.cfg.mapId).valueMul));
const botCash = (r: Logged, b: RoundResult) => b.cashByCombo[comboLevel(r.cfg)];
const spl = (lv0: number, lv1: number, t: number) => (lv1 > lv0 ? t / (lv1 - lv0) : t);

const specsFor = (profile?: Partial<SkillProfile>, skills = SKILL_NAMES): RoundSpec[] =>
  rounds.flatMap((r) => skills.flatMap((skill) => Array.from({ length: BOT_SEEDS }, (_, k) => ({ cfg: r.cfg, skill, seed: r.seed + k * 7919, aspect: r.viewport.w / r.viewport.h, profile }))));

function score(res: RoundResult[], skillCount: number): { logCash: number; level: number; spl: number }[] {
  return rounds.map((r, i) => {
    const out = { logCash: 0, level: 0, spl: 0 };
    void skillCount;
    const bots = res.slice(i * BOT_SEEDS, (i + 1) * BOT_SEEDS);
    const m = (f: (b: RoundResult) => number) => bots.reduce((a, b) => a + f(b), 0) / bots.length;
    out.logCash = Math.log(m((b) => botCash(r, b)) + 1) - Math.log(baseCash(r) + 1);
    out.level = m((b) => b.endLevel) - r.endLevel;
    out.spl = Math.log(m((b) => spl(b.startLevel, b.endLevel, b.played))) - Math.log(spl(r.startLevel, r.endLevel, r.played));
    return out;
  });
}

const all = await runRounds(specsFor());
const per = SKILL_NAMES.map((s, k) => {
  const res = rounds.flatMap((_, i) => all.slice((i * SKILL_NAMES.length + k) * BOT_SEEDS, (i * SKILL_NAMES.length + k + 1) * BOT_SEEDS));
  return { skill: s, rows: score(res, 1) };
});
console.log(`${rounds.length} logged rounds; bot vs you (mean over ${BOT_SEEDS} bot seeds on your world seed):`);
rounds.forEach((r, i) => {
  console.log(
    `  ${r.map.padEnd(8)} start ${r.startLevel + 1} -> you ${r.endLevel + 1} ($${Math.round(baseCash(r))} base, ${r.played.toFixed(0)} s, ${r.endReason}) | ` +
      per.map((p) => `${p.skill} size ${(r.endLevel + 1 + p.rows[i].level).toFixed(1)} cash x${Math.exp(p.rows[i].logCash).toFixed(2)}`).join(' | '),
  );
});
const summary = per.map((p) => ({
  skill: p.skill,
  cashRatio: Math.exp(p.rows.reduce((a, r) => a + r.logCash, 0) / p.rows.length),
  levelDiff: p.rows.reduce((a, r) => a + r.level, 0) / p.rows.length,
  splRatio: Math.exp(p.rows.reduce((a, r) => a + r.spl, 0) / p.rows.length),
}));
for (const s of summary) console.log(`${s.skill.padEnd(8)} cash x${s.cashRatio.toFixed(2)} of yours, end size ${s.levelDiff >= 0 ? '+' : ''}${s.levelDiff.toFixed(2)}, seconds per size x${s.splRatio.toFixed(2)}`);
const hub = rounds.map((r) => r.hubSeconds).filter((x): x is number => x !== null);

let fit: { profile: Partial<SkillProfile>; loss: number } | null = null;
if (process.argv.includes('--fit')) {
  const grid: Partial<SkillProfile>[] = [];
  for (const think of [0.25, 0.45, 0.7])
    for (const noise of [0.1, 0.2, 0.35])
      for (const stick of [0.75, 0.9, 1])
        for (const sizePref of [0, 0.6, 1.2]) grid.push({ think, noise, stick, sizePref });
  const specs = grid.flatMap((g) => specsFor(g, ['average']));
  const res = await runRounds(specs);
  const per2 = rounds.length * BOT_SEEDS;
  grid.forEach((g, gi) => {
    const rows = score(res.slice(gi * per2, (gi + 1) * per2), 1);
    const loss = rows.reduce((a, r) => a + r.logCash ** 2 + 0.25 * r.level ** 2 + r.spl ** 2, 0) / rows.length;
    if (!fit || loss < fit.loss) fit = { profile: g, loss };
  });
  console.log(`best average profile: ${JSON.stringify(fit!.profile)} (loss ${fit!.loss.toFixed(3)})`);
}
mkdirSync('balance/data', { recursive: true });
writeFileSync('balance/data/calibration.json', JSON.stringify({ commit: gitCommit(), rounds: rounds.length, summary, hubSecondsMedian: hub.sort((a, b) => a - b)[hub.length >> 1] ?? null, fit }, null, 1));
