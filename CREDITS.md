# Credits

## Assets

All 3D props, maps, textures, particles and UI art are generated procedurally in code
(`src/render/props.ts`, `src/core/mapgen/`, shaders in `src/render/`). All sound effects and
ambience are synthesised at runtime with WebAudio (`src/audio/audio.ts`). No downloaded
models or textures are used; the only downloaded assets are the music tracks below.

## Music

All tracks are CC0 (public domain dedication, no attribution required), downloaded from
OpenGameArt and re-encoded to 96 kbps MP3 with loudness normalisation (`public/music/`).
Credited with thanks anyway.

| Map | Track | Author | Source | License |
|---|---|---|---|---|
| Sunny Suburb | Happy Clappy Loop | OwlishMedia | https://opengameart.org/content/happy-clappy-loop | CC0 |
| Happy Farm | Gone Fishin' | Memoraphile @ You're Perfect Studio | https://opengameart.org/content/gone-fishin | CC0 (also offered as CC-BY 4.0 / OGA-BY 3.0) |
| Downtown | Funked Up | Joth | https://opengameart.org/content/funked-up | CC0 |
| Harbor | Happy Vibes | Ruskerdax | https://opengameart.org/node/160228 | CC0 |
| Airport | Funky House (first 32 bars, cut to loop without the fade-out) | Of Far Different Nature | https://opengameart.org/content/funky-house | CC0 |
| Spaceport | Joyfully (loop version) | MintoDog | https://opengameart.org/content/joyfully | CC0 |
| Moon Base | Cosmic Navigation (loop version) | Synth-thetic | https://opengameart.org/content/cosmic-navigation | CC0 |

## Fonts

| Asset | Source | License |
|---|---|---|
| Nunito (variable) via `@fontsource-variable/nunito` | https://fontsource.org/fonts/nunito · https://github.com/googlefonts/nunito | SIL Open Font License 1.1 |

## Libraries

| Library | Source | License |
|---|---|---|
| three.js | https://threejs.org · https://github.com/mrdoob/three.js | MIT |
| Vite | https://vitejs.dev | MIT |
| TypeScript | https://www.typescriptlang.org | Apache-2.0 |
| Vitest (dev) | https://vitest.dev | MIT |
| tsx (dev) | https://github.com/privatenumber/tsx | MIT |
| playwright-core (dev, smoke tests) | https://playwright.dev | Apache-2.0 |

Emoji used as UI icons are rendered by the player's system font.
