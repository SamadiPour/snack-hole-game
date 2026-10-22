## Phase 7: more Dark Matter after the first Singularity, smaller starts on the last two maps

Playtest at the third Singularity: the start and the first Singularity feel right, but by run 4
the player had 4 DM to spend, each Singularity added a handful, and the DM tree's prices made
farming for more pointless. The hole also started large on the Spaceport and Moon Base. Runs 1
and 2 had to stay as they are. Target after a first pass: about +8 DM at the end of run 2, +12 at
run 3, +15 at run 4. Sizes below are HUD sizes.

**What changed**

| Parameter | Before | Now |
|---|---|---|
| Dark Matter gain, Singularities 2 and later | x1 | x2 (`singularityDmBonus` 1, `singularityDmCap` 1) |
| Singularity panel's "good time to collapse" hint | gain is +50% of all DM earned | the formula grew 50% since the last Singularity, before multipliers (`dmGrowth`) |
| Spaceport / Moon Base size offset | 31 / 32 | 36 / 37 (5 sizes smaller) |
| Starting Size levels | 45 | 50 |
| Event Horizon / Dense Core levels | 20 / 20 | 10 / 10 |
| Quantum Helpers | +10% per level, 10 levels | +50% per level, 2 levels (3, 6 DM) |
| Hawking Radiation | +2 h per level, 3 levels (5, 10, 20 DM) | +4 h, 1 level (10 DM) |

The first Singularity pays what it did, so run 2 starts with the same Dark Matter and tree. The
cash bonus per DM stays +10%. Without the hint change, a bigger gain reaches "+50% of all DM"
sooner: the player collapses earlier with less cash and keeps little of the multiplier (x1.5:
+6 → +7 at the third Singularity). Timed by the formula, the hint comes at the same lifetime cash
as before at tier 0, and its text no longer names a percentage. A save with levels above the new
caps gets their DM back when it loads (`clampToGame`), so no `SAVE_VERSION` bump. The panel says
how much the Singularities raise gains, and its progress bar names the DM the next step pays.

**How it was decided**

Every candidate ran on real rounds (direct Layer B) with the model from before this pass, against
`pre` (seeds 1–3, loss 28.4) and `pre-fresh` (seeds 4–10, 32.5). These used the old hint. The DM
tree caps alone change nothing before the Moon Base goal (28.5): nobody owns 10 levels of
anything by then. K is the extra size offset on the Spaceport and Moon Base, with K more Starting
Size levels.

| Candidate | Loss, seeds 1–3 | Average bot: DM / tree levels at run 4 | Moon Base goal, average / weak (h) | Strong bot's run after the goal (min) | Average: Spaceport first visit (rounds) |
|---|---|---|---|---|---|
| before | 28.4 | 17 / 6 | 2.90 / 5.71 | 12.6 | 1 |
| tree caps only | 28.5 | 17 / 6 | 2.86 / 5.71 | 12.6 | 1 |
| K 5 | 31.9 | 18 / 6 | 2.94 / 6.38 | 12.6 | 2 |
| K 8 | 34.8 | 17 / 6 | 2.99 / 7.48 | 13.4 | 3 |
| x1.5, x2, x2.5 (one step per Singularity, up to 3) | 31.3 | 22 / 7 | 2.77 / 5.23 | 6.2 | 2 |
| x2, x3, x4 | 34.8 | 31 / 9 | 2.70 / 4.94 | 4.6 | 1 |
| x1.5, x2, x2.5 + K 5 | 31.1 | 23 / 7 | 2.93 / 5.87 | 5.9 | 4 |
| x1.5, x2, x2.5 + K 8 | 33.8 | 23 / 7 | 2.85 / 6.42 | 6.2 | 3 |
| DM x2 at +5% each, DM prices x2 (a relabel) | 31.4 | 35 / 6 (17.5 old DM) | 2.77 / 5.57 | 12.5 | 1 |
| same, tree price growth x0.5 | 31.2 | 35 / 6 | 2.78 / 5.75 | 12.6 | 1 |
| x1.5 from the second on | 26.2 | 21 / 7 | 2.88 / 5.22 | 9.7 | 2 |
| x1.5 from the second on + K 5 | 29.0 | 21 / 7 | 2.98 / 5.88 | 10.2 | 4 |
| x2 from the second on + K 5 | 30.1 | 28 / 8 | 2.85 / 5.83 | 6.0 | 4 |
| **x2 from the second on + K 5, hint by the formula** | 30.0 | 29 / 8 | 2.85 / 5.84 | 5.7 | 4 |

A relabel moved the loss by 3 with no balance change, so differences under about 3 are noise.

- **Lower bonus per DM, more DM.** As a relabel (twice the DM at +5% each, every DM price
  doubled) it changes nothing but rounding, and needs a save migration. More tree levels by run 4
  need more DM relative to the prices bought there, but the cheapest levels are what the first
  Singularity buys, so any such change also changes run 2. Cheaper later levels (price growth
  x0.5) do nothing by run 4: players own levels 1–2 of each track then.
