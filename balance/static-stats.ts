/**
 * Static per-map stats: what each map holds per size level, what it pays, how much XP it holds and
 * how far a hole can grow on it. Reads the real generators and World.reachable(), so it tracks
 * config changes. No simulation of movement.
 *
 *   npx tsx balance/static-stats.ts            # markdown to stdout
 *   npx tsx balance/static-stats.ts --json     # JSON to stdout
 */
import { ABILITIES, HELPERS, MAPS, SIZE, UPGRADES, type MapId } from '../src/config/balance';
import { OBJECT_TYPES, baseValueOf, typeId, xpOf } from '../src/config/objects';
import * as eco from '../src/core/economy';
import { generateMap } from '../src/core/mapgen';
import { spawnLevel } from '../src/core/mapgen/ladder';
import { defaultSave } from '../src/core/save';
import { radiusForLevel, xpForLevel } from '../src/core/size';
import { World } from '../src/core/world';

const JSON_OUT = process.argv.includes('--json');

interface LevelRow {
  level: number;
  radius: number;
  count: number;
  movers: number;
  value: number;
  xp: number;
  /** Props per 1,000 m² of map. */
  density: number;
  /** Distance from the map start to the nearest prop of this level. */
  nearest: number;
  types: string;
}

interface MapStats {
  id: MapId;
  size: number;
  spawns: number;
  movers: number;
  goal: number;
  maxLevel: number;
  sizeOffset: number;
  valueMul: number;
  xpMul: number;
  totalValue: number;
  totalXp: number;
  levels: LevelRow[];
  /**
   * Start level -> highest level reachable by eating everything (growth 0 / growth 6, no Mega
   * Mouth; and growth 0 with Mega Mouth's mouth for the whole chain, an upper bound).
   */
  ceiling: { start: number; reach0: number; reach6: number; reachMega: number }[];
  /** Lowest start level whose ceiling reaches the goal. */
  minStartForGoal0: number;
  minStartForGoal6: number;
  minStartForGoalMega: number;
}

function cfgFor(mapId: MapId, start: number, growthLvl: number, mega = 0) {
  const s = defaultSave(0);
  s.upgrades.growth = growthLvl;
  s.abilities.mega = mega;
  const cfg = eco.buildRoundConfig(s, mapId);
  return { ...cfg, startLevel: start, goldChance: 0 };
}

function stats(mapId: MapId): MapStats {
  const def = eco.mapDef(mapId);
  const map = generateMap(mapId);
  const byLevel = new Map<number, { n: number; mv: number; v: number; xp: number; near: number; types: Map<string, number> }>();
  let totalValue = 0;
  let totalXp = 0;
  for (const s of map.spawns) {
    const t = OBJECT_TYPES[typeId(s.type)];
    const l = spawnLevel(s);
    const v = baseValueOf(t, s.scale) * def.valueMul;
    const xp = xpOf(t, s.scale);
    totalValue += v;
    totalXp += xp;
    let row = byLevel.get(l);
    if (!row) byLevel.set(l, (row = { n: 0, mv: 0, v: 0, xp: 0, near: Infinity, types: new Map() }));
    row.n++;
    if (s.move) row.mv++;
    row.v += v;
    row.xp += xp;
    row.near = Math.min(row.near, Math.hypot(s.x - map.start.x, s.z - map.start.z));
    row.types.set(t.name, (row.types.get(t.name) ?? 0) + 1);
  }
  const area = map.size * map.size;
  const levels: LevelRow[] = [...byLevel.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([level, r]) => ({
      level,
      radius: radiusForLevel(level),
      count: r.n,
      movers: r.mv,
      value: r.v,
      xp: r.xp,
      density: (r.n / area) * 1000,
      nearest: r.near,
      types: [...r.types.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([n, c]) => `${n} ${c}`)
        .join(', '),
    }));

  const maxLevel = eco.mapMaxLevel(mapId);
  const ceiling: MapStats['ceiling'] = [];
  for (let start = 0; start <= def.goal; start++) {
    const reach = (g: number, mega = 0) => {
      const w = new World(map, cfgFor(mapId, start, g, mega), { seed: 1 });
      return start + w.reachable().levels;
    };
    ceiling.push({ start, reach0: reach(0), reach6: reach(6), reachMega: reach(0, 1) });
  }
  const minStart = (k: 'reach0' | 'reach6' | 'reachMega') => ceiling.find((c) => c[k] >= def.goal)?.start ?? Infinity;
  return {
    id: mapId,
    size: map.size,
    spawns: map.spawns.length,
    movers: map.spawns.filter((s) => s.move).length,
    goal: def.goal,
    maxLevel,
    sizeOffset: def.sizeOffset,
    valueMul: def.valueMul,
    xpMul: def.xpMul,
    totalValue,
    totalXp,
    levels,
    ceiling,
    minStartForGoal0: minStart('reach0'),
    minStartForGoal6: minStart('reach6'),
    minStartForGoalMega: minStart('reachMega'),
  };
}

