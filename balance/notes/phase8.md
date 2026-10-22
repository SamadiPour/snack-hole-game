## Phase 8: Vortex and Mega Mouth

Playtest: Vortex and Mega Mouth start each round half charged, which they should not; with both
running the magnet pulls far too hard and clears the map; Mega Mouth lasts too long.

**What changed**

| | Before | Now |
|---|---|---|
| Vortex / Mega Mouth at round start | half charged (`startCharge` 0.5) | empty (0): first use a full cooldown in |
| Mega Mouth duration | 5 s (+20% per level, 9 s at level 5) | 4 s (7.2 s at level 5) |
| Magnet and Vortex reach | `magR` past the Mega mouth's rim | `magR` past the hole's own rim |

The magnet and Vortex still pull every prop the mouth can swallow, Mega's bigger ones included.
Dash still starts ready.

**What drives the stage clears**

Paired rounds at 30 states from runs 3–5 (Harbor to Moon Base, an average player's saves),
12 world seeds each; cash vs the game before this pass, share of the map eaten:

| | Strong | Average | Weak |
|---|---|---|---|
| Before | 0% / 99% | 0% / 86% | 0% / 59% |
| Without Vortex and Mega | −40% / 66% | −50% / 50% | −39% / 36% |
| Mega only | −13% / 98% | −13% / 81% | −23% / 49% |
| Vortex only | −35% / 66% | −41% / 55% | −29% / 40% |
| Start empty | −7% | −4% | −5% |
| Mega 4 s | −2% | −6% | −3% |
| Reach from the hole's own rim | −3% / 98% | 0% / 86% | −6% / 56% |
| Not pulling Mega-only props either | −4% / 98% | −2% / 85% | −16% / 51% |
| **Start empty + Mega 4 s + own-rim reach** | −8% / 98% | −11% / 82% | −13% / 52% |
| same + Mega x1.3, +0.05 per level (x1.5 at level 5) | −13% / 93% | −25% / 73% | −24% / 45% |

Mega Mouth clears the late maps on its own: its mouth (x1.35, up to x1.75) makes props about five
sizes bigger edible, and a strong player then eats 98% of the map with or without Vortex. Vortex
before this pass added its own reach past the Mega rim and pulled those big props in from about
six hole radii. Measuring the reach from the hole's own rim takes the Mega rim out of it; not
pulling Mega-only props at all was tried and dropped after the playtest (they should still come
in). Only a smaller Mega mouth stops strong players clearing (rounds of 98% or more: 78% → 57%).

**Results** (`s2` → `s3`; direct Layer B, seeds 1–3 / fresh 4–10, same model)

| | Strong | Average | Weak |
|---|---|---|---|
| Moon Base goal (h) | 1.44 → 1.48 / 1.40 → 1.53 | 2.85 → 2.85 / 2.65 → 2.94 | 5.84 → 5.97 / 5.39 → 5.54 |
| Longest stretch without a noticeable upgrade (rounds) | 1 → 1 | 2 → 2 / 2 → 3 | 5 → 6 / 5 → 5 |
| Longest gap without new content (min) | 11 → 14 / 16 → 12 | 17 → 25 / 20 → 25 | 42 → 52 / 41 → 47 |
| Shop sold out / buys per visit | 0.2% / 6 → 0.4% / 5 | 0.5% / 3 → 1.3% / 3 | 0.6% / 2 → 1.6% / 2 |
| Loss | 30.0 → 30.6 / 33.6 → 32.3 | | |

Game sim (seeds 1–10, `--human` / `--good`): first Singularity 46:51 → 53:14 / 34:18 → 34:16,
Moon Base 1h 55m → 2h 12m / 1h 25m → 1h 27m, targets met 10–13 → 9–13 / 10–13 → 10–12. A
casual player's run 1 is about 6 minutes longer: Vortex, bought on Downtown, now fires once less
in most rounds. One `--human` seed's first Singularity takes 1h 01m (target 30–60 min), and Moon
Base's goal needs over 85% of the map on 3 of 10 `--human` seeds (was 1).

Not taken: Vortex cooldown 22 → 18 s with Mega cooldown 30 → 25 s (a casual first Singularity
back to about 48 min, both loss sets lower, but Moon Base near a full clear on 6 of 10 seeds).
