import { SIZE, type MapId } from '../config/balance';
import { OBJECT_TYPES } from '../config/objects';
import { radiusForLevel } from '../core/size';
import { ALIVE, GONE, MV_NONE, MV_RUN, type WObj } from '../core/world';
import type { Game } from '../game';
import { fxOn, type FxLabMode } from './flags';

/** Sim seconds before the first swallow (the camera settles), and per swallow; the prop slides in during SLIDE_FROM..SLIDE_TO. */
const SETTLE = 2;
const CYCLE = 3.2;
const SLIDE_FROM = 0.8;
const SLIDE_TO = 1.4;
/** The prop's footprint, as a fraction of the biggest that fits (big enough for every effect). */
const REL_MIN = 0.7;
const REL_MAX = 0.95;
/** Smallest fraction accepted for the chosen prop: still a big gulp (round-fx BIG_GULP). */
const BIG_ENOUGH = 0.6;
/** The hole grows until the chosen prop is at most this fraction of the biggest that fits. */
const REL_GROW = 0.85;
/** Prop the lab feeds by default (`&fxprop=<id>` picks another); without one on the map it picks a common big prop. */
const DEFAULT_PROP = 'truck';

const NAMES: Record<FxLabMode, string> = { gulp: 'spin-up + debris', spaghetti: 'spaghettification', all: 'all big-swallow effects' };

/**
 * Dev FX lab (`?fxlab`, `?fxlab=gulp`, `?fxlab=spaghetti`, optionally `&fxprop=<id>`): starts a
 * round, grows and parks the hole, and every CYCLE seconds slides the same kind of big prop (a Box
 * Truck by default) into it from the right. Swallows alternate with the effect off (BEFORE) and on
 * (AFTER), so the two can be compared side by side in time.
 */
