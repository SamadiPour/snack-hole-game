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
- Set pieces laid out around their own size (the airport's parked planes, hangars and terminal,
  the Moon Base HQ and domes) get explicit scales, one per size level, so `fillLadder` leaves
  them alone; a rescaled prop keeps its centre, so a plane shrunk later would no longer reach its
  stand or jet bridge. `scripts/floorplan.ts` draws the result top-down to check.
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

- **Golden props**: every prop rolls `1% + 1% * GoldenTouchLvl` (9% at the max level 8) to spawn golden each
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

## Cash upgrades (`cost = base * growth^level * map^0.95 * 4^tier`)

Upgrade prices are in the newest unlocked map's money: `map` is that map's value multiplier
(`priceScale`), to the power `MAP_PRICE.exp` (0.95). Unlocking a map raises them along with
income, so the shop keeps something worth buying on every map; the power makes each jump a little
smaller than the payout's (Farm x8.7 instead of x9.7, Moon Base x760 instead of x1,080), which
shortens the slow first rounds on a new map. The bases below are Suburb prices. Helper and ability
prices are fixed instead (x4 per tier only, `fixedPriceScale`): they are big one-off goals, and a
price you are saving up for should not jump when a map unlocks.

Capped tracks with few, chunky levels and no milestone multipliers. One level is bought at a
time (no bulk buy). Growth-type upgrades (Speed, Growth Rate, Magnet, Round Time) raise how many
levels a round gains, so they are priced like size upgrades.

| Upgrade | Effect per level | Base | Growth | Max | Visible at (run $) |
|---|---|---|---|---|---|
| Starting Size | +1 start level | 55 | 1.25 | 50 | 0 |
| Speed | +8% speed | 75 | 3.25 | 8 | 0 |
| Cash Value | +26% cash (linear) | 125 | 2.8 | 10 | 0 |
| Round Time | +10 s (base 60 s, max 100 s) | 500 | 2.8 | 4 | 0 |
| Growth Rate | +10% XP | 185 | 2.8 | 6 | 100 |
| Magnet | pull range `R * (0.15 + 0.12 lvl)` | 250 | 2.95 | 8 | 300 |
| Combo Window | +0.15 s window, +0.15 cap | 620 | 2.5 | 8 | 1,500 |
| Golden Touch | +1% golden chance (base 1%) | 6,200 | 2.35 | 8 | 15,000 |
| Offline Vault | +1 h offline cap (base 8 h) | 3,700 | 3 | 4 | 5,000 |

## Helper holes

- Count 1–4, one-off costs `38K, 617K, 6.56M, 177M` (visible after $800). Fixed prices, set where
  the simulated average player buys each one (Farm, Downtown, Harbor, Airport).
- Training level: `132,000 * 2.51^lvl` (max 10). Radius `0.7 * 1.13^lvl` (cap 2.4 m), +50% radius
  and speed per Quantum Helpers level (2 levels).
- Helpers only work during rounds: they chase the nearest edible prop and earn 84% of its value.
  They earn nothing between rounds or offline.

## Abilities (unlock once, then level up to 5)

| Ability | Key | Effect | Cooldown | Unlock | Level 2 | Later levels |
|---|---|---|---|---|---|---|
| Dash | Space / 1 | x2.8 speed for 0.6 s | 7 s | $300K | $2.67M | x3.25 each |
| Vortex | 2 | magnet +300% range, x3 pull, 4 s | 22 s | $2.22M | $7.41M | x3.34 each |
| Mega Mouth | 3 | radius x1.35 (+0.1 per level), 4 s | 30 s | $36.9M | $85.6M | x2.32 each |

Fixed prices, set where the simulated average player buys each one (Vortex on Downtown, Mega
Mouth on Harbor); Dash unlocks cheaper, partway through Farm, with its levels left where they
were. Level cost `levelCost * growth^(lvl - 2)`; each level −12% cooldown, +20% duration (Mega
Mouth also +10% radius).
The magnet's range and pull follow the hole's own radius, so Mega Mouth widens the mouth but
not the magnet's reach (Vortex included): it pulls whatever the mouth can swallow, from the
hole's own rim.
Rounds start with Dash ready and Vortex / Mega Mouth empty (`startCharge` 0), so their first use
comes a full cooldown into the round.

Esc (or the ⏸ button) pauses a round: the simulation freezes, with Resume / Settings / End round
(keeps the cash eaten so far). Hiding the tab also pauses.

## Maps

Maps unlock by size, not cash: reach a map's size goal in a round and the next map unlocks (and
is selected). Later maps also need Singularities.

