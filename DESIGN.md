# Snack Hole — Design

A hole roams a low-poly toy world and swallows anything that fits. Timed rounds feed a permanent
upgrade tree, new maps, helper holes, abilities and a prestige layer (Singularity).

All numbers live in `src/config/balance.ts` (economy) and `src/config/objects.ts` (props).
This file describes the formulas; the config is the source of truth.

## Core loop

1. Pick a map in the hub, press **Play** (a bot-driven demo hole roams the map behind the hub).
2. Steer for the round time: mouse = direction from screen centre, touch = virtual joystick,
   WASD / arrows override both.
3. An object falls in when its footprint `f <= 0.9 R` and its centre is inside the hole
   (`dist < R - 0.25 f`). Too-big objects overlapping the rim wobble. Small creatures flee.
4. Each swallow gives size XP and cash (`value * cashMult * comboMult`).
5. XP fills size levels; the radius tweens up; bigger things become edible
   ("Next: Car @ 10" in the HUD, "Now you can eat: …" on level-up).
6. The round ends when time runs out, when the map is cleared, or early once the hole is
   **snacked out** (below). Results (cash, time bonus, biggest bite, % map eaten, best combo, new
   Gulpedia entries, records) → hub → shop → Play again.
7. Reaching a map's **size goal** unlocks the next map and switches to it.

A round only counts once it ends: closing the tab (or the phone killing it) mid-round keeps nothing
from that round. Ending it from the pause menu does count.

### Round length and early finish

- Rounds last 60 s; Round Time adds +10 s per level, up to 100 s.
- `World.reachable()` works out what the hole can still eat: the props that fit now, plus the
  ones it would fit after growing on all of those (smallest first, one pass to the fixed point),
  plus what Mega Mouth would fit while it is active or recharges before time runs out.
- Every 0.5 s the round checks it. It is **snacked out** when nothing is reachable; a random event
  still to come starts at once instead. Crumbs the hole cannot grow on keep the round going:
  ending while something still fits reads as a bug, so quitting is left to the pause menu.
- The sim's player quits that way (no time bonus) once no more growth is possible and the
  reachable leftovers would pay less than 5% of the round's cash so far, valued at the combo cap
  since round cash includes combo. On a map not cleared yet it plays on to 100%.
- Finishing early (snacked out or map cleared) pays a time bonus of +1% of the round's cash per
  second left, up to +50%.

## Size & objects

- Radius `R(L) = 0.75 * 1.125^L`. L starts at Starting Size + Dense Core − the map's size offset −
  the Singularity tier (at most 10), and every round begins with half the XP of its first level.
- Each map has a max size (`mapMaxLevel`): the level that swallows its biggest prop, plus 3
  (`MAP_SIZE_HEADROOM`), and at least the level whose hole spans 15% of the map's width
  (`MAP_SIZE_MIN_SPAN`; only Suburb and Farm, whose props are small, reach it). Neither the start
  size nor in-round growth goes past it, so maxed upgrades on an early map no longer give a hole
  that covers the whole map.
- XP for L → L+1: `8 * R(L)^2 * min(1, (L + 2) / 6)`. A prop gives `f^2` XP, times
  `1 + 3 * (f / 0.9R)^3` for props close to the size limit. Equal exponents keep the number of
  your-size props per level constant, so growth runs at a steady ~4–6 s per level instead of
  stalling late in a round; the near-limit bonus lets sparse top tiers (a few huge landmarks)
  still grow you. The ramp makes the first few levels quick.
- Each map has an `xpMul`: denser maps grow you slower so each one takes several rounds.
- Object footprint `f = max(0.425 * hypot(w, d), 0.12 h) * scale`.
- Object value `max(1, round(6 f^1.3 (1 + h/20) * typeMul)) * mapMul`. The low exponent keeps
  income growing steadily with size (about x1.17 per level) instead of jumping when a tier of big
  props becomes edible.
- Speed `(4.5 + 2.1 R) * (1 + 0.08 * speedLvl)` m/s. Camera distance `(13 + 7.5 R)`, more on
  portrait screens.
- Map % eaten is weighted by ground area (`f^2`), so landmarks count for far more than cones.
- Size ladders: after generation, `fillLadder` (`core/mapgen/ladder.ts`) shrinks a few props from
  the next tier up into any size level that has nothing new to eat, then closes gaps left right
  below lone landmarks by shrinking everything above them. A test keeps every map's ladder free
  of gaps longer than one level. The ladder test does not check distance, so the next step also
  has to sit near the start: the airport apron carries forklifts, big baggage dollies, follow-me
  cars and service vans for sizes 8–11, otherwise those sizes stalled for 10–30 s per level while
  the hole crossed to the landside trees.
