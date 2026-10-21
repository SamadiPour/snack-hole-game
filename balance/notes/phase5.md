## Playtest fixes: shop, Mega Mouth, Moon Base lock

From the first playtest: the shop ran dry before Moon Base, Mega Mouth (with Magnet) pulled in
most of the map, and the Moon Base lock read like a Dark Matter cost.

**What changed**

- **Prices follow the map.** Every cash price (upgrades, abilities, helpers) is multiplied by the
  newest unlocked map's value multiplier, as tiers already scale them (`priceScale`,
  `src/core/economy.ts`). Config prices are now in Suburb money. A fresh CMA-ES search over price
  parameters only (goals, offsets and XP left alone) set the values below, with two new checks:
  the shop never sells out and a visit buys at most 4 items, and map value multipliers rise map
  by map (a cheaper next map would make prices drop on unlocking it).
- **Mega Mouth** grows the radius x1.35 at level 1 and +0.1 per level (x1.75 at 5), instead of a
  flat x1.45. The magnet's range and pull follow the hole's own radius, so Mega Mouth widens the
  mouth but not the magnet's reach past the rim.
- **Moon Base lock** reads "Needs 3 Singularities (you have 1)".
- The Dark Matter coefficient went back to 1.75, so the save-version-5 migration is gone (the
  branch never shipped; saves stay at version 4).

| Parameter | Phase 4 | Now |
|---|---|---|
| Price scale | fixed | x newest map's value multiplier |
| Map value x (Farm / Downtown / Harbor / Airport / Moon Base) | 7.4 / 57.5 / 193 / 1,150 / 940 | 9.7 / 50 / 233 / 870 / 1,080 |
| Upgrade bases (Starting Size … Golden Touch) | 45, 60, 100, 400, 150, 200, 500, 5,000 | 55, 75, 125, 500, 185, 250, 620, 6,200 (Suburb money) |
| Cost growth: Starting Size / Speed / Cash Value, Round Time, Growth Rate / Magnet / Combo / Golden | 1.45 / 5 / 3.8, 9, 5.5 / 5 / 4.4 / 4.4 | 1.25 / 3.25 / 2.8 / 2.95 / 2.5 / 2.35 |
| Ability unlock (Dash / Vortex / Mega Mouth), level growth | $5K / $100K / $2.97M, x4 | 20K / 54K / 208K, x1.65 |
| Helpers 1–4, training growth | 2K / 50K / 1M / 25M, x3.5 | 4.4K / 15K / 37K / 285K, x1.71 |
| Cash Value per level / Golden Touch per level / helper share | +31% / +1.15% / 80% | +26% / +1% / 84% |
| Dark Matter coefficient | 1.96 | 1.75 |

**Results on real rounds** (Phase 4 → now)

| Fresh seeds 4–10, strong / average / weak | Phase 4 | Now |
|---|---|---|
| Rounds with the shop sold out (Airport / Moon Base, average) | 64% / 100% | 0–2% / 0% |
| Items bought per shop visit after Suburb (average) | 7–12 | 2–4 |
| Time to the first Moon Base goal | 41 min / 1h18 / 3h05 | 1h54 / 3h15 / 6h22 |
| Replay: next run's time to the previous run's furthest map | 92% / 80% / 62% | 73% / 64% / 69% |
| Longest stretch without a noticeable upgrade | 1 / 1 / 3 rounds | 2 / 3 / 6 rounds |
| Longest gap without new content | 9 / 16 / 30 min | 25 / 35 / 64 min |
| First Singularity | 14 / 32 / 82 min | 47 / 67 / 97 min |

Loss (violations, real rounds): 63.2 → 28.7 on seeds 1–3, 57.5 → 32.5 on fresh seeds 4–10.
The game's own `npm run sim`: Moon Base at 2h 44m (`--human`) and 2h 00m (`--good`), 9–13 and
10–12 of its 22 targets met (Phase 4: 9–10 and 7–8). Parity 50/50; `npm test` and `npm run
smoke` pass.

**Trade-offs**

- The game is about 2.5x longer: the shop now slows the climb instead of selling out. At your
  pace in the playtest (between the average and strong bots) that is about 2–2.5 h to the Moon
  Base goal, against about 1 h before.
- First visits to a new map are where it slows: every price jumps with the map, so Downtown and
  Harbor can take 10–17 rounds the first time (game sim, `--human`) before Starting Size catches
  up. That is most of the longer content gaps.
- With Wormhole (keep maps), prices stay at Moon Base level from the start of a run.