const all = MAPS.map((m) => stats(m.id));

if (JSON_OUT) {
  console.log(JSON.stringify(all, null, 1));
} else {
  const n = (x: number, d = 0) => (Number.isFinite(x) ? x.toLocaleString('en-US', { maximumFractionDigits: d }) : '-');
  const out: string[] = [];
  out.push('## Hole size per level', '', '| Size (L+1) | Radius m | Eats footprint <= | XP to next | Speed m/s (no upgrades) |', '|---|---|---|---|---|');
  for (let l = 0; l <= 40; l += l < 10 ? 1 : 5) {
    const r = radiusForLevel(l);
    out.push(`| ${l + 1} | ${n(r, 2)} | ${n(SIZE.fit * r, 2)} | ${n(xpForLevel(l), 1)} | ${n(eco.holeSpeed(r, 1), 1)} |`);
  }
  out.push('');
  out.push(
    '## Map summary',
    '',
    'Min start = lowest start size whose "eat everything" ceiling reaches the goal; in brackets the Starting Size + Dense Core that gives it at tier 0.',
    '',
    '| Map | Size m | Props (movers) | Goal | Max | Offset | Value x | XP x | Total $ (base) | Total XP | Min start, growth 0 | growth 6 | Mega always on |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  );
  const ms = (s: MapStats, l: number) => (Number.isFinite(l) ? `${l + 1} (${l + s.sizeOffset})` : '-');
  for (const s of all)
    out.push(
      `| ${s.id} | ${s.size} | ${s.spawns} (${s.movers}) | ${s.goal + 1} | ${s.maxLevel + 1} | ${s.sizeOffset} | ${s.valueMul} | ${s.xpMul} | ${n(s.totalValue)} | ${n(s.totalXp)} | ${ms(s, s.minStartForGoal0)} | ${ms(s, s.minStartForGoal6)} | ${ms(s, s.minStartForGoalMega)} |`,
    );
  out.push('');
  out.push('## Upgrade costs (tier 0)', '', '| Upgrade | L1 | L2 | L3 | L4 | L5 | L6 | L8 | L10 | max (cost of last) | total |', '|---|---|---|---|---|---|---|---|---|---|---|');
  const money = (x: number) => (x >= 1e6 ? `${n(x / 1e6, 1)}M` : x >= 1e3 ? `${n(x / 1e3, 1)}K` : n(x));
  for (const u of UPGRADES) {
    const c = (l: number) => (l <= u.max ? money(eco.upgradeCost(u.id, l - 1)) : '-');
    const total = eco.geomBulkCost(u.base, u.growth, 0, u.max);
    out.push(`| ${u.name} | ${[1, 2, 3, 4, 5, 6, 8, 10].map(c).join(' | ')} | ${u.max} (${money(eco.upgradeCost(u.id, u.max - 1))}) | ${money(total)} |`);
  }
  for (const a of ABILITIES) {
    const c = (l: number) => money(eco.abilityCost(a.id, l));
    out.push(`| ${a.name} (unlock, L2..L5) | ${c(0)} | ${c(1)} | ${c(2)} | ${c(3)} | ${c(4)} | - | - | - | ${a.maxLevel} | ${money([0, 1, 2, 3, 4].reduce((t, l) => t + eco.abilityCost(a.id, l), 0))} |`);
  }
  out.push(`| Helper count | ${HELPERS.countCosts.map(money).join(' | ')} | - | - | - | - | 4 | ${money(HELPERS.countCosts.reduce((a, b) => a + b, 0))} |`);
  out.push(`| Helper level | ${[0, 1, 2, 3, 4, 5, 7, 9].map((l) => money(eco.helperLevelCost(l))).join(' | ')} | ${HELPERS.levelMax} | ${money(eco.geomBulkCost(HELPERS.levelBase, HELPERS.levelGrowth, 0, HELPERS.levelMax))} |`);
  out.push('');
  for (const s of all) {
    out.push(`## ${s.id}`, '', '| Size | Radius | Props | Movers | $ total | $ / prop | XP total | Props / 1000 m² | Nearest to start m | Main types |', '|---|---|---|---|---|---|---|---|---|---|');
    for (const r of s.levels)
      out.push(`| ${r.level + 1} | ${n(r.radius, 2)} | ${r.count} | ${r.movers} | ${n(r.value)} | ${n(r.value / r.count, 1)} | ${n(r.xp, 1)} | ${n(r.density, 2)} | ${n(r.nearest, 0)} | ${r.types} |`);
    out.push('', 'Start size -> highest size reachable by eating everything edible (growth 0 / growth 6 / growth 0 with Mega Mouth always on):', '');
    out.push(s.ceiling.map((c) => `${c.start + 1}→${c.reach0 + 1}/${c.reach6 + 1}/${c.reachMega + 1}`).join(', '), '');
  }
  console.log(out.join('\n'));
}