- Solid props (buildings, vehicles, silos, domes…: `solid` in `objects.ts`) block placement:
  scatter never puts props inside them, forced layouts drop small props whose core lands inside
  a solid 1.5x bigger, and wandering animals/people walk around them (1 m blocking raster that
  frees up once the solid is eaten; ponds stay blocked).

## Resources

| Resource | Earned by | Spent on | Reset by Singularity |
|---|---|---|---|
| Cash ($) | rounds (helpers eat for you during rounds), offline return bonus | upgrades, helpers, abilities | yes |
| Dark Matter (DM) | Singularity | DM tree, skins | no |

## Golden props, events and landmarks

- **Golden props**: every prop rolls `1% + 1.15% * GoldenTouchLvl` (10.2% at the max level 8) to spawn golden each
  round: worth x10, drawn in gold with a moving glint and sparkles, coin ding + gold floater on
  swallow. Results show how many you ate (✨).
- **Random events** (rounds only, not the hub demo): at round start each event rolls its chance
  (rush hour 30%, UFO 25%, stampede 35% on the farm). Hits play one at a time, the first 8–16 s in
  and the next 4–8 s after the previous ends, while ≥ 12 s remain. Measured: ~50% of rounds have
  an event (~68% on the farm), even with the base 60 s round.
  - 🚗 Rush hour: 18 extra vehicles from the map's traffic mix enter the roads out of view.
  - 🛸 UFO fly-by: a saucer (scale 0.7, edible when big enough) crosses just beyond the hole with
    a tractor beam, dropping 10 golden copies of the map's commonest small prop.
  - 🐄 Stampede (farm): 18 cows / sheep / pigs / horses charge across through the hole's row,
    veering around buildings, then leave the map.
  Event props are bonus snacks: they don't count toward map % or the size hints.
- **Landmarks** (houses, towers, barns, ships, jets, domes, big vehicles…: `landmark` in
  `objects.ts`), two tiers:
  - First one of a kind ever (new to the Gulpedia): 1.1 s of slow-motion (30% speed easing back),
    camera pull-back, dust burst, rumble + bell chord and a NEW LANDMARK! banner.
  - Later ones at ≥ 55% of your size limit: light version (smaller dust burst, quieter rumble,
    shake), no slow-mo or banner; 2.5 s cooldown.

## Combo

Swallows within the window (`1.2 s + 0.15 s * comboLvl`) of the previous one stack.
`comboMult = min(1 + 0.02 * (stack - 1), 2 + 0.15 * comboLvl)`.

## Cash upgrades (`cost = base * growth^level * 4^tier`)

Capped tracks with few, chunky levels and no milestone multipliers. One level is bought at a
time (no bulk buy). Growth-type upgrades (Speed, Growth Rate, Magnet, Round Time) raise how many
levels a round gains, so they are priced like size upgrades.

| Upgrade | Effect per level | Base | Growth | Max | Visible at (run $) |
|---|---|---|---|---|---|
| Starting Size | +1 start level | 45 | 1.45 | 45 | 0 |
| Speed | +8% speed | 60 | 5 | 8 | 0 |
| Cash Value | +31% cash (linear) | 100 | 3.8 | 10 | 0 |
| Round Time | +10 s (base 60 s, max 100 s) | 400 | 9 | 4 | 0 |
| Growth Rate | +10% XP | 150 | 5.5 | 6 | 100 |
| Magnet | pull range `R * (0.15 + 0.12 lvl)` | 200 | 5 | 8 | 300 |
| Combo Window | +0.15 s window, +0.15 cap | 500 | 4.4 | 8 | 1,500 |
| Golden Touch | +1.15% golden chance (base 1%) | 5,000 | 4.4 | 8 | 15,000 |
| Offline Vault | +1 h offline cap (base 8 h) | 3,000 | 10 | 4 | 5,000 |

## Helper holes

- Count 1–4, one-off costs `2K, 50K, 1M, 25M` (visible after $800).
- Training level: `5,000 * 3.5^lvl` (max 10). Radius `0.7 * 1.13^lvl` (cap 2.4 m), +10% radius
  and speed per Quantum Helpers level.
- Helpers only work during rounds: they chase the nearest edible prop and earn 80% of its value.
  They earn nothing between rounds or offline.

## Abilities (unlock once, then level up to 5)

| Ability | Key | Effect | Cooldown | Unlock cost |
|---|---|---|---|---|
| Dash | Space / 1 | x2.8 speed for 0.6 s | 7 s | $5K |
| Vortex | 2 | magnet +300% range, x3 pull, 4 s | 22 s | $100K |
| Mega Mouth | 3 | radius x1.45, 5 s | 30 s | $2.97M |