| Map | Unlock | Goal (size) | Max size | Value x | Size offset | XP x |
|---|---|---|---|---|---|---|
| Sunny Suburb | free | 17 | 27 | 1 | 0 | 1 |
| Happy Farm | Suburb goal | 19 | 29 | 9.7 | 9 | 0.81 |
| Downtown | Farm goal | 26 | 31 | 50 | 16 | 0.63 |
| Harbor | Downtown goal | 24 | 30 | 233 | 24 | 0.49 |
| Airport | Harbor goal + 1 Singularity | 28 | 35 | 870 | 26 | 0.94 |
| Spaceport | Airport goal + 2 Singularities | 29 | 36 | 970 | 36 | 0.87 |
| Moon Base | Spaceport goal + 3 Singularities | 25 | 30 | 1,080 | 37 | 0.81 |

Goals, size offsets, XP and value multipliers were tuned with the simulators in `balance/`
(CMA-ES over simulated playthroughs; `balance/tuned/finalist.json`, results in
`balance/NOTES.md`). Goals sit below each map's XP ceiling: Harbor and Moon Base used to need the
last props of a full clear, which stalled most players a size short. Value multipliers rise map
by map, since prices follow them. The Spaceport, added later, sits between Airport and Moon Base
and unlocks with 2 Singularities. Spaceport and Moon Base take 5
more sizes off than they used to, balanced by Starting Size levels 46–50 (`balance/NOTES.md`):
a hole that maxed the old 45 levels no longer starts close to their goals. Every map tracks
its best %; reaching 100% gives a permanent +25% cash (kept through prestige).

## Casual Tour

A relaxed mode behind the Classic / Tour switch above PLAY, there from the first launch. In Tour
mode the hub shows a star count instead of cash, a ‹ › picker for the open Tour maps, and the Tour
map list in place of the shop; PLAY starts the selected Tour map. It uses the base hole, with
no upgrades, abilities, helpers or golden props, and has no timer, cash or shop. Props give XP
without the map's `xpMul`, which is there to slow upgraded players (`tourRoundConfig` in
`core/tour.ts`, numbers in `TOUR`). A light built-in magnet (half a Magnet level, reaching 21% of
the radius past the rim) forgives loose steering: it cuts clear times about 5% in the sim (a full
level, about 9%), and since its reach and pull follow the radius it adds less at big sizes
(+8–20% swallows per second) than at small ones (+15–55%), with no measurable sim cost.

- The maps come in the main game's order. The first starts at size 1 and every later one at size 11
  (`TOUR.entryLevel`), so the hole never drops back to a speck. Carrying the size over from the map
  before was tried: later maps started 95–100% edible and cleared in about 2 minutes.
- Reaching a map's size goal opens the next map at once (saved mid-round) and selects it for the
  next PLAY. A round runs until the map is cleared or the player leaves from the pause menu.
  Leaving keeps the best size and %, but the map starts over next time: there is no mid-map save.
- **Catch-up growth**: every 0.5 s, once what still fits cannot pay for another size level
  (`reachable().levels === 0`), the hole grows one level for free (`catchUp` event), but only
  while a map prop is still too big to fit. While props its current size brought within reach
  are left, it first waits up to 15 s (`TOUR.catchUpPatience`) for the player to eat them. Each
  new tier gets its turn, empty stretches of the size ladder pass at a level per 0.5 s, and the
  hole stops growing once everything left fits. Without catch-up the base hole snacked out on
  Harbor and later maps with 46–89% eaten, or spent 4–6 minutes on one size vacuuming crumbs.
  Growing until something could pay for a level was tried: most maps reached their max size
  (3 levels past eating everything) with 15–30% left to eat, and Airport and Spaceport grew 11
  sizes in 6 s with about 40% eaten. Waiting with no limit was tried too: a jet on Airport or the
  big dome on Moon Base that the player had not found yet held the hole at one size for up to
  112 s (`--human`, 20 seeds), and 156 s for a slower player model.
