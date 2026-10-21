## Diagnosis: root causes

Measured by `balance/diagnose.ts` (D1–D5) on the baseline data.

| Problem | Mechanism | Root-cause parameters | Evidence |
|---|---|---|---|
| Harbor and Moon Base goals stall | The goal sits at the map's XP ceiling: rounds that miss end **1 size short with 95–100% of the map eaten** | `MAPS.harbor/moon.goal`, `xpMul` (Harbor 0.47) | D1; Harbor misses 79% (average) / 97% (weak) of rounds |
| Downtown and Airport take 8–14 rounds | Starting Size sits below the map's size offset, so the hole starts at size 1–4 and must climb 20+ sizes in one round; misses end **8–9 sizes short with 10–20% eaten** (time-limited, not ceiling) | `MAPS.downtown/airport.sizeOffset` (16, 31), `UPGRADES.startSize.growth` (1.65) | D1; D4: Starting Size is 47–97% of all spending |
| Farm is slow and vacuum-heavy | Size 5 takes **27 s** (the nearest size 3–4 props are 117 m from the start); sizes 14–15 take 14–19 s (1–6 props per size); 63–85% of round time everything on screen is edible | Farm `sizeOffset` 8 (enters below the dead zone), `goal` 20 in the sparse band; the layout itself (out of scope) | D2; within-run table |
| Replays after a Singularity are slow | Each run pays +50% DM (`PRESTIGE.exponent` 0.25 → 16x cash per doubling); the next run re-buys 30–40 Starting Size levels at x1.65 each, so 88–97% of its spend goes there | `PRESTIGE.exponent`, `coef`, `bonusPerDm`, `startSize.growth` | D4; replay ratio 80–84% |
| Strong ≫ weak | Target choice: XP is f² with up to x4 near the size limit. Lowering the frontier bonus cuts the gap only from x12 to x7.5 and costs the average bot 3 sizes per round | `SIZE.frontierBonus` (kept: lowering it slows everyone) | D3 |
| Helpers / Helper training feel useless | Helpers eat props the main hole needs: −0.6% (strong), −2.4% (average) cash, but +29% for weak (at −0.5 size) | `HELPERS.roundCashShare` 0.6 | D5 |
| Late Cash Value, Golden Touch, Combo below 10% | Linear effects: +0.25 cash x per level on a growing base; +1% golden chance = +9% x share of golden; combo cap needs a 51-swallow streak | `CASH_VALUE.perLevel`, `GOLDEN.chancePerLevel`, `COMBO.*` | upgrade-feel table |

## Parameter whitelist

Searched (`balance/lib/params.ts`, `SEARCH`): per map, the goal (only lower, up to 4 sizes),
XP multiplier (only higher, up to x1.6: slower growth would make play duller), size offset (−6 to
+2) and value multiplier (x0.5–2); Starting Size cost growth (1.4–1.8); a shared cost-growth scale
for the seven capped tracks (x0.6–1.2 on `growth − 1`); Cash Value per level (0.25–0.5); Golden
Touch per level (1–2.5%); Growth Rate per level (10–20%); helper cash share (0.6–1.2); Mega Mouth
unlock cost ($0.5–3M); Dark Matter coefficient (1.75–3.5), exponent (0.25–0.4) and cash bonus per
DM (10–25%).

Held fixed on purpose: hole speed and round length (no slower movement, no longer rounds), offline
earnings (no bigger), the frontier XP bonus and value exponent (Layer A only; D3 shows the bonus is
not the lever), prop sizes and map layouts (out of scope).

## Loss

`balance/lib/loss.ts`: Σ over checks of weight x skill weight x miss, plus 2 x Σ (normalised
parameter change)². A miss is the relative distance outside the target (0 inside, capped at 5).
Skill weights: strong 1, average 1.5, weak 1.5.

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

Each candidate is scored on 22 playthroughs through the fitted model (3 skills x optimizer /
balanced / casual x seeds 1–2, binge; casual returners; one single-stat run). CMA-ES, 14
candidates per generation, 50 generations, starting at today's values. The best candidates and
the final CMA mean are then re-scored on seeds 3–8; the lowest there is the finalist.