Level cost `unlock * 4^lvl`; each level −12% cooldown, +20% duration.
Rounds start with Dash ready and Vortex / Mega Mouth half charged (`startCharge`), so the big
ones land mid-round instead of being spent at second 0 on a tiny hole.

Esc (or the ⏸ button) pauses a round: the simulation freezes, with Resume / Settings / End round
(keeps the cash eaten so far). Hiding the tab also pauses.

## Maps

Maps unlock by size, not cash: reach a map's size goal in a round and the next map unlocks (and
is selected). Later maps also need Singularities.

| Map | Unlock | Goal (size) | Max size | Value x | Size offset | XP x |
|---|---|---|---|---|---|---|
| Sunny Suburb | free | 17 | 27 | 1 | 0 | 1 |
| Happy Farm | Suburb goal | 19 | 29 | 7.4 | 9 | 0.81 |
| Downtown | Farm goal | 26 | 31 | 57.5 | 16 | 0.63 |
| Harbor | Downtown goal | 24 | 30 | 193 | 24 | 0.49 |
| Airport | Harbor goal + 1 Singularity | 28 | 35 | 1,150 | 26 | 0.94 |
| Spaceport | Airport goal + 2 Singularities | 29 | 36 | 960 | 29 | 0.87 |
| Moon Base | Spaceport goal + 3 Singularities | 25 | 30 | 940 | 32 | 0.81 |

Goals, size offsets, XP and value multipliers were tuned with the simulators in `balance/`
(CMA-ES over simulated playthroughs; `balance/tuned/finalist.json`, report in
`balance/reports/`). Goals sit below each map's XP ceiling: Harbor and Moon Base used to need the
last props of a full clear, which stalled most players a size short. Moon Base's props are now
worth a little less in total than Airport's. Every map tracks
its best %; reaching 100% gives a permanent +25% cash (kept through prestige).

## Singularity (prestige)

- Available once Downtown is unlocked in the run.
- Dark Matter comes from lifetime cash: `DM total = floor(1.96 * (lifetimeCash / 1e6)^0.25)`, and a
  Singularity pays what has not been claimed yet. Doubling DM needs ~16x the cash, and collapsing
  again at the same point pays nothing, so runs must push further. The panel shows the gain, its
  % of all DM earned so far, a "Resets this run" / "You keep" list with the run's numbers, the
  next map that needs a Singularity, and a hint once the gain is +50%. The confirm dialog shows a
  now / after table (start size, map, cash, upgrades, helpers, abilities, permanent cash bonus,
  DM, tier), and its reset button must be held for 1.2 s (Enter or gamepad A: press twice).
- Resets cash, upgrades, helpers, abilities, maps (Wormhole keeps maps), map goals and recent
  income. Keeps DM, DM tree, records, Gulpedia, trophies, 100% bonuses, skins, tier.
- Every DM ever earned gives +10% cash forever (spending does not reduce it).
- DM tree: Event Horizon (+25% cash), Dense Core (+1 start size), Head Start
  (start with $300 × 10^(lvl−1)), Quantum Helpers (+10% helper radius and speed), Gravity Well
  (+1 magnet level), Hawking Radiation (+2 h offline cap), Wormhole (keep maps, 40 DM). The rest
  of the tree costs ~16K DM, maxed around tier 12. Dense Core goes to level 20 on the same
  `3 * 1.7^lvl` curve: levels 11–20 cost 605 to 71.7K DM (173K in all), the late-game DM sink,
  bought out around tier 17–18.
- **Endless tiers.** A Singularity after a run that reached the Moon Base goal raises the tier:
  every map starts 1 size smaller per tier up to 10 sizes (tier 10), map payouts and all cash
  prices scale x4 per tier, and DM gains are x(1 + 0.1 × tier). Past tier 10 a tier only scales
  the numbers, so with maxed Starting Size and Dense Core Moon Base still starts 1 size below its
  goal and a tier-up always takes a round (uncapped it would start at size 1 from about tier 33).
  Dense Core 10 leaves it 11 sizes below. Tiers 1, 3, 5 and 10 unlock skins
  (trophies).
- Skins (rim colour + swirl pattern: spiral, rings, stars, galaxy or none) cost 3–30 DM or come
  from trophies.

## Offline earnings