- Three stars per map: reach the goal, clear the map, clear it within par (`TOUR.par`: the casual
  player's median clear, rounded up to 30 s, plus 30 s). Moon Base's par is 9:00, 30 s more than
  that rule gives since the 15 s wait limit: lowering it would take back third stars already
  earned.
- Reaching the Moon Base goal completes the Tour, and earning the last of the 21 stars makes it
  perfect: each gets a celebration screen (fanfare, flash) after that round's results.
- Tour rounds book nothing into the main game (no cash, stats, Gulpedia, trophies or map
  progress). Progress lives in `save.tour` and survives Singularities. Since nothing reaches the
  Gulpedia, the first landmark of each kind gets the full slow-motion moment once per round.

`npm run sim:tour` plays every Tour map with the sim's player models, seeds 1–3, median:

| Map | Start size | Goal | Goal (`--human`) | Clear (`--human`) | Clear (`--good`) | Par |
|---|---|---|---|---|---|---|
| Sunny Suburb | 1 | 17 | 2:13 | 6:06 | 4:55 | 7:00 |
| Happy Farm | 11 | 19 | 2:09 | 7:35 | 6:44 | 8:30 |
| Downtown | 11 | 26 | 2:37 | 4:06 | 3:30 | 5:00 |
| Harbor | 11 | 24 | 2:32 | 4:33 | 3:53 | 5:30 |
| Airport | 11 | 28 | 5:53 | 6:47 | 5:39 | 7:30 |
| Spaceport | 11 | 29 | 5:31 | 5:52 | 5:49 | 6:30 |
| Moon Base | 11 | 25 | 6:25 | 7:51 | 6:39 | 9:00 |
| Whole Tour | | | 27:20 | 42:50 | 37:09 | |

The longest stretch without eating anything is 8 s (`--human`). Like the main sim, these times are
a lower bound for real players.

## Singularity (prestige)

- Available once Downtown is unlocked in the run.
- Dark Matter comes from lifetime cash: `DM total = floor(1.75 * (lifetimeCash / 1e6)^0.25)`, and a
  Singularity pays what has not been claimed yet. Doubling DM needs ~16x the cash, and collapsing
  again at the same point pays nothing, so runs must push further. The panel shows the gain, its
  % of all DM earned so far, a "Resets this run" / "You keep" list with the run's numbers, the
  next map that needs a Singularity, and a hint once the formula has grown 50% since the last
  Singularity (`dmGrowth`, before the multipliers below, so they do not bring it sooner). The confirm dialog shows a
  now / after table (start size, map, cash, upgrades, helpers, abilities, permanent cash bonus,
  DM, tier), and its reset button must be held for 1.2 s (Enter or gamepad A: press twice).
- Resets cash, upgrades, helpers, abilities, maps (Wormhole keeps maps), map goals and recent
  income. Keeps DM, DM tree, records, Gulpedia, trophies, 100% bonuses, skins, tier.
- Every Singularity after the first pays x2 Dark Matter for the same lifetime cash
  (`singularityDmMult`; with the tier bonus below). The first one, and so the whole second run,
  plays as before; from the third run on there is more to spend on the tree.
- Every DM ever earned gives +10% cash forever (spending does not reduce it).
- DM tree: Event Horizon (+25% cash, 10 levels), Dense Core (+1 start size, 10 levels), Head
  Start (start with $300 × 10^(lvl−1), 6 levels), Quantum Helpers (+50% helper radius and speed,
  2 levels), Gravity Well (+1 magnet level, 6 levels), Hawking Radiation (+4 h offline cap, 10
  DM), Wormhole (keep maps, 40 DM): about 1.4K DM in all, Dense Core's `3 * 1.7^lvl` the most
  (865). Levels above a lowered cap give their DM back when an old save loads.
- **Endless tiers.** A Singularity after a run that reached the Moon Base goal raises the tier:
  every map starts 1 size smaller per tier up to 10 sizes (tier 10), map payouts and all cash
  prices scale x4 per tier, and DM gains are x(1 + 0.1 × tier). Past tier 10 a tier only scales
  the numbers, so with maxed Starting Size and Dense Core Moon Base starts 11 sizes below its
  goal and a tier-up always takes a round (uncapped it would start at size 1 from about tier 33).
  Tiers 1, 3, 5 and 10 unlock skins (trophies).
- Skins (rim colour + swirl pattern: spiral, rings, stars, galaxy or none) cost 3–30 DM or come
  from trophies.

## Offline earnings

Coming back pays half a round of your recent income (average of the last 5 rounds) per hour
away, from 3 minutes up to an 8 h cap (4 rounds' worth). Offline Vault adds +1 h per level and
Hawking Radiation +4 h (16 h max). It needs no helpers and keeps working after a
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
Radiation: the sim never leaves the game) and collapses once the panel shows its hint
(`PRESTIGE.goodGain`: the formula grew 50% since the last Singularity; and at least +30% cash,
3 DM) and progress has stalled: the newest map's goal is reached and the next map (or, past Moon
Base, the next tier) needs a Singularity, or 4 rounds without a better size. Collapsing at the
first stall is about the fastest way through: collapsing as soon as 1–2 DM are on offer, or holding out for 6–8, reaches
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
| first Singularity | 53:14 (37:22–1h 01m) | 34:16 (26:55–37:35) |
| Moon Base (run 4) | 2h 12m (1h 52m–2h 29m) | 1h 27m (1h 18m–1h 32m) |
| run 2 rounds to the Harbor goal | 4 (2–9) | 3 (2–4) |
| seconds per level after the first | 5.53–5.93 | 4.40–4.70 |
| targets met | 9–13 of 22 | 10–12 of 22 |

