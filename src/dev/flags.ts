/**
 * URL flags for testing, read once at startup. Dev builds only: release builds ignore the query
 * string, so every flag is off there. Flags combine, e.g. `/?mute&save=midgame&seed=7`.
 *
 *   ?mute       no audio at all: no AudioContext, no music fetches
 *   ?fresh      start from a new save and never write it to localStorage
 *   ?save=NAME  start from a fixture save (src/dev/fixtures.ts), never written to localStorage
 *   ?seed=N     the hub demo and every round use world seed N (identical starting world)
 *   ?fxlab[=gulp|spaghetti]  start a round that replays a big swallow every few seconds,
 *               alternating the big-swallow effects off (BEFORE) and on (AFTER); see dev/fxLab.ts
 *   &fxprop=ID  the prop the FX lab feeds (default: truck, the Box Truck)
 *   &map=ID     the map the FX lab plays (default: the save's selected map)
 */
const q = new URLSearchParams(import.meta.env.DEV ? location.search : '');
const seed = Number.parseInt(q.get('seed') ?? '', 10);

export type FxLabMode = 'gulp' | 'spaghetti' | 'all';

export const devFlags = {
  mute: q.has('mute'),
  fresh: q.has('fresh'),
  save: q.get('save'),
  seed: Number.isFinite(seed) ? seed : null,
  fxlab: (q.has('fxlab') ? q.get('fxlab') || 'all' : null) as FxLabMode | null,
  /** The save lives in memory only (fresh or fixture), so tests never touch the real one. */
  get ephemeral(): boolean {
    return this.fresh || this.save !== null;
  },
};

/** Big-swallow effect switches. Always on; only the FX lab turns them off, to compare. */
export const fxOn = { gulp: true, spaghetti: true };
