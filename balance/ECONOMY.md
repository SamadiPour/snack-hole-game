# Snack Hole economy inventory

Phase 1 of the balance audit, written from the code at commit `b4230e4`. Every formula is quoted as
implemented, with `file:line`. The formulas still hold; 22 values changed in Phase 4 (goals, map
offsets and multipliers, cost growths, Cash Value, Golden Touch, helper share, Mega Mouth, Dark
Matter coefficient): see `tuned/finalist.json` and `NOTES.md`. Two formulas changed after
that: Mega Mouth's radius is `x(1.35 + 0.1 (level - 1))` instead of x1.45, and the magnet's range
and pull use the hole's base radius instead of the Mega-enlarged one. Every cash price is now
multiplied by the newest unlocked map's value multiplier (`priceScale`), with config prices in
Suburb money (`NOTES.md`, Phase 5). Phase 7 doubles Dark Matter gains from
the second Singularity on (the collapse hint follows the formula before that multiplier),
makes Quantum Helpers +50% per level (2 levels) and Hawking Radiation one +4 h level, and caps
Event Horizon and Dense Core at 10; the DM tree table in §8 is from before. `static/stats.md` is regenerated for the current values. Config values are the source of truth; DESIGN.md is a summary of them.
Per-map tables come from `npx tsx balance/static-stats.ts` (full output: `balance/static/stats.md`).

"Points" in the brief = **cash ($)**. "Run" in the brief = **round** (one timed play). A "run" in the
code and in DESIGN.md is a whole prestige cycle (Singularity to Singularity). This file uses
*round* and *prestige run* to keep them apart.

## 1. The loop

```
round (60-100 s, one map)
  hole eats props with footprint f <= 0.9 R
    -> XP: f^2 x frontier bonus x growth x map xpMul  -> size levels -> bigger R -> bigger props
    -> cash: value x cashMult x combo (x10 if golden)  (+ helper holes eat for 60% cash, no XP)
  round ends: time up / map cleared / snacked out (+1% cash per second left, max +50%)
settleRound: cash -> save; best size on map; reaching the map's size goal unlocks the next map
shop: cash -> 9 upgrade tracks, 4 helper holes + training, 3 abilities
  -> next round starts bigger / faster / pays more
Singularity (after Downtown unlocks): lifetime cash -> Dark Matter -> DM tree + permanent +10% cash per DM
  resets cash, upgrades, helpers, abilities, maps; first run past the Moon Base goal raises the tier
offline: away >= 3 min pays 0.5 x (average of the last 5 rounds' cash) per hour, capped at 8-18 h
```

Two currencies: cash (reset by Singularity) and Dark Matter (kept). Map progression is gated by
**size**, never by cash, except that Airport and Moon Base also need 1 and 3 Singularities.

## 2. Size, growth and the swallow rule

| What | Formula as implemented | Where |
|---|---|---|
| Radius | `R(L) = 0.75 * 1.125^L` (L is 0-based; the UI shows L+1) | `src/core/size.ts:8-10`, `balance.ts:7-8` |
| XP for L -> L+1 | `8 * R(L)^2 * min(1, (L + 2) / 6)` | `size.ts:17-21`, `balance.ts:15-19` |
| Prop footprint | `f = max(0.425 * hypot(w, d), 0.12 * h) * scale` | `src/config/objects.ts:189-192` |
| Prop XP | `f^2` | `objects.ts:229-231` |
| XP on swallow (main hole) | `f^2 * xpMult * (1 + 3 * min(1, f / (0.9 * baseR))^3)` | `world.ts:859`, `size.ts:24-26` |
| xpMult | `(1 + 0.1 * growthLvl) * map.xpMul` | `economy.ts:446` |
| Fits | `f <= 0.9 * R` with R the **tweened** radius `H.r` | `world.ts:763-764, 780` |
| Swallowed | fits and centre distance `< R - 0.25 f` | `world.ts:781-784` |
| Too big, near rim | wobble only when `d < R + 0.7 f` | `world.ts:799-805` |
| Level-up | XP spent one level at a time; several levels per swallow possible; stops at `maxLevel` and XP past it is dropped | `world.ts:212-221, 869-878` |
| Round start | `level = min(startLevel, maxLevel)`, `xp = 0.5 * xpForLevel(level)` | `world.ts:335-338` |
| Start level | `startSize + denseCore - map.sizeOffset - min(tier, 10)`, clamped to `[0, mapMaxLevel]` | `economy.ts:409-420` |
| Map max size | `max(level that eats the biggest prop + 3, level whose R spans 15% of the map width)` | `economy.ts:71-80`, `balance.ts:236-241` |
| Radius tween | `r += (baseR * mega - r) * (1 - e^(-5 dt))` | `world.ts:953-956` |
| Hole speed | `(4.5 + 2.1 R) * (1 + 0.08 * speedLvl)` m/s, velocity eased `1 - e^(-9 dt)` | `size.ts:28-30`, `world.ts:692, 707-709` |
| Camera | distance `(13 + 7.5 R)`, x`(1/aspect)^0.6` on portrait; FOV 45°, pitch 0.98 rad | `src/render/scene.ts:35, 233-238, 336` |
| Fleeing | small movers that fit run at 1.9x speed within `2.2 R + 3` m | `world.ts:620-642` |

