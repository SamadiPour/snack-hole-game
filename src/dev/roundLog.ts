import { ABILITIES, type AbilityId } from '../config/balance';
import { OBJECT_TYPES } from '../config/objects';
import { levelToEat } from '../core/size';
import { ALIVE, DORMANT, type World } from '../core/world';
import type { Game } from '../game';

/**
 * Dev-only calibration log (`?log`): records every round you play so the balance tools in
 * balance/ can tune their bots to a real player. It polls `game.debugState` once per frame, so
 * the game needs no hooks, and posts each finished round to the dev server, which appends it to
 * balance/calibration/rounds.jsonl (the balance-log plugin in vite.config.ts). Release builds
 * never load this module.
 */

/** Seconds of round time between position / size samples. */
const SAMPLE_EVERY = 0.5;

interface Eat {
  /** Round time of the swallow. */
  t: number;
  type: string;
  f: number;
  /** 0 = main hole, 1+ = helper. */
  hole: number;
  gold: boolean;
  event: boolean;
  /** Size level that first fits this prop, and the main hole's level when it went in. */
  propLevel: number;
  holeLevel: number;
  value: number;
}

interface Sample {
  t: number;
  level: number;
  cash: number;
  x: number;
  z: number;
  pct: number;
  /** Stick magnitude this frame (0..1). */
  input: number;
}

interface Tracker {
  world: World;
  startedAt: number;
  /** Real seconds spent in the hub before this round (shop, menus); null for the session's first round. */
  hubSeconds: number | null;
  save: unknown;
  seen: Uint8Array;
  eats: Eat[];
  samples: Sample[];
  levelTimes: number[];
  lastLevel: number;
  nextSample: number;
  lastTime: number;
  /** Round seconds with the stick past 0.2, and the sum of stick magnitude x seconds. */
  steerSeconds: number;
  inputSum: number;
  casts: { id: AbilityId; t: number; waited: number }[];
  readySince: Record<AbilityId, number | null>;
  lastCd: Record<AbilityId, number>;
}

export function startRoundLog(game: Game): void {
  const log: unknown[] = [];
  (window as unknown as { roundLog: unknown[] }).roundLog = log;
  let tr: Tracker | null = null;
  let hubSince = performance.now();
  let rounds = 0;
  console.info('[roundLog] on: every round is posted to balance/calibration/rounds.jsonl');

  const begin = (w: World): Tracker => {
    const s = game.debugState.save;
    const ready = {} as Record<AbilityId, number | null>;
    const cd = {} as Record<AbilityId, number>;
    for (const a of ABILITIES) {
      ready[a.id] = null;
      cd[a.id] = w.abilities[a.id].cd;
    }
    return {
      world: w,
      startedAt: performance.now(),
      hubSeconds: rounds > 0 ? (performance.now() - hubSince) / 1000 : null,
      save: {
        upgrades: { ...s.upgrades },
        abilities: { ...s.abilities },
        helpers: s.helpers,
        helperLevel: s.helperLevel,
        dmUpgrades: { ...s.dmUpgrades },
        tier: s.tier,
        prestiges: s.stats.prestiges,
        rounds: s.stats.rounds,
        mapLevel: { ...s.mapLevel },
        map100: { ...s.map100 },
      },
      seen: new Uint8Array(w.objects.length),
      eats: [],
      samples: [],
      levelTimes: [],
      lastLevel: w.main.level,
      nextSample: 0,
      lastTime: w.time,
      steerSeconds: 0,
      inputSum: 0,
      casts: [],
      readySince: ready,
      lastCd: cd,
    };
  };

  const track = (t: Tracker): void => {
    const w = t.world;
    const dt = w.time - t.lastTime;
    t.lastTime = w.time;
    if (w.running && dt > 0) {
      const m = Math.min(1, Math.hypot(w.input.x, w.input.z));
      t.inputSum += m * dt;
      if (m > 0.2) t.steerSeconds += dt;
    }
    for (let i = 0; i < w.objects.length; i++) {
      const o = w.objects[i];
      if (t.seen[i] || o.state === ALIVE || o.state === DORMANT) continue;
      t.seen[i] = 1;
      t.eats.push({ t: w.time, type: OBJECT_TYPES[o.t].id, f: o.f, hole: o.hole, gold: o.gold, event: o.event, propLevel: levelToEat(o.f), holeLevel: w.main.level, value: o.value });
    }
    while (t.lastLevel < w.main.level) {
      t.lastLevel++;
      t.levelTimes.push(w.time);
    }
    for (const a of ABILITIES) {
      const st = w.abilities[a.id];
      if (w.cfg.abilities[a.id].level <= 0) continue;
      if (st.cd > t.lastCd[a.id] + 0.25) {
        t.casts.push({ id: a.id, t: w.time, waited: t.readySince[a.id] === null ? 0 : w.time - t.readySince[a.id]! });
        t.readySince[a.id] = null;
      } else if (st.cd <= 0 && w.running && t.readySince[a.id] === null) t.readySince[a.id] = w.time;
      t.lastCd[a.id] = st.cd;
    }
    if (w.time >= t.nextSample) {
      t.nextSample += SAMPLE_EVERY;
      t.samples.push({ t: w.time, level: w.main.level, cash: w.cash, x: w.main.x, z: w.main.z, pct: w.percentEaten, input: Math.min(1, Math.hypot(w.input.x, w.input.z)) });
    }
  };

  const finish = (t: Tracker): void => {
    const w = t.world;
    rounds++;
    hubSince = performance.now();
    const entry = {
      v: 1,
      at: new Date().toISOString(),
      port: location.port,
      viewport: { w: innerWidth, h: innerHeight, touch: matchMedia('(pointer: coarse)').matches },
      map: w.cfg.mapId,
      seed: w.opts.seed,
      cfg: w.cfg,
      save: t.save,
      hubSeconds: t.hubSeconds,
      wallSeconds: (performance.now() - t.startedAt) / 1000,
      played: w.time,
      endReason: w.endReason,
      timeLeft: w.timeLeft,
      cash: w.cash,
      timeBonus: w.timeBonus,
      helperCash: w.helperCash,
      startLevel: w.cfg.startLevel,
      endLevel: w.main.level,
      pct: w.percentEaten,
      eaten: w.eaten,
      helperEaten: w.helperEaten,
      comboBest: w.comboBest,
      goldEaten: w.goldEaten,
      levelTimes: t.levelTimes,
      steerShare: w.time > 0 ? t.steerSeconds / w.time : 0,
      meanInput: w.time > 0 ? t.inputSum / w.time : 0,
      casts: t.casts,
      eats: t.eats,
      samples: t.samples,
    };
    log.push(entry);
    void fetch('/__balance/log', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(entry) })
      .then((r) => console.info(`[roundLog] round ${rounds} ${r.ok ? 'saved' : `not saved (${r.status})`}: ${w.cfg.mapId}, size ${w.cfg.startLevel + 1} -> ${w.main.level + 1}, $${Math.round(w.cash)}`))
      .catch((e: unknown) => console.warn('[roundLog] post failed', e));
  };

  const frame = (): void => {
    requestAnimationFrame(frame);
    const { state, world } = game.debugState;
    if (tr && (tr.world !== world || tr.world.ended)) {
      track(tr);
      finish(tr);
      tr = null;
    }
    if (!tr && state === 'round' && world && !world.ended && !world.opts.demo) tr = begin(world);
    if (tr) track(tr);
  };
  requestAnimationFrame(frame);
}