- **Raising gains with every Singularity** (up to the third) makes the post-Moon runs very short
  (strong bot 4–6 min instead of 12.6). A flat multiplier from the second Singularity on is the
  smallest step that leaves run 2 alone.
- **x1.5 → x2.** x1.5 gave the game sim's casual player +6.5, +7, +10 for runs 2–4 (+4.5, +6, +9
  before), short of the target; x2 with the formula hint gives +9, +12, +18.
- **K.** 5 makes the Spaceport's first visit take 2–4 rounds for the average bot (1 before). 8
  stalls the weak bot there (14–18 rounds, Moon Base goal 7.5 h). Moon Base still falls in one
  round for strong and average players at either K: its rounds eat 70–90% of the map, so a
  smaller start only means eating more of it.

**Results** (before → now; seeds 1–3 / fresh seeds 4–10, binge, median of optimizer, balanced and
casual)

| | Strong | Average | Weak |
|---|---|---|---|
| Moon Base goal (h) | 1.52 → 1.44 / 1.43 → 1.40 | 2.90 → 2.85 / 2.69 → 2.65 | 5.71 → 5.84 / 5.66 → 5.39 |
| DM / tree levels at the start of run 4 | 14 / 5 → 24 / 7 | 17 / 6 → 29 / 8 | 12 / 4 → 23 / 7 |
| Longest stretch without a noticeable upgrade (rounds) | 1 → 1 | 2 → 2 | 5 → 5 |
| Longest gap without new content (min) | 14 → 11 / 16 → 16 | 20 → 17 / 25 → 20 | 49 → 42 / 52 → 41 |
| Shop sold out / buys per visit | 0% / 5 → 0.2% / 6 | 0.8% / 3 → 0.5% / 3 | 0.5% / 2 → 0.6% / 2 |
| Spaceport first visit (rounds) | 1 → 1 | 1 → 4 | 5 → not before a Singularity on most |
| Loss | 28.4 → 30.0 / 32.5 → 33.6 | | |

Game sim (seeds 1–10, `--human` / `--good`, medians):

| Run | Length | DM gained | DM total at the next start | Tree levels at the next start (seed 1) | Permanent cash multiplier at the next start |
|---|---|---|---|---|---|
| 1 | 46m / 34m (same) | +6 / +6 | 6 | 2 | x3.3 |
| 2 | 29m / 22m (same) | +4.5 → +9 / +4 → +8 | 11 → 15 / 10 → 14 | 4 → 5 | x6.9 → x8.5 / x5.8 → x7.0 |
| 3 | 24m / 17m → 16m | +6 → +12 / +5 → +10 | 17 → 27 / 15 → 24 | 6 → 8 | x10.5 → x18.5 / x9.4 → x13.2 |
| 4 (Moon Base) | 27m → 19m / 18m → 17m | +9 → +18 / +8 → +16 | 26 → 45 / 23 → 40 | 7 → 11 | x21.7 → x50.0 / x17.3 → x38.4 |
| 5 | 19m → 11m / 15m → 9m | +13 → +29 / +12 → +34 | 39 → 73 / 35 → 74 | 10 → 14 | x35.9 → x123 / x27.8 → x125 |
| 6 | 15m → 7m / 10m → 6m | +20 → +56 / +20 → +64 | 59 → 131 / 55 → 138 | 12 → 18 | x58.7 → x261 / x55.4 → x274 |

Runs 1 and 2 are the same to the second on all 20 seeds. Moon Base (run 4) 1h 58m → 1h 55m /
1h 27m → 1h 25m. Spaceport first visit 1–3 → 1–8 rounds for `--human` (1–2 for `--good`); Moon
Base 1 for both. Targets met 10–14 → 10–13 (7 on every seed, was 8) / 10–13 → 10–13 (8, was 6).
Worse: after the first tier-up a run earns more than twice the Dark Matter of the one before (4
of 10 `--human` seeds, all `--good`; was none), runs 5 and 6 take about half as long, and the
median `--human` round grows the radius less (x3.25–3.65, target x4; short late runs start close
to each map's size cap). The doubled DM compounds: its cash bonus and the extra tree make every
later run faster and richer.

**Also found**

- **Bigger helpers earn less.** Paired rounds at run 3–5 states (average bot, 16 seeds each):
  one Quantum Helpers level (+50%) changed round cash by +4% to −14%, two levels (+100%) by −1% to
  −30%, and lowered the end size a little. Helper swallows pay 84% and give the player no XP, and
  on late maps the player eats most of the map anyway, so a stronger helper mostly takes props
  from the player. The old +10% levels pushed the same way, five of them per new level.
- **The balanced bot reads the cap.** It buys the track with the lowest level / max, so 50
  Starting Size levels change its run 1 (average first Singularity 66 → 73 min on seeds 1–3);
  the optimizer, casual and game-sim players' runs 1 and 2 are unchanged.

Reports `2026-10-22T20-42-49-pre` (before) and the `-s2` report with `compare.md` (now).