Edge cases worth knowing:

- Eating uses the tweened `H.r` but the frontier bonus uses `H.baseR`. After a level-up the mouth lags
  the new size for ~0.3-0.6 s.
- During Mega Mouth (`r -> 1.45 baseR`) every prop above the normal fit gets the full x4 frontier
  bonus, because `f / (0.9 baseR)` is clamped at 1.
- The early-finish check (`World.reachable`, `world.ts:421-448`) eats everything edible in size order
  and ignores dormant event props. It is not a strict ceiling: in a test a bot reached Harbor size 24
  where `reachable()` said 23, thanks to rush-hour/UFO props.

Hole size per level (no upgrades):

| Size | Radius m | Eats f <= | XP to next | Speed m/s |
|---|---|---|---|---|
| 1 | 0.75 | 0.68 | 1.5 | 6.1 |
| 5 | 1.20 | 1.08 | 11.5 | 7.0 |
| 10 | 2.16 | 1.95 | 37.5 | 9.0 |
| 16 | 4.39 | 3.95 | 154 | 13.7 |
| 21 | 7.91 | 7.12 | 500 | 21.1 |
| 26 | 14.25 | 12.83 | 1,625 | 34.4 |
| 31 | 25.68 | 23.11 | 5,277 | 58.4 |

## 3. Cash per swallow

| What | Formula | Where |
|---|---|---|
| Prop base value | `max(1, round(6 * f^1.3 * (1 + h/20) * typeMul))` | `objects.ts:223-227`, `balance.ts:39` |
| Value in a round | `base * map.valueMul * 4^tier` (x10 if golden) | `world.ts:382, 389-393`, `economy.ts:440` |
| Cash, main hole | `value * cashMult * comboMult(stack)` | `world.ts:857` |
| Cash, helper hole | `value * cashMult * 0.6` (no XP, no combo) | `world.ts:862`, `balance.ts:161` |
| Combo | stack +1 if the previous swallow was within `1.2 + 0.15 * comboLvl` s; `comboMult = min(1 + 0.02 (stack-1), 2 + 0.15 * comboLvl)` | `economy.ts:100-111`, `world.ts:854-857` |
| Golden | each prop rolls `0.01 + 0.01 * goldenLvl` per round (event props too) | `world.ts:327-330`, `economy.ts:96-98` |
| Time bonus | on map cleared or snacked out: `cash * min(0.5, 0.01 * floor(secondsLeft))`; none on time-up or quitting from pause | `world.ts:923-929`, `economy.ts:427-429` |
| cashMult | product of: Cash Value `1 + 0.25 L` (max x3.5); Dark Matter `1 + 0.1 * dmTotal` (uncapped); Event Horizon `1 + 0.25 L` (max x6); trophies `1 + 0.02 * n` (42 -> x1.84); Gulpedia sets `1 + 0.05 * n` (10 -> x1.5); maps at 100% `1 + 0.25 * n` (6 -> x2.5) | `economy.ts:180-196` |

