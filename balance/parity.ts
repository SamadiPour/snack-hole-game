/**
 * Parity checks for Layer A. Layer A plays the real World, so the size, swallow and cash formulas
 * cannot drift from the game; what can drift is how the harness runs it. This checks:
 *
 *   1. step size: rounds at the sim's step vs the game's 60 fps step (means over many seeds);
 *   2. combo: cash recomputed from swallow times for the played Combo Window level vs World's own;
 *   3. scaling: a round at cashMult 3 and tier 2 pays exactly 3 x 4^2 the base round (same seed);
 *   4. golden: mean cash with Golden Touch 8 vs base x (1 + 9 p) over many seeds;
 *   5. formulas: XP needed, footprint, value and the frontier bonus for a few props, by hand.
 *
 *   npx tsx balance/parity.ts            # writes balance/data/parity.json and prints a summary
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { OBJECT_TYPES, baseValueOf, footprintOf, typeId, xpOf } from '../src/config/objects';
import { frontierXpMult, xpForLevel, radiusForLevel } from '../src/core/size';
import { generateMap } from '../src/core/mapgen';
import { World } from '../src/core/world';
import { SKILL_NAMES } from './lib/bots';
import { runRounds } from './lib/pool';
import { goldFactor, runRound, type RoundSpec } from './lib/round';
import { STATES, cfgOf } from './lib/states';

const SEEDS = 32;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const out: Record<string, unknown> = {};
const lines: string[] = [];
let failures = 0;
const check = (name: string, ok: boolean, detail: string) => {
  lines.push(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${detail}`);
  if (!ok) failures++;
};

// 1. Step size.
const steps = [1 / 60, 1 / 30, 1 / 20];
const specs: RoundSpec[] = [];
for (const st of STATES) for (const skill of SKILL_NAMES) for (const dt of steps) for (let i = 0; i < SEEDS; i++) specs.push({ cfg: cfgOf(st), skill, seed: 1000 + i, dt });
const res = await runRounds(specs);
const dtRows: Record<string, unknown>[] = [];
let k = 0;
for (const st of STATES)
  for (const skill of SKILL_NAMES) {
    const byDt = steps.map(() => res.slice(k, (k += SEEDS)));
    const cash = byDt.map((rs) => mean(rs.map((r) => r.cash)));
    const lvl = byDt.map((rs) => mean(rs.map((r) => r.endLevel)));
    dtRows.push({ state: st.name, skill, cash, lvl });
    for (let d = 1; d < steps.length; d++) {
      // Per-seed spread is large; compare means against their standard error.
      const a = byDt[0].map((r) => r.cash);
      const b = byDt[d].map((r) => r.cash);
      const se = Math.sqrt((variance(a) + variance(b)) / SEEDS);
      const diff = cash[d] - cash[0];
      const rel = diff / Math.max(1, cash[0]);
      check(
        `dt 1/${Math.round(1 / steps[d])} vs 1/60, ${st.name} ${skill}`,
        Math.abs(diff) <= 2.5 * se || Math.abs(rel) <= 0.05,
        `cash ${fmtPct(rel)} (${(diff / Math.max(1e-9, se)).toFixed(1)} SE), end size ${(lvl[d] - lvl[0]).toFixed(2)}`,
      );
    }
  }
out.dt = dtRows;

function variance(xs: number[]): number {
  const m = mean(xs);
  return xs.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, xs.length - 1);
}
function fmtPct(x: number): string {
  return `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;
}

// 2. Combo reconstruction, at the played level, against World's own cash.
for (const st of STATES) {
  const cfg = cfgOf(st);
  const r = runRound({ cfg, skill: 'strong', seed: 7 });
  const rel = r.cashByCombo[st.save.upgrades.combo] / r.worldCash - 1;
  check(`combo recompute, ${st.name} (combo ${st.save.upgrades.combo})`, Math.abs(rel) < 0.01, fmtPct(rel));
}

// 3. Scaling: cash multiplier and tier only scale cash.
{
  const st = STATES[3];
  const cfg = cfgOf(st);
  const base = new World(generateMap(cfg.mapId), { ...cfg, cashMult: 1, goldChance: 0 }, { seed: 9 });
  const scaled = new World(generateMap(cfg.mapId), { ...cfg, cashMult: 3, mapMul: cfg.mapMul * 16, goldChance: 0 }, { seed: 9 });
  for (const w of [base, scaled]) {
    let t = 0;
    while (!w.ended && t < 4000) {
      w.input = { x: Math.cos(t / 90), z: Math.sin(t / 130) };
      w.step(1 / 30);
      w.events.length = 0;
      t++;
    }
  }
  const ratio = scaled.cash / base.cash;
  check('cashMult 3 x tier 2 scales cash exactly', Math.abs(ratio / 48 - 1) < 1e-9 && scaled.main.level === base.main.level, `x${ratio.toFixed(6)}, levels ${base.main.level} / ${scaled.main.level}`);
}

// 4. Golden expectation: the same rounds at golden chance 0 and 9% (golden props change nothing
// but cash), against base x goldFactor.
{
  const st = STATES[3];
  const cfg = cfgOf(st);
  const p = 0.09;
  const n = 200;
  const plain = await runRounds(Array.from({ length: n }, (_, i) => ({ cfg, skill: 'average' as const, seed: 500 + i })));
  const gold: number[] = [];
  for (let i = 0; i < n; i++) {
    const w = new World(generateMap(cfg.mapId), { ...cfg, cashMult: 1, goldChance: p }, { seed: 500 + i });
    let t = 0;
    while (!w.ended && t < 2400) {
      w.input = { x: Math.cos(t / 70 + i), z: Math.sin(t / 110 + i) };
      w.step(1 / 30);
      w.events.length = 0;
      t++;
    }
    const base = new World(generateMap(cfg.mapId), { ...cfg, cashMult: 1, goldChance: 0 }, { seed: 500 + i });
    t = 0;
    let goldCash = 0;
    let all = 0;
    while (!base.ended && t < 2400) {
      base.input = { x: Math.cos(t / 70 + i), z: Math.sin(t / 110 + i) };
      base.step(1 / 30);
      for (const e of base.events) if (e.k === 'eat') {
        all += e.cash;
        if (e.o.gold) goldCash += e.cash;
      }
      base.events.length = 0;
      t++;
    }
    gold.push(w.cash / (base.cash * goldFactor(p, all ? goldCash / all : 0)));
  }
  const rel = mean(gold) - 1;
  const se = Math.sqrt(variance(gold) / n);
  check('golden 9%: mean cash vs base x goldFactor', Math.abs(rel) < Math.max(0.03, 2.5 * se), `${fmtPct(rel)} (SE ${(se * 100).toFixed(1)}%), UFO-drop share ${(mean(plain.map((r) => r.goldShare)) * 100).toFixed(1)}%`);
}

// 5. Formulas by hand.
{
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b));
  const car = OBJECT_TYPES[typeId('car')];
  const f = 0.425 * Math.hypot(4.2, 1.9);
  check('car footprint', near(footprintOf(car), f), `${f.toFixed(4)}`);
  check('car XP = f^2', near(xpOf(car), f * f), `${(f * f).toFixed(4)}`);
  check('car value', baseValueOf(car) === Math.max(1, Math.round(6 * f ** 1.3 * (1 + 1.5 / 20))), `${baseValueOf(car)}`);
  const r = radiusForLevel(10);
  check('radius L10', near(r, 0.75 * 1.125 ** 10), r.toFixed(4));
  check('XP for L3 (ramp)', near(xpForLevel(3), 8 * radiusForLevel(3) ** 2 * (5 / 6)), xpForLevel(3).toFixed(4));
  check('frontier bonus at the limit = x4', near(frontierXpMult(0.9 * r, r), 4), frontierXpMult(0.9 * r, r).toFixed(4));
}

mkdirSync('balance/data', { recursive: true });
writeFileSync('balance/data/parity.json', JSON.stringify({ ...out, lines }, null, 1));
console.log(lines.join('\n'));
console.log(`${lines.length - failures}/${lines.length} parity checks pass`);
