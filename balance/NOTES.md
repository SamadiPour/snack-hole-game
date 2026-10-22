# Balance notes

What each balance pass changed, why, what it tried and dropped, and what is still open. This file
replaces the per-pass notes (`baseline`, `phase3` to `phase8`, `spaceport`); their full tables are in
git history (`git log -- balance/notes/`). Config values are the source of truth
(`src/config/balance.ts`); numbers here are what the passes measured. Sizes are HUD sizes (0-based
config goal + 1).

## Where it stands

After the last pass (Phase 8, commit `576a974`). Direct Layer B is real rounds; seeds 1–3 were
used while tuning, 4–10 are fresh.

| | Strong | Average | Weak |
|---|---|---|---|
| Moon Base goal, seeds 1–3 / 4–10 | 1h29 / 1h32 | 2h51 / 2h56 | 5h58 / 5h32 |
| Longest stretch without a noticeable upgrade | 1 round | 2–3 rounds | 5–6 rounds |
| Longest gap without new content | 12–14 min | 25 min | 47–52 min |
| Shop sold out / items bought per visit | 0.4% / 5 | 1.3% / 3 | 1.6% / 2 |

Loss (violations, lower is better): 30.6 on seeds 1–3, 32.3 on 4–10. The untuned baseline scored
66.9 and 71.6. Differences under about 3 are noise: refitting the model moves Layer B by ±3, and a
pure relabel (Phase 7) moved it by 3.

The game's own sim (`npm run sim`, seeds 1–10, `--human` / `--good`): first Singularity 53 min /
34 min, Moon Base goal (run 4) 2h 12m / 1h 27m, 9–13 / 10–12 of 22 targets met.

## Method

- **Layer A** plays one real round with a bot; **Layer B** plays whole playthroughs with the
  game's save, shop, offline and Singularity code, either on real rounds (direct) or through a
  random-forest model fitted to Layer A (model). `README.md` has the commands.
- **Search**: CMA-ES over the whitelist in `lib/params.ts`, scored by `lib/loss.ts` on 22
  playthroughs through the model, then re-scored on held-out seeds. Every candidate that matters
  is then checked on real rounds: the model averages rounds, so it underrates stretches without a
  noticeable upgrade, and a search leans on that (Phase 6's price search won in the model and
  lost on real rounds).
- **Loss**: weighted target misses (average and weak count 1.5x) plus a penalty on change size.

| Check | Weight | Target |
|---|---|---|
| Time to the first Moon Base goal | 3 | strong 45 min–2.5 h, average 1.5–4 h, weak 2.5–6 h |
| Longest stretch without a noticeable upgrade (after 10 min) | 2.5 | ≤ 3 rounds |
| Replay: next run's time to the previous run's furthest map | 2.5 | ≤ 50% |
| Longest gap without new content | 2 | ≤ 20 min |
| Weak: longest stretch with no purchase, new best size or unlock | 2 | ≤ 3 rounds |
| Playthroughs stuck at the 150-round cap | 4 | none |
| First Singularity | 1.5 | strong 15–45, average 30–60, weak 40–90 min |
| Early game: first purchase, 3 tracks by 4:00, a purchase in reach | 1.5 | ≤ 1.5 min, ≥ 3, ≥ 90% |
| Single-stat Starting Size stalls | 2 | never |
| Purchases adding < 5% cash and < 0.5 size (model) | 1 | ≤ 25% |
| Returner: offline share of cash | 1 | ≤ 25% |

- **Held fixed on purpose**: hole speed and round length, offline earnings, the frontier XP bonus
  and value exponent, prop sizes and map layouts. XP multipliers may only rise (slower growth makes
  play duller); goals may only fall.

## What changed and why

**Baseline problems** (six maps, before tuning). Average bots finished in about 3 h, strong in
57 min, weak never (stalled at Harbor and Airport). Four causes:

- Harbor and Moon Base goals sat at the map's XP ceiling: missed rounds ended one size short with
  95–100% of the map eaten.
- Downtown and Airport started the hole far below their size offset, so one round had to climb 20+
  sizes; Starting Size was 47–97% of all spending.
- Farm's top sizes are sparse (1–6 props per size, 50–190 m apart): 63–85% of a round was
  vacuuming crumbs.