A combo reaches the base cap (x2) only at a 51-swallow streak.

## 4. Round

| What | Value | Where |
|---|---|---|
| Length | `60 + 10 * roundTimeLvl` s (max 100) | `economy.ts:422-424`, `balance.ts:41-44` |
| Ends early | map 99.95% eaten (`cleared`), or nothing reachable (`snackedOut`, checked every 0.5 s; a pending random event starts at once instead) | `world.ts:913-922`, `roundEvents.ts:94-98` |
| End delay | 1.6 s (2.4 s on clear) while props fall | `world.ts:930` |
| Map % | weighted by `f^2`; event props excluded | `world.ts:294-295, 395-397` |
| Abilities at start | Dash ready, Vortex and Mega Mouth half charged | `world.ts:286`, `balance.ts:184-186` |
| Random events | rush hour 30% (18 vehicles), UFO 25% (saucer at scale 0.7 + 10 golden drops), stampede 35% on the farm (18 animals); first 8-16 s in, then 4-8 s gaps, only while >= 12 s remain | `balance.ts:124-132`, `roundEvents.ts:45-88` |

There is no respawn. Every round rebuilds the whole map from a cached layout.

## 5. Maps

Layouts are fixed per map: each `MapDef.seed` feeds its generator, and `fillLadder` then shrinks props
so no size level is empty for more than one step (`mapgen/index.ts:24-33`, `mapgen/ladder.ts:21-72`).
The per-round seed only changes movers, golden rolls, events and helper wandering.

Unlock rule: reach the previous map's goal size in a round, plus the Singularities shown below
(`economy.ts:512-532`, `round.ts:90-91`). A newly unlocked map is selected automatically.

| Map | Size m | Props (movers) | Goal | Max | Size offset | Value x | XP x | Needs | Total $ (base) | Total XP |
|---|---|---|---|---|---|---|---|---|---|---|
| Suburb | 230 | 1,772 (141) | 17 | 27 | 0 | 1 | 1.00 | - | 14,572 | 3,079 |
| Farm | 280 | 2,126 (164) | 20 | 29 | 8 | 6 | 0.81 | Suburb goal | 100,170 | 2,923 |
| Downtown | 250 | 1,369 (231) | 26 | 31 | 16 | 45 | 0.62 | Farm goal | 937,575 | 4,936 |
| Harbor | 280 | 1,272 (163) | 25 | 30 | 22 | 236 | 0.47 | Downtown goal | 3,161,220 | 3,548 |
| Airport | 320 | 1,315 (168) | 28 | 35 | 31 | 1,000 | 0.80 | Harbor goal + 1 Singularity | 12,338,000 | 4,219 |
| Moon Base | 300 | 1,574 (79) | 26 | 30 | 35 | 1,400 | 0.81 | Airport goal + 3 Singularities | 18,698,400 | 2,715 |

Total $ is base value x map multiplier, before cashMult, combo, golden and tier. It is also **the most
a round can pay** on that map, before those multipliers.

### Size tiers per map

Props by the size level that first eats them, grouped into bands (full per-level table in
`balance/static/stats.md`). "Sparse" = at most ~10 props per level, mostly lone landmarks.

| Map | Size 1 (edible at start) | Dense bands | Sparse bands | Nearest prop of the next sizes from the start |
|---|---|---|---|---|
| Suburb | 765 (43%), 10% of $, 5% of XP | 2-12, 17-18 (24-142 per level) | 13-16 (1-2 box trucks each), 20 | 71-95 m for sizes 13-16 |
| Farm | 594 (28%), 9% of $, 5% of XP | 2-11 | 12-21 (1-6 each) | 28-115 m |
| Downtown | 694 (51%), 6% of $, 3% of XP | 2-3, 5-9, 11-12, 18, 21 | 4, 10, 13-17, 19-20, 22-28 | 21-85 m |
| Harbor | 562 (44%), 8% of $, 3% of XP | 2-3, 7-9, 11-13, 16 | 4-6, 10, 14-15, 17-27 | 28-186 m |
| Airport | 746 (57%), 9% of $, 2% of XP | 2-3, 6-12 | 4-5, 13-32 | 26-155 m |
| Moon Base | 638 (41%), 12% of $, 5% of XP | 2-7, 11 (thinner: 8-10, 12, 15) | 13-14, 16-27 | 9-105 m |

