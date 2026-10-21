## Spaceport: a seventh map between Airport and Moon Base

Commit `eb72d34`, on top of `balance-tuning` (`8d268f0`). The jump from 1 to 3 Singularities had no
new map: run 3 replayed every map up to the Airport, then ground a few rounds there until it could
collapse. The Spaceport unlocks at the Airport goal plus 2 Singularities, and Moon Base (still 3
Singularities) now follows the Spaceport goal. Sizes are the HUD sizes (0-based + 1).

| | Airport | Spaceport | Moon Base |
|---|---|---|---|
| Unlock | Harbor goal + 1 Singularity | Airport goal + 2 Singularities | Spaceport goal + 3 Singularities |
| Goal / max size | 28 / 35 | 29 / 36 | 25 / 30 |
| Size offset | 26 | 29 | 32 |
| Value x / XP x | 1,150 / 0.94 | 960 / 0.87 | 940 / 0.81 |
| Props, all $ at base (`static/stats.md`) | 1,315, $14.2M | 1,135, $15.0M | 1,574, $12.6M |

The size ladder has one gap, size 32 (the step up to the Rocket Hall).

### Choosing the goal and the value

- Every bot enters the Spaceport at size 18: by run 3 Starting Size is maxed, so Starting Size +
  Dense Core is about 46 for all skills. A first pass with the goal at size 26 fell at once: the
  average bot ended its first round at size 29–31. Airport and Moon Base goals sit 1–2 sizes below
  the average bot's end size, so the goal moved to 29. The weak bot's end size is then 29 (median,
  27–31), so it reaches the goal in 1 round (median) without stalling.
- Prop value grows with height, and the tall landmarks (Moon Rocket 115 m, Launch Tower, Rocket
  Hall) made the first pass pay 1.3–1.7x Airport per round, more than Moon Base. Without extra
  type multipliers on the landmarks, a 60 m tower, fewer small props and value x960, run-4 rounds
  pay (average bot, median) Airport $10.2B, Spaceport $10.8B, Moon Base $9.6B.

### Effect on progression (direct Layer B, seeds 1–3; before = `8d268f0`)

| | strong | average | weak |
|---|---|---|---|
| Moon Base goal (finish, median) | 0h44m → 0h44m | 1h22m → 1h23m | 3h07m → 3h05m |
| Longest gap between new content | 7.2 → 5.7 min | 15.8 → 9.7 min | 30.0 → 26.0 min |
| Rounds to the Spaceport goal, runs 3 / 4 | 1 / 1 | 1 / 1 | 1 / 1 |
| Run 3 length (rounds) | 8.7 → 8.6 min (7 → 7) | 14.5 → 14.8 min (9 → 9) | 32.8 → 30.1 min (17 → 16) |

The finish barely moves: run 3 spends on the Spaceport the rounds it used to grind on the Airport
before collapsing, and run 4 adds about one round. `compare.md` has every target before and after.
