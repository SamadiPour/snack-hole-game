## Summary: tuned candidate (Phase 3)

Candidate `balance/tuned/finalist.json`: the best of CMA-ES search C, re-scored on held-out seeds,
plus two hand fixes (Harbor goal size 24, Moon Base goal size 25; see trade-offs). Before/after
tables and charts: `compare.md` next to this report.

**Verified on real Layer A rounds** (direct mode). Loss (violations only, lower is better):

| Seeds | Before | After | Note |
|---|---|---|---|
| 1–3 | 66.9 | 16.8 | seeds the search used |
| 4–10 | 71.6 | 17.7 | fresh seeds, never seen by the search |

| Fresh seeds 4–10, strong / average / weak | Before | After |
|---|---|---|
| Time to the first Moon Base goal | 1h02 / 3h16 / never | 44 min / 1h20 / 3h05 |
| Longest stretch without a noticeable upgrade | 3 / 4 / 34 rounds | 1 / 1 / 3 rounds |
| Longest gap without new content | 15 / 47 / 103 min | 9 / 13 / 32 min |
| First Singularity | 23 / 68 / 134 min | 16 / 30 / 78 min |
| Weak: longest stretch with no progress | 23 rounds | 2 rounds |
| Playthroughs stuck at a goal | weak never finishes | none |

Also better: the next goal is on screen more often (average 27% → 44%). Strong earns x7 weak at the
same upgrades, down from x14 (strong/average x1.8, down from x2.4). Offline is at most 23% of a
returner's cash.

**Still missed**

- Replays after a Singularity still take ~80% of the previous run's time (target ≤ 50%). With
  parameters alone this conflicts with a stable endgame (search B tried: replays sped up, endless
  tiers collapsed into 2-minute runs). Needs proposal L1 below.
- The weak bot's longest content gap is 32–36 min (target 20). It is 9–14 min for strong and
  average.
- Within a round: the next goal is on screen 30–44% of the time (target 70%), the Katamari loop
  barely happens, and more swallows are "noise" (63% vs 52%, because holes now start bigger
  relative to the props). These are layout-bound (proposal L3).
- Helpers, Helper training and Magnet add under 5% per level for the average bot.
- Single-stat runs: dumping only into Starting Size now gets 2–4 runs in, then stalls 1 size short
  of Downtown or Harbor (it never buys Mega Mouth or Growth Rate). Every other single track still
  stalls on Suburb, by design: goals are sizes.
- The weak bot buys 2 tracks in its first 4 minutes (target 3).

## Trade-offs

1. **Shorter game.** Average 3 h → 1 h 20 m, strong 1 h → 45 min, weak never → ~3 h. Most of the
   cut is removed grinding (rounds stuck at goals). The average sits just under the 1.5 h end of
   your "more than 1–1.5 h casually". If you want 2 h or more, the same search can target it,
   mostly through value multipliers and cost growth, at the price of more rounds per map.
2. **Goals no longer need a full clear.** Farm 20 → 19, Harbor 25 → 24, Moon Base 26 → 25. The
   Moon Base finale falls in its first round (it often did before too). Making it take two rounds
   would put the goal back at the XP ceiling, which is the stall we removed.
3. **Starting Size is cheaper** (cost growth 1.65 → 1.45) and the seven capped tracks are 13%
   steeper. Starting Size was already the main spend, and it stays so.
4. **Moon Base is now worth less in total than Airport** (value x942 vs x1,147: about $12.6M vs
   $14.1M of props before multipliers), which breaks "each map pays more". Pinning Moon at or above
   Airport costs little loss if you prefer it.
5. **Prestige comes sooner** (average first Singularity 64 → 29 min). The Dark Matter coefficient
   is +12%, so existing saves get a few extra DM on their next Singularity (Phase 4 will flag save
   effects in full).

## Proposals that need your approval (not applied)

- **L1. Replay speed:** let a Singularity keep part of the run's size: for example Dense Core +2
  start sizes per level, or keep 25% of Starting Size levels. Logic change.
- **L2. Endless-tier runaway** (already in the baseline: strong players reach 2-minute tiers from
  tier ~8): the Dark Matter cash bonus is linear in DM while tiers inflate cash x4. Make the bonus
  sublinear (e.g. `1 + 0.1 DM^0.75`) or let tier prices grow faster than payouts. Logic change.
- **L3. Layout:** mid-size props near the Farm start (sizes 3–4 sit 117 m away, causing a 27 s
  stall at size 5) and denser top bands on every map, for "next goal on screen" and the Katamari
  loop. Map changes.
- **L4. Helpers:** credit helper swallows' XP to the main hole, so helpers stop slowing growth.
- **L5. Head Start:** scale it by 4^tier like every price (today it is worthless from tier ~3).