Spatial density of all props: 27-34 per 1,000 m² on Suburb and Farm, 13-22 on the others. The size 1
tier alone is 7-15 per 1,000 m²; every other level is under 5 and the sparse ones 0.01-0.1.

### How big a hole can get on each map

`World.reachable()` from a given start size, eating everything edible in size order (an optimistic
ceiling that ignores time, travel and events). The ceiling is nearly flat in the start size.

| Map | Goal | Ceiling from start size 1, growth 0 / growth 6 | Lowest start reaching the goal, growth 0 | growth 6 |
|---|---|---|---|---|
| Suburb | 17 | 23 / 25 | 1 | 1 |
| Farm | 20 | 22 / 24 | 1 | 1 |
| Downtown | 26 | 25 / 27 | 17 (Starting Size + Dense Core 32) | 1 |
| Harbor | 25 | 21 / 23 | 23 (44) | 20 (41) |
| Airport | 28 | 22 / 24 | 26 (56) | 25 (55) |
| Moon Base | 26 | 21 / 24 | 24 (58) | 21 (55) |

Bot spot-checks (good bot, maxed Speed/Magnet/Round Time/Growth, Dash and Vortex 5, seeds 3-4):

| Map, start size | Mega Mouth | Final size | Map eaten | End |
|---|---|---|---|---|
| Harbor, 9 | none | 24 (goal 25) | 92% | snacked out at 78-83 s |
| Harbor, 9 | level 1 | 25 | 100% | cleared at 62-64 s |
| Airport, 10 | level 1 | 28 | 87% | snacked out at ~80 s |
| Moon Base, 11 | level 1 | 26 | 100% | cleared at 70-78 s |

So from Harbor on, the goal depends on Mega Mouth plus Growth Rate, and on Harbor and Moon Base it is
reached only on the final props of a full clear. Starting Size does not move the ceiling.

## 6. Upgrades (cash)

`cost = base * growth^level * 4^tier`, one level at a time. Each track is visible once the run's cash
reaches `unlockAt` (or after a level or a Singularity). Sources: `balance.ts:103-113, 134-136`,
`economy.ts:84-125, 151-153, 431-456, 468-479`.

| Upgrade | Effect per level | Base | Growth | Max | L1 | L4 | Last level | All levels | Shown at |
|---|---|---|---|---|---|---|---|---|---|
| Starting Size | +1 start level | 45 | 1.65 | 45 | 45 | 202 | 1.67e11 | 4.2e11 | 0 |
| Speed | +8% hole speed (linear) | 60 | 4.5 | 8 | 60 | 5.5K | 2.2M | 2.9M | 0 |
| Cash Value | +0.25 cash mult (linear) | 100 | 3.5 | 10 | 100 | 4.3K | 7.9M | 11M | 0 |
| Round Time | +10 s | 400 | 8 | 4 | 400 | 205K | 205K | 234K | 0 |
| Growth Rate | +0.1 XP mult (linear) | 150 | 5 | 6 | 150 | 18.8K | 469K | 586K | 100 |
| Magnet | pull range `R (0.15 + 0.12 L)`, pull `(2 + 1.5 R)(1 + 0.08 L)` m/s | 200 | 4.5 | 8 | 200 | 18.2K | 7.5M | 9.6M | 300 |
| Combo Window | +0.15 s window, +0.15 cap | 500 | 4 | 8 | 500 | 32K | 8.2M | 10.9M | 1,500 |
| Golden Touch | +1% golden chance | 5,000 | 4 | 8 | 5K | 320K | 81.9M | 109M | 15,000 |
| Offline Vault | +1 h offline cap | 3,000 | 10 | 4 | 3K | 3M | 3M | 3.3M | 5,000 |

