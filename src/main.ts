import './ui/styles.css';
import { devFlags } from './dev/flags';
import { Game } from './game';
import { registerServiceWorker } from './pwa';
import { showFatal } from './ui/fatal';

/** three.js needs WebGL 2; checked up front so players get a message instead of a blank page. */
function hasWebGL2(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return gl !== null;
  } catch {
    return false;
  }
}

if (!hasWebGL2()) {
  showFatal(
    'Snack Hole can’t run in this browser',
    'The game draws its 3D world with WebGL 2, which is turned off or not supported here. Turn on hardware acceleration in your browser settings, update the browser, or try another one.',
    [],
  );
} else {
  try {
    const game = new Game();
    game.start();
    // Handle for smoke tests and the debug panel; not exposed in release builds.
    if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
    if (import.meta.env.DEV && devFlags.log) void import('./dev/roundLog').then((m) => m.startRoundLog(game));
  } catch (err) {
    console.error(err);
    showFatal('Snack Hole could not start', `Something went wrong while loading the game: ${err instanceof Error ? err.message : String(err)}`);
  }
}

registerServiceWorker();
