## Seven maps: Spaceport and prices retuned together

The Spaceport (`spaceport.md`) was tuned against the fixed prices of Phase 4. Since Phase 5,
prices follow the newest unlocked map's value multiplier, so the Spaceport also sets prices for
most of run 3 and 4. This pass re-tuned its goal, size offset, XP and value together with every
price parameter, on the merged seven-map game (`503054d`). Sizes below are HUD sizes.

**What changed**

| Parameter | Merged | Now |
|---|---|---|
| Spaceport size offset | 29 | 31 (the hole starts 2 sizes smaller there) |
| Price scale on unlocking a map | x value multiplier | x value multiplier^0.95 (below) |

Goal 29, value x970 and XP x0.87 stay, and so do the Phase 5 base prices and growths.

**How it was decided**

- **Prices.** Two CMA-ES searches over prices, map values and the Spaceport's four parameters
  (23 parameters; then 21, with the Dark Matter curve held, since changing it needs a save
  migration) lowered the model's loss from 36.9 to 28.3 on held-out seeds 3–8. On real rounds the
  finalist did not beat the merged config: 30.5 → 30.6 on seeds 1–3, 35.5 → 36.0 on seeds 4–10.
  The model averages rounds, so it underrates stretches without a noticeable upgrade (3 rounds in
  the model, 8 on real rounds for the weak bot), and the search leaned on that. The Phase 5 prices
  stay.
- **Spaceport goal.** Every round on the Spaceport starts at the same size: Starting Size is
  maxed by run 3, and upgrades bought there move the end size by less than one size. So the goal
  falls in one round, or it needs most of the map. On real rounds (seeds 1–3):

  | Goal / offset | Loss | Game sim: map eaten at the goal | Rounds to the goal, runs 3–4 (`--human`) |
  |---|---|---|---|
  | 29 / 29 (merged) | 30.5 | 73–79% | 1 (16 of 20 visits), 2 |
  | 29 / 31 | 27.6 | 72–78% | 1 (14 of 20), 2–5 |
  | 30 / 29 | 28.4 | | |
  | 30 / 31 | 25.8 | 84–96% | 1–7; one `--good` run never reached it |
  | 31 / 29 | 28.9 | | |
  | 32 / 29 | 272 | | nobody reaches it |

  Goal 30 scores best in `balance/` but turns the Spaceport into a near full clear in the game's
  own sim, the trap Harbor and Moon Base were tuned out of. Goal 29 with offset 31 keeps the
  Spaceport below its XP ceiling and gives a few visits a second round.
- **XP and value.** The XP multiplier may only rise (slower growth would make play duller), and
  that makes the map easier. x970 sits between Airport (x870) and Moon Base (x1,080), so prices
  rise about 11% on unlocking it.

**Results** (merged → now)

Layer B scores have about ±3 points of noise across model refits, because the optimizer bot
shops by the fitted model. The figures below rerun both configs with the same model (reports
`2026-10-21T18-18-32-m0b`, merged, and `2026-10-21T18-18-34-o31b`, now, with `compare.md`).

| | Merged | Now |
|---|---|---|
| Loss, seeds 1–3 / fresh seeds 4–10 (real rounds) | 29.1 / 35.3 | 28.1 / 34.9 |
| Time to the first Moon Base goal, strong / average / weak (seeds 1–3) | 1h50m / 3h27m / 6h22m | 1h53m / 3h28m / 6h16m |
| Game sim, Moon Base (run 4), `--human` / `--good` (median, seeds 1–10) | 2h 45m / 2h 00m | 2h 46m / 2h 02m |
| Game sim targets met, `--human` / `--good` | 10–13 / 10–12 of 22 | 10–14 / 10–12 of 22 |

Against Phase 5 (six maps; 28.7 / 32.5), the seventh map costs little: content gaps are shorter
(average bot 35 → 26–29 min), but Spaceport and Moon Base first visits still take one round for
most players. Making those take 2–4 rounds needs content (more XP above size 29 on the
Spaceport) or a change to how Starting Size carries into late maps, not tuning.

Parity 0 failures; model error on the Spaceport is in line with the other maps (median cash
10–17%).

### A softer price jump on unlocking a map

Every playthrough's longest stretch without a noticeable upgrade sat on a first visit to Farm,
Downtown, Harbor or Airport, 4–19 rounds in. Unlocking a map multiplied every price by its value
multiplier while the first rounds there paid about what the previous map's last rounds did, so
buying power fell to x0.29 (Farm), x0.15 (Downtown) and x0.12 (Harbor). Prices now take the
newest map's multiplier to a power, `MAP_PRICE.exp` (`priceScale`). On real rounds, seeds 1–3
(Spaceport offset 31 in both):

| `MAP_PRICE.exp` | Loss | Longest stretch without a noticeable upgrade (strong / average / weak) | Moon Base goal (h) | Longest content gap, average / weak |
|---|---|---|---|---|
| 1 | 28.1 | 3 / 3 / 6 | 1.88 / 3.46 / 6.26 | 29 / 68 min |
| **0.95** | 27.6 | 1 / 3 / 5 | 1.74 / 2.97 / 5.74 | 26 / 49 min |
| 0.9 | 31.9 | 1 / 2 / 4 | 1.48 / 2.39 / 5.16 | 20 / 43 min |
| 0.85 | 37.3 | 1 / 2 / 4 | 1.28 / 2.28 / 4.50 | 20 / 52 min |
| 0.8 | 44.3 | 0 / 1 / 3 | 1.16 / 2.03 / 3.67 | 17 / 34 min |