Magnet pull (`world.ts:786-797`): each step a fitting prop within `R + magR` moves
`min(pull * dt * (1.5 - d / (R + magR)), d - 0.5 * inner)` toward the centre. Vortex adds +3 to the
range fraction and x3 to the pull.

### Abilities, helpers

| Item | Effect | Cost | Where |
|---|---|---|---|
| Dash (shown at $2.5K) | x2.8 speed for 0.6 s, cooldown 7 s | unlock 5K, then `5K * 4^L` (L2-L5: 20K-1.28M) | `balance.ts:184, 189-198` |
| Vortex (shown at $50K) | magnet range +3R, pull x3 for 4 s, cooldown 22 s | unlock 100K, L5 25.6M | `balance.ts:185` |
| Mega Mouth (shown at $1.5M) | radius x1.45 for 5 s, cooldown 30 s | unlock 3M, L5 768M | `balance.ts:186` |
| Ability level | cooldown `x0.88^(L-1)`, duration `x(1 + 0.2 (L-1))` | | `economy.ts:204-212` |
| Helper holes 1-4 (shown at $800) | chase the nearest edible prop within 24 m, 60% cash, no XP | 2K, 50K, 1M, 25M | `balance.ts:152-163`, `world.ts:715-759` |
| Helper training (max 10) | radius `min(2.4, 0.7 * 1.13^L) * (1 + 0.1 * quantum)`; speed `5 * (1 + 0.1 q) * (1 + 0.4 r)` | `5000 * 3.5^L` (L10: 394M) | `economy.ts:113-115, 231-233`, `world.ts:750` |

## 7. Offline earnings

`economy.ts:237-265`, `game.ts:102-134`, `balance.ts:143-149`.

```
away = (now - lastSeen) / 1000                      (also tab-hidden time, game.ts:114-128)
if away < 180 s: pays 0
credited = min(away, (8 + 1 * vaultLvl + 2 * hawkingLvl) h)      cap 8 h, max 18 h
earned = mean(last 5 rounds' cash) * 0.5 * credited / 3600
```

- A full base cap pays 4 rounds of recent income; the 18 h maximum pays 9.
- At about 0.5-0.75 rounds per minute of active play, that is ~5-8 min (base) to ~12-18 min (max)
  of play. Per minute, active play earns ~60-90x more than being away.
- Offline cash goes through `earn()`, so it also counts as run cash (upgrade visibility) and lifetime
  cash (Dark Matter).
- It cannot unlock maps or tiers: those need a size reached in a round. It can buy the upgrades that
  reach them.
- `recentRoundCash` is emptied by a Singularity, so being away right after one pays nothing.

## 8. Singularity (prestige) and tiers

Sources: `economy.ts:270-341, 409-420`, `balance.ts:254-300`.

| What | Formula |
|---|---|
| Available | once Downtown is unlocked in the current prestige run |
| DM total from lifetime cash | `floor(1.75 * (lifetimeCash / 1e6)^0.25)` |
| DM paid | `floor((dmTotal(lifetime) - dmClaimed) * (1 + 0.1 * tier))` |
| First DM / 3 DM / 10 DM | lifetime $107K / $8.6M / $1.07B |
| Doubling DM | needs 16x the lifetime cash |
| Permanent cash bonus | +10% per DM ever earned (uncapped) |
| Resets | cash, run cash, upgrades, helpers, abilities, maps (unless Wormhole), map best sizes, recent income |
| Keeps | DM, DM tree, lifetime cash, Gulpedia, trophies, 100% map bonuses, skins, tier |
| Tier | +1 when the prestige run reached the Moon Base goal. Every map starts `min(tier, 10)` sizes smaller; map values and every cash price x`4^tier`; DM gains x`(1 + 0.1 tier)` |

DM tree (`cost = ceil(base * growth^L)`):