Rounds to reach each map's goal, seed 1, `--human` (- = not reached that run):

| Run | Suburb | Farm | Downtown | Harbor | Airport | Spaceport | Moon Base | Run length |
|---|---|---|---|---|---|---|---|---|
| 1 | 4 | 8 | 11 | 7 | | | | 52:59 (30 rounds) |
| 2 | 3 | 4 | 3 | 3 | 4 | | | 30:14 (17) |
| 3 | 2 | 1 | 2 | 2 | 3 | 3 | | 24:19 (13) |
| 4 | 2 | 1 | 1 | 2 | 2 | 2 | 1 | 20:53 (13) |
| 5 | 2 | 1 | 1 | 1 | 1 | 1 | 1 | 10:53 (9) |
| 6 | 2 | 1 | 1 | 1 | 1 | 1 | 1 | 8:13 (8) |

Dark Matter per run, seed 1, `--human`: 6, 10, 12, 18, 30, 57 (before x2 from the second
Singularity: 5, 5, 6, 8, 13, 20).

Upgrade prices follow the newest map's value multiplier, so the shop rarely runs dry: shop visits
buy 3.5–8 items (target 1–3 for `--human`; fixed helper and ability prices get cheap on later
maps) and about 1% of visits find it sold out. Goals sit below each map's XP ceiling: from Harbor
on, a goal is reached with 65–83% of the map eaten, Moon Base 74–90%. Misses: the cheapest option
left costs 0.16–0.30 rounds of income (target 1–3), first visits take up to 12 rounds on Downtown
and 10 on Harbor (target 2–8; prices jump with each new map before Starting Size catches up) but
1–8 on the Spaceport (`--good`: 1–2) and 1 on Moon Base, later runs still reach most goals in
1–2 rounds (target 2–4), runs grind 1–6 rounds after their last goal while the formula climbs to
the hint, runs after the first tier-up earn more than twice the Dark Matter of the run before (3
of 10 `--human` seeds, 8 of 10 `--good`) and take 8–12 minutes, the median `--human` round grows
the radius x3.25–4.11 (target x4; short late runs start close to each map's size cap), one
`--human` first Singularity takes 1h 01m (target 30–60 min), and the skill band. The players in `balance/` are slower (their average bot reaches the Moon Base goal in about
2h 50m): playtesting decides which is closer.

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
    tour.ts        casual Tour: round config, map chain, stars, settleTour
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
scripts/       sim.ts (balance), tour-sim.ts (casual Tour pacing), smoke.mjs / shots.mjs / ui-shots.mjs (Playwright screenshots),
               profile.mjs (frame timings), devServer.mjs (each script starts its own Vite
               unless given a URL), floorplan.ts (top-down map plans, `--props` for footprints)
```

### Rendering notes

- Ground: one merged mesh of painted shapes (roads, lawns, water…) drawn with depth writes off
  in array order, then an invisible depth-only plane. Both discard fragments inside any hole
  (uniform array, up to 8 holes), so props sinking below y = 0 only show through the opening.
  Every layer is shaded, so the outside colour is a frame round the map, not a layer under it.
- Hole: back-side open cylinder with a dark gradient + animated stripes, swirl floor shader,
  bright rim ring and additive glow ring. Props darken with depth (`uFadeDepth`).
- Props: one `InstancedMesh` per type (≈40–60 draw calls per map); per-instance tint only on
  parts flagged `tintable`. Only dirty instances are rewritten each frame (~1 ms JS per frame
  with 1,700+ objects). Each mesh draws only the props whose bounding sphere meets the camera
  or the sun's shadow camera, packed into its first slots; the set is picked again when the view
  has moved part of a margin, so a round's start draws a few hundred props, not all 2,000 twice
  (shadow and colour pass), and swallowed props cost nothing.
- Frame budget: every screen draws on every refresh. Auto quality starts phones and tablets
  (`pointer: coarse`) at pixel ratio 1.5. A phone-sized round went from 1.85 to 1.04 ms GPU per frame (Apple M5 Pro, Metal).
- See-through occluders: in rounds, props too big to swallow that sit between the camera and the
  hole fade to 45% opacity. They are hidden in their instanced mesh and drawn as a single mesh
  (depth-only pre-pass, then a blended colour pass so only the front surface shows).
- Dash: rim after-images left along the path (pooled additive rings), a shockwave ring, sparks
  off the trailing rim and a short FOV punch.