- Replays after a Singularity took 80–84% of the previous run's time: each Singularity paid only
  +50% Dark Matter, and Starting Size had to be re-bought from scratch.

Skill also decided too much (strong earned x14 weak at the same upgrades): XP is f² with up to x4
near the size limit, so target choice dominates. Lowering the frontier bonus only cut the gap to
x7.5 and slowed everyone, so it stayed.

**Phases 3–4: tuning.** Goals moved below each map's XP ceiling (Farm, Harbor and Moon Base one
size lower), map offsets and value multipliers were retuned, Starting Size got cheaper, and the
helper cash share went from 60% to 80%. Finish times: 44 min / 1h20 / 3h05. Strong earns x7 weak
(was x14).

**Phase 5: prices follow the map.** The first playtest sold out the shop before Moon Base. Every
cash price was multiplied by the newest unlocked map's value multiplier (`priceScale`), with config
prices in Suburb money; map value multipliers now rise map by map so unlocking a map never makes
prices drop. Mega Mouth became x1.35 + 0.1 per level (was a flat x1.45), and the magnet's reach
follows the hole's own radius. The Moon Base lock text says how many Singularities the player has.
Sold-out rounds on Airport and Moon Base fell from 64% / 100% to about 0%; the game became about
2.5x longer (average 3h15 to the Moon Base goal). The Dark Matter coefficient went back to 1.75,
so no save migration was needed.

**Spaceport.** Run 3 had no new map: it replayed up to the Airport and ground there until it could
collapse. The Spaceport sits between Airport and Moon Base, unlocks at the Airport goal plus 2
Singularities, and Moon Base (still 3) follows its goal. Its value (x970) sits between Airport and
Moon Base: the tall landmarks made a first pass pay 1.3–1.7x Airport per round, so landmark value
was trimmed and a tower shortened. The finish barely moved; run 3 spends on the Spaceport the
rounds it used to grind on the Airport, and the average bot's longest content gap fell from 35 to
about 27 min.

**Phase 6: softer price jumps, fixed one-off prices.**

- *Map price exponent.* Every playthrough's worst stretch without a noticeable upgrade was a first
  visit to a new map: buying power fell to x0.29 (Farm), x0.15 (Downtown), x0.12 (Harbor). Prices
  now follow the map's multiplier to the power `MAP_PRICE.exp` 0.95 (Farm prices 11% lower, Moon
  Base 30% lower). 0.9 and below made the shop cheap (cheapest option under 0.1 rounds of income)
  and the game short.
- *Fixed helper and ability prices.* A playtest saw the Mega Mouth unlock run from $208K on the
  Suburb to $129M on the Airport while the player saved for it. Helpers and abilities now have
  fixed prices, x4 per tier only (`fixedPriceScale`), set where the average bot bought each item
  before. Abilities got their own `levelCost` and `levelGrowth`. Raising those fixed prices did not
  bring the lost length back.
- *Dash at $300K*, so it can be bought partway through Farm (the average bot buys it 25 min in
  instead of 35).

**Phase 7: more Dark Matter after the first Singularity.** A playtest at the third Singularity had
4 DM to spend and a tree whose prices made farming pointless; the hole also started big on the
Spaceport and Moon Base. Runs 1 and 2 had to stay the same.

- Every Singularity after the first pays x2 DM (`singularityDmBonus` 1, `singularityDmCap` 1). Game
  sim, casual player, runs 2–4: +9, +12, +18 DM (was +4.5, +6, +9). Runs 1 and 2 are unchanged to
  the second on all 20 seeds.
- The "good time to collapse" hint follows the DM formula before multipliers (`dmGrowth`). Left on
  "+50% of all DM earned", the bigger gain would trigger it sooner and the player would collapse
  with less cash.
- Spaceport and Moon Base start 5 sizes smaller, with Starting Size raised from 45 to 50 levels.
  The Spaceport's first visit takes 2–4 rounds for the average bot (was 1).
- DM tree: Event Horizon and Dense Core cap at 10 levels, Quantum Helpers is 2 levels of +50%,
  Hawking Radiation one level of +4 h. Nobody owns 10 levels of anything before the Moon Base goal,
  so the caps change nothing until then.