| Node | Effect | Base | Growth | Max |
|---|---|---|---|---|
| Event Horizon | +25% cash | 2 | 1.5 | 20 |
| Dense Core | +1 start size | 3 | 1.7 | 20 |
| Head Start | start with `300 * 10^(L-1)` cash (not scaled by tier) | 2 | 2 | 6 |
| Quantum Helpers | helpers +10% radius and speed | 3 | 1.8 | 10 |
| Gravity Well | +1 magnet level | 3 | 1.8 | 6 |
| Hawking Radiation | +2 h offline cap | 5 | 2 | 3 |
| Wormhole | keep maps | 40 | - | 1 |

## 9. Other cash bonuses

- 42 trophies, +2% cash each (`achievements.ts:19-62`, `balance.ts:331`).
- 10 Gulpedia sets, +5% each once every prop type in the set has been eaten (`economy.ts:161-164`).
- Each map cleared to 100% at least once: +25% (`economy.ts:186`), kept through Singularity.

## 10. RNG

All core randomness goes through the seeded `Rng` (`core/rng.ts`). Map layouts are fixed. The per-round
`World` seed drives movers, golden rolls, events and helpers. `scripts/sim.ts` uses three separate
streams for world seeds, ability rolls and bot steering (`sim.ts:52-55`).

## 11. Suspicious or likely buggy

Ranked by likely impact on pacing.

1. **Goals past the XP ceiling.** Harbor and Moon Base goals are reached only on the last props of a
   full clear, and only with Mega Mouth (unlocked for $3M). Without it a strong bot snacks out on
   Harbor at size 24 of 25 with 92% eaten. The HUD asks for "size 25" while the map holds no more
   XP. Starting Size cannot fix this: the ceiling barely moves with the start size.
2. **Round income is capped by the map's content.** A round cannot pay more than the map's total value
   x cashMult x combo (<= x2-3.2) x golden x time bonus (<= x1.5). Once a hole clears a map, Speed,
   Starting Size, Growth, Magnet, Round Time, Dash and Vortex only add time bonus. That is why late
   rounds turn into vacuuming and why progress then comes only from the next map or a cash multiplier.
3. **Sparse landmark bands.** Above size ~12 most maps have 1-6 props per level, often 50-190 m from
   the start. Growth there relies on the x4 frontier XP of a few far-apart props. The Katamari loop
   (come back to what blocked you) and "next target on screen" are probably weak in those bands.
4. **Big early tier, then noise.** 28-57% of every map's props are edible at size 1 but hold only
   2-5% of its XP and 6-12% of its cash. Phase 2 will measure how soon they become worthless.
5. **Steep cost growth on capped tracks.** Growth of 3.5-10x per level against linear effects
   (+25% cash, +8% speed, +10% XP). Starting Size is the only long track (45 levels at 1.65x) and
   adds little once rounds reach the map's ceiling.
6. **Upgrades likely below the 10% "noticeable" bar.** Cash Value from level 8 (+9.1% down to +7.7%),
   Golden Touch at every level (+8.3% down to +5.2% expected cash), Speed (+8% movement), Growth Rate
   from level 2 (+9.1% down to +6.3% XP), Combo Window (the x2 cap needs a 51-swallow streak, so a higher cap rarely matters),
   Round Time on maps that already end early, and Offline Vault (+12.5% offline only).
7. **Head Start ignores tiers.** Prices scale x4 per tier but Head Start cash does not, so its top
   level ($30M) is worth ~$30K of tier-5 prices.
8. **Runaway multiplier in the endless tiers.** Tier scaling cancels out (prices and payouts both x4),
   but the DM cash bonus is uncapped and multiplies Event Horizon (x6). The cash/price ratio grows
   every tier, which risks rounds where everything is affordable at once.
9. **Moon Base pays little more than Airport.** Its multiplier is x1.4 over Airport (total $18.7M vs
   $12.3M base) although it needs 3 Singularities.
10. **Helpers may hurt goals on ceiling maps.** They eat small props the main hole would have turned
    into XP, on maps whose goal needs every last bit of XP. Phase 2 will check this.
11. Minor: ability cards stay hidden after a Singularity until run cash passes their `unlockAt`
    (upgrade cards use `prestiges > 0`, `economy.ts:151-153` vs `221-223`). The mouth lags a level-up
    by ~0.3-0.6 s (eating uses the tweened radius). Offline pays 0 right after a Singularity.
