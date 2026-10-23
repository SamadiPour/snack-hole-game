# CLAUDE.md

Snack Hole is a hole-swallows-the-world browser game with an incremental meta-game, built with Vite, TypeScript and three.js, no UI framework. README.md covers features and controls. DESIGN.md holds the economy formulas, pacing targets and module map.

## Commands

- `npm run dev`: dev server on :5101 (strict port).
- `npm run build`: `tsc --noEmit`, then the Vite build into `dist/`. There is no linter; `npx tsc --noEmit` is the type check.
- `npm test`: vitest. One file: `npx vitest run tests/economy.test.ts`. One test: add `-t "<test name>"`.
- `npm run sim -- --human --runs 6 --seeds 1-10`: headless balance sim that prints PASS/FAIL pacing targets for each seed, run in parallel (`--report --seed N` for one seed with its event log). `--human` is a casual player and `--good` a strong one; run both after changing `src/config/balance.ts`, and trust a target only when it passes on every seed. DESIGN.md's pacing tables come from these reports.
- `npm run sim:tour` (`-- --good`, `--seeds 1-5`, `--map airport`): casual Tour pacing per map, from each map's Tour start size to a clear. Rerun it after changing `TOUR` or a map's layout; `TOUR.par` comes from it.
- `npm run itch`: relative-path build in `itch/build/` without the service worker, zipped to `itch/snack-hole.zip` (gitignored).
- Pushing to `main` deploys (`.github/workflows/deploy.yml`). One job runs `npm test` once, then builds both targets: GitHub Pages with `--base=/<repo>/`, and itch.io with `npm run itch`. Two jobs then deploy in parallel: Pages, and the itch build pushed with butler (channel `samadipour/snack-hole:html5`, needs the `BUTLER_API_KEY` repo secret). Build public asset URLs from `import.meta.env.BASE_URL`, as `src/audio/music.ts` does.
- Skipping a deploy: pushes that only touch `*.md`, `LICENSE` or `screenshots/` deploy nothing (`paths-ignore`). For other pushes that need no new version (tests, scripts, tooling), put `[skip ci]` in the message of the last commit pushed; GitHub checks only that commit. To deploy later without a new commit, run the workflow by hand (`gh workflow run deploy.yml`).

## Architecture

- **Pure core**: `src/core/` imports no DOM and no three.js, so vitest and `scripts/sim.ts` run the real round simulation and economy headless. Core randomness goes through the seeded `Rng` (`core/rng.ts`), which keeps maps, tests, the sim and `?seed` deterministic. `Math.random` appears only in render and audio.
- **Sim to presentation**: `World` (`core/world.ts`) runs one round and reports what happened as `WEvent`s pushed onto `world.events` (`eat`, `level`, `ability`, `event`, `timeUp`, `snackedOut`, …). Every frame, `game.ts` passes the array to `RoundFeedback` (`round-fx.ts`), which drives audio, HUD and particles, then clears it. Add new feedback as a new event kind.
- **Rendering**: `render/` draws the current `World` with one `InstancedMesh` per prop type. Only objects flagged `dirty` get their instance rewritten each frame, so sim code that moves or changes a `WObj` sets `o.dirty = true`.
- **Game glue**: `game.ts` is the state machine (hub, round, results). It wires save, economy, `World`, renderer, UI and audio together. The hub runs a bot-driven demo `World` behind the menus. Storage, backups and the one-saving-tab guard live in `persistence.ts`; settings wiring in `settings-flow.ts`. `settleRound` (`core/round.ts`) books a finished round into the save for both the game and `scripts/sim.ts`, so change round bookkeeping there.
- **Casual Tour**: `core/tour.ts` builds a `RoundConfig` with `casual: true` for the same `World`: no timer, and catch-up growth instead of snacking out. Its progress lives only in `save.tour`; `settleTour` books Tour rounds and `settleRound` never sees them.
- **Numbers**: economy numbers live in `src/config/balance.ts` and the prop catalogue in `src/config/objects.ts`. `core/economy.ts` holds the formulas. DESIGN.md describes them, but the config files are the source of truth.
- **Save**: `migrate()` in `core/save.ts` merges the stored save over `defaultSave()`, so a new field only needs a default. It also drops non-finite or negative numbers and clamps levels to their caps (`clampToGame`), so a new capped field needs a line there. Renamed or reshaped data needs a `SAVE_VERSION` bump (`config/balance.ts`) plus a `MIGRATIONS` entry.
- **Dev-only code**: the debug panel (dynamic import), `window.game` and `src/dev/` sit behind `import.meta.env.DEV`, so release builds drop them.
- **PWA**: `vite.config.ts` writes `dist/sw.js` from `src/service-worker.js` with the precache list and versioned cache names. Only release builds register it (`src/pwa.ts`); the dev server unregisters any worker a local release build (`npm run play`, `npm run preview`) left on the same origin.

## Testing

- **Browser pane**: start `snack-hole-dev` (`.claude/launch.json`, local and gitignored, port 5180), then load `http://localhost:5180/?mute&fresh` before the first click. The user hears every sound the pane plays, so keep `?mute` on every URL. Port 5101 belongs to the user's own `npm run dev`.
- **Start state**: the pane keeps its localStorage save across sessions, so begin from `?fresh` (new save) or `?save=midgame` (fixture save). Both keep the save in memory only. Flags: `src/dev/flags.ts`; fixtures: `src/dev/fixtures.ts`.
- **Repeatable rounds**: add `?seed=N` and every round starts from the same world (objects, movers, RNG state). The sim steps on real frame time, so later frames drift.
- **Driving the game**: dev builds expose `window.game`. `game.debugState` holds state, world, save and frame timings; `game.warp = 10` speeds time; `game.debugState.world.timeLeft = 0.01` ends a round. `scripts/smoke.mjs` shows the full flow.
- **Hidden pane**: when the pane is hidden (`document.hidden`), the game pauses the round and shows the offline-earnings dialog on return. Run long or timing-sensitive checks headless.
- **Map layouts**: `npx tsx scripts/floorplan.ts [--props] [mapId...]` writes top-down plans of the generated maps (ground paint, with `--props` every prop's footprint, after the size ladder) to `screenshots/floor-*.png`. A layout change also changes the map's pinned fingerprint in `tests/mapgen.test.ts`.
- **Headless**: `npm run smoke`, `scripts/shots.mjs`, `scripts/ui-shots.mjs` and `scripts/profile.mjs` start their own Vite on a free port (or use `BASE_URL`) and drive silent headless Chrome. After gameplay or UI changes, run `npm test` and `npm run smoke`. Smoke overwrites the tracked `screenshots/desktop-05-biground.png` (the README image); restore it with `git checkout` unless the image should change.
