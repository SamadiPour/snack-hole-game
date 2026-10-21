/**
 * URL flags for testing, read once at startup. Dev builds only: release builds ignore the query
 * string, so every flag is off there. Flags combine, e.g. `/?mute&save=midgame&seed=7`.
 *
 *   ?mute       no audio at all: no AudioContext, no music fetches
 *   ?fresh      start from a new save and never write it to localStorage
 *   ?save=NAME  start from a fixture save (src/dev/fixtures.ts), never written to localStorage
 *   ?seed=N     the hub demo and every round use world seed N (identical starting world)
 *   ?log        record every round for the balance tools (roundLog.ts), saved by the dev server
 *               to balance/calibration/rounds.jsonl
 */
const q = new URLSearchParams(import.meta.env.DEV ? location.search : '');
const seed = Number.parseInt(q.get('seed') ?? '', 10);

export const devFlags = {
  mute: q.has('mute'),
  fresh: q.has('fresh'),
  save: q.get('save'),
  seed: Number.isFinite(seed) ? seed : null,
  log: q.has('log'),
  /** The save lives in memory only (fresh or fixture), so tests never touch the real one. */
  get ephemeral(): boolean {
    return this.fresh || this.save !== null;
  },
};