0.95 is the small step: prices on Farm are 11% lower and on Moon Base 30% lower. Below it the
shop gets cheap (the cheapest option left falls under 0.1 rounds of income) and the game short.

| 0.95 vs 1 | Before | After |
|---|---|---|
| Loss, fresh seeds 4–10 | 34.9 | 32.9 |
| Longest stretch without a noticeable upgrade, fresh seeds | 2 / 4 / 6 | 1 / 3 / 5 |
| Moon Base goal, fresh seeds (h) | 1.94 / 3.40 / 6.50 | 1.67 / 2.92 / 5.96 |
| Shop sold out (share of visits after 10 min) / items bought per visit (average) | 0.2% / 2 | 1–1.4% / 3 |
| Game sim, Moon Base, `--human` / `--good` | 2h 46m / 2h 02m | 2h 25m / 1h 45m |
| Game sim targets met, `--human` / `--good` | 10–14 / 10–12 | 8–13 / 10–12 |

The game sim's misses at 0.95: more items per shop visit (3–4 for `--human`, target 1–3), and
run 2 replays run 1's maps a little faster than its 50% target on 3 seeds. Report
`2026-10-21T18-42-29-k95` with `compare.md` against `…18-18-34-o31b`.

### Fixed helper and ability prices

Playtest: ability prices climbed as the game went on. Every price followed the newest map, so
the Mega Mouth unlock went from $208K on the Suburb to $8.6M once Downtown was unlocked and $129M
on the Airport: a one-off goal the player was saving for kept running away. Helpers and abilities
now have fixed cash prices, x4 per Singularity tier only (`fixedPriceScale`); upgrades still
follow the newest map. Each ability has its own level growth.

Two anchors, on real rounds against `MAP_PRICE.exp` 0.95 (`k95`), seeds 1–3:

| Fixed prices set at | Loss | Moon Base goal, strong / average / weak (h) | Shop score |
|---|---|---|---|
| (map-scaled, before) | 27.6 | 1.74 / 2.97 / 5.74 | 8.3 |
| where the average bot buys each item today (C1) | 31.3 | 1.48 / 2.75 / 5.68 | 8.9 |
| C1 x1.5 / x2 | 33.2 / 32.0 | 1.63 / 2.65 / 5.72, 1.58 / 3.23 / 5.95 | 9.9 / 10.0 |
| where each item becomes visible (C2: Dash $20K, Vortex $450K, Mega Mouth $8.5M) | 37.4 | 1.31 / 2.47 / 5.12 | 14.5 |

C1 is in the game: unlocks Dash $822K, Vortex $2.22M, Mega Mouth $36.9M (level growth x3.25,
x3.34, x2.32; Dash's unlock was later lowered, below), helpers $38K / $617K / $6.56M / $177M, training $132K x2.51 per level. The first
purchases land where they did (Dash and Vortex on Downtown, Mega Mouth on Harbor in run 2,
helpers on Farm, Downtown, Harbor and Airport).

| C1 vs map-scaled | Before | After |
|---|---|---|
| Loss, fresh seeds 4–10 | 32.9 | 34.8 |
| Moon Base goal, fresh seeds (h) | 1.67 / 2.92 / 5.96 | 1.49 / 2.72 / 5.83 |
| Longest stretch without a noticeable upgrade, fresh seeds | 1 / 3 / 5 | 1 / 2 / 5 |
| Game sim, Moon Base, `--human` / `--good` | 2h 25m / 1h 45m | 2h 05m / 1h 29m |
| Game sim targets met | 8–13 / 10–12 | 9–13 / 11–13 |
| Game sim items per shop visit | 3–4 / 4–5 | 4–6 / 5–7 |

The game gets shorter: later in a run the fixed prices no longer climb, so the last levels and
helpers come sooner. Most of the loss difference is one flickering check (a map whose first
visit takes under 2 rounds) plus the shop. Raising the fixed prices did not bring the length back
on these seeds.

**Dash at $300K.** From the playtest: Dash should be buyable partway through Farm. Its unlock
dropped from $822K to $300K; its levels keep their prices ($2.67M, then x3.25), so abilities now
have a separate `levelCost` (the level-2 price). Farm pays about $75–100K a round mid-visit, and
the average bot now buys Dash 25 min in on Farm instead of 35 min in on Downtown.

| $300K Dash vs C1 | Before | After |
|---|---|---|
| Loss, seeds 1–3 / fresh seeds 4–10 | 31.3 / 34.8 | 28.4 / 32.5 |
| Moon Base goal, seeds 1–3 (h) | 1.48 / 2.75 / 5.68 | 1.52 / 2.90 / 5.71 |
| Longest content gap, average / weak, seeds 1–3 | 25 / 63 min | 20 / 49 min |
| Game sim, Moon Base, `--human` / `--good` | 2h 05m / 1h 29m | 1h 58m / 1h 27m |
| Game sim targets met | 9–13 / 11–13 | 10–14 / 10–13 |
