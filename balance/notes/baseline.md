## Summary

Baseline before any tuning: 3 skills x 4 purchase policies x 3 play patterns x 3 seeds, each round
played for real in Layer A. The time to finish is the first Moon Base goal.

- **Overall length is fine for an average player but wrong at both ends.** Average bots finish in
  about **3 h** (target 1.5–4 h). Strong bots finish in **57 min**, and from their second run every
  goal falls in 1–2 rounds. Weak bots **never finish** within 10 h: they stall at the Harbor and
  Airport goals.
- **Progression stalls on four maps, for two reasons.**
  - *Goals at the XP ceiling.* Harbor (25) and Moon Base (26) are reached only on the last props of
    a near-full clear. Airport (28) needs Mega Mouth and 87% of the map. The average bot spends
    7–11+ rounds on Airport in each run. Parameters: `MAPS[].goal`, `MAPS[].xpMul` (Harbor 0.47),
    Mega Mouth `unlockCost` ($3M; the biggest upgrade measured, +33% cash per round).
  - *Sparse top bands.* Above size ~12, most maps have 1–6 props per size, 50–190 m apart.
    - On Farm: a size takes 13–18 s instead of 4–9 s elsewhere, the next goal is on screen 11–24% of
      the time, and 63–85% of round time is vacuuming crumbs. The average bot needs 10 rounds there
      in run 1.
    - Parameters: Farm `goal` 20 sits inside that band, `xpMul` 0.81, and `SIZE.xpCoef`/`xpExp`
      (each size needs 1.27x the XP).
    - Fixing the layout itself would be a map change, which is out of scope.
- **Prestige replays are too slow.** From run 3, reaching the previous run's furthest map takes
  80–84% of that run's time (target ≤ 50%). Each Singularity pays only +50% DM (`PRESTIGE.exponent`
  0.25: 16x lifetime cash per doubling). Dense Core gives back 1 start size per level, against
  map offsets of 8–35. Starting Size must be re-bought from $45 at x1.65 per level.
  - On Moon Base the goal falls in round 1, then the bot grinds 7–12 rounds until the
    Singularity pays +50%.
- **Skill decides too much.** At the same upgrades, strong earns x2.4 average and x14 weak. Target
  choice dominates: XP is f² with up to x4 near the size limit, so aiming at the biggest edible prop
  beats eating whatever is nearest by 2–4x.
- **Weak upgrades.** Helper training (−4%: helpers eat XP the main hole needs), Helpers (+2.4%),
  Combo Window (+4.9%), Golden Touch (+7%) and late Cash Value levels (< 10%). Parameters:
  `HELPERS.roundCashShare` and radius, `COMBO.perStack` (the x2 cap needs a 51-swallow streak),
  `GOLDEN.chancePerLevel`.
- **Working as intended:** the early game (first purchase at about 1.3 min, a purchase in reach
  after every round of the first 30 min), no dead start, maps not emptied early, offline earnings
  (one 8 h cap = 7 min of active play; active play earns x65 per minute; 21% of an average
  returner's cash), and a first Singularity at about 1 h for the average bot.