export function startFxLab(game: Game, mode: FxLabMode): void {
  const label = document.createElement('div');
  label.style.cssText =
    'position:fixed;left:50%;top:84px;transform:translateX(-50%);z-index:50;padding:8px 18px;border-radius:999px;font:900 20px system-ui,sans-serif;color:#fff;pointer-events:none;text-shadow:0 2px 0 rgba(0,0,0,.3)';
  document.body.appendChild(label);

  let type = -1;
  let anchorX = 0;
  let anchorZ = 0;
  let anchored = false;
  let cycle = -1;
  let prop: WObj | null = null;

  const setOn = (on: boolean): void => {
    fxOn.gulp = on || mode === 'spaghetti';
    fxOn.spaghetti = on || mode === 'gulp';
    label.textContent = `${on ? 'AFTER' : 'BEFORE'} · ${NAMES[mode]} ${on ? 'on' : 'off'}`;
    label.style.background = on ? '#1f9d55' : '#6b6b80';
  };

  /**
   * The chosen prop type, with the hole grown so it fits with room to spare. Without one on the
   * map, -1: nextProp then picks the most common big static type instead.
   */
  const chooseType = (): number => {
    const w = game.debugState.world!;
    const id = new URLSearchParams(location.search).get('fxprop') ?? DEFAULT_PROP;
    const t = OBJECT_TYPES.findIndex((d) => d.id === id);
    const sample = w.objects.find((o) => o.t === t && o.state === ALIVE && !o.event && o.mv !== MV_RUN);
    if (!sample) return -1;
    const h = w.main;
    while (sample.f > REL_GROW * SIZE.fit * radiusForLevel(h.level)) h.level++;
    h.baseR = radiusForLevel(h.level);
    return t;
  };

  /** Next unused prop of the lab's type. */
  const nextProp = (): WObj | null => {
    const w = game.debugState.world!;
    const fit = SIZE.fit * w.main.baseR;
    // Golden props add their own burst, which would muddy the comparison.
    const size = (o: WObj, lo: number): boolean => !o.event && !o.gold && o.f >= lo * fit && o.f <= REL_MAX * fit;
    const big = (o: WObj, lo: number): boolean => o.state === ALIVE && size(o, lo);
    if (type >= 0) {
      const pick = (o: WObj): boolean => o.t === type && o.mv !== MV_RUN && size(o, BIG_ENOUGH);
      const alive = w.objects.find((o) => pick(o) && o.state === ALIVE);
      if (alive) return alive;
      // All eaten: bring a swallowed one back, so the loop runs forever.
      const gone = w.objects.find((o) => pick(o) && o.state === GONE);
      if (!gone) return null;
      Object.assign(gone, { state: ALIVE, y: gone.baseY, hole: -1, ox: 0, oz: 0, tilt: 0, vy: 0, ft: 0, wob: 0, dirty: true });
      if (gone.mv === MV_NONE) w.grid.insert(gone);
      else w.movers.push(gone);
      return gone;
    }
    const ok = (o: WObj): boolean => o.mv === MV_NONE && !OBJECT_TYPES[o.t].landmark && big(o, REL_MIN);
    const counts = new Map<number, number>();
    for (const o of w.objects) if (ok(o)) counts.set(o.t, (counts.get(o.t) ?? 0) + 1);
    type = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1;
    return w.objects.find((o) => o.t === type && ok(o)) ?? null;
  };

  /** A spot near the start with no prop too big to swallow nearby, so nothing blocks the view. */
  const clearSpot = (): [number, number] => {
    const w = game.debugState.world!;
    const { x: x0, z: z0, baseR: r } = w.main;
    const fit = SIZE.fit * r;
    const lim = w.map.half - 10;
    for (let ring = 0; ring < 16; ring++) {
      for (let k = 0; k < (ring ? 12 : 1); k++) {
        const a = (k / 12) * Math.PI * 2;
        const x = x0 + Math.cos(a) * ring * 10;
        const z = z0 + Math.sin(a) * ring * 10;
        if (Math.abs(x) > lim || Math.abs(z) > lim) continue;
        let blocked = false;
        w.grid.query(x, z, r * 4 + Math.min(w.maxF, 30), (o) => {
          if (o.state === ALIVE && o.f > fit && Math.hypot(o.x - x, o.z - z) < r * 4 + o.f) blocked = true;
        });
        if (!blocked) return [x, z];
      }
    }
    return [x0, z0];
  };

  const frame = (): void => {
    requestAnimationFrame(frame);
    const { state, world: w } = game.debugState;
    if (state === 'hub') {
      const map = new URLSearchParams(location.search).get('map');
      if (map) game.debugState.save.selectedMap = map as MapId;
      game.play();
      anchored = false;
      cycle = -1;
      return;
    }
    if (state !== 'round' || !w) return;
    // The game pauses whenever the page is hidden; the lab keeps running once it is back.
    if (!document.hidden) game.resume();
    const h = w.main;
    if (!anchored) {
      type = chooseType();
      [anchorX, anchorZ] = clearSpot();
      w.cfg.xpMult = 0;
      anchored = true;
    }
    // Park the hole (ignore steering) and keep the round from ending; helpers wait far away.
    h.x = anchorX;
    h.z = anchorZ;
    h.vx = h.vz = 0;
    w.timeLeft = 999;
    for (const o of w.holes) if (!o.main) o.x = o.tx = anchorX + 400;

    const lt = w.time - SETTLE;
    if (lt < 0) return;
    const c = Math.floor(lt / CYCLE);
    const t = lt - c * CYCLE;
    if (c !== cycle) {
      cycle = c;
      setOn(c % 2 === 1);
      prop = nextProp();
      if (!prop) label.textContent = 'FX lab: no big prop of one kind left on this map';
    }
    if (!prop || prop.state !== ALIVE) return;
    // Stand just outside the rim facing the hole, then slide straight in. Road vehicles are held
    // still (they skip moving while waiting); they are not in the grid, so only props get updated.
    const k = Math.min(1, Math.max(0, (t - SLIDE_FROM) / (SLIDE_TO - SLIDE_FROM)));
    const d = h.r * (2 - 1.7 * k);
    prop.x = anchorX + d;
    prop.z = anchorZ;
    prop.y = prop.baseY;
    prop.rot = Math.PI;
    prop.dirty = true;
    if (prop.mv === MV_NONE) w.grid.update(prop);
    else prop.wait = 1;
  };
  requestAnimationFrame(frame);
}
