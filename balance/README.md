# Balance tools

Simulated players for Snack Hole's pacing, built on the real game code (`src/core/`). Re-run them
after any change to `src/config/balance.ts`, `src/config/objects.ts` or a map generator.
`ECONOMY.md` lists every formula; `report.ts` writes dated reports to `reports/` (gitignored, like
`data/`; `NOTES.md` keeps the numbers that matter); `tuned/finalist.json` is the tuned set now
written into the game (with the values it replaced).

## After a content or balance change

```bash
npx tsx balance/parity.ts                                    # still 50/50?
npx tsx balance/layer-b.ts --mode direct --seeds 1-3         # playthroughs on real rounds
npx tsx balance/layer-a.ts                                   # refit the model (needed after any config change)
npx tsx balance/experiments.ts
npx tsx balance/report.ts                                    # read the violations table first
```

Keep the previous data to compare against: rename `layerB-direct.json` / `experiments.json` to
`*-pre.json` first, then `npx tsx balance/validate.ts --pairs "pre:"` and
`npx tsx balance/compare.ts --before <old report> --after <new report> --before-tag pre --tag ''`.

## Run everything

```bash
npx tsx balance/static-stats.ts > balance/static/stats.md   # per-map tables, no simulation (1 s)
npx tsx balance/parity.ts                                    # Layer A parity checks (~20 s)
npx tsx balance/layer-a.ts                                   # Layer A grid + fitted model (~2 min)
npx tsx balance/layer-b.ts --mode direct --seeds 1-3         # playthroughs on real rounds (~1 min)
npx tsx balance/layer-a.ts                                   # refit, now with Layer B's rounds
npx tsx balance/layer-b.ts --mode model --seeds 1-3          # same playthroughs through the model
npx tsx balance/layer-b.ts --mode model --seeds 4-10 --tag fresh
npx tsx balance/experiments.ts                               # paired upgrade / skill experiments (~1 min)
npx tsx balance/report.ts                                    # balance/reports/<timestamp>/report.md
```

Tuning (Phase 3). These ran against the config from before tuning. Parameter values are
absolute, except `upgrades.growthScale`, which scales the config's own cost growths: never apply
`tuned/finalist.json` again to the tuned game.

```bash
npx tsx balance/diagnose.ts                                  # mechanisms behind the misses
npx tsx balance/tune.ts --gens 50 --tag c                    # CMA-ES over lib/params.ts, scored by lib/loss.ts (~25 min)
npx tsx balance/tune.ts --finalists balance/data/tune-c.json --seeds 3-8   # re-score the best on other seeds
npx tsx balance/layer-b.ts --mode direct --seeds 1-3 --params balance/data/finalist.json --tag tuned
npx tsx balance/layer-b.ts --mode direct --seeds 4-10 --tag fresh            # baseline, fresh seeds
npx tsx balance/layer-b.ts --mode direct --seeds 4-10 --params balance/data/finalist.json --tag tuned-fresh
npx tsx balance/experiments.ts --tag tuned
npx tsx balance/validate.ts --pairs ":tuned,fresh:tuned-fresh"             # loss on real rounds, both seed sets
npx tsx balance/report.ts --tag tuned --notes <notes.md>
npx tsx balance/compare.ts --before balance/reports/<baseline> --after balance/reports/<tuned> --tag tuned
```

Generated data goes to `balance/data/` (gitignored, rebuilt by the commands above). Every file
records the git commit it was made from; seeds are fixed by the flags above.

## Pieces

- **Layer A** (`lib/round.ts`, `lib/bots.ts`): one real round. A bot steers the real `World`
  through `w.input` and presses abilities; the round is measured (cash per Combo Window level,
  size over time, eaten per size, dead time, map %, and with `detail` the share of time the next
  goal is on screen, vacuuming, Katamari loops, small-prop value). Cash is measured at cash
  multiplier 1, tier 0, no golden props; Layer B applies those exactly.
- **Bots**: `strong` (routes by XP per metre over clusters, knows the map, times abilities, quits
  on crumbs), `average` (nearest visible prop with a size preference, reaction delay, steering
  noise), `weak` (slow, wanders, random nearby picks, chases props too big). Numbers in `SKILLS`.
- **Parity** (`parity.ts`): step size vs the game's 60 fps, combo recompute, cash scaling, golden
  expectation, formulas by hand.
- **Fitted model** (`lib/model.ts`, `lib/forest.ts`): a random forest per map and skill over the
  round config; a prediction is a weighted set of real training rounds. `layer-a.ts` prints its
  error against 8-round means on fresh states.
- **Layer B** (`lib/progress.ts`): playthroughs with the game's save, `settleRound`, shop,
  offline and prestige code. Policies: `optimizer` (payback with a 10-level lookahead, decided
  with the model), `balanced`, `single` (one track), `casual` (cheapest, 30% random). Patterns:
  `binge`, `returner` (three 15-minute sessions a day, offline collected), `returner-nooff`.
- **Tuning** (`lib/params.ts`, `lib/loss.ts`, `lib/cmaes.ts`, `tune.ts`): the whitelist with
  bounds, applied at runtime by mutating `src/config/balance.ts` objects (no source edits); the
  loss is weighted target misses (average and weak count 1.5x) plus a penalty on change size.
  `report.ts --notes <file>` puts a hand-written summary at the top of a report; `NOTES.md`
  collects what each pass changed, dropped and left open.
- **Calibration**: play with the dev server at `http://localhost:5101/?log` (plus `&fresh` or
  `&save=calib-farm` / `&save=calib-harbor`); each round is appended to
  `balance/calibration/rounds.jsonl`. `calibrate.ts` compares the bots with those rounds.

## Limits

Bots are not people. Results are a guide to confirm by playing, not a verdict.