**Phase 8: Vortex and Mega Mouth.** A playtest found both abilities half charged at round start,
the magnet pulling far too hard with both running, and Mega Mouth lasting too long. Both now start
empty, Mega Mouth lasts 4 s at level 1 (was 5), and the magnet and Vortex reach past the hole's own
rim instead of the Mega rim (they still pull Mega-sized props). Mega Mouth's wider mouth is what
clears late maps: a strong player eats 98% of a map with or without Vortex. Casual run 1 got about
6 minutes longer.

## Tried and dropped

- **Price search in Phase 6** (23 parameters): better in the model (36.9 → 28.3), no better on real
  rounds. The Phase 5 prices stayed.
- **Spaceport goal 30**: best loss in `balance/`, but a near full clear (84–96% of the map) in the
  game sim, the trap Harbor and Moon Base were tuned out of. Goal 32: nobody reaches it.
- **Raising DM gains with every Singularity** (x1.5, x2, x2.5 or x2, x3, x4): post-Moon runs shrink
  to 4–6 min for the strong bot. **x1.5 from the second on**: short of the DM target.
- **Lower bonus per DM with more DM** (twice the DM at +5% each): a relabel, needs a save
  migration, changes nothing. **Cheaper later tree levels**: players own only levels 1–2 by run 4.
- **Size cut of 8 on the last two maps** (instead of 5): the weak bot stalls 14–18 rounds on the
  Spaceport.
- **Not pulling Mega-only props at all**: dropped after the playtest (they should still come in).
  **Smaller Mega mouth** (x1.3 + 0.05 per level): the only thing that stops strong players
  clearing, but cuts the average player's cash by a quarter.
- **Vortex cooldown 18 s, Mega 25 s**: casual first Singularity back to about 48 min, but Moon Base
  near a full clear on 6 of 10 seeds.

## Save effects

- No `SAVE_VERSION` bump since version 4. The Dark Matter coefficient is back at 1.75, so the
  Phase 4 migration never shipped.
- DM upgrade levels above a lowered cap give their DM back on load (`clampToGame`), at the price
  they were bought for (Hawking Radiation's old curve: 5, 10, 20 DM). Loading twice refunds once.
- Every map before an unlocked one is unlocked on load, so a save with Moon Base gets the Spaceport.
  A save past the Airport goal with 2 Singularities unlocks it after its next round.
- Owned upgrade, helper and ability levels are kept; their next levels cost what the new curves say.

## Open problems

- **Replays** still take 64–73% of the previous run's time (target ≤ 50%, last measured in Phase
  5). Parameters alone conflict with a stable endgame. Proposal: let a Singularity keep part of the
  run's size (Dense Core +2 sizes per level, or keep 25% of Starting Size levels).
- **Late first visits** fall in one round for strong players: Starting Size is maxed by run 3, so
  every Spaceport and Moon Base round starts at the same size. Needs content (more XP above size 29
  on the Spaceport) or a change to how Starting Size carries into late maps.
- **Moon Base near a full clear**: its goal needs over 85% of the map on 3 of 10 `--human` seeds
  after Phase 8.
- **After the first tier-up** the doubled DM compounds: runs 5 and 6 take about half as long, and a
  run earns more than twice the DM of the one before.
- **Endless-tier runaway** (in the baseline too): the DM cash bonus is linear while tiers inflate
  cash x4, so strong players reach 2-minute tiers from tier ~8. Proposal: a sublinear bonus
  (`1 + 0.1 DM^0.75`) or tier prices growing faster than payouts.
- **Helpers take props from the player.** Helper swallows pay 84% and give no XP; one Quantum
  Helpers level changed round cash by +4% to −14%, two by −1% to −30%. Proposal: credit helper
  swallows' XP to the main hole.
- **Head Start** is worthless from tier ~3. Proposal: scale it by 4^tier like every price.
- **Layout**: Farm's size 3–4 props sit 117 m from the start (a 27 s stall at size 5); top bands
  are sparse on every map, so the next goal is on screen only 30–44% of the time (target 70%).
- **Weak players**: longest content gap 47–52 min (target 20); 5–6 rounds without a noticeable
  upgrade.
- **Game sim misses**: 3–4 items per shop visit for `--human` (target 1–3); one seed's first
  Singularity at 1h 01m (target 30–60 min).

Bots are not people: confirm by playing.