Coming back pays half a round of your recent income (average of the last 5 rounds) per hour
away, from 3 minutes up to an 8 h cap (4 rounds' worth). Offline Vault adds +1 h per level and
Hawking Radiation +2 h per level (18 h max). It needs no helpers and keeps working after a
Singularity (recent income starts low again). Time with the tab hidden counts the same way.

## Gulpedia & trophies

- Gulpedia: all 124 prop types with 3D thumbnails, discovered on first swallow, lifetime counts.
  11 sets (Street, Nature, People & Pets, Park, Vehicles, Buildings, Farm, Harbor, Airport,
  Spaceport, Moon); each completed set gives +5% cash.
- 42 trophies, each +2% cash; seven also unlock skins (four of them for Singularity tiers).

## Pacing (from `npm run sim -- --human --runs 6 --seeds 1-10`, and `--good`)

`npm run sim` plays real rounds with a greedy bot (same World + map generators). It steers for
the most size XP per distance (map goals are sizes; chasing cash instead reached Moon Base 10–15%
later), shops cheapest-first (Head Start cash before a run's first round; return-per-cost
ordering was at most ~7% faster), skips what only pays while away (Offline Vault, Hawking
Radiation: the sim never leaves the game) and collapses once the DM gain reaches the panel's hint
(`PRESTIGE.goodGain`, +50% of all DM it has earned, and at least 3 DM) and progress has stalled:
the newest map's goal is reached and the next map (or, past Moon Base, the next tier) needs a
Singularity, or 4 rounds without a better size. Collapsing at the first stall is about the
fastest way through: collapsing as soon as 1–2 DM are on offer, or holding out for 6–8, reaches
Moon Base later. A run that reaches 150 rounds without a Singularity stops the sim and fails the
report.

Two player profiles, since pacing has to suit both:

- `--human`, a casual player: 80% stick input, an ability fires about 5 s after it is ready
  (0.2 casts/s), 20 s per results + shop visit. Targets that guard against stalling are meant
  for it.
- `--good`: full stick (keys, or the mouse past 24% of the screen's short side), abilities tapped
  the moment they are ready, steering into dense patches (cluster XP within 1.5 hole radii).
  Targets that guard against goals falling in one round are meant for it.

`--report` checks the pacing targets (PASS/FAIL), `--trace` prints each round's level-up times,
`--seed` changes the world seeds, and `--seeds 1-10` runs the report once per seed in parallel and
prints them side by side. Seeds spread the timings by ±15%, so a balance decision needs 10 seeds
and a target needs margin, not one seed's pass. World seeds, ability rolls and the bot's own
randomness come from separate streams, and the sim's clock counts the end delay while the last
props fall. Its minutes are still a lower bound: menus, the Singularity dialog and first-landmark
slow motion are not counted.

Pacing aims for steady progress, not a total length: every round until a map's goal should beat
the best size so far, a goal should take a few rounds rather than one, and a run should end soon
after its last goal.

| Seeds 1–10, median (range) | `--human` | `--good` |
|---|---|---|
| first Singularity | 21:36 (19:34–23:06) | 13:02 (12:49–14:50) |
| Moon Base (run 4) | 56:07 (55:16–58:44) | 41:28 (41:03–42:31) |
| run 2 rounds to the Harbor goal | 1 (1–1) | 1 (1–1) |
| seconds per level after the first | 4.65–5.20 | 3.20–3.90 |
| targets met | 9–10 of 22 | 7–8 of 22 |

Rounds to reach each map's goal, seed 1, `--human` (- = not reached that run):

| Run | Suburb | Farm | Downtown | Harbor | Airport | Moon Base | Run length |
|---|---|---|---|---|---|---|---|
| 1 | 5 | 3 | 3 | 2 | | | 21:49 (13 rounds) |
| 2 | 3 | 2 | 2 | 1 | 1 | | 14:18 (9) |
| 3 | 2 | 1 | 1 | 1 | 1 | | 10:07 (7) |
| 4 | 2 | 1 | 1 | 1 | 1 | 1 | 19:16 (14) |
| 5 | 2 | 1 | 1 | 1 | 1 | 1 | 14:11 (11) |
| 6 | 2 | 1 | 1 | 1 | 1 | 1 | 11:43 (9) |

Since the retune with the simulators in `balance/` (goals, map offsets and multipliers, prices), no
goal sits at its map's XP ceiling: goals fall with 7–76% of the map eaten, no run gets stuck, and
Moon Base comes about twice as fast as before (1h 52m and 59 min). The sim's own targets against
goals falling too fast now miss more: later runs reach each goal in 1 round (target 2–4), run 2
reaches the Harbor goal in 1 round (target 2–3), the first Singularity comes at 13–23 min (target
30–60), shop visits buy 8–13 items (target 1–3) and leave the cheapest option at 0.13–0.17 rounds
of income (target 1–3), and runs grind 3–9 rounds after their last goal. Also missed: radius growth
per round 3.3–3.7x (target 4–10), run 3 reaching the Airport in 63–90% of run 2's time (target
25–55%) and the skill band (1.0–1.7x, target 1.5–3). The players in `balance/` are slower (their
average bot reaches the Moon Base goal in about 1h 20m): playtesting decides which is closer.

## Architecture

```
src/
  config/      balance.ts (economy numbers), objects.ts (prop catalogue: 124 types)
  core/        pure logic, no DOM/three — runs headless in tests and the sim
    format.ts      number formatting (K, M, B, T, Qa, Qi, scientific)
    economy.ts     costs, effects, map unlocks, map max sizes, offline, prestige and tiers,
                   round config
    size.ts        hole size formulas (radius, XP per level, what fits); mapgen uses them too
    save.ts        versioned save, migration, defaults
    round.ts       settleRound: books a finished round into the save (game and sim share it)
    world.ts       round simulation: holes, swallowing, movers, combo, abilities, early finish
    roundEvents.ts rush hour, UFO fly-by and stampede (staged off-stage, run one at a time)
    traffic.ts     road vehicles slow for the vehicle ahead and take turns at junctions
                   (each looks 10x a second, not every frame)
    mapgen/        seeded procedural maps (builder + one generator per map, ladder.ts fills
                   size-ladder gaps)
    bot.ts         greedy steering (sim + hub attract mode)
    spatial.ts     uniform hash grid
    achievements.ts
  render/      three.js: scene/camera (resolution follows the canvas box; Auto quality lowers the
               pixel ratio while frames run slow), ground decal mesh + hole cut shader, hole
               view, procedural prop geometry, instanced objects, particles, thumbnails,
               motion.ts (prefers-reduced-motion)
  ui/          HTML overlay: hud, hub + tabs, cards, dialogs (focus trap, Esc), toasts, debug
               panel, input (mouse, touch, keys by KeyboardEvent.code, gamepad), fatal.ts
               (error screen)
  audio/       WebAudio synth (gulps, mallet/bell chimes, countdown, fanfare, ambient beds with
               wind/surf swells, birds on the farm and suburb, gulls at the harbor) and
               music.ts: one CC0 track per map from public/music/ (CREDITS.md), looped
               gaplessly, cross-faded on map change, quieter in the hub, ducked while paused
  dev/         dev-only URL testing flags (?mute, ?fresh, ?save=NAME, ?seed=N) and fixture saves
  game.ts      state machine (hub → round → results), autosave, offline, purchases, crash guard
  persistence.ts  SaveStore: localStorage (memory for dev test saves), backup, damaged-save copy,
               one saving tab, warning when the browser refuses a write
  round-fx.ts  RoundFeedback: world events → sounds, particles, banners, floaters, shake,
               landmark slow-motion, results screen
  settings-flow.ts  settings dialog wiring: apply, export, import, restore backup, reset
  pwa.ts       service worker registration (release builds); service-worker.js is the template
               vite.config.ts turns into dist/sw.js
tests/         vitest: format, economy, shop (helpers, abilities, trophies, offline edges), save
               validation, round settlement, world/mapgen, pinned map layouts, events, prop
               builders, map size ladders
scripts/       sim.ts (balance), smoke.mjs / shots.mjs / ui-shots.mjs (Playwright screenshots),
               profile.mjs (frame timings), devServer.mjs (each script starts its own Vite
               unless given a URL)
```

### Rendering notes

- Ground: one merged mesh of painted shapes (roads, lawns, water…) drawn with depth writes off
  in array order, then an invisible depth-only plane. Both discard fragments inside any hole
  (uniform array, up to 8 holes), so props sinking below y = 0 only show through the opening.
- Hole: back-side open cylinder with a dark gradient + animated stripes, swirl floor shader,
  bright rim ring and additive glow ring. Props darken with depth (`uFadeDepth`).
- Props: one `InstancedMesh` per type (≈40–60 draw calls per map); per-instance tint only on
  parts flagged `tintable`. Only dirty instances are rewritten each frame (~1 ms JS per frame
  with 1,700+ objects).
- See-through occluders: in rounds, props too big to swallow that sit between the camera and the
  hole fade to 45% opacity. They are hidden in their instanced mesh and drawn as a single mesh
  (depth-only pre-pass, then a blended colour pass so only the front surface shows).
- Dash: rim after-images left along the path (pooled additive rings), a shockwave ring, sparks
  off the trailing rim and a short FOV punch.
